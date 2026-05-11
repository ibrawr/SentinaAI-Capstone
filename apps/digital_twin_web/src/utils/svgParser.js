// SVG Parser - Converts SVG elements to hall format
// Supports: <rect>, <polygon>, <path>
// Path commands: M, L, H, V, Z, C, Q (curves flattened)

const CURVE_TOLERANCE = 5; // pixels
const COLORS = ['#e09f3e', '#1f3a5f', '#2f8f9d', '#9e2a2b', '#ff6b6b', '#9b59b6'];

// Parse SVG text and extract halls
export function parseSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  
  const halls = [];
  let idCounter = 1;

  // Parse <rect> elements
  const rects = doc.getElementsByTagName('rect');
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const hall = parseRect(rect, idCounter++);
    if (hall) halls.push(hall);
  }

  // Parse <polygon> elements
  const polygons = doc.getElementsByTagName('polygon');
  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i];
    const hall = parsePolygon(polygon, idCounter++);
    if (hall) halls.push(hall);
  }

  // Parse <path> elements
  const paths = doc.getElementsByTagName('path');
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const hall = parsePath(path, idCounter++);
    if (hall) halls.push(hall);
  }

  // Parse <circle> elements
  const circles = doc.getElementsByTagName('circle');
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i];
    const hall = parseCircle(circle, idCounter++);
    if (hall) halls.push(hall);
  }

  // Parse <ellipse> elements
  const ellipses = doc.getElementsByTagName('ellipse');
  for (let i = 0; i < ellipses.length; i++) {
    const ellipse = ellipses[i];
    const hall = parseEllipse(ellipse, idCounter++);
    if (hall) halls.push(hall);
  }

  return halls;
}

// Parse <rect> to hall
function parseRect(rect, id) {
  const x = parseFloat(rect.getAttribute('x') || 0);
  const y = parseFloat(rect.getAttribute('y') || 0);
  const width = parseFloat(rect.getAttribute('width') || 0);
  const height = parseFloat(rect.getAttribute('height') || 0);

  if (width === 0 || height === 0) return null;

  // Convert to polygon (4 vertices)
  return {
    id: `imported_hall_${id}`,
    telemetryId: `IMPORTED_${String(id).padStart(2, '0')}`,
    zone: 'Imported',
    vertices: [
      [Math.round(x), Math.round(y)],
      [Math.round(x + width), Math.round(y)],
      [Math.round(x + width), Math.round(y + height)],
      [Math.round(x), Math.round(y + height)]
    ],
    color: COLORS[(id - 1) % COLORS.length]
  };
}

// Parse <polygon> to hall
function parsePolygon(polygon, id) {
  const points = polygon.getAttribute('points');
  if (!points) return null;

  const vertices = points
    .trim()
    .split(/\s+/)
    .map(p => {
      const [x, y] = p.split(',').map(parseFloat);
      return [Math.round(x), Math.round(y)];
    })
    .filter(([x, y]) => !isNaN(x) && !isNaN(y));

  if (vertices.length < 3) return null;

  return {
    id: `imported_hall_${id}`,
    telemetryId: `IMPORTED_${String(id).padStart(2, '0')}`,
    zone: 'Imported',
    vertices,
    color: COLORS[(id - 1) % COLORS.length]
  };
}

// Parse <path> to hall
function parsePath(path, id) {
  const d = path.getAttribute('d');
  if (!d) return null;

  const vertices = parsePathData(d);
  if (vertices.length < 3) return null;

  return {
    id: `imported_hall_${id}`,
    telemetryId: `IMPORTED_${String(id).padStart(2, '0')}`,
    zone: 'Imported',
    vertices,
    color: COLORS[(id - 1) % COLORS.length]
  };
}

