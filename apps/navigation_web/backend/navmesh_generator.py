"""
Generates a navigation mesh from room and corridor geometry by building a
walkable spine graph, connecting rooms and entrances, and supporting IoT-based
edge weight updates.
"""

from __future__ import annotations

import math
import heapq
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Set

import numpy as np

try:
    from shapely.geometry import Polygon, Point, LineString, MultiPolygon
    from shapely.ops import unary_union
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False
    print("WARNING: Shapely not installed - corridor unioning will be degraded")


def _dist(a: Dict[str, float], b: Dict[str, float]) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["y"]) - float(b["y"]))


def _point_in_poly(x: float, y: float, poly: List[List[float]]) -> bool:
    """Ray casting point-in-polygon."""
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = float(poly[i][0]), float(poly[i][1])
        xj, yj = float(poly[j][0]), float(poly[j][1])
        intersects = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi)
        if intersects:
            inside = not inside
        j = i
    return inside


def _poly_to_shapely(poly: List[List[float]]) -> Optional[Polygon]:
    """Convert polygon list to Shapely Polygon."""
    if not HAS_SHAPELY or not poly or len(poly) < 3:
        return None
    try:
        return Polygon([(float(p[0]), float(p[1])) for p in poly])
    except:
        return None


def _shapely_to_poly(geom: Polygon) -> List[List[float]]:
    """Convert Shapely Polygon to list."""
    if geom.is_empty:
        return []
    coords = list(geom.exterior.coords)
    return [[float(x), float(y)] for x, y in coords[:-1]]


def union_corridor_polygons(corridor_dicts: List[Dict]) -> List[List[float]]:
    """
    Union all corridor polygons into a single unified polygon.

    Args:
        corridor_dicts: List of corridor dicts with 'polygon' key

    Returns:
        Single unified polygon as list of [x,y] coordinates
    """
    if not HAS_SHAPELY:
        print("WARNING: Shapely not available - returning largest corridor fragment")
        if not corridor_dicts:
            return []
        largest = max(corridor_dicts, key=lambda c: len(c.get('polygon', [])))
        return largest.get('polygon', [])

    shapely_polys = []
    for c in corridor_dicts:
        poly = c.get('polygon', [])
        sp = _poly_to_shapely(poly)
        if sp and sp.is_valid and not sp.is_empty:
            shapely_polys.append(sp)

    if not shapely_polys:
        return []

    try:
        unified = unary_union(shapely_polys)

        if isinstance(unified, MultiPolygon):
            unified = max(unified.geoms, key=lambda p: p.area)

        if unified.is_valid and not unified.is_empty:
            result = _shapely_to_poly(unified)
            print(f"Corridor union: {len(corridor_dicts)} fragments → 1 unified polygon ({len(result)} vertices)")
            return result
        else:
            print("WARNING: Corridor union produced invalid polygon")
            return []
    except Exception as e:
        print(f"WARNING: Corridor union failed: {e}")
        largest = max(corridor_dicts, key=lambda c: len(c.get('polygon', [])))
        return largest.get('polygon', [])


def find_hall_entrances_via_intersection(
    hall_poly: List[List[float]],
    corridor_poly: List[List[float]],
    num_rays: int = 16
) -> List[Tuple[float, float]]:
    """
    Find hall entrance points by detecting where hall boundary intersects corridor.

    Args:
        hall_poly: Hall polygon vertices
        corridor_poly: Unified corridor polygon vertices
        num_rays: Number of rays to cast from hall center

    Returns:
        List of (x, y) entrance point coordinates
    """
    if not HAS_SHAPELY or not hall_poly or not corridor_poly:
        cx = sum(p[0] for p in hall_poly) / len(hall_poly)
        cy = sum(p[1] for p in hall_poly) / len(hall_poly)
        return [(cx, cy)]

    try:
        hall_geom = Polygon([(p[0], p[1]) for p in hall_poly])
        corridor_geom = Polygon([(p[0], p[1]) for p in corridor_poly])

        if not hall_geom.is_valid or not corridor_geom.is_valid:
            cx = sum(p[0] for p in hall_poly) / len(hall_poly)
            cy = sum(p[1] for p in hall_poly) / len(hall_poly)
            return [(cx, cy)]

        centroid = hall_geom.centroid
        cx, cy = centroid.x, centroid.y

        entrances = []
        for i in range(num_rays):
            angle = 2.0 * math.pi * i / num_rays
            dx = math.cos(angle)
            dy = math.sin(angle)

            step = 5.0
            x, y = cx, cy
            for _ in range(200):
                x += dx * step
                y += dy * step
                pt = Point(x, y)

                if not hall_geom.contains(pt):
                    if corridor_geom.contains(pt):
                        entrances.append((x, y))
                    break

        if entrances:
            return entrances
        else:
            boundary = hall_geom.boundary
            intersection = boundary.intersection(corridor_geom)

            if not intersection.is_empty:
                if hasattr(intersection, 'coords'):
                    return list(intersection.coords)
                elif hasattr(intersection, 'geoms'):
                    points = []
                    for geom in intersection.geoms:
                        if hasattr(geom, 'coords'):
                            points.extend(list(geom.coords))
                    if points:
                        return points

            return [(cx, cy)]

    except Exception as e:
        print(f"Warning: Hall entrance detection failed: {e}")
        cx = sum(p[0] for p in hall_poly) / len(hall_poly)
        cy = sum(p[1] for p in hall_poly) / len(hall_poly)
        return [(cx, cy)]


