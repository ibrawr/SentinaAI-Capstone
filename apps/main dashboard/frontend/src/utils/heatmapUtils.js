// Ported from navigation_web/frontend/features/heatmap/heatmap-utils.js
// ESM named exports — no window globals.

export function pointInPolygon(x, y, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getPolygonBounds(polygon) {
  if (!polygon || polygon.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of polygon) {
    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
  }
  return { minX, minY, maxX, maxY };
}

function gaussianKernel(distance, radius) {
  if (radius === 0) return distance === 0 ? 1 : 0;
  const sigma = radius / 3;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export function aggregateHeatmapGrid(points, cellSizePx, radiusPx, bounds, boothPolygon = null) {
  let filteredPoints = points;
  if (boothPolygon) {
    filteredPoints = points.filter(pt => pointInPolygon(pt.x, pt.y, boothPolygon));
  }
  if (filteredPoints.length === 0) {
    return { grid: new Float32Array(0), width: 0, height: 0, gridMinX: bounds.minX, gridMinY: bounds.minY, maxValue: 0 };
  }
  const gridMinX = bounds.minX, gridMinY = bounds.minY;
  const gridWidth = Math.ceil((bounds.maxX - bounds.minX) / cellSizePx) + 1;
  const gridHeight = Math.ceil((bounds.maxY - bounds.minY) / cellSizePx) + 1;
  const grid = new Float32Array(gridWidth * gridHeight);

  for (const point of filteredPoints) {
    const px = point.x, py = point.y, value = point.value || 1;
    const cellX = Math.floor((px - gridMinX) / cellSizePx);
    const cellY = Math.floor((py - gridMinY) / cellSizePx);
    const cellRadius = Math.ceil(radiusPx / cellSizePx);
    const minCX = Math.max(0, cellX - cellRadius), maxCX = Math.min(gridWidth - 1, cellX + cellRadius);
    const minCY = Math.max(0, cellY - cellRadius), maxCY = Math.min(gridHeight - 1, cellY + cellRadius);
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const ccx = gridMinX + cx * cellSizePx + cellSizePx / 2;
        const ccy = gridMinY + cy * cellSizePx + cellSizePx / 2;
        const dist = Math.sqrt((ccx - px) ** 2 + (ccy - py) ** 2);
        if (dist <= radiusPx) grid[cy * gridWidth + cx] += value * gaussianKernel(dist, radiusPx);
      }
    }
  }

  let maxValue = 0;
  for (let i = 0; i < grid.length; i++) maxValue = Math.max(maxValue, grid[i]);
  return { grid, width: gridWidth, height: gridHeight, gridMinX, gridMinY, maxValue: maxValue || 1 };
}

const colorRamps = {
  hot: [
    { stop: 0.0, r: 0,   g: 0,   b: 0,   a: 0   },
    { stop: 0.2, r: 50,  g: 0,   b: 50,  a: 100 },
    { stop: 0.4, r: 150, g: 0,   b: 0,   a: 150 },
    { stop: 0.6, r: 255, g: 100, b: 0,   a: 200 },
    { stop: 0.8, r: 255, g: 255, b: 0,   a: 230 },
    { stop: 1.0, r: 255, g: 255, b: 255, a: 255 },
  ],
  rainbow: [
    { stop: 0.00, r: 0,   g: 0,   b: 0,   a: 0   },
    { stop: 0.15, r: 0,   g: 0,   b: 200, a: 120 },
    { stop: 0.35, r: 0,   g: 200, b: 255, a: 170 },
    { stop: 0.55, r: 0,   g: 220, b: 0,   a: 200 },
    { stop: 0.70, r: 255, g: 230, b: 0,   a: 220 },
    { stop: 0.85, r: 255, g: 100, b: 0,   a: 235 },
    { stop: 1.00, r: 255, g: 0,   b: 0,   a: 255 },
  ],
};

function mapIntensityToColor(intensity, ramp, alphaMultiplier = 1.0) {
  if (intensity <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  intensity = Math.max(0, Math.min(1, intensity));
  let lower = ramp[0], upper = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (intensity >= ramp[i].stop && intensity <= ramp[i + 1].stop) { lower = ramp[i]; upper = ramp[i + 1]; break; }
  }
  const range = upper.stop - lower.stop;
  const t = range === 0 ? 0 : (intensity - lower.stop) / range;
  return {
    r: Math.round(lower.r + t * (upper.r - lower.r)),
    g: Math.round(lower.g + t * (upper.g - lower.g)),
    b: Math.round(lower.b + t * (upper.b - lower.b)),
    a: Math.round((lower.a + t * (upper.a - lower.a)) * alphaMultiplier),
  };
}

export function generateHeatmapImageData(gridData, colorRampName = "hot", intensityMultiplier = 1.0) {
  const { grid, width, height, maxValue } = gridData;
  const imageData = new Uint8ClampedArray(width * height * 4);
  const ramp = colorRamps[colorRampName] || colorRamps.hot;
  for (let i = 0; i < grid.length; i++) {
    const color = mapIntensityToColor((grid[i] / maxValue) * intensityMultiplier, ramp);
    const idx = i * 4;
    imageData[idx] = color.r; imageData[idx + 1] = color.g;
    imageData[idx + 2] = color.b; imageData[idx + 3] = color.a;
  }
  return imageData;
}