// Parse path data string into vertices
function parsePathData(d) {
  const commands = parseCommands(d);
  const vertices = [];
  let currentPos = [0, 0];
  let startPos = [0, 0];

  commands.forEach(({ cmd, args }) => {
    switch (cmd) {
      case 'M':
        currentPos = [args[0], args[1]];
        startPos = currentPos;
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'm':
        currentPos = [currentPos[0] + args[0], currentPos[1] + args[1]];
        startPos = currentPos;
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'L':
        currentPos = [args[0], args[1]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'l':
        currentPos = [currentPos[0] + args[0], currentPos[1] + args[1]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'H':
        currentPos = [args[0], currentPos[1]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'h':
        currentPos = [currentPos[0] + args[0], currentPos[1]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'V':
        currentPos = [currentPos[0], args[0]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'v':
        currentPos = [currentPos[0], currentPos[1] + args[0]];
        vertices.push([Math.round(currentPos[0]), Math.round(currentPos[1])]);
        break;

      case 'C':
        const cubicPoints = flattenCubicBezier(
          currentPos,
          [args[0], args[1]],
          [args[2], args[3]],
          [args[4], args[5]]
        );
        cubicPoints.slice(1).forEach(p => vertices.push([Math.round(p[0]), Math.round(p[1])]));
        currentPos = [args[4], args[5]];
        break;

      case 'c':
        const cubicPointsRel = flattenCubicBezier(
          currentPos,
          [currentPos[0] + args[0], currentPos[1] + args[1]],
          [currentPos[0] + args[2], currentPos[1] + args[3]],
          [currentPos[0] + args[4], currentPos[1] + args[5]]
        );
        cubicPointsRel.slice(1).forEach(p => vertices.push([Math.round(p[0]), Math.round(p[1])]));
        currentPos = [currentPos[0] + args[4], currentPos[1] + args[5]];
        break;

      case 'Q':
        const quadPoints = flattenQuadraticBezier(
          currentPos,
          [args[0], args[1]],
          [args[2], args[3]]
        );
        quadPoints.slice(1).forEach(p => vertices.push([Math.round(p[0]), Math.round(p[1])]));
        currentPos = [args[2], args[3]];
        break;

      case 'q':
        const quadPointsRel = flattenQuadraticBezier(
          currentPos,
          [currentPos[0] + args[0], currentPos[1] + args[1]],
          [currentPos[0] + args[2], currentPos[1] + args[3]]
        );
        quadPointsRel.slice(1).forEach(p => vertices.push([Math.round(p[0]), Math.round(p[1])]));
        currentPos = [currentPos[0] + args[2], currentPos[1] + args[3]];
        break;

      case 'Z':
      case 'z':
        // Close path (implicit)
        break;
    }
  });

  return vertices;
}

// Parse path command string
function parseCommands(d) {
  const commands = [];
  const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let match;

  while ((match = regex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const args = argsStr
      .split(/[\s,]+/)
      .filter(a => a)
      .map(parseFloat)
      .filter(a => !isNaN(a));

    commands.push({ cmd, args });
  }

  return commands;
}

// Flatten cubic Bezier curve
function flattenCubicBezier(p0, p1, p2, p3) {
  const points = [];
  
  function subdivide(t0, t1, depth = 0) {
    if (depth > 10) return;

    const t = (t0 + t1) / 2;
    const point = cubicBezierPoint(p0, p1, p2, p3, t);
    
    const midPoint = [
      (cubicBezierPoint(p0, p1, p2, p3, t0)[0] + cubicBezierPoint(p0, p1, p2, p3, t1)[0]) / 2,
      (cubicBezierPoint(p0, p1, p2, p3, t0)[1] + cubicBezierPoint(p0, p1, p2, p3, t1)[1]) / 2
    ];

    const distance = Math.sqrt(
      Math.pow(point[0] - midPoint[0], 2) + Math.pow(point[1] - midPoint[1], 2)
    );

    if (distance > CURVE_TOLERANCE) {
      subdivide(t0, t, depth + 1);
      points.push(point);
      subdivide(t, t1, depth + 1);
    }
  }

  points.push(p0);
  subdivide(0, 1);
  points.push(p3);

  return points;
}

// Cubic Bezier point at t
function cubicBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u*u*u * p0[0] + 3*u*u*t * p1[0] + 3*u*t*t * p2[0] + t*t*t * p3[0],
    u*u*u * p0[1] + 3*u*u*t * p1[1] + 3*u*t*t * p2[1] + t*t*t * p3[1]
  ];
}

// Flatten quadratic Bezier curve
function flattenQuadraticBezier(p0, p1, p2) {
  const points = [];
  
  function subdivide(t0, t1, depth = 0) {
    if (depth > 10) return;

    const t = (t0 + t1) / 2;
    const point = quadraticBezierPoint(p0, p1, p2, t);
    
    const midPoint = [
      (quadraticBezierPoint(p0, p1, p2, t0)[0] + quadraticBezierPoint(p0, p1, p2, t1)[0]) / 2,
      (quadraticBezierPoint(p0, p1, p2, t0)[1] + quadraticBezierPoint(p0, p1, p2, t1)[1]) / 2
    ];

    const distance = Math.sqrt(
      Math.pow(point[0] - midPoint[0], 2) + Math.pow(point[1] - midPoint[1], 2)
    );

    if (distance > CURVE_TOLERANCE) {
      subdivide(t0, t, depth + 1);
      points.push(point);
      subdivide(t, t1, depth + 1);
    }
  }

  points.push(p0);
  subdivide(0, 1);
  points.push(p2);

  return points;
}

// Quadratic Bezier point at t
function quadraticBezierPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u*u * p0[0] + 2*u*t * p1[0] + t*t * p2[0],
    u*u * p0[1] + 2*u*t * p1[1] + t*t * p2[1]
  ];
}

// Parse <circle> to hall
function parseCircle(circle, id) {
  const cx = parseFloat(circle.getAttribute('cx') || 0);
  const cy = parseFloat(circle.getAttribute('cy') || 0);
  const r = parseFloat(circle.getAttribute('r') || 0);

  if (r === 0) return null;

  // Convert circle to polygon using ellipse converter
  const vertices = ellipseToPolygon(cx, cy, r, r);
  
  return makePolygonHall(id, vertices);
}

// Parse <ellipse> to hall
function parseEllipse(ellipse, id) {
  const cx = parseFloat(ellipse.getAttribute('cx') || 0);
  const cy = parseFloat(ellipse.getAttribute('cy') || 0);
  const rx = parseFloat(ellipse.getAttribute('rx') || 0);
  const ry = parseFloat(ellipse.getAttribute('ry') || 0);

  if (rx === 0 || ry === 0) return null;

  const vertices = ellipseToPolygon(cx, cy, rx, ry);
  
  return makePolygonHall(id, vertices);
}

// Convert ellipse to polygon with enough segments to look round
function ellipseToPolygon(cx, cy, rx, ry, segments = 64) {
  const vertices = [];
  
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    vertices.push([Math.round(x), Math.round(y)]);
  }
  
  return vertices;
}

// Create polygon hall with standard schema
function makePolygonHall(id, vertices) {
  if (!vertices || vertices.length < 3) return null;
  
  return {
    id: `imported_hall_${id}`,
    telemetryId: `IMPORTED_${String(id).padStart(2, '0')}`,
    zone: 'Imported',
    vertices,
    color: COLORS[(id - 1) % COLORS.length]
  };
}
