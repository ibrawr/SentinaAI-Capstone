/**
 * Renders and updates the navigation heatmap overlay using window-based Pixi and heatmap utilities.
 * Supports global and booth-scoped views, point filtering, masking, and texture size protection.
 */

(function () {
  if (!window.PIXI) {
    console.warn('HeatmapLayer: PIXI not found on window.');
    return;
  }
  if (!window.HeatmapUtils) {
    console.warn('HeatmapLayer: HeatmapUtils not found on window.');
    return;
  }

  const PIXI = window.PIXI;
  const HU = window.HeatmapUtils;

  function getPointsBounds(points) {
    if (!points || points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  function toXYArray(poly) {
    // Accept [[x,y], ...] or [{x,y}, ...]
    return (poly || []).map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
  }

  function polyToPixiPoints(poly) {
    const pts = [];
    for (const p of poly || []) {
      if (Array.isArray(p)) {
        pts.push(p[0], p[1]);
      } else {
        pts.push(p.x, p.y);
      }
    }
    return pts;
  }

  class HeatmapLayer {
    constructor({ worldContainer, zIndex = 60 }) {
      this.world = worldContainer;

      this.container = new PIXI.Container();
      this.container.zIndex = zIndex;
      this.container.sortableChildren = true;
      this.world.addChild(this.container);

      this.sprite = new PIXI.Sprite();
      this.sprite.zIndex = 1;
      this.sprite.roundPixels = true;
      this.container.addChild(this.sprite);

      this.maskGfx = new PIXI.Graphics();
      this.maskGfx.zIndex = 2;
      this.container.addChild(this.maskGfx);

      this.enabled = true;
      this.mode = 'global';
      this.radiusPx = 55;
      this.cellSizePx = 12;
      this.alphaScale = 1.0;
      this.selectedBoothId = null;
      this._booths = [];

      this._canvas = document.createElement('canvas');
      this._ctx = this._canvas.getContext('2d');
      this._lastKey = '';

      // Keep texture sizes conservative so very large heatmaps do not blow up the renderer.
      this._maxTex = 2048;
    }

    destroy() {
      try {
        if (this.sprite.texture) this.sprite.texture.destroy(true);
        this.container.destroy({ children: true, texture: true, baseTexture: true });
      } catch (_) {}
    }

    setEnabled(v) {
      this.enabled = !!v;
      this.container.visible = this.enabled;
    }

    setMode(mode) {
      this.mode = (mode === 'booth') ? 'booth' : 'global';
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
        const polygon = toXYArray(b.polygon);
        return {
          id: b.id,
          polygon,
          bounds: HU.getPolygonBounds(polygon)
        };
      });
    }

    setSelectedBoothId(id) {
      this.selectedBoothId = id;
    }

    update(telemetryPoints) {
      if (!this.enabled) return;

      const points = Array.isArray(telemetryPoints) ? telemetryPoints : [];

      const booth = (this.mode === 'booth')
        ? this._booths.find(b => String(b.id) === String(this.selectedBoothId))
        : null;

      let scopedPoints = points;
      if (this.mode === 'booth') {
        if (!booth) {
          this.sprite.visible = false;
          this.maskGfx.clear();
          this.sprite.mask = null;
          return;
        }

        // Prefer boothId when it is already present. Fall back to polygon checks otherwise.
        scopedPoints = points.filter(p => {
          if (p.boothId != null) return String(p.boothId) === String(booth.id);
          return HU.pointInPolygon(p.x, p.y, booth.polygon);
        });
      }

      if (scopedPoints.length === 0) {
        this.sprite.visible = false;
        this.maskGfx.clear();
        this.sprite.mask = null;
        return;
      }

      const bounds = booth ? booth.bounds : getPointsBounds(scopedPoints);

      // Gradually increase cell size until the generated texture stays within safe limits.
      let cell = this.cellSizePx;
      let cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell) + 1);
      let rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell) + 1);
      while ((cols > this._maxTex || rows > this._maxTex) && cell < 200) {
        cell = Math.ceil(cell * 1.25);
        cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell) + 1);
        rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell) + 1);
      }

      // Cache the last visible state so we can skip rebuilding identical textures.
      const key = `${this.mode}|${this.selectedBoothId}|r${this.radiusPx}|c${cell}|a${this.alphaScale}|n${scopedPoints.length}|b${bounds.minX.toFixed(1)},${bounds.minY.toFixed(1)},${bounds.maxX.toFixed(1)},${bounds.maxY.toFixed(1)}`;
      if (key === this._lastKey) {
        this.sprite.visible = true;
        this._applyMask(booth);
        return;
      }
      this._lastKey = key;

      const boothPoly = booth ? booth.polygon : null;
      const gridData = HU.aggregateHeatmapGrid(scopedPoints, cell, this.radiusPx, bounds, boothPoly);
      if (!gridData || !gridData.grid || gridData.width === 0 || gridData.height === 0) {
        this.sprite.visible = false;
        this.maskGfx.clear();
        this.sprite.mask = null;
        return;
      }

      const imgData = HU.generateHeatmapImageData(gridData, 'hot', this.alphaScale);

      const w = gridData.width;
      const h = gridData.height;
      this._canvas.width = w;
      this._canvas.height = h;
      this._ctx.putImageData(imgData, 0, 0);

      const tex = PIXI.Texture.from(this._canvas);
      if (this.sprite.texture) {
        try {
          this.sprite.texture.destroy(true);
        } catch (_) {}
      }
      this.sprite.texture = tex;
      this.sprite.visible = true;

      this.sprite.x = bounds.minX;
      this.sprite.y = bounds.minY;
      this.sprite.width = w * cell;
      this.sprite.height = h * cell;

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

  window.HeatmapLayer = HeatmapLayer;
})();