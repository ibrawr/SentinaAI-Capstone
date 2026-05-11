/**
 * Utility helpers for heatmap generation, including bounds calculation,
 * booth hit testing, grid aggregation, normalization, and RGBA color mapping.
 */

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function buildColorLUT(stops = null) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  const defaultStops = [
    [0.00, '#000000'],
    [0.15, '#1e3a8a'],
    [0.40, '#06b6d4'],
    [0.65, '#f59e0b'],
    [0.90, '#ef4444'],
    [1.00, '#ffffff'],
  ];
  (stops || defaultStops).forEach(([t, c]) => grad.addColorStop(t, c));

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

// Ray-casting point-in-polygon check. Polygon is [{x,y}, ...]
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getBounds(points, fallback = { minX: 0, minY: 0, maxX: 1, maxY: 1 }) {
  if (!points || points.length === 0) return fallback;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/*
  Aggregates point values into a grid using a Gaussian-style radius falloff.

  points: [{x,y,value}] where value defaults to 1
  radiusPx: influence radius in world pixels
  cellSizePx: grid cell size in pixels
  bounds: {minX,minY,maxX,maxY}
*/
export function aggregateToGrid(points, radiusPx, cellSizePx, bounds) {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSizePx));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSizePx));
  const grid = new Float32Array(cols * rows);

  const rCells = Math.max(1, Math.ceil(radiusPx / cellSizePx));
  const sigma = radiusPx / 3;
  const twoSigma2 = 2 * sigma * sigma;

  for (const p of points) {
    const px = (p.x - bounds.minX) / cellSizePx;
    const py = (p.y - bounds.minY) / cellSizePx;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    const w = (p.value ?? 1);

    for (let dy = -rCells; dy <= rCells; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= rows) continue;
      for (let dx = -rCells; dx <= rCells; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= cols) continue;

        const gx = (x + 0.5) * cellSizePx + bounds.minX;
        const gy = (y + 0.5) * cellSizePx + bounds.minY;
        const ddx = gx - p.x;
        const ddy = gy - p.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > radiusPx * radiusPx) continue;

        const k = Math.exp(-d2 / twoSigma2);
        grid[y * cols + x] += w * k;
      }
    }
  }

  return { grid, cols, rows, bounds, cellSizePx };
}

export function normalizeGrid(grid) {
  let max = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
  if (max <= 0) return { max: 0, norm: new Float32Array(grid.length) };
  const norm = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) norm[i] = grid[i] / max;
  return { max, norm };
}

// Converts normalized grid values into an RGBA buffer using the provided color lookup table.
export function gridToRGBA(normGrid, cols, rows, lut, alphaScale = 1.0, alphaPow = 0.9) {
  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let i = 0; i < normGrid.length; i++) {
    const t = clamp01(normGrid[i]);

    // Keep near-zero values transparent so the overlay fades out cleanly.
    const a = t <= 0.001 ? 0 : clamp01(Math.pow(t, alphaPow) * alphaScale);
    const idx = Math.min(255, Math.max(0, Math.floor(t * 255)));

    out[i * 4 + 0] = lut[idx * 4 + 0];
    out[i * 4 + 1] = lut[idx * 4 + 1];
    out[i * 4 + 2] = lut[idx * 4 + 2];
    out[i * 4 + 3] = Math.floor(a * 255);
  }
  return out;
}
