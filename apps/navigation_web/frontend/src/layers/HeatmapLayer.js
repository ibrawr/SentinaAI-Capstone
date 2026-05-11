/**
 * Renders and updates a PixiJS heatmap overlay using telemetry points.
 * Supports venue-wide and booth-scoped views, grid-based aggregation,
 * and masking the overlay to a selected booth polygon when needed.
 */

import * as PIXI from 'pixi.js';
import {
  buildColorLUT,
  getBounds,
  aggregateToGrid,
  normalizeGrid,
  gridToRGBA,
  pointInPolygon,
} from '../utils/heatmap';

function polyToPixiPoints(poly) {
  // Accept [{x,y}] or [[x,y]]
  return poly.flatMap(p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]);
}

export default class HeatmapLayer {
  constructor({ worldContainer, zIndex = 50 }) {
    this.world = worldContainer;

    this.container = new PIXI.Container();
    this.container.zIndex = zIndex;
    this.container.sortableChildren = true;

    this.sprite = new PIXI.Sprite();
    this.sprite.zIndex = 1;
    this.sprite.roundPixels = true;
    this.container.addChild(this.sprite);

    this.maskGfx = new PIXI.Graphics();
    this.maskGfx.zIndex = 2;
    this.container.addChild(this.maskGfx);

    this.world.addChild(this.container);

    this.enabled = true;
    this.mode = 'global';
    this.radiusPx = 55;
    this.cellSizePx = 12;
    this.alphaScale = 1.0;
    this.selectedBoothId = null;

    this.lut = buildColorLUT();

    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');

    this._lastKey = '';
    this._booths = [];
  }

  destroy() {
    if (this.sprite.texture) this.sprite.texture.destroy(true);
    this.container.destroy({ children: true, texture: true, baseTexture: true });
  }

  setEnabled(v) {
    this.enabled = !!v;
    this.container.visible = this.enabled;
  }

  setMode(mode) {
    this.mode = mode === 'booth' ? 'booth' : 'global';
  }

  setRadius(px) {
    this.radiusPx = Math.max(5, Number(px) || 55);
  }

  setCellSize(px) {
    this.cellSizePx = Math.max(4, Number(px) || 12);
  }

  setAlphaScale(v) {
    this.alphaScale = Math.max(0, Number(v) || 1.0);
  }

  setBooths(booths) {
    this._booths = (booths || []).map(b => {
      const polygon = (b.polygon || []).map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
      return {
        id: b.id,
        polygon,
        bounds: getBounds(polygon),
      };
    });
  }

  setSelectedBoothId(id) {
    this.selectedBoothId = id;
  }

  // telemetryPoints: [{x,y,value?, boothId?}]
  // If boothId is missing, compute booth membership from the polygon when needed.
  update(telemetryPoints) {
    if (!this.enabled) return;

    const points = Array.isArray(telemetryPoints) ? telemetryPoints : [];
    const booth = this.mode === 'booth'
      ? this._booths.find(b => String(b.id) === String(this.selectedBoothId))
      : null;

    // In booth mode, only keep points that belong to the selected booth.
    let scopedPoints = points;
    if (this.mode === 'booth') {
      if (!booth) {
        // Hide the overlay until a booth is selected.
        this.sprite.visible = false;
        this.maskGfx.clear();
        this.sprite.mask = null;
        return;
      }

      // Prefer pre-tagged booth IDs first. Fall back to point-in-polygon when needed.
      scopedPoints = points.filter(p => {
        if (p.boothId != null) return String(p.boothId) === String(booth.id);
        return pointInPolygon({ x: p.x, y: p.y }, booth.polygon);
      });
    }

    // Booth mode stays locked to booth bounds. Global mode uses the current point bounds.
    const bounds = booth ? booth.bounds : getBounds(scopedPoints, { minX: 0, minY: 0, maxX: 1, maxY: 1 });

    // Skip rebuilding the texture if the visible output would be the same.
    const key = `${this.mode}|${this.selectedBoothId}|${this.radiusPx}|${this.cellSizePx}|${this.alphaScale}|${scopedPoints.length}|${bounds.minX.toFixed(1)},${bounds.minY.toFixed(1)},${bounds.maxX.toFixed(1)},${bounds.maxY.toFixed(1)}`;
    if (key === this._lastKey) {
      this.sprite.visible = true;
      this._applyMask(booth);
      return;
    }
    this._lastKey = key;

    if (scopedPoints.length === 0) {
      this.sprite.visible = false;
      this.maskGfx.clear();
      this.sprite.mask = null;
      return;
    }

    const { grid, cols, rows, cellSizePx } = aggregateToGrid(
      scopedPoints,
      this.radiusPx,
      this.cellSizePx,
      bounds
    );

    const { norm } = normalizeGrid(grid);
    const rgba = gridToRGBA(norm, cols, rows, this.lut, this.alphaScale);

    this._canvas.width = cols;
    this._canvas.height = rows;

    const imgData = this._ctx.createImageData(cols, rows);
    imgData.data.set(rgba);
    this._ctx.putImageData(imgData, 0, 0);

    const tex = PIXI.Texture.from(this._canvas);

    if (this.sprite.texture) this.sprite.texture.destroy(true);

    this.sprite.texture = tex;
    this.sprite.visible = true;

    // Scale the texture back into world space using the grid cell size.
    this.sprite.x = bounds.minX;
    this.sprite.y = bounds.minY;
    this.sprite.width = cols * cellSizePx;
    this.sprite.height = rows * cellSizePx;

    this._applyMask(booth);
  }

  _applyMask(booth) {
    if (this.mode !== 'booth' || !booth) {
      this.maskGfx.clear();
      this.sprite.mask = null;
      return;
    }

    this.maskGfx.clear();
    this.maskGfx.beginFill(0xffffff, 1);
    this.maskGfx.drawPolygon(polyToPixiPoints(booth.polygon));
    this.maskGfx.endFill();
    this.sprite.mask = this.maskGfx;
  }
}