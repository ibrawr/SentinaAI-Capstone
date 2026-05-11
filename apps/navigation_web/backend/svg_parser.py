"""
Parses SVG venue geometry and extracts hall and corridor polygons for
navigation mesh generation.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import math
from typing import Dict, List, Optional, Tuple


SVG_NS = "http://www.w3.org/2000/svg"

HALL_FILLS = {
    "#1f3a5f",
    "#2f8f9d",
    "#9e2a2b",
    "#e09f3e",
}

CORRIDOR_FILL = "#ff0000"

COLOR_TOLERANCE = 20

TARGET_HALL_COUNT = 26


Matrix = Tuple[Tuple[float, float, float], Tuple[float, float, float], Tuple[float, float, float]]


def _mat_identity() -> Matrix:
    return (
        (1.0, 0.0, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 1.0),
    )


def _mat_mul(a: Matrix, b: Matrix) -> Matrix:
    """Matrix multiplication a @ b (3x3)."""
    return (
        (
            a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
            a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
            a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
        ),
        (
            a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
            a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
            a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
        ),
        (
            a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
            a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
            a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
        ),
    )


def _mat_apply(m: Matrix, x: float, y: float) -> Tuple[float, float]:
    """Apply affine matrix to point (x,y)."""
    nx = m[0][0] * x + m[0][1] * y + m[0][2]
    ny = m[1][0] * x + m[1][1] * y + m[1][2]
    return (float(nx), float(ny))


def _mat_translate(tx: float, ty: float) -> Matrix:
    return (
        (1.0, 0.0, float(tx)),
        (0.0, 1.0, float(ty)),
        (0.0, 0.0, 1.0),
    )


def _mat_scale(sx: float, sy: float) -> Matrix:
    return (
        (float(sx), 0.0, 0.0),
        (0.0, float(sy), 0.0),
        (0.0, 0.0, 1.0),
    )


def _mat_rotate(deg: float) -> Matrix:
    rad = math.radians(float(deg))
    c = math.cos(rad)
    s = math.sin(rad)
    return (
        (c, -s, 0.0),
        (s, c, 0.0),
        (0.0, 0.0, 1.0),
    )


def _mat_skew_x(deg: float) -> Matrix:
    t = math.tan(math.radians(float(deg)))
    return (
        (1.0, t, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 1.0),
    )


def _mat_skew_y(deg: float) -> Matrix:
    t = math.tan(math.radians(float(deg)))
    return (
        (1.0, 0.0, 0.0),
        (t, 1.0, 0.0),
        (0.0, 0.0, 1.0),
    )


def _parse_transform(transform_str: str) -> Matrix:
    """Parse SVG transform="..." into a single 3x3 matrix."""
    if not transform_str:
        return _mat_identity()

    s = transform_str.strip()
    if not s:
        return _mat_identity()

    m_total: Matrix = _mat_identity()

    for name, args in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", s):
        name_l = name.strip().lower()
        nums = _parse_floats(args)

        if name_l == "translate":
            tx = nums[0] if len(nums) >= 1 else 0.0
            ty = nums[1] if len(nums) >= 2 else 0.0
            tmat = _mat_translate(tx, ty)

        elif name_l == "scale":
            sx = nums[0] if len(nums) >= 1 else 1.0
            sy = nums[1] if len(nums) >= 2 else sx
            tmat = _mat_scale(sx, sy)

        elif name_l == "rotate":
            ang = nums[0] if len(nums) >= 1 else 0.0
            if len(nums) >= 3:
                cx, cy = nums[1], nums[2]
                tmat = _mat_mul(_mat_translate(cx, cy), _mat_mul(_mat_rotate(ang), _mat_translate(-cx, -cy)))
            else:
                tmat = _mat_rotate(ang)

        elif name_l == "matrix" and len(nums) >= 6:
            a, b, c, d, e, f = nums[:6]
            tmat = (
                (float(a), float(c), float(e)),
                (float(b), float(d), float(f)),
                (0.0, 0.0, 1.0),
            )

        elif name_l == "skewx":
            ang = nums[0] if len(nums) >= 1 else 0.0
            tmat = _mat_skew_x(ang)

        elif name_l == "skewy":
            ang = nums[0] if len(nums) >= 1 else 0.0
            tmat = _mat_skew_y(ang)

        else:
            continue

        m_total = _mat_mul(tmat, m_total)

    return m_total


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def _parse_floats(s: str) -> List[float]:
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s or "")]


def _get_style_attr(el: ET.Element, key: str) -> Optional[str]:
    style = el.get("style", "") or ""
    m = re.search(rf"{re.escape(key)}\s*:\s*([^;]+)", style, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None


def _hex_to_rgb(hex_color: str) -> Optional[Tuple[int, int, int]]:
    """Convert hex color to RGB tuple."""
    if not hex_color or hex_color == "none":
        return None
    hex_color = hex_color.strip().lower()

    if re.fullmatch(r"#([0-9a-f]{8})", hex_color):
        hex_color = hex_color[:7]

    if re.fullmatch(r"#([0-9a-f]{6})", hex_color):
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        return (r, g, b)

    return None


def _colors_match(color1: str, color2: str, tolerance: int = COLOR_TOLERANCE) -> bool:
    """Check if two hex colors match within tolerance."""
    rgb1 = _hex_to_rgb(color1)
    rgb2 = _hex_to_rgb(color2)

    if rgb1 is None or rgb2 is None:
        return False

    for c1, c2 in zip(rgb1, rgb2):
        if abs(c1 - c2) > tolerance:
            return False

    return True


def _normalize_hex_color(s: str) -> Optional[str]:
    """Normalize supported hex colors to #rrggbb form."""
    if not s:
        return None
    s = s.strip().lower()
    if s == "none":
        return None
    if re.fullmatch(r"#([0-9a-f]{8})", s):
        s = s[:7]
    if re.fullmatch(r"#([0-9a-f]{6})", s):
        return s
    return None