def _neighbors_8(img: np.ndarray, r: int, c: int) -> List[Tuple[int, int]]:
    return [
        (r - 1, c), (r - 1, c + 1), (r, c + 1), (r + 1, c + 1),
        (r + 1, c), (r + 1, c - 1), (r, c - 1), (r - 1, c - 1),
    ]


def _zs_thin(binary: np.ndarray, max_iters: int = 250) -> np.ndarray:
    img = (binary > 0).astype(np.uint8)
    h, w = img.shape

    def transitions(p: List[int]) -> int:
        t = 0
        for i in range(8):
            if p[i] == 0 and p[(i + 1) % 8] == 1:
                t += 1
        return t

    changed = True
    it = 0
    while changed and it < max_iters:
        changed = False
        it += 1
        to_remove: List[Tuple[int, int]] = []

        for r in range(1, h - 1):
            for c in range(1, w - 1):
                if img[r, c] != 1:
                    continue
                ncoords = _neighbors_8(img, r, c)
                p = [int(img[rr, cc]) for rr, cc in ncoords]
                s = sum(p)
                if s < 2 or s > 6:
                    continue
                if transitions(p) != 1:
                    continue
                if p[0] * p[2] * p[4] != 0:
                    continue
                if p[2] * p[4] * p[6] != 0:
                    continue
                to_remove.append((r, c))

        if to_remove:
            for r, c in to_remove:
                img[r, c] = 0
            changed = True

        to_remove = []

        for r in range(1, h - 1):
            for c in range(1, w - 1):
                if img[r, c] != 1:
                    continue
                ncoords = _neighbors_8(img, r, c)
                p = [int(img[rr, cc]) for rr, cc in ncoords]
                s = sum(p)
                if s < 2 or s > 6:
                    continue
                if transitions(p) != 1:
                    continue
                if p[0] * p[2] * p[6] != 0:
                    continue
                if p[0] * p[4] * p[6] != 0:
                    continue
                to_remove.append((r, c))

        if to_remove:
            for r, c in to_remove:
                img[r, c] = 0
            changed = True

    return img


def _skeleton_degrees(skel: np.ndarray) -> np.ndarray:
    h, w = skel.shape
    deg = np.zeros_like(skel, dtype=np.uint8)
    p = np.pad(skel, 1, mode="constant", constant_values=0)
    neigh_sum = (
        p[0:h, 1:w + 1] + p[0:h, 2:w + 2] + p[1:h + 1, 2:w + 2] + p[2:h + 2, 2:w + 2] +
        p[2:h + 2, 1:w + 1] + p[2:h + 2, 0:w] + p[1:h + 1, 0:w] + p[0:h, 0:w]
    )
    deg[skel > 0] = neigh_sum[skel > 0].astype(np.uint8)
    return deg


