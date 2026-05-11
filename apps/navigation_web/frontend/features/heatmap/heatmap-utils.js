/**
 * Provides heatmap utility functions for polygon checks, Gaussian grid aggregation,
 * color ramp mapping, and RGBA image generation for the navigation heatmap overlay.
 */

(function() {
function pointInPolygon(x, y, polygon) {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

function getPolygonBounds(polygon) {
  if (!polygon || polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of polygon) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }

  return { minX, minY, maxX, maxY };
}

function gaussianKernel(distance, radius) {
  if (radius === 0) return distance === 0 ? 1 : 0;

  // Use sigma = radius / 3 so the influence is mostly contained within the radius.
  const sigma = radius / 3;
  const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return weight;
}

/*
 * Aggregates telemetry points into a heatmap grid using Gaussian falloff.
 * When a booth polygon is provided, only points inside that booth are included.
 */
function aggregateHeatmapGrid(points, cellSizePx, radiusPx, bounds, boothPolygon = null) {
  let filteredPoints = points;
  if (boothPolygon) {
    filteredPoints = points.filter(pt => pointInPolygon(pt.x, pt.y, boothPolygon));
  }

  if (filteredPoints.length === 0) {
    return {
      grid: new Float32Array(0),
      width: 0,
      height: 0,
      gridMinX: bounds.minX,
      gridMinY: bounds.minY,
      maxValue: 0
    };
  }

  const gridMinX = bounds.minX;
  const gridMinY = bounds.minY;
  const gridWidth = Math.ceil((bounds.maxX - bounds.minX) / cellSizePx) + 1;
  const gridHeight = Math.ceil((bounds.maxY - bounds.minY) / cellSizePx) + 1;

  const grid = new Float32Array(gridWidth * gridHeight);

  for (const point of filteredPoints) {
    const px = point.x;
    const py = point.y;
    const value = point.value || 1;

    const cellX = Math.floor((px - gridMinX) / cellSizePx);
    const cellY = Math.floor((py - gridMinY) / cellSizePx);

    const cellRadius = Math.ceil(radiusPx / cellSizePx);

    const minCellX = Math.max(0, cellX - cellRadius);
    const maxCellX = Math.min(gridWidth - 1, cellX + cellRadius);
    const minCellY = Math.max(0, cellY - cellRadius);
    const maxCellY = Math.min(gridHeight - 1, cellY + cellRadius);

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellCenterX = gridMinX + cx * cellSizePx + cellSizePx / 2;
        const cellCenterY = gridMinY + cy * cellSizePx + cellSizePx / 2;

        const dx = cellCenterX - px;
        const dy = cellCenterY - py;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radiusPx) {
          const weight = gaussianKernel(distance, radiusPx);
          const idx = cy * gridWidth + cx;
          grid[idx] += value * weight;
        }
      }
    }
  }

  let maxValue = 0;
  for (let i = 0; i < grid.length; i++) {
    maxValue = Math.max(maxValue, grid[i]);
  }

  return {
    grid,
    width: gridWidth,
    height: gridHeight,
    gridMinX,
    gridMinY,
    maxValue: maxValue || 1
  };
}

const colorRamps = {
  hot: [
    { stop: 0.0, r: 0, g: 0, b: 0, a: 0 },
    { stop: 0.2, r: 50, g: 0, b: 50, a: 100 },
    { stop: 0.4, r: 150, g: 0, b: 0, a: 150 },
    { stop: 0.6, r: 255, g: 100, b: 0, a: 200 },
    { stop: 0.8, r: 255, g: 255, b: 0, a: 230 },
    { stop: 1.0, r: 255, g: 255, b: 255, a: 255 }
  ],

  viridis: [
    { stop: 0.0, r: 68, g: 1, b: 84, a: 0 },
    { stop: 0.25, r: 59, g: 82, b: 139, a: 150 },
    { stop: 0.5, r: 33, g: 145, b: 140, a: 200 },
    { stop: 0.75, r: 94, g: 201, b: 98, a: 230 },
    { stop: 1.0, r: 253, g: 231, b: 37, a: 255 }
  ],

  cool: [
    { stop: 0.0, r: 0, g: 255, b: 255, a: 0 },
    { stop: 0.5, r: 0, g: 0, b: 255, a: 200 },
    { stop: 1.0, r: 255, g: 0, b: 255, a: 255 }
  ],

  jet: [
    { stop: 0.0, r: 0, g: 0, b: 128, a: 0 },
    { stop: 0.25, r: 0, g: 0, b: 255, a: 150 },
    { stop: 0.5, r: 0, g: 255, b: 255, a: 200 },
    { stop: 0.75, r: 255, g: 255, b: 0, a: 230 },
    { stop: 1.0, r: 255, g: 0, b: 0, a: 255 }
  ]
};

function mapIntensityToColor(intensity, ramp, alphaMultiplier = 1.0) {
  if (intensity <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  intensity = Math.max(0, Math.min(1, intensity));

  let lowerStop = ramp[0];
  let upperStop = ramp[ramp.length - 1];

  for (let i = 0; i < ramp.length - 1; i++) {
    if (intensity >= ramp[i].stop && intensity <= ramp[i + 1].stop) {
      lowerStop = ramp[i];
      upperStop = ramp[i + 1];
      break;
    }
  }

  const range = upperStop.stop - lowerStop.stop;
  const t = range === 0 ? 0 : (intensity - lowerStop.stop) / range;

  const r = Math.round(lowerStop.r + t * (upperStop.r - lowerStop.r));
  const g = Math.round(lowerStop.g + t * (upperStop.g - lowerStop.g));
  const b = Math.round(lowerStop.b + t * (upperStop.b - lowerStop.b));
  const a = Math.round((lowerStop.a + t * (upperStop.a - lowerStop.a)) * alphaMultiplier);

  return { r, g, b, a };
}

function generateHeatmapImageData(gridData, colorRampName = 'hot', intensityMultiplier = 1.0) {
  const { grid, width, height, maxValue } = gridData;
  const imageData = new Uint8ClampedArray(width * height * 4);

  const ramp = colorRamps[colorRampName] || colorRamps.hot;

  for (let i = 0; i < grid.length; i++) {
    const rawValue = grid[i];
    const normalizedIntensity = (rawValue / maxValue) * intensityMultiplier;
    const color = mapIntensityToColor(normalizedIntensity, ramp);

    const idx = i * 4;
    imageData[idx] = color.r;
    imageData[idx + 1] = color.g;
    imageData[idx + 2] = color.b;
    imageData[idx + 3] = color.a;
  }

  return imageData;
}

  window.HeatmapUtils = {
    pointInPolygon: pointInPolygon,
    getPolygonBounds: getPolygonBounds,
    gaussianKernel: gaussianKernel,
    aggregateHeatmapGrid: aggregateHeatmapGrid,
    mapIntensityToColor: mapIntensityToColor,
    generateHeatmapImageData: generateHeatmapImageData,
  };
})();