def get_normalized_fill(el: ET.Element) -> Optional[str]:
    fill = el.get("fill")
    if not fill:
        fill = _get_style_attr(el, "fill")
    return _normalize_hex_color(fill)


def is_hall_color(fill: str) -> bool:
    """Check if fill color matches any hall color with tolerance."""
    if not fill:
        return False

    for hall_color in HALL_FILLS:
        if _colors_match(fill, hall_color):
            return True

    return False


def is_corridor_color(fill: str) -> bool:
    """Check if fill color is corridor red (#ff0000)."""
    if not fill:
        return False

    return _colors_match(fill, CORRIDOR_FILL, tolerance=COLOR_TOLERANCE)


def get_label_text(el: ET.Element) -> str:
    """Best-effort label and id detection."""
    parts: List[str] = []
    if el.get("id"):
        parts.append(el.get("id"))  # type: ignore[arg-type]

    for k, v in el.attrib.items():
        if k.lower().endswith("label") and v:
            parts.append(v)

    if el.get("aria-label"):
        parts.append(el.get("aria-label"))  # type: ignore[arg-type]

    return " ".join(parts).strip().lower()


def prettify_hall_name(raw: str) -> str:
    """Convert compact SVG hall ids into human-readable names."""
    if not raw:
        return raw
    s = str(raw).strip()
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])([0-9])", r"\1 \2", s)
    s = re.sub(r"([0-9])([A-Za-z])", r"\1 \2", s)
    s = re.sub(r"\s+", " ", s).strip()
    parts = []
    for w in s.split(" "):
        if w.isupper() and len(w) <= 4:
            parts.append(w)
        else:
            parts.append(w[:1].upper() + w[1:])
    return " ".join(parts)