def _prune_spurs(skel: np.ndarray, min_len_px: float, cell_px: float) -> np.ndarray:
    sk = skel.copy().astype(np.uint8)
    min_steps = max(1, int(math.ceil(min_len_px / float(cell_px))))
    h, w = sk.shape

    def neigh(r: int, c: int) -> List[Tuple[int, int]]:
        out = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                rr, cc = r + dr, c + dc
                if 0 <= rr < h and 0 <= cc < w and sk[rr, cc] == 1:
                    out.append((rr, cc))
        return out

    changed = True
    rounds = 0
    while changed and rounds < 60:
        rounds += 1
        changed = False
        deg = _skeleton_degrees(sk)
        endpoints = list(zip(*np.where((sk == 1) & (deg == 1))))
        to_kill: Set[Tuple[int, int]] = set()

        for ep in endpoints:
            path = [ep]
            prev = None
            cur = ep
            for _ in range(min_steps):
                ns = neigh(cur[0], cur[1])
                if prev is not None:
                    ns = [x for x in ns if x != prev]
                if not ns:
                    break
                nxt = ns[0]
                path.append(nxt)
                prev, cur = cur, nxt

            if len(path) <= min_steps and deg[cur] >= 3:
                for p in path[:-1]:
                    to_kill.add(p)

        if to_kill:
            for r, c in to_kill:
                sk[r, c] = 0
            changed = True

    return sk


@dataclass(frozen=True)
class Pixel:
    r: int
    c: int


def _pixel_neighbors(skel: np.ndarray, p: Pixel) -> List[Pixel]:
    h, w = skel.shape
    out: List[Pixel] = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            rr, cc = p.r + dr, p.c + dc
            if 0 <= rr < h and 0 <= cc < w and skel[rr, cc] == 1:
                out.append(Pixel(rr, cc))
    return out


def _pixel_step_dist(a: Pixel, b: Pixel, cell_px: float) -> float:
    dr = abs(a.r - b.r)
    dc = abs(a.c - b.c)
    return cell_px if (dr + dc == 1) else cell_px * math.sqrt(2.0)


