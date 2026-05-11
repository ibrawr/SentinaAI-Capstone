"""
Flask backend for the convention center navigation system.

This service loads the floor plan, builds or loads the navmesh,
applies telemetry-aware routing, and exposes navigation, event,
device, and health endpoints for the frontend.
"""

from __future__ import annotations

import inspect
import json
import math
import os
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from svg_parser import SVGParser
from coordinate_transformer import CoordinateTransformer, extract_geojson_bounds
from navmesh_generator import NavMeshGenerator
from pathfinder import DijkstraPathfinder
from telemetry_processor import TelemetryProcessor
from event_store import EventStore
from iot_validator import validate_iot_payload  # NFR-24/25
from devices_registry import DEVICES_REGISTRY, device_telemetry as _device_telemetry_store

app = Flask(__name__, static_folder="../frontend", static_url_path="/static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
CORS(app)


@app.after_request
def _no_cache_static(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


navmesh_data: Optional[Dict] = None
transformer: Optional[CoordinateTransformer] = None
pathfinder: Optional[DijkstraPathfinder] = None
telemetry: Optional[TelemetryProcessor] = None
iot_sensor_data: Dict[str, float] = {}
event_store: Optional[EventStore] = None


def _normalize_room_name(name: str) -> str:
    """'North Hall 1' -> 'northhall1', 'NorthHall1' -> 'northhall1'"""
    return (name or "").lower().replace(" ", "")


def _ensure_rooms_metadata(nm: Dict) -> list[Dict]:
    """
    Ensures nm['rooms_metadata'] exists.

    Manual navmesh files may only include nodes and edges,
    so room metadata is rebuilt from nodes when needed.
    """
    rooms_md = nm.get("rooms_metadata")
    if isinstance(rooms_md, list) and rooms_md:
        for r in rooms_md:
            if "position" in r and isinstance(r["position"], dict):
                r["position"]["x"] = float(r["position"].get("x", 0))
                r["position"]["y"] = float(r["position"].get("y", 0))
        return rooms_md

    rooms_md = []
    for node in (nm.get("nodes", []) or []):
        if node.get("type") != "room":
            continue

        if isinstance(node.get("position"), dict):
            pos = node["position"]
            x = float(pos.get("x", 0))
            y = float(pos.get("y", 0))
        else:
            x = float(node.get("x", 0))
            y = float(node.get("y", 0))

        svg_lookup = nm.get("_svg_room_polygons", {})
        node_name = node.get("name", node.get("id", ""))
        svg_poly = svg_lookup.get(_normalize_room_name(node_name))
        polygon = svg_poly if svg_poly else node.get("polygon", [])

        rooms_md.append(
            {
                "id": node.get("id"),
                "name": node.get("name", node.get("id")),
                "position": {"x": x, "y": y},
                "polygon": polygon,
            }
        )

    nm["rooms_metadata"] = rooms_md
    return rooms_md


def _polyline_length_px(coords: list[dict]) -> float:
    """Euclidean length of a polyline in SVG pixels."""
    if not coords or len(coords) < 2:
        return 0.0
    total = 0.0
    for i in range(len(coords) - 1):
        a = coords[i]
        b = coords[i + 1]
        total += math.hypot(float(b["x"]) - float(a["x"]), float(b["y"]) - float(a["y"]))
    return float(total)


def _smooth_path_coords(coords: list[dict], generator: Any, samples: int = 21) -> list[dict]:
    """
    Shortcuts a grid-like path into a more natural polyline.

    Uses corridor-only line-of-sight checks so the path does not cut through halls.
    """
    if not coords or len(coords) <= 2:
        return coords
    if generator is None:
        return coords

    los_fn = getattr(generator, "_segment_walkable_corridor_only", None)
    if not callable(los_fn):
        los_fn = getattr(generator, "_segment_walkable", None)
    if not callable(los_fn):
        return coords

    out = [coords[0]]
    i = 0
    n = len(coords)
    while i < n - 1:
        j = n - 1
        while j > i + 1:
            # Scale sample count with segment length to catch hall boundaries reliably.
            dist = math.hypot(coords[j]["x"] - coords[i]["x"], coords[j]["y"] - coords[i]["y"])
            adaptive_samples = max(samples, int(dist / 20) + 1)

            if los_fn(coords[i], coords[j], samples=adaptive_samples):
                break
            j -= 1
        out.append(coords[j])
        i = j
    return out


def _simplify_path_coords(coords: list[dict], generator: Any) -> list[dict]:
    """
    Removes redundant near-collinear nodes while keeping the path walkable.

    A node is only removed when it is almost collinear with its neighbors
    and the direct connection still passes corridor validation.
    """
    if not coords or len(coords) <= 2:
        return coords

    if generator is None:
        return coords

    los_fn = getattr(generator, "_segment_walkable_corridor_only", None)
    if not callable(los_fn):
        return coords

    angle_threshold = 165.0
    simplified = [coords[0]]

    i = 1
    while i < len(coords) - 1:
        prev = simplified[-1]
        curr = coords[i]
        next_pt = coords[i + 1]

        v1_x = curr["x"] - prev["x"]
        v1_y = curr["y"] - prev["y"]
        v2_x = next_pt["x"] - curr["x"]
        v2_y = next_pt["y"] - curr["y"]

        len1 = math.hypot(v1_x, v1_y)
        len2 = math.hypot(v2_x, v2_y)

        if len1 < 1e-6 or len2 < 1e-6:
            i += 1
            continue

        v1_x /= len1
        v1_y /= len1
        v2_x /= len2
        v2_y /= len2

        dot = v1_x * v2_x + v1_y * v2_y
        dot = max(-1.0, min(1.0, dot))
        angle_deg = math.degrees(math.acos(dot))

        if angle_deg > angle_threshold:
            samples = max(25, int(math.hypot(next_pt["x"] - prev["x"], next_pt["y"] - prev["y"]) / 15) + 1)

            if los_fn(prev, next_pt, samples=samples):
                i += 1
                continue

        simplified.append(curr)
        i += 1

    simplified.append(coords[-1])
    return simplified


def _resolve_svg_path() -> Path:
    env_path = os.environ.get("CONVENTION_SVG_PATH")
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists():
            return p

    backend_dir = Path(__file__).resolve().parent
    candidate_1 = (backend_dir.parent / "convention_map.svg").resolve()
    if candidate_1.exists():
        return candidate_1

    candidate_2 = (Path.cwd() / "convention_map.svg").resolve()
    if candidate_2.exists():
        return candidate_2

    return candidate_1


def _resolve_telemetry_path() -> Optional[Path]:
    """Finds the telemetry JSONL file."""
    env_path = os.environ.get("TELEMETRY_PATH")
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists():
            return p

    backend_dir = Path(__file__).resolve().parent

    candidates = [
        backend_dir.parent / "telemetry_stream_hall_v3__1_.jsonl",
        backend_dir.parent / "telemetry_stream_hall_v3.jsonl",
        backend_dir.parent / "data" / "telemetry_stream_hall_v3__1_.jsonl",
        backend_dir.parent / "data" / "telemetry_stream_hall_v3.jsonl",
        backend_dir / "telemetry_stream_hall_v3__1_.jsonl",
        backend_dir / "telemetry_stream_hall_v3.jsonl",
        Path.cwd() / "telemetry_stream_hall_v3__1_.jsonl",
        Path.cwd() / "telemetry_stream_hall_v3.jsonl",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def _resolve_events_dir() -> Path:
    env_path = os.environ.get("EVENTS_DIR")
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists():
            return p

    backend_dir = Path(__file__).resolve().parent
    return (backend_dir.parent / "data" / "events").resolve()


def _resolve_data_file(filename: str) -> Optional[Path]:
    """Finds a file in the data directory."""
    env_var = f"DATA_{filename.upper().replace('.', '_')}"
    env_path = os.environ.get(env_var)
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists():
            return p

    backend_dir = Path(__file__).resolve().parent

    candidates = [
        backend_dir.parent / "data" / filename,
        backend_dir.parent / filename,
        backend_dir / filename,
        Path.cwd() / "data" / filename,
        Path.cwd() / filename,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def _looks_like_geometry_dict(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    if "dimensions" not in obj:
        return False
    dims = obj.get("dimensions")
    if not isinstance(dims, dict) or "width" not in dims or "height" not in dims:
        return False
    return ("rooms" in obj) or ("corridors" in obj) or ("entrances" in obj)


def _extract_geometry_from_parser(parser: Any) -> Dict:
    common_names = [
        "extract_all",
        "parse",
        "extract",
        "run",
        "process",
        "get_geometry",
        "extract_geometry",
        "extract_geometry_data",
        "extract_shapes",
        "extract_polygons",
        "build",
        "build_geometry",
        "to_dict",
    ]

    for name in common_names:
        fn = getattr(parser, name, None)
        if callable(fn):
            try:
                result = fn()
                if _looks_like_geometry_dict(result):
                    return result
            except TypeError:
                continue
            except Exception:
                continue

    candidates = []
    for name in dir(parser):
        if name.startswith("_"):
            continue
        fn = getattr(parser, name, None)
        if not callable(fn):
            continue

        try:
            sig = inspect.signature(fn)
        except Exception:
            continue

        if any(
            p.default is inspect._empty
            and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
            for p in sig.parameters.values()
        ):
            continue

        candidates.append(name)

    for name in sorted(candidates):
        fn = getattr(parser, name)
        try:
            result = fn()
            if _looks_like_geometry_dict(result):
                return result
        except Exception:
            continue

    public_methods = [n for n in dir(parser) if not n.startswith("_") and callable(getattr(parser, n, None))]
    raise AttributeError(
        "Could not find any SVGParser method that returns the expected geometry dict. "
        f"Public methods available on SVGParser: {public_methods}"
    )


def _get_actual_coordinate_bounds(geometry_data: Dict) -> tuple[float, float]:
    """Extracts the actual coordinate span used by the parsed geometry."""
    all_x = []
    all_y = []

    for room in geometry_data.get("rooms", []):
        for point in room.get("polygon", []):
            all_x.append(point[0])
            all_y.append(point[1])

    for corridor in geometry_data.get("corridors", []):
        for point in corridor.get("polygon", []):
            all_x.append(point[0])
            all_y.append(point[1])

    if not all_x or not all_y:
        return (geometry_data["dimensions"]["width"], geometry_data["dimensions"]["height"])

    actual_width = max(all_x) - min(all_x)
    actual_height = max(all_y) - min(all_y)

    return (actual_width, actual_height)


def initialize_system() -> None:
    global navmesh_data, transformer, pathfinder, telemetry, event_store

    svg_path = _resolve_svg_path()
    print("\n" + "=" * 60)
    print("Convention Center Navigation System - IoT Enabled")
    print("=" * 60)
    print(f"Using SVG: {svg_path}")

    if not svg_path.exists():
        raise FileNotFoundError(f"SVG file not found at {svg_path}. Set CONVENTION_SVG_PATH to override.")

    parser = SVGParser(str(svg_path))
    geometry_data = _extract_geometry_from_parser(parser)

    corridors = geometry_data.get("corridors", [])
    if not corridors:
        print("WARNING: No corridors detected")

    actual_width, actual_height = _get_actual_coordinate_bounds(geometry_data)
    reported_width = geometry_data["dimensions"]["width"]
    reported_height = geometry_data["dimensions"]["height"]

    print(f"\nCoordinate Space Analysis:")
    print(f"  Reported viewBox: {reported_width} × {reported_height}")
    print(f"  Actual coord space: {actual_width:.1f} × {actual_height:.1f}")

    svg_dims_for_scaling = (actual_width, actual_height)

    geojson_str = (
        '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},'
        '"geometry":{"coordinates":[[[55.28514167811778,25.221544615013386],'
        '[55.285686028545314,25.22123340829775],[55.28616814714442,25.221948974483112],'
        '[55.28827305653181,25.220899043260104],[55.29181204995919,25.225541532185503],'
        '[55.29026162371224,25.227136599916307],[55.2890019971085,25.226140196693052],'
        '[55.28699133263294,25.22713370705307],[55.28514635183484,25.224359979970103],'
        '[55.28401929803499,25.22246726320094],[55.285294274281426,25.22176237175553],'
        '[55.28514167811778,25.221544615013386]]],"type":"Polygon"}}]}'
    )
    geojson_data = json.loads(geojson_str)
    bounds = extract_geojson_bounds(geojson_data)

    transformer = CoordinateTransformer(
        svg_dimensions=svg_dims_for_scaling,
        geojson_bounds=bounds,
    )

    print(f"\nScale Calculation:")
    print(
        f"  GeoJSON building: {transformer.building_dimensions_m['width']:.1f}m × {transformer.building_dimensions_m['height']:.1f}m"
    )
    print(f"  meters_per_pixel: {transformer.meters_per_pixel:.4f}")
    print(f"  Example: 1000px path = {1000 * transformer.meters_per_pixel:.1f} meters")

    navmesh_json_path = _resolve_data_file("navmesh_output.json")

    if navmesh_json_path and navmesh_json_path.exists():
        print(f"\n{'='*60}")
        print(f"Loading MANUAL navmesh from: {navmesh_json_path}")
        print(f"{'='*60}")

        with open(navmesh_json_path, "r") as f:
            navmesh_data = json.load(f)

        # Convert manual x/y node format into the backend position format.
        for node in navmesh_data.get("nodes", []):
            if "position" not in node or not isinstance(node.get("position"), dict):
                node["position"] = {"x": float(node.get("x", 0)), "y": float(node.get("y", 0))}
                node.pop("x", None)
                node.pop("y", None)

        generator = NavMeshGenerator(
            rooms=geometry_data.get("rooms", []),
            corridors=corridors,
            entrances=geometry_data.get("entrances", []),
        )

        navmesh_data["transformer"] = transformer
        navmesh_data["generator"] = generator
        navmesh_data["corridor_polygons"] = geometry_data.get("corridors", [])
        navmesh_data["_svg_room_polygons"] = {
            _normalize_room_name(r.get("name", "")): r.get("polygon", [])
            for r in geometry_data.get("rooms", [])
            if r.get("polygon")
        }

        _ensure_rooms_metadata(navmesh_data)

        print(f"\nManual Navmesh Loaded:")
        print(f"  Nodes: {len(navmesh_data['nodes'])}")
        print(f"  Edges: {len(navmesh_data['edges'])}")
        print(f"  Rooms: {len(navmesh_data.get('rooms_metadata', []))}")
    else:
        print(f"\nNo manual navmesh found at {navmesh_json_path}")
        print(f"Auto-generating navmesh from SVG...")

        generator = NavMeshGenerator(
            rooms=geometry_data.get("rooms", []),
            corridors=corridors,
            entrances=geometry_data.get("entrances", []),
        )
        navmesh_data = generator.generate()

        navmesh_data["transformer"] = transformer
        navmesh_data["generator"] = generator
        navmesh_data["_svg_room_polygons"] = {
            _normalize_room_name(r.get("name", "")): r.get("polygon", [])
            for r in geometry_data.get("rooms", [])
            if r.get("polygon")
        }

        print(f"\nNavmesh Generated:")
        print(f"  Nodes: {len(navmesh_data['nodes'])}")
        print(f"  Edges: {len(navmesh_data['edges'])}")
        print(f"  Rooms: {len(navmesh_data['rooms_metadata'])}")

    pathfinder = DijkstraPathfinder(navmesh_data["nodes"], navmesh_data["edges"])

    telemetry_path = _resolve_telemetry_path()
    if telemetry_path:
        print(f"\n{'='*60}")
        print("Loading IoT Telemetry")
        print(f"{'='*60}")
        print(f"Telemetry file: {telemetry_path}")

        try:
            telemetry = TelemetryProcessor()
            telemetry.load_jsonl_stream(telemetry_path)

            rooms_for_mapping = _ensure_rooms_metadata(navmesh_data)
            if rooms_for_mapping:
                telemetry.map_hall_ids_to_rooms(rooms_for_mapping)
            else:
                print("Warning: No rooms found for telemetry mapping")

            sensor_data = telemetry.get_sensor_data_for_navmesh()
            if sensor_data:
                iot_sensor_data.update(sensor_data)
                generator.update_edge_weights_from_iot(sensor_data)
                pathfinder.update_weights(navmesh_data["edges"])

                summary = telemetry.get_summary()
                print(f"\nTelemetry Applied:")
                print(f"  Avg occupancy: {summary['avg_occupancy']:.1%}")
                print(f"  Max occupancy: {summary['max_occupancy']:.1%}")
                print(f"  Crowded halls (>50%): {len([h for h in summary['crowded_halls']])} halls")

                if summary["crowded_halls"]:
                    print(f"\n  Most crowded:")
                    for item in summary["crowded_halls"][:3]:
                        print(f"    {item['hallId']}: {item['occupancy']:.1%}")

        except Exception as e:
            print(f"Warning: Could not load telemetry: {e}")
            telemetry = None
    else:
        print(f"\nNo telemetry file found (optional)")
        print(f"  Routing will use base weights without crowd avoidance")

    print(f"\n{'='*60}")
    print("System Ready")
    print(f"{'='*60}\n")

    events_dir = _resolve_events_dir()
    if events_dir.exists():
        event_store = EventStore.load(events_dir)
        print(f"Loaded events dataset from: {events_dir}")
    else:
        print(f"Events directory not found: {events_dir} (skipping)")
        event_store = None


@app.route("/api/navmesh", methods=["GET"])
def get_navmesh():
    if not navmesh_data or not transformer:
        return jsonify({"error": "System not initialized"}), 500

    rooms_metadata = _ensure_rooms_metadata(navmesh_data)

    response = {
        "nodes": navmesh_data["nodes"],
        "edges": navmesh_data["edges"],
        "rooms": rooms_metadata,
        "scale_info": transformer.get_scale_info(),
        "corridor_polygons": navmesh_data.get("corridor_polygons", []),
        "spine_nodes": navmesh_data.get("spine_nodes", []),
        "spine_edges": navmesh_data.get("spine_edges", []),
    }
    return jsonify(response)


@app.route("/api/rooms", methods=["GET"])
def get_rooms():
    if not navmesh_data:
        return jsonify({"error": "System not initialized"}), 500
    return jsonify(_ensure_rooms_metadata(navmesh_data))


@app.route("/api/pathfind", methods=["POST", "OPTIONS"])
def calculate_path():
    # Handles the browser preflight request for cross-origin POSTs.
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        return response

    if not pathfinder or not transformer:
        return jsonify({"error": "System not initialized"}), 500

    data = request.json or {}
    start_id = data.get("start")
    end_id = data.get("end")
    avoid_crowds = data.get("avoid_crowds", True)

    if not start_id or not end_id:
        return jsonify({"error": "start and end required"}), 400

    try:
        # Temporarily fall back to base weights when crowd avoidance is disabled.
        if not avoid_crowds and telemetry:
            original_edges = [e.copy() for e in navmesh_data["edges"]]
            for e in navmesh_data["edges"]:
                e["effective_weight"] = e.get("weight", e.get("base_weight", 1.0))
            pathfinder.update_weights(navmesh_data["edges"])

            path = pathfinder.find_path(start_id, end_id)

            navmesh_data["edges"] = original_edges
            pathfinder.update_weights(navmesh_data["edges"])
        else:
            path = pathfinder.find_path(start_id, end_id)

        if not path:
            return jsonify({"error": "No path found", "success": False}), 404

        path_coords = []
        for node_id in path:
            node = pathfinder.nodes.get(node_id)
            if node and "position" in node:
                path_coords.append(node["position"])
            else:
                print(f"Warning: Node {node_id} missing position")

        if not path_coords:
            return jsonify({"error": "Path found but no coordinates available", "success": False}), 500

        # Keep the raw navmesh path here. The frontend handles visual corner smoothing.
        path_coords_smooth = path_coords

        # Distance shown to the user is geometric distance, not Dijkstra cost.
        total_distance_pixels = _polyline_length_px(path_coords_smooth)
        total_distance_meters = total_distance_pixels * transformer.meters_per_pixel

        # Cost is kept separately because it may include crowd-based weighting.
        total_cost = pathfinder.get_path_distance(path)

        path_crowding = []
        if telemetry:
            for node_id in path:
                node = pathfinder.nodes.get(node_id)
                if node and node.get("type") == "room":
                    occupancy = iot_sensor_data.get(node_id, 0.0)
                    path_crowding.append(
                        {
                            "node_id": node_id,
                            "name": node.get("name", ""),
                            "occupancy": round(occupancy, 3),
                        }
                    )

        return jsonify(
            {
                "success": True,
                "path": path,
                "path_coordinates": path_coords,
                "path_coordinates_smooth": path_coords_smooth,
                "distance": {
                    "pixels": round(total_distance_pixels, 2),
                    "meters": round(total_distance_meters, 2),
                },
                "cost": round(float(total_cost), 2),
                "node_count": len(path),
                "path_crowding": path_crowding,
                "crowd_avoidance_enabled": avoid_crowds,
            }
        )
    except Exception as e:
        import traceback

        print(f"ERROR in pathfind: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e), "success": False}), 500


@app.route("/api/iot/update", methods=["POST"])
def update_iot_sensors():
    """
    Manually updates sensor data for testing or real-time streams.

    NFR-24 rejects payloads containing images, face IDs, or PII keys.
    NFR-25 accepts only whitelisted numeric crowd-density values.
    """
    if not navmesh_data or not pathfinder:
        return jsonify({"error": "System not initialized"}), 500

    payload = request.json or {}

    ok, error, sensor_data = validate_iot_payload(payload)
    if not ok:
        return jsonify({"error": error, "rejected": True}), 400

    if not sensor_data:
        return jsonify({"error": "No valid numeric sensor values found in payload"}), 400

    iot_sensor_data.update(sensor_data)
    navmesh_data["generator"].update_edge_weights_from_iot(iot_sensor_data)
    pathfinder.update_weights(navmesh_data["edges"])

    return jsonify(
        {
            "success": True,
            "updated_nodes": len(sensor_data),
            "message": "Edge weights updated based on crowd density",
        }
    )


@app.route("/api/iot/data", methods=["GET"])
def get_iot_data():
    """Returns the current IoT sensor data."""
    return jsonify(iot_sensor_data)


@app.route("/api/iot/summary", methods=["GET"])
def get_iot_summary():
    """Returns telemetry summary statistics."""
    if not telemetry:
        return jsonify({"telemetry_enabled": False, "message": "No telemetry data loaded"})

    summary = telemetry.get_summary()
    summary["telemetry_enabled"] = True
    return jsonify(summary)


@app.route("/api/iot/reload", methods=["POST"])
def reload_telemetry():
    """Reloads telemetry from file."""
    global telemetry

    if not navmesh_data:
        return jsonify({"error": "System not initialized"}), 500

    telemetry_path = _resolve_telemetry_path()
    if not telemetry_path:
        return jsonify({"error": "No telemetry file found"}), 404

    try:
        telemetry = TelemetryProcessor()
        telemetry.load_jsonl_stream(telemetry_path)

        rooms_for_mapping = _ensure_rooms_metadata(navmesh_data)
        if rooms_for_mapping:
            telemetry.map_hall_ids_to_rooms(rooms_for_mapping)

        sensor_data = telemetry.get_sensor_data_for_navmesh()
        iot_sensor_data.update(sensor_data)
        navmesh_data["generator"].update_edge_weights_from_iot(sensor_data)
        pathfinder.update_weights(navmesh_data["edges"])

        summary = telemetry.get_summary()

        return jsonify({"success": True, "message": "Telemetry reloaded", "summary": summary})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/events", methods=["GET"])
def api_list_events():
    if not event_store:
        return jsonify({"events": [], "warning": "event_store_not_loaded"}), 200
    return jsonify({"events": event_store.list_events()})


@app.route("/api/halls/<path:hall_name>/events", methods=["GET"])
def api_events_for_hall(hall_name: str):
    if not event_store:
        return jsonify({"hall": hall_name, "events": [], "warning": "event_store_not_loaded"}), 200
    return jsonify({"hall": hall_name, "events": event_store.events_for_hall(hall_name)})


@app.route("/api/halls/<path:hall_name>/events/<event_id>/exhibitors", methods=["GET"])
def api_exhibitors_for_hall_event(hall_name: str, event_id: str):
    if not event_store:
        return jsonify({"hall": hall_name, "eventId": event_id, "assignments": [], "warning": "event_store_not_loaded"}), 200
    return jsonify(
        {
            "hall": hall_name,
            "eventId": event_id,
            "assignments": event_store.exhibitors_for_hall_event(hall_name, event_id),
        }
    )


@app.route("/api/events/reload", methods=["POST"])
def api_events_reload():
    global event_store
    events_dir = _resolve_events_dir()
    if not events_dir.exists():
        return jsonify({"ok": False, "error": f"events_dir_not_found: {events_dir}"}), 400
    event_store = EventStore.load(events_dir)
    return jsonify({"ok": True, "loaded_from": str(events_dir)})


@app.route("/api/devices", methods=["GET"])
def get_devices():
    """Returns the full IoT device registry."""
    return jsonify({"status": "success", "devices": DEVICES_REGISTRY})


@app.route("/api/devices/status", methods=["GET"])
def get_device_status():
    """
    Returns live device telemetry.

    Falls back to the static registry status when the live telemetry store
    does not yet contain data for a device.
    """
    status_map = {}
    for device in DEVICES_REGISTRY:
        did = device["id"]
        if did in _device_telemetry_store:
            status_map[did] = _device_telemetry_store[did]
        else:
            status_map[did] = {"status": device.get("status", "online")}
    return jsonify({"status": "success", "devices": status_map})


@app.route("/api/health", methods=["GET"])
def health_check():
    rooms_count = 0
    if navmesh_data:
        rooms_count = len(_ensure_rooms_metadata(navmesh_data))

    return jsonify(
        {
            "status": "healthy",
            "system_initialized": navmesh_data is not None,
            "nodes": len(navmesh_data["nodes"]) if navmesh_data else 0,
            "edges": len(navmesh_data["edges"]) if navmesh_data else 0,
            "rooms": rooms_count,
            "telemetry_enabled": telemetry is not None,
            "telemetry_halls": len(iot_sensor_data) if iot_sensor_data else 0,
        }
    )


@app.route("/")
def serve_frontend():
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(404)
def spa_fallback(e):
    path = request.path or ""
    if path.startswith("/api/") or path.startswith("/static/"):
        return jsonify({"error": "not found", "path": path}), 404
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    return send_from_directory(frontend_dir, "index.html")


try:
    initialize_system()
except Exception as _init_err:
    import traceback
    print("\n" + "=" * 60)
    print("ERROR: Navigation system failed to initialize:")
    traceback.print_exc()
    print("Flask will start, but all /api/* endpoints will return 500.")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    print("\nStarting Flask server on http://localhost:5000")
    print("API endpoints:")
    print("  GET  /api/health          - System health check")
    print("  GET  /api/navmesh         - Get navigation mesh")
    print("  POST /api/pathfind        - Calculate route")
    print("  GET  /api/iot/summary     - IoT telemetry summary")
    print("  GET  /api/iot/data        - Current sensor data")
    print("  POST /api/iot/reload      - Reload telemetry from file")
    print()
    app.run(debug=False, host="0.0.0.0", port=5000)