def _rect_to_poly(x: float, y: float, w: float, h: float) -> List[List[float]]:
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def _poly_area(poly: List[List[float]]) -> float:
    """Shoelace area."""
    if len(poly) < 3:
        return 0.0
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def _poly_bbox(poly: List[List[float]]) -> Dict[str, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return {
        "x": float(min(xs)),
        "y": float(min(ys)),
        "width": float(max(xs) - min(xs)),
        "height": float(max(ys) - min(ys)),
    }


def _poly_centroid(poly: List[List[float]]) -> Dict[str, float]:
    """Compute a polygon centroid with a point-average fallback."""
    n = len(poly)
    if n == 0:
        return {"x": 0.0, "y": 0.0}

    a2 = 0.0
    cx = 0.0
    cy = 0.0
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        a2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross

    if abs(a2) < 1e-9:
        sx = sum(p[0] for p in poly)
        sy = sum(p[1] for p in poly)
        return {"x": sx / n, "y": sy / n}

    a = a2 * 0.5
    cx /= (6.0 * a)
    cy /= (6.0 * a)
    return {"x": float(cx), "y": float(cy)}


class SVGParser:
    """Parse SVG files to extract geometric data for navigation mesh."""

    def __init__(self, svg_path: str):
        self.svg_path = svg_path
        self.tree = ET.parse(svg_path)
        self.root = self.tree.getroot()

        self._parent_map: Dict[ET.Element, ET.Element] = {}
        for parent in self.root.iter():
            for child in list(parent):
                self._parent_map[child] = parent

        viewbox = self.root.get("viewBox", "0 0 5600 3200")
        try:
            _, _, self.width, self.height = map(float, viewbox.split())
        except Exception:
            self.width, self.height = 5600.0, 3200.0

    def _cumulative_transform(self, el: ET.Element) -> Matrix:
        """Return the element transform including ancestor group transforms."""
        m: Matrix = _mat_identity()
        cur: Optional[ET.Element] = el
        while cur is not None:
            t = cur.get("transform")
            if t:
                m = _mat_mul(_parse_transform(t), m)
            cur = self._parent_map.get(cur)
        return m

    def _apply_transform(self, pts: List[List[float]], m: Matrix) -> List[List[float]]:
        if m == _mat_identity():
            return pts
        out: List[List[float]] = []
        for x, y in pts:
            nx, ny = _mat_apply(m, float(x), float(y))
            out.append([nx, ny])
        return out

    def extract_rooms(self) -> List[Dict]:
        candidates: List[Dict] = []

        for el in self.root.iter():
            tag = _strip_ns(el.tag)
            if tag not in ("rect", "path", "polygon"):
                continue

            fill = get_normalized_fill(el)
            if not is_hall_color(fill):
                continue

            label = get_label_text(el)
            if "hall" not in label:
                continue

            poly: Optional[List[List[float]]] = None

            if tag == "rect":
                x = float(el.get("x", 0))
                y = float(el.get("y", 0))
                w = float(el.get("width", 0))
                h = float(el.get("height", 0))
                if w <= 0 or h <= 0:
                    continue
                poly = _rect_to_poly(x, y, w, h)

            elif tag == "polygon":
                poly = self._parse_polygon_points(el.get("points", ""))

            elif tag == "path":
                poly = self._parse_path_to_points(el.get("d", ""))

            if not poly or len(poly) < 3:
                continue

            poly = self._apply_transform(poly, self._cumulative_transform(el))

            area = _poly_area(poly)
            if area <= 0:
                continue

            candidates.append(
                {
                    "type": "room",
                    "name": prettify_hall_name(el.get("id", "") or "") or prettify_hall_name(label or "") or "Hall",
                    "bounds": _poly_bbox(poly),
                    "center": _poly_centroid(poly),
                    "polygon": poly,
                    "_area": area,
                }
            )

        if len(candidates) > TARGET_HALL_COUNT:
            candidates.sort(key=lambda r: r["_area"], reverse=True)
            candidates = candidates[:TARGET_HALL_COUNT]

        for r in candidates:
            r.pop("_area", None)

        print(f"Halls extracted: {len(candidates)}")
        return candidates

    def extract_corridors(self) -> List[Dict]:
        corridors: List[Dict] = []

        for el in self.root.iter():
            tag = _strip_ns(el.tag)
            if tag not in ("rect", "path", "polygon"):
                continue

            fill = get_normalized_fill(el)
            if not is_corridor_color(fill):
                continue

            label = get_label_text(el)
            corridor_id = el.get("id", "")

            if tag == "rect":
                x = float(el.get("x", 0))
                y = float(el.get("y", 0))
                w = float(el.get("width", 0))
                h = float(el.get("height", 0))
                if w <= 0 or h <= 0:
                    continue
                poly = _rect_to_poly(x, y, w, h)
                poly = self._apply_transform(poly, self._cumulative_transform(el))
                corridors.append(self._poly_to_corridor(poly, corridor_id))

            elif tag == "polygon":
                pts = self._parse_polygon_points(el.get("points", ""))
                if pts and len(pts) >= 3:
                    pts = self._apply_transform(pts, self._cumulative_transform(el))
                    corridors.append(self._poly_to_corridor(pts, corridor_id))

            elif tag == "path":
                pts = self._parse_path_to_points(el.get("d", ""))
                if pts and len(pts) >= 3:
                    pts = self._apply_transform(pts, self._cumulative_transform(el))
                    corridors.append(self._poly_to_corridor(pts, corridor_id))

        print(f"Corridors extracted: {len(corridors)}")
        if len(corridors) == 0:
            print("WARNING: No corridors detected - routing will fail!")
            print("Check SVG for elements with fill=#ff0000")

        return corridors

    def _poly_to_corridor(self, pts: List[List[float]], corridor_id: str = "") -> Dict:
        return {
            "type": "corridor",
            "id": corridor_id,
            "bounds": _poly_bbox(pts),
            "polygon": pts,
        }

    def _parse_polygon_points(self, points_str: str) -> Optional[List[List[float]]]:
        if not points_str:
            return None
        nums = re.findall(r"-?\d+\.?\d*", points_str)
        if len(nums) < 6:
            return None
        pts: List[List[float]] = []
        for i in range(0, len(nums), 2):
            if i + 1 < len(nums):
                pts.append([float(nums[i]), float(nums[i + 1])])
        return pts if len(pts) >= 3 else None

    def _parse_path_to_points(self, d: str) -> Optional[List[List[float]]]:
        """Convert supported SVG path commands into a polyline."""
        if not d:
            return None

        tokens = re.findall(r"[A-Za-z]|-?\d+(?:\.\d+)?", d)
        if not tokens:
            return None

        pts: List[List[float]] = []
        i = [0]
        cmd: Optional[str] = None
        cur = [0.0, 0.0]
        start: Optional[List[float]] = None

        def cubic_bezier(p0, p1, p2, p3, t: float):
            mt = 1.0 - t
            return (
                (mt ** 3) * p0[0]
                + 3 * (mt ** 2) * t * p1[0]
                + 3 * mt * (t ** 2) * p2[0]
                + (t ** 3) * p3[0],
                (mt ** 3) * p0[1]
                + 3 * (mt ** 2) * t * p1[1]
                + 3 * mt * (t ** 2) * p2[1]
                + (t ** 3) * p3[1],
            )

        def read_num() -> float:
            if i[0] >= len(tokens):
                raise ValueError("Unexpected end of path data")
            val = float(tokens[i[0]])
            i[0] += 1
            return val

        while i[0] < len(tokens):
            t = tokens[i[0]]

            if re.fullmatch(r"[A-Za-z]", t):
                cmd = t
                i[0] += 1
                if cmd in ("Z", "z") and start is not None:
                    pts.append([start[0], start[1]])
                continue

            if cmd is None:
                i[0] += 1
                continue

            if cmd == "M":
                x = read_num()
                y = read_num()
                cur = [x, y]
                start = [x, y]
                pts.append([x, y])
                cmd = "L"

            elif cmd == "m":
                x = cur[0] + read_num()
                y = cur[1] + read_num()
                cur = [x, y]
                start = [x, y]
                pts.append([x, y])
                cmd = "l"

            elif cmd == "L":
                x = read_num()
                y = read_num()
                cur = [x, y]
                pts.append([x, y])

            elif cmd == "l":
                x = cur[0] + read_num()
                y = cur[1] + read_num()
                cur = [x, y]
                pts.append([x, y])

            elif cmd == "H":
                x = read_num()
                cur = [x, cur[1]]
                pts.append([cur[0], cur[1]])

            elif cmd == "h":
                x = cur[0] + read_num()
                cur = [x, cur[1]]
                pts.append([cur[0], cur[1]])

            elif cmd == "V":
                y = read_num()
                cur = [cur[0], y]
                pts.append([cur[0], cur[1]])

            elif cmd == "v":
                y = cur[1] + read_num()
                cur = [cur[0], y]
                pts.append([cur[0], cur[1]])

            elif cmd == "C":
                x1 = read_num()
                y1 = read_num()
                x2 = read_num()
                y2 = read_num()
                x = read_num()
                y = read_num()

                p0 = (cur[0], cur[1])
                p1 = (x1, y1)
                p2 = (x2, y2)
                p3 = (x, y)

                for step in range(1, 11):
                    tt = step / 10.0
                    bx, by = cubic_bezier(p0, p1, p2, p3, tt)
                    pts.append([float(bx), float(by)])

                cur = [x, y]

            elif cmd == "c":
                x1 = cur[0] + read_num()
                y1 = cur[1] + read_num()
                x2 = cur[0] + read_num()
                y2 = cur[1] + read_num()
                x = cur[0] + read_num()
                y = cur[1] + read_num()

                p0 = (cur[0], cur[1])
                p1 = (x1, y1)
                p2 = (x2, y2)
                p3 = (x, y)

                for step in range(1, 11):
                    tt = step / 10.0
                    bx, by = cubic_bezier(p0, p1, p2, p3, tt)
                    pts.append([float(bx), float(by)])

                cur = [x, y]

            else:
                return None

        cleaned: List[List[float]] = []
        for p in pts:
            if not cleaned or cleaned[-1] != p:
                cleaned.append(p)

        return cleaned if len(cleaned) >= 3 else None

    def get_dimensions(self) -> Tuple[float, float]:
        return self.width, self.height

    def extract_all(self) -> Dict:
        return {
            "dimensions": {"width": self.width, "height": self.height},
            "rooms": self.extract_rooms(),
            "corridors": self.extract_corridors(),
        }