def _compress_skeleton_to_graph(
    skel: np.ndarray,
    cell_px: float,
    split_every_steps: int = 6,
) -> Tuple[List[Pixel], List[Tuple[Pixel, Pixel, float]]]:
    sk = skel.astype(np.uint8)
    deg = _skeleton_degrees(sk)
    nodes: Set[Pixel] = set(Pixel(r, c) for r, c in zip(*np.where((sk == 1) & (deg != 2))))

    if not nodes:
        all_pix = list(zip(*np.where(sk == 1)))
        for r, c in all_pix[:: max(1, len(all_pix) // 50)]:
            nodes.add(Pixel(r, c))

    def neigh(p: Pixel) -> List[Pixel]:
        return _pixel_neighbors(sk, p)

    for _round in range(12):
        added: Set[Pixel] = set()
        for u in list(nodes):
            for v in neigh(u):
                prev = u
                cur = v
                steps = 1
                while cur not in nodes:
                    ns = neigh(cur)
                    ns = [x for x in ns if x != prev]
                    if not ns:
                        break
                    if steps >= split_every_steps:
                        added.add(cur)
                        break
                    prev, cur = cur, ns[0]
                    steps += 1
        if not added:
            break
        before = len(nodes)
        nodes |= added
        if len(nodes) == before:
            break

    nodes_list = sorted(list(nodes), key=lambda p: (p.r, p.c))
    node_set = set(nodes_list)

    edges: List[Tuple[Pixel, Pixel, float]] = []
    seen_dir: Set[Tuple[Pixel, Pixel]] = set()

    for u in nodes_list:
        for v in neigh(u):
            if (u, v) in seen_dir:
                continue
            seen_dir.add((u, v))
            seen_dir.add((v, u))

            prev = u
            cur = v
            dacc = _pixel_step_dist(u, v, cell_px)

            while cur not in node_set:
                ns = neigh(cur)
                ns = [x for x in ns if x != prev]
                if not ns:
                    node_set.add(cur)
                    nodes_list.append(cur)
                    break
                nxt = ns[0]
                dacc += _pixel_step_dist(cur, nxt, cell_px)
                prev, cur = cur, nxt
                seen_dir.add((prev, cur))
                seen_dir.add((cur, prev))

            if cur != u and cur in node_set:
                a, b = (u, cur) if (u.r, u.c) < (cur.r, cur.c) else (cur, u)
                edges.append((a, b, float(dacc)))

    uniq = {}
    for a, b, d in edges:
        key = (a, b)
        if key not in uniq or d < uniq[key]:
            uniq[key] = d
    return nodes_list, [(k[0], k[1], v) for k, v in uniq.items()]


class NavMeshGenerator:
    def __init__(
        self,
        rooms: List[Dict],
        corridors: List[Dict],
        entrances: Optional[List[Dict]] = None,
        corridor_step_px: int = 12,
        segment_size_px: int = 300,
        max_corridor_nodes: int = 6000,
        spur_prune_px: float = 30.0,
    ):
        self.rooms = rooms or []
        self.corridors = corridors or []
        self.entrances = entrances or []

        self.corridor_step_px = int(max(6, corridor_step_px))
        self.segment_size_px = int(max(50, segment_size_px))
        self.max_corridor_nodes = int(max(200, max_corridor_nodes))
        self.spur_prune_px = float(max(0.0, spur_prune_px))

        self.nodes: List[Dict] = []
        self.edges: List[Dict] = []

        print("Unifying corridor polygons...")
        self._unified_corridor_poly = union_corridor_polygons(self.corridors)
        self._corridor_polys: List[List[List[float]]] = [self._unified_corridor_poly] if self._unified_corridor_poly else []

        self._hall_polys: List[List[List[float]]] = []

        self._walkable_raster: Optional[np.ndarray] = None
        self._raster_min_x: float = 0.0
        self._raster_min_y: float = 0.0
        self._raster_cell: float = float(self.corridor_step_px)

    def generate(self) -> Dict:
        print("Generating navigation mesh (spine routing - FIXED VERSION)")

        self.nodes = []
        self.edges = []

        self._create_room_nodes()
        self._hall_polys = [n["polygon"] for n in self.nodes if n["type"] == "room"]

        self._create_spine_corridor_graph()
        self._connect_rooms_via_entrances()
        self._create_or_connect_entrance()

        print(f"Generated {len(self.nodes)} nodes and {len(self.edges)} edges")

        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "rooms_metadata": self._extract_room_metadata(),
            "corridor_polygons": self.corridors,
        }

    def _create_room_nodes(self) -> None:
        for idx, room in enumerate(self.rooms):
            self.nodes.append(
                {
                    "id": f"room_{idx}",
                    "type": "room",
                    "name": room.get("name", f"Room {idx + 1}"),
                    "position": room["center"],
                    "bounds": room["bounds"],
                    "polygon": room["polygon"],
                    "is_destination": True,
                }
            )

    def _extract_room_metadata(self) -> List[Dict]:
        rooms = []
        for n in self.nodes:
            if n["type"] == "room":
                rooms.append(
                    {"id": n["id"], "name": n.get("name", n["id"]), "bounds": n.get("bounds"), "center": n.get("position")}
                )
        return rooms

    def _in_any_corridor(self, x: float, y: float) -> bool:
        for poly in self._corridor_polys:
            if _point_in_poly(x, y, poly):
                return True
        return False

    def _in_any_hall(self, x: float, y: float) -> bool:
        for poly in self._hall_polys:
            if _point_in_poly(x, y, poly):
                return True
        return False

    def _is_walkable(self, x: float, y: float) -> bool:
        return self._in_any_corridor(x, y) and (not self._in_any_hall(x, y))

    def _segment_walkable_corridor_only(self, a: Dict[str, float], b: Dict[str, float], samples: int = 21) -> bool:
        ax, ay = float(a["x"]), float(a["y"])
        bx, by = float(b["x"]), float(b["y"])
        for i in range(samples + 1):
            t = i / float(samples)
            x = ax + (bx - ax) * t
            y = ay + (by - ay) * t
            if not self._is_walkable(x, y):
                return False
        return True

    def _world_to_cell(self, x: float, y: float) -> Tuple[int, int]:
        c = int((x - self._raster_min_x) / self._raster_cell)
        r = int((y - self._raster_min_y) / self._raster_cell)
        return r, c

    def _cell_to_world(self, r: int, c: int) -> Dict[str, float]:
        x = self._raster_min_x + (c + 0.5) * self._raster_cell
        y = self._raster_min_y + (r + 0.5) * self._raster_cell
        return {"x": float(x), "y": float(y)}

    def _create_spine_corridor_graph(self) -> None:
        if not self._corridor_polys or not self._unified_corridor_poly:
            print("WARNING: No unified corridor polygon")
            return

        poly = self._unified_corridor_poly

        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)

        pad = float(self.corridor_step_px) * 2.0
        min_x -= pad
        min_y -= pad
        max_x += pad
        max_y += pad

        cell = float(self.corridor_step_px)
        w = int(math.ceil((max_x - min_x) / cell))
        h = int(math.ceil((max_y - min_y) / cell))

        if w * h > 1_200_000:
            scale = math.sqrt((w * h) / 1_200_000.0)
            cell *= max(1.0, scale)
            w = int(math.ceil((max_x - min_x) / cell))
            h = int(math.ceil((max_y - min_y) / cell))

        binary = np.zeros((h, w), dtype=np.uint8)
        for rr in range(h):
            y = min_y + (rr + 0.5) * cell
            for cc in range(w):
                x = min_x + (cc + 0.5) * cell
                if self._is_walkable(x, y):
                    binary[rr, cc] = 1

        self._walkable_raster = binary
        self._raster_min_x = float(min_x)
        self._raster_min_y = float(min_y)
        self._raster_cell = float(cell)

        if int(binary.sum()) == 0:
            print("WARNING: walkable raster empty")
            return

        skel = _zs_thin(binary)
        if self.spur_prune_px > 0:
            skel = _prune_spurs(skel, min_len_px=self.spur_prune_px, cell_px=cell)

        if int(skel.sum()) == 0:
            print("WARNING: skeleton empty")
            return

        node_pix, edge_pix = _compress_skeleton_to_graph(skel, cell_px=cell, split_every_steps=6)

        pix_to_nodeid: Dict[Pixel, str] = {}
        corridor_nodes: List[Dict] = []

        for idx, p in enumerate(node_pix):
            pos = self._cell_to_world(p.r, p.c)
            if not self._is_walkable(pos["x"], pos["y"]):
                continue
            seg_i = int(pos["x"] // float(self.segment_size_px))
            seg_j = int(pos["y"] // float(self.segment_size_px))
            segment_id = f"corr_seg_{seg_i}_{seg_j}"
            nid = f"corridor_{idx}"
            corridor_nodes.append(
                {"id": nid, "type": "corridor", "position": pos, "segment_id": segment_id, "is_destination": False}
            )
            pix_to_nodeid[p] = nid

        if len(corridor_nodes) > self.max_corridor_nodes:
            corridor_nodes = corridor_nodes[: self.max_corridor_nodes]
            keep = set(n["id"] for n in corridor_nodes)
            pix_to_nodeid = {p: nid for p, nid in pix_to_nodeid.items() if nid in keep}

        self.nodes.extend(corridor_nodes)
        node_by_id = {n["id"]: n for n in self.nodes}

        added_pairs = 0
        seen_pairs = set()
        for a_pix, b_pix, d in edge_pix:
            a_id = pix_to_nodeid.get(a_pix)
            b_id = pix_to_nodeid.get(b_pix)
            if not a_id or not b_id or a_id == b_id:
                continue
            key = tuple(sorted((a_id, b_id)))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)

            pa = node_by_id[a_id]["position"]
            pb = node_by_id[b_id]["position"]

            if not self._segment_walkable_corridor_only(pa, pb, samples=25):
                continue

            self._add_edge_bidir(a_id, b_id, float(d))
            added_pairs += 1

        print(f"Spine corridor graph: {len(corridor_nodes)} nodes, {added_pairs} edge pairs")

    def _connect_rooms_via_entrances(self) -> None:
        """Connect rooms to corridor using proper entrance detection."""
        room_nodes = [n for n in self.nodes if n["type"] == "room"]
        corridor_nodes = [n for n in self.nodes if n["type"] == "corridor"]

        if not room_nodes or not corridor_nodes:
            print("WARNING: Cannot connect rooms - missing nodes")
            return

        node_by_id = {n["id"]: n for n in self.nodes}

        for room in room_nodes:
            room_poly = room.get("polygon") or []
            if not room_poly:
                continue

            entrances = find_hall_entrances_via_intersection(
                room_poly,
                self._unified_corridor_poly,
                num_rays=16
            )

            if not entrances:
                cx, cy = float(room["position"]["x"]), float(room["position"]["y"])
                entrances = [(cx, cy)]

            best_conn = None
            min_dist = float('inf')

            for ex, ey in entrances:
                for corr in corridor_nodes:
                    cx, cy = corr["position"]["x"], corr["position"]["y"]
                    d = math.hypot(ex - cx, ey - cy)

                    if d < min_dist:
                        a = {"x": ex, "y": ey}
                        b = {"x": cx, "y": cy}
                        if self._segment_walkable_corridor_only(a, b, samples=25):
                            min_dist = d
                            best_conn = (ex, ey, corr["id"], d)

            if best_conn:
                door_x, door_y, spine_id, dist = best_conn

                door_id = f"door_{room['id']}"
                seg_i = int(door_x // float(self.segment_size_px))
                seg_j = int(door_y // float(self.segment_size_px))
                door_node = {
                    "id": door_id,
                    "type": "door",
                    "name": f"Door {room.get('name', room['id'])}",
                    "position": {"x": float(door_x), "y": float(door_y)},
                    "segment_id": f"corr_seg_{seg_i}_{seg_j}",
                    "is_destination": False,
                }
                self.nodes.append(door_node)
                node_by_id[door_id] = door_node

                room_cx = room["position"]["x"]
                room_cy = room["position"]["y"]
                self._add_edge_bidir(room["id"], door_id, math.hypot(room_cx - door_x, room_cy - door_y))
                self._add_edge_bidir(door_id, spine_id, dist)
            else:
                nearest = min(corridor_nodes, key=lambda c: _dist(room["position"], c["position"]))
                self._add_edge_bidir(room["id"], nearest["id"], _dist(room["position"], nearest["position"]))

    def _create_or_connect_entrance(self) -> None:
        entrance_id = "entrance_0"
        existing = next((n for n in self.nodes if n["id"] == entrance_id), None)

        if existing:
            entrance_node = existing
        else:
            corridor_nodes = [n for n in self.nodes if n["type"] == "corridor"]
            if not corridor_nodes:
                return
            corridor_nodes.sort(key=lambda n: (n["position"]["x"], n["position"]["y"]))
            entrance_pos = corridor_nodes[0]["position"]
            entrance_node = {
                "id": entrance_id,
                "type": "entrance",
                "name": "Entrance 0",
                "position": {"x": float(entrance_pos["x"]), "y": float(entrance_pos["y"])},
                "is_destination": True,
            }
            self.nodes.append(entrance_node)

        corridor_nodes = [n for n in self.nodes if n["type"] == "corridor"]
        if not corridor_nodes:
            return

        dists = [(float(_dist(entrance_node["position"], c["position"])), c) for c in corridor_nodes]
        dists.sort(key=lambda t: t[0])

        added = 0
        for d, corr in dists[:25]:
            if self._segment_walkable_corridor_only(entrance_node["position"], corr["position"], samples=31):
                self._add_edge_bidir(entrance_node["id"], corr["id"], float(d))
                added += 1
            if added >= 4:
                break

        if added == 0 and dists:
            d, corr = dists[0]
            self._add_edge_bidir(entrance_node["id"], corr["id"], float(d))

    def update_edge_weights_from_iot(self, sensor_data: Dict[str, float]) -> None:
        if not sensor_data:
            return
        node_by_id = {n["id"]: n for n in self.nodes}
        for e in self.edges:
            a = node_by_id.get(e["from"])
            b = node_by_id.get(e["to"])
            if not a or not b:
                continue

            mult = None
            if e["from"] in sensor_data:
                mult = float(sensor_data[e["from"]])
            elif e["to"] in sensor_data:
                mult = float(sensor_data[e["to"]])
            else:
                if a.get("type") in ("corridor", "door") and b.get("type") in ("corridor", "door"):
                    seg = a.get("segment_id") or b.get("segment_id")
                    if seg and seg in sensor_data:
                        mult = float(sensor_data[seg])

            if mult is None:
                continue

            base = float(e.get("base_weight", e.get("weight", 1.0)))
            e["base_weight"] = base
            e["weight"] = base * mult
            e["effective_weight"] = base * mult

    def _add_edge_bidir(self, a: str, b: str, weight: float) -> None:
        w = float(weight)
        self.edges.append({"from": a, "to": b, "weight": w, "base_weight": w, "effective_weight": w})
        self.edges.append({"from": b, "to": a, "weight": w, "base_weight": w, "effective_weight": w})
