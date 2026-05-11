"""
Rescales an existing navmesh JSON into the coordinate space of the current
SVG geometry and updates edge weights from the transformed node positions.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, Tuple, List

from svg_parser import SVGParser


def _looks_like_geometry_dict(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    dims = obj.get("dimensions")
    if not isinstance(dims, dict):
        return False
    if "width" not in dims or "height" not in dims:
        return False
    return ("rooms" in obj) or ("corridors" in obj) or ("entrances" in obj)


def _extract_geometry_from_parser(parser: Any) -> Dict:
    """Find a parser method that returns the expected geometry dict."""
    common_names = [
        "extract_all", "parse", "extract", "run", "process",
        "get_geometry", "extract_geometry", "extract_geometry_data",
        "extract_shapes", "extract_polygons", "build", "build_geometry", "to_dict",
    ]

    for name in common_names:
        fn = getattr(parser, name, None)
        if callable(fn):
            try:
                result = fn()
                if _looks_like_geometry_dict(result):
                    return result
            except Exception:
                continue

    for name in dir(parser):
        if name.startswith("_"):
            continue
        fn = getattr(parser, name, None)
        if not callable(fn):
            continue
        try:
            result = fn()
            if _looks_like_geometry_dict(result):
                return result
        except Exception:
            continue

    raise RuntimeError("Could not extract geometry dict from SVGParser.")


def _bbox_from_geometry(geometry: Dict) -> Tuple[float, float, float, float]:
    """Return (minX, minY, maxX, maxY) from rooms and corridors polygons."""
    xs: List[float] = []
    ys: List[float] = []

    for room in geometry.get("rooms", []) or []:
        for pt in room.get("polygon", []) or []:
            xs.append(float(pt[0]))
            ys.append(float(pt[1]))

    for cor in geometry.get("corridors", []) or []:
        for pt in cor.get("polygon", []) or []:
            xs.append(float(pt[0]))
            ys.append(float(pt[1]))

    if not xs or not ys:
        w = float(geometry["dimensions"]["width"])
        h = float(geometry["dimensions"]["height"])
        return (0.0, 0.0, w, h)

    return (min(xs), min(ys), max(xs), max(ys))


def _collect_nav_points(nav: Dict) -> List[Tuple[float, float]]:
    pts: List[Tuple[float, float]] = []

    for n in nav.get("nodes", []) or []:
        if isinstance(n.get("position"), dict):
            x = n["position"].get("x")
            y = n["position"].get("y")
        else:
            x = n.get("x")
            y = n.get("y")
        try:
            pts.append((float(x), float(y)))
        except Exception:
            pass

        poly = n.get("polygon")
        if isinstance(poly, list):
            for p in poly:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    try:
                        pts.append((float(p[0]), float(p[1])))
                    except Exception:
                        pass

    for r in nav.get("rooms_metadata", []) or []:
        pos = r.get("position", {})
        if isinstance(pos, dict):
            try:
                pts.append((float(pos.get("x", 0)), float(pos.get("y", 0))))
            except Exception:
                pass

        poly = r.get("polygon")
        if isinstance(poly, list):
            for p in poly:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    try:
                        pts.append((float(p[0]), float(p[1])))
                    except Exception:
                        pass

    return pts


def _bbox_from_nav(nav: Dict) -> Tuple[float, float, float, float]:
    pts = _collect_nav_points(nav)
    if not pts:
        raise RuntimeError("No usable points found in navmesh JSON.")
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def _affine_map(
    x: float,
    y: float,
    src: Tuple[float, float, float, float],
    dst: Tuple[float, float, float, float],
) -> Tuple[float, float]:
    sx0, sy0, sx1, sy1 = src
    dx0, dy0, dx1, dy1 = dst

    sw = max(1e-9, sx1 - sx0)
    sh = max(1e-9, sy1 - sy0)
    dw = dx1 - dx0
    dh = dy1 - dy0

    nx = (x - sx0) / sw
    ny = (y - sy0) / sh

    return (dx0 + nx * dw, dy0 + ny * dh)


def _rescale_navmesh(nav: Dict, src_bbox, dst_bbox) -> Dict:
    out = json.loads(json.dumps(nav))

    for n in out.get("nodes", []) or []:
        if "x" in n and "y" in n:
            nx, ny = _affine_map(float(n["x"]), float(n["y"]), src_bbox, dst_bbox)
            n["x"] = round(nx, 6)
            n["y"] = round(ny, 6)
        elif isinstance(n.get("position"), dict):
            px = float(n["position"].get("x", 0))
            py = float(n["position"].get("y", 0))
            nx, ny = _affine_map(px, py, src_bbox, dst_bbox)
            n["position"]["x"] = round(nx, 6)
            n["position"]["y"] = round(ny, 6)

        poly = n.get("polygon")
        if isinstance(poly, list):
            new_poly = []
            for p in poly:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    nx, ny = _affine_map(float(p[0]), float(p[1]), src_bbox, dst_bbox)
                    new_poly.append([round(nx, 6), round(ny, 6)])
            n["polygon"] = new_poly

    rms = out.get("rooms_metadata")
    if isinstance(rms, list):
        for r in rms:
            pos = r.get("position")
            if isinstance(pos, dict):
                nx, ny = _affine_map(float(pos.get("x", 0)), float(pos.get("y", 0)), src_bbox, dst_bbox)
                r["position"] = {"x": round(nx, 6), "y": round(ny, 6)}
            poly = r.get("polygon")
            if isinstance(poly, list):
                new_poly = []
                for p in poly:
                    if isinstance(p, (list, tuple)) and len(p) >= 2:
                        nx, ny = _affine_map(float(p[0]), float(p[1]), src_bbox, dst_bbox)
                        new_poly.append([round(nx, 6), round(ny, 6)])
                r["polygon"] = new_poly

    pos = {}
    for n in out.get("nodes", []) or []:
        if "x" in n and "y" in n:
            pos[n["id"]] = (float(n["x"]), float(n["y"]))
        elif isinstance(n.get("position"), dict):
            pos[n["id"]] = (float(n["position"]["x"]), float(n["position"]["y"]))

    for e in out.get("edges", []) or []:
        a = pos.get(e.get("from"))
        b = pos.get(e.get("to"))
        if a and b:
            dist = math.hypot(b[0] - a[0], b[1] - a[1])
            e["weight"] = max(1, int(round(dist)))

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--svg", required=True, help="Path to convention_map.svg (the NEW 1600x900 one)")
    ap.add_argument("--nav", required=True, help="Path to navmesh_output.json (old coords)")
    ap.add_argument("--out", required=True, help="Output path for rescaled navmesh json")
    args = ap.parse_args()

    svg_path = Path(args.svg).resolve()
    nav_path = Path(args.nav).resolve()
    out_path = Path(args.out).resolve()

    if not svg_path.exists():
        raise FileNotFoundError(svg_path)
    if not nav_path.exists():
        raise FileNotFoundError(nav_path)

    nav = json.loads(nav_path.read_text(encoding="utf-8"))

    parser = SVGParser(str(svg_path))
    geometry = _extract_geometry_from_parser(parser)

    dst_bbox = _bbox_from_geometry(geometry)
    src_bbox = _bbox_from_nav(nav)

    print("\nSOURCE navmesh bbox:", src_bbox, " (old coordinate space)")
    print("TARGET svg geometry bbox:", dst_bbox, " (new coordinate space from SVGParser)")
    print("TARGET svg reported dims:", geometry.get("dimensions"))

    rescaled = _rescale_navmesh(nav, src_bbox, dst_bbox)
    new_bbox = _bbox_from_nav(rescaled)
    print("NEW navmesh bbox:", new_bbox, " (should now match target bbox range)\n")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rescaled, indent=2), encoding="utf-8")
    print("Wrote:", out_path)


if __name__ == "__main__":
    main()