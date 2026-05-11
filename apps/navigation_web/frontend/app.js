// app.js - PixiJS Convention Center Navigation with IoT Crowd Awareness

const API_BASE = 'http://localhost:5000/api';
// If true, render every intermediate node as a small dot (useful for debugging navmesh).
const SHOW_PATH_DEBUG_POINTS = false;

class ConventionCenterApp {
    constructor() {
        this.app = null;
        this.navmeshData = null;
        this.currentPath = null;
        this.iotSummary = null;
        this.iotData = {};
        this.heatmapEnabled = false; // show/hide heatmap overlay
        this.heatmapOpacity = 1.0; // opaque overlay opacity (traffic light scale)
        this.demoMode = true; // DEMO: simulate varied occupancy (green/yellow/red)
        this._iotDataReal = {}; // last real telemetry payload
        this.crowdAvoidance = true; // NEW: toggle for crowd avoidance

        this.viewport = {
            zoom: 1,
            x: 0,
            y: 0
        };

        // Drag state and robust hover hit-testing (do not rely on Pixi hit tests)
        this._isDragging = false;
        this._roomHitTest = [];
        this._hoveredRoomId = null;
        this._robustHoverInitialized = false;
        this._navmeshRetryCount = 0;

        this.layers = {
            background: null,
            rooms: null,
            corridors: null,
            corridorOutlines: null,
            heatmap: null,  // heat map layer for occupancy
            path: null,
            interactive: null
        };

        // Fallback corridor geometry (if backend navmesh lacks corridor_polygons)
        this.svgCorridorPolygons = [];
        this._svgCorridorsLoaded = false;

        this.init();
    }

    async init() {
        this.setupPixi();
        await this.loadNavmesh();
        await this.loadSvgCorridors();
        await this.loadIoTData();
        // Keep telemetry + heatmap live
        setInterval(() => this.refreshTelemetry(), 5000);
        this.setupUI();
        this.renderMap();
        this.updateStatus('Ready', false);
    }

    setupPixi() {
        const canvas = document.getElementById('pixiCanvas');
        const container = document.getElementById('canvas-container');
        
	        this.app = new PIXI.Application({
	            view: canvas,
	            width: container.clientWidth,
	            height: container.clientHeight,
	            // Background Color
	            backgroundColor: 0xf5f5f5,
	            antialias: true,
	            resolution: window.devicePixelRatio || 1,
	        });
        
        try {
            this.app.renderer.resolution = 1;
        } catch (_) {}

        this.app.stage.sortableChildren = true;        // Create layers
        this.layers.background = new PIXI.Container();
        this.layers.corridors = new PIXI.Container();
        this.layers.corridorOutlines = new PIXI.Container();
        this.layers.rooms = new PIXI.Container();
        this.layers.heatmap = new PIXI.Container(); // overlay sits above rooms/corridors
        this.layers.path = new PIXI.Container();
        this.layers.interactive = new PIXI.Container();

        // Optional zIndex (stage.sortableChildren already enabled)
        this.layers.background.zIndex = 0;
        this.layers.corridors.zIndex = 10;        // base corridor fill
        this.layers.heatmap.zIndex = 20;          // opaque heat overlay (rooms + corridors)
        this.layers.corridorOutlines.zIndex = 30; // outlines stay readable above heatmap
        this.layers.rooms.zIndex = 40;            // labels + hall outlines above heatmap
        this.layers.path.zIndex = 50;
        this.layers.interactive.zIndex = 60;

        // Draw order: background → corridors → heatmap → corridorOutlines → rooms → path → interactive
        this.app.stage.addChild(this.layers.background);
        this.app.stage.addChild(this.layers.corridors);
        this.app.stage.addChild(this.layers.heatmap);
        this.app.stage.addChild(this.layers.corridorOutlines);
        this.app.stage.addChild(this.layers.rooms);
        this.app.stage.addChild(this.layers.path);
        this.app.stage.addChild(this.layers.interactive);

        this.app.stage.interactive = true;
        this.app.stage.hitArea = this.app.screen;

        this.setupPanZoom();
        window.addEventListener('resize', () => this.handleResize());
    }

    setupPanZoom() {
        // Make the map draggable from ANY click location (including halls/corridors).
        // We handle panning at the DOM level so interactive Pixi objects do not block dragging.
        try {
            this.app.stage.eventMode = 'static';
        } catch (_) {
            this.app.stage.interactive = true;
        }
        this.app.stage.hitArea = this.app.screen;

        let isDragging = false;
        let pointerId = null;
        let dragStartScreen = { x: 0, y: 0 };
        let startViewport = { x: 0, y: 0 };
        let movedPx = 0;

        const getLocalPoint = (e) => {
            const rect = this.app.view.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        const onDown = (e) => {
            // Left click / touch only
            if (typeof e.button === 'number' && e.button !== 0) return;
            isDragging = true;
            this._isDragging = true;
            movedPx = 0;
            pointerId = e.pointerId;
            const p = getLocalPoint(e);
            dragStartScreen = { x: p.x, y: p.y };
            startViewport = { x: this.viewport.x, y: this.viewport.y };
            try {
                this.app.view.setPointerCapture(pointerId);
            } catch (_) {}
        };

        const onMove = (e) => {
            if (!isDragging) return;
            if (pointerId !== null && e.pointerId !== pointerId) return;
            const p = getLocalPoint(e);
            const dxScreen = p.x - dragStartScreen.x;
            const dyScreen = p.y - dragStartScreen.y;
            movedPx = Math.max(movedPx, Math.abs(dxScreen) + Math.abs(dyScreen));
            const dx = dxScreen / this.viewport.zoom;
            const dy = dyScreen / this.viewport.zoom;
            this.viewport.x = startViewport.x + dx;
            this.viewport.y = startViewport.y + dy;
            this._clampViewportToMap();
            this.updateViewport();
            // Hide tooltip while actively dragging to avoid flicker
            if (movedPx > 2) this.hideEventTooltip();
        };

        const onUp = (e) => {
            if (pointerId !== null && e.pointerId !== pointerId) return;
            isDragging = false;
            this._isDragging = false;
            pointerId = null;
        };

        this.app.view.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);

        this.app.view.addEventListener('wheel', (event) => {
            event.preventDefault();
            const rect = this.app.view.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const oldZoom = this.viewport.zoom;
            const zoomStep = 1.08;
            const factor = event.deltaY > 0 ? 1 / zoomStep : zoomStep;
            const newZoom = this._clamp(oldZoom * factor, 0.25, 6.0);
            const worldX = (mouseX / oldZoom) - this.viewport.x;
            const worldY = (mouseY / oldZoom) - this.viewport.y;
            this.viewport.zoom = newZoom;
            this.viewport.x = (mouseX / newZoom) - worldX;
            this.viewport.y = (mouseY / newZoom) - worldY;
            this._clampViewportToMap();
            this.updateViewport();
        }, { passive: false });
    }

    _clampViewportToMap() {
        if (!this.navmeshData?.scale_info?.svg_dimensions) return;
        const mapW = this.navmeshData.scale_info.svg_dimensions.width;
        const mapH = this.navmeshData.scale_info.svg_dimensions.height;
        const screenW = this.app.screen.width / this.viewport.zoom;
        const screenH = this.app.screen.height / this.viewport.zoom;
        const marginX = mapW * 0.1;
        const marginY = mapH * 0.1;
        const minX = Math.min(-mapW - marginX + screenW, marginX);
        const maxX = Math.max(marginX, -mapW - marginX + screenW);
        const minY = Math.min(-mapH - marginY + screenH, marginY);
        const maxY = Math.max(marginY, -mapH - marginY + screenH);
        this.viewport.x = this._clamp(this.viewport.x, minX, maxX);
        this.viewport.y = this._clamp(this.viewport.y, minY, maxY);
    }

    resetView() {
        if (this.navmeshData && this.navmeshData.scale_info) {
            this.centerMap();
            return;
        }
        this.viewport = { zoom: 1, x: 0, y: 0 };
        this.updateViewport();
    }

    updateViewport() {
        const maxSane = 1000000;
        if (Math.abs(this.viewport.x) > maxSane || Math.abs(this.viewport.y) > maxSane) {
            console.warn('[VIEWPORT] Detected escaped coordinates, resetting:', this.viewport);
            this.viewport = { zoom: 1, x: 0, y: 0 };
        }
        this.app.stage.scale.set(this.viewport.zoom);
        this.app.stage.position.set(
            this.viewport.x * this.viewport.zoom,
            this.viewport.y * this.viewport.zoom
        );
    }

    handleResize() {
        const container = document.getElementById('canvas-container');
        this.app.renderer.resize(container.clientWidth, container.clientHeight);
        this.app.stage.hitArea = this.app.screen;
        this.centerMap();
    }

    _clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    _heatColor(t) {
        // Traffic-light heatmap: green (normal) → yellow (alarming) → red (critical)
        // t is expected to be normalized 0..1 (e.g., occupancy fraction or normalized congestion)
        t = this._clamp(Number(t) || 0, 0, 1);

        const lerp = (a, b, u) => Math.round(a + (b - a) * u);

        let r = 0, g = 0, b = 0;
        if (t <= 0.5) {
            // Green → Yellow
            const u = t / 0.5;
            r = lerp(0, 255, u);
            g = 255;
            b = 0;
        } else {
            // Yellow → Red
            const u = (t - 0.5) / 0.5;
            r = 255;
            g = lerp(255, 0, u);
            b = 0;
        }

        return (r << 16) + (g << 8) + b;
    }

    _hashString(s) {
        // Simple deterministic hash for stable demo values
        s = String(s ?? '');
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    _mulberry32(a) {
        // Deterministic PRNG returning 0..1
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    _buildDemoIoTData(real) {
        // Creates a believable spread of occupancies, while forcing a few halls to red.
        // If real telemetry already has good spread, we only override a few hotspots.
        const out = Object.assign({}, (real && typeof real === 'object') ? real : {});
        const nodes = this.navmeshData?.nodes || [];
        const roomNodes = nodes.filter(n => n.type === 'room');
        if (!roomNodes.length) return out;

        const sorted = [...roomNodes].sort((a, b) => (String(a.name || a.id)).localeCompare(String(b.name || b.id)));
        const N = sorted.length;

        const realVals = sorted
            .map(n => Number(out[n.id]))
            .filter(v => Number.isFinite(v));
        const spread = realVals.length ? (Math.max(...realVals) - Math.min(...realVals)) : 0;

        // Pick stable hotspots by percentile (works regardless of hall naming)
        const pickIdx = (p) => Math.max(0, Math.min(N - 1, Math.floor(p * (N - 1))));
        const redIds = new Set([sorted[pickIdx(0.15)]?.id, sorted[pickIdx(0.55)]?.id, sorted[pickIdx(0.85)]?.id].filter(Boolean));
        const yellowIds = new Set([sorted[pickIdx(0.30)]?.id, sorted[pickIdx(0.40)]?.id, sorted[pickIdx(0.70)]?.id].filter(Boolean));
        const greenIds = new Set([sorted[pickIdx(0.05)]?.id, sorted[pickIdx(0.25)]?.id, sorted[pickIdx(0.95)]?.id].filter(Boolean));

        // If telemetry is basically uniform (your "all yellow" issue), fully simulate a spread.
        const useFullSimulation = spread < 0.20;

        for (const n of sorted) {
            const id = n.id;
            const rand = this._mulberry32(this._hashString(id) ^ 0xA5A5A5A5)();

            if (useFullSimulation) {
                // Full distribution: mostly green, some yellow, few red.
                if (redIds.has(id)) {
                    out[id] = 0.90 + 0.09 * rand; // 90–99%
                } else if (yellowIds.has(id)) {
                    out[id] = 0.55 + 0.18 * rand; // 55–73%
                } else {
                    out[id] = 0.10 + 0.25 * rand; // 10–35%
                }
            } else {
                // Real telemetry has variety; just add believable demo emphasis.
                const base = Number(out[id]);
                const baseOcc = Number.isFinite(base) ? this._clamp(base, 0, 1) : (0.10 + 0.25 * rand);

                if (redIds.has(id)) out[id] = Math.max(baseOcc, 0.88 + 0.10 * rand);
                else if (greenIds.has(id)) out[id] = Math.min(baseOcc, 0.18 + 0.12 * rand);
                else out[id] = baseOcc;
            }
        }

        return out;
    }

    _buildDemoSummary(iotData) {
        const iot = (iotData && typeof iotData === 'object') ? iotData : {};
        const nodes = this.navmeshData?.nodes || [];
        const roomNodes = nodes.filter(n => n.type === 'room');
        const idToName = new Map(roomNodes.map(n => [n.id, n.name || n.id]));

        const vals = roomNodes
            .map(n => Number(iot[n.id]))
            .filter(v => Number.isFinite(v));

        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        const mx = vals.length ? Math.max(...vals) : 0;

        const crowded = roomNodes
            .map(n => ({ hallId: idToName.get(n.id), occupancy: this._clamp(Number(iot[n.id]) || 0, 0, 1) }))
            .filter(x => x.occupancy > 0.50)
            .sort((a, b) => b.occupancy - a.occupancy)
            .slice(0, 10);

        return {
            telemetry_enabled: true,
            avg_occupancy: avg,
            max_occupancy: mx,
            crowded_halls: crowded,
            telemetry_halls: roomNodes.length,
            telemetry_note: 'simulated'
        };
    }



    async refreshTelemetry() {
        // Lightweight polling to keep the heatmap + IoT panel live
        try {
            const [summaryResp, dataResp] = await Promise.all([
                fetch(`${API_BASE}/iot/summary`, { cache: 'no-store' }),
                fetch(`${API_BASE}/iot/data`, { cache: 'no-store' }),
            ]);

            const summary = await summaryResp.json().catch(() => null);
            const data = await dataResp.json().catch(() => ({}));

            if (summary) this.iotSummary = summary;
            if (data && typeof data === 'object') this._iotDataReal = data;
            this.iotData = this._iotDataReal || this.iotData || {};

            if (this.demoMode) {
                this.iotData = this._buildDemoIoTData(this._iotDataReal);
                this.iotSummary = this._buildDemoSummary(this.iotData);
            }

            this.updateIoTDisplay();
            this.renderHeatmap();
        } catch (_) {
            // keep quiet if telemetry is down
        }
    }

    async loadNavmesh() {
        this.updateStatus('Loading navigation mesh...', true);
        try {
            const response = await fetch(`${API_BASE}/navmesh`, { cache: 'no-store' });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                const msg = (data && data.error) ? data.error : `HTTP ${response.status}`;
                throw new Error(`Failed to load navmesh: ${msg}`);
            }

            // Defensive: if backend returns an unexpected payload, fail gracefully
            if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !Array.isArray(data.rooms)) {
                throw new Error('Navmesh payload missing required fields (nodes/edges/rooms)');
            }

            this.navmeshData = data;
            console.log('✓ Navmesh loaded:', this.navmeshData);

            document.getElementById('node-count').textContent = this.navmeshData.nodes.length;
            document.getElementById('edge-count').textContent = this.navmeshData.edges.length;
            document.getElementById('room-count').textContent = this.navmeshData.rooms.length;

            this.populateRoomDropdowns();
        } catch (error) {
            console.error('Error loading navmesh:', error);
            const msg = error?.message || String(error);
            this.updateStatus(`Error loading navmesh: ${msg}`, false);

            // If backend is still warming up, retry a few times so the UI doesn't stay on "Initializing..." forever.
            if (/system not initialized/i.test(msg) && this._navmeshRetryCount < 10) {
                this._navmeshRetryCount += 1;
                setTimeout(async () => {
                    await this.loadNavmesh();
                    if (this.navmeshData) {
                        this.populateRoomDropdowns();
                        this.renderMap();
                        this.updateStatus('Ready', false);
                    }
                }, 1000);
            }
        }
    }

    _parseHexWithAlpha(hex) {
        // Accepts: #RRGGBB or #RRGGBBAA
        if (typeof hex !== 'string') return { color: 0xffffff, alpha: 1 };
        const h = hex.trim().replace('#', '');
        if (h.length === 6) {
            return { color: parseInt(h, 16), alpha: 1 };
        }
        if (h.length === 8) {
            const rgb = parseInt(h.slice(0, 6), 16);
            const a = parseInt(h.slice(6, 8), 16);
            return { color: rgb, alpha: Math.max(0, Math.min(1, a / 255)) };
        }
        return { color: 0xffffff, alpha: 1 };
    }

	_getHallStyleByName(hallName) {
		// Returns { color: 0xRRGGBB, alpha: 0..1 }
		const safe = (hallName ?? '').toString().trim();
		const name = safe.toLowerCase();

		// Core hall buckets (keep your same palette)
		if (name.startsWith('north hall')) return { color: 0x9e2a2b, alpha: 0.4 };
		if (name.startsWith('east hall')) return { color: 0x1f3a5f, alpha: 0.4 };
		if (name.startsWith('south hall')) return { color: 0xe09f3e, alpha: 0.4 };

		// Generic halls like "Hall 1", "Hall 8", etc.
		if (name.startsWith('hall')) {
			const num = parseInt(name.replace('hall', '').trim(), 10);
			if (!Number.isNaN(num)) {
				if (num >= 1 && num <= 6) return { color: 0x2f8f9d, alpha: 0.4 };
				if (num >= 7 && num <= 10) return { color: 0x1f3a5f, alpha: 0.3 };
			}
		}

		return { color: 0xcccccc, alpha: 0.3 };
	}

    async loadIoTData() {
        this.updateStatus('Loading IoT telemetry...', true);
        try {
            // Load summary
            const summaryResp = await fetch(`${API_BASE}/iot/summary`, { cache: 'no-store' });
            this.iotSummary = await summaryResp.json().catch(() => null);
            
            // Load sensor data
            const dataResp = await fetch(`${API_BASE}/iot/data`, { cache: 'no-store' });
            this._iotDataReal = await dataResp.json().catch(() => ({}));
            this.iotData = this._iotDataReal;

            // DEMO: simulate occupancy spread so the heatmap isn't all yellow
            if (this.demoMode) {
                this.iotData = this._buildDemoIoTData(this._iotDataReal);
                this.iotSummary = this._buildDemoSummary(this.iotData);
            }

            const enabled = (this.iotSummary && this.iotSummary.telemetry_enabled) || this.demoMode;
            if (enabled) {
                console.log('✓ IoT Telemetry loaded:', this.iotSummary);
                this.updateIoTDisplay();
            } else {
                console.log('⚠ IoT Telemetry not available');
                const el = document.getElementById('iot-status');
                if (el) el.textContent = 'Offline';
                document.getElementById('iot-panel').style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading IoT data:', error);
            const el = document.getElementById('iot-status');
            if (el) el.textContent = 'Offline';
            document.getElementById('iot-panel').style.display = 'none';
        }
    }

    updateIoTDisplay() {
        const enabled = this.demoMode || (this.iotSummary && this.iotSummary.telemetry_enabled);
        if (!enabled) return;

        const summary = this.demoMode ? this._buildDemoSummary(this.iotData) : this.iotSummary;
        const statusEl = document.getElementById('iot-status');
        if (statusEl) statusEl.textContent = this.demoMode ? 'Simulated' : (summary.telemetry_enabled ? 'Active' : 'Offline');

        const avgEl = document.getElementById('avg-occupancy');
        if (avgEl) avgEl.textContent = `${(summary.avg_occupancy * 100).toFixed(1)}%`;

        const maxEl = document.getElementById('max-occupancy');
        if (maxEl) maxEl.textContent = `${(summary.max_occupancy * 100).toFixed(1)}%`;
        
        // Show crowded halls
        const crowdedList = document.getElementById('crowded-halls');
        crowdedList.innerHTML = '';
        
        if (summary.crowded_halls && summary.crowded_halls.length > 0) {
            summary.crowded_halls.slice(0, 5).forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.hallId}: ${(item.occupancy * 100).toFixed(0)}%`;
                li.style.color = item.occupancy > 0.75 ? '#ff6b6b' : '#ffa500';
                crowdedList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'No crowded halls';
            li.style.color = '#4caf50';
            crowdedList.appendChild(li);
        }
    }

    populateRoomDropdowns() {
        const startSelect = document.getElementById('startRoom');
        const endSelect = document.getElementById('endRoom');
        
        startSelect.innerHTML = '<option value="">Select starting hall...</option>';
        endSelect.innerHTML = '<option value="">Select destination...</option>';
        
        this.navmeshData.rooms.forEach(room => {
            const option1 = document.createElement('option');
            option1.value = room.id;
            option1.textContent = room.name;
            const option2 = option1.cloneNode(true);
            startSelect.appendChild(option1);
            endSelect.appendChild(option2);
        });
    }

    
    async loadSvgCorridors() {
        // If backend provides corridor_polygons, prefer those.
        const backendPolys = (this.navmeshData && Array.isArray(this.navmeshData.corridor_polygons)) ? this.navmeshData.corridor_polygons : null;
        if (backendPolys && backendPolys.length) {
            this._svgCorridorsLoaded = true;
            return;
        }
        if (this._svgCorridorsLoaded) return;

        try {
            // SVG is bundled into frontend/assets so it's always reachable by the static server.
            const res = await fetch('./assets/convention_map.svg', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const svgText = await res.text();

            // Create a real SVG element in the DOM so SVGPathElement geometry APIs work reliably.
            const holder = document.createElement('div');
            holder.style.position = 'absolute';
            holder.style.left = '-99999px';
            holder.style.top = '-99999px';
            holder.style.width = '1px';
            holder.style.height = '1px';
            holder.style.overflow = 'hidden';
            holder.innerHTML = svgText;

            document.body.appendChild(holder);
            const svgEl = holder.querySelector('svg');
            if (!svgEl) throw new Error('SVG <svg> root not found');

            const redPaths = Array.from(svgEl.querySelectorAll('path'))
                .filter(p => {
                    const style = (p.getAttribute('style') || '').toLowerCase().replace(/\s+/g,'');
                    const fill = (p.getAttribute('fill') || '').toLowerCase().replace(/\s+/g,'');
                    // Accept fill in style or attribute (#ff0000 or rgb(255,0,0))
                    return style.includes('fill:#ff0000') || fill === '#ff0000' || style.includes('fill:rgb(255,0,0)');
                });

            const corridors = [];

            for (const p of redPaths) {
                let total = 0;
                try { total = p.getTotalLength(); } catch (_) { total = 0; }
                if (!isFinite(total) || total <= 0) continue;

                const id = p.getAttribute('id') || 'corridor';
                // corridor_02 is curvy and long; sample denser so the outline looks smooth.
                const samples = (id === 'corridor_02') ? 220 : 80;

                const pts = [];
                for (let i = 0; i <= samples; i++) {
                    const t = (i / samples) * total;
                    const pt = p.getPointAtLength(t);
                    pts.push([pt.x, pt.y]);
                }
                // Reduce noise: drop near-duplicate consecutive points
                const simplified = [];
                const eps2 = 0.25; // ~0.5px squared
                for (const q of pts) {
                    if (!simplified.length) { simplified.push(q); continue; }
                    const a = simplified[simplified.length - 1];
                    const dx = q[0] - a[0], dy = q[1] - a[1];
                    if ((dx*dx + dy*dy) > eps2) simplified.push(q);
                }
                if (simplified.length >= 3) corridors.push({ id, polygon: simplified });
            }

            document.body.removeChild(holder);

            this.svgCorridorPolygons = corridors;
            this._svgCorridorsLoaded = true;

            if (corridors.length) {
                console.log(`✓ SVG corridor fallback loaded: ${corridors.length} corridor paths`);
            } else {
                console.warn('⚠ No red corridor paths found in SVG (fallback corridors empty)');
            }
        } catch (e) {
            console.warn('⚠ Failed to load SVG corridor fallback:', e);
            this.svgCorridorPolygons = [];
            this._svgCorridorsLoaded = true;
        }
    }

renderMap() {
        if (!this.navmeshData) return;
        this.updateStatus('Rendering map...', true);
        this.layers.rooms.removeChildren();
        this.layers.corridors.removeChildren();
        if (this.layers.corridorOutlines) this.layers.corridorOutlines.removeChildren();
        this.layers.heatmap.removeChildren();
        
        this.renderCorridors();
        this.renderRooms();

        if (!this._robustHoverInitialized) {
            this._setupRobustHoverTooltips();
            this._robustHoverInitialized = true;
        }
        
        // Heatmap overlay (rooms + corridor congestion)
        this.renderHeatmap();
        
        this.centerMap();
        this.updateStatus('Map rendered', false);
    }
    renderHeatmap() {
        if (!this.layers.heatmap) return;
        this.layers.heatmap.removeChildren();
        if (!this.heatmapEnabled || !this.navmeshData) return;

        const g = new PIXI.Graphics();
        g.zIndex = this.layers.heatmap.zIndex || 20;

        const alpha = this._clamp(this.heatmapOpacity, 0, 1);
        const iot = (this.iotData && typeof this.iotData === 'object') ? this.iotData : {};

        // ---------------------------
        // Corridor heat (solid fill)
        // ---------------------------
        const corridorPolys = this.navmeshData.corridor_polygons || [];
        const edges = this.navmeshData.edges || [];
        const nodes = this.navmeshData.nodes || [];

        const roomNodes = nodes.filter(n => n.type === 'room');

        // Compute average edge multiplier per node
        const incident = new Map();
        const addInc = (id, m) => {
            if (!incident.has(id)) incident.set(id, []);
            incident.get(id).push(m);
        };

        for (const e of edges) {
            let m = 1.0;
            const bw = Number(e.base_weight);
            const w = Number(e.weight);
            if (isFinite(bw) && bw > 0 && isFinite(w)) m = w / bw;
            else if (e.crowd_multiplier !== undefined) m = Number(e.crowd_multiplier) || 1.0;
            addInc(e.from, m);
            addInc(e.to, m);
        }

        const corridorNodes = nodes.filter(n => n.type === 'corridor');
        const nodeT = new Map();

        for (const n of corridorNodes) {
            const arr = incident.get(n.id) || [];
            const avgM = arr.length ? (arr.reduce((a,b)=>a+b,0) / arr.length) : 1.0;

            // Fixed scale: 1.0 (normal) → 2.0 (critical)
            let t = 0.0;
            if (avgM > 1.05) t = this._clamp((avgM - 1.0) / 1.0, 0, 1);
            nodeT.set(n.id, t);
        }

        // Fill each corridor polygon using the average corridor-node intensity inside it.
        for (const c of corridorPolys) {
            const poly = c?.polygon;
            if (!poly || poly.length < 3) continue;

            let sum = 0, count = 0;
            for (const n of corridorNodes) {
                const x = n.position?.x, y = n.position?.y;
                if (!isFinite(x) || !isFinite(y)) continue;
                if (this._pointInPolygon(x, y, poly)) {
                    sum += (nodeT.get(n.id) ?? 0);
                    count += 1;
                }
            }

            const tEdges = (count > 0) ? (sum / count) : 0.0;
            const tRooms = this._corridorIntensityFromRooms(poly, roomNodes, iot);
            const t = this._clamp(Math.max(tEdges, tRooms * 0.95), 0, 1);
            const color = this._heatColor(t);

            g.beginFill(color, alpha);
            g.lineStyle(0);
            g.moveTo(poly[0][0], poly[0][1]);
            for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
            g.closePath();
            g.endFill();
        }

        // ---------------------------
        // Room heat (solid fill)
        // ---------------------------
        for (const node of roomNodes) {
            const poly = node.polygon;
            if (!poly || poly.length < 3) continue;

            // Default to 0 (green) if a hall has no telemetry sample
            const occ = Number(iot[node.id] ?? 0);
            const t = this._clamp(isFinite(occ) ? occ : 0, 0, 1);
            const color = this._heatColor(t);

            g.beginFill(color, alpha);
            g.lineStyle(0);
            g.moveTo(poly[0][0], poly[0][1]);
            for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
            g.closePath();
            g.endFill();
        }

        this.layers.heatmap.addChild(g);
    }



    _corridorIntensityFromRooms(poly, roomNodes, iot) {
        // Estimate corridor heat from nearby room occupancies so corridors visually match hotspots.
        if (!poly || poly.length < 3 || !roomNodes?.length) return 0.0;
        // centroid
        let cx = 0, cy = 0;
        for (const p of poly) { cx += p[0]; cy += p[1]; }
        cx /= poly.length; cy /= poly.length;

        const occOf = (id) => this._clamp(Number(iot?.[id] ?? 0) || 0, 0, 1);

        // take k nearest rooms
        const k = 4;
        const nearest = roomNodes
            .map(n => {
                const x = n.position?.x ?? n.center?.x ?? n.polygon?.[0]?.[0];
                const y = n.position?.y ?? n.center?.y ?? n.polygon?.[0]?.[1];
                const dx = (Number(x) - cx), dy = (Number(y) - cy);
                const d2 = (dx * dx + dy * dy);
                return { id: n.id, d2 };
            })
            .filter(o => Number.isFinite(o.d2))
            .sort((a, b) => a.d2 - b.d2)
            .slice(0, k);

        if (!nearest.length) return 0.0;
        const avg = nearest.reduce((acc, o) => acc + occOf(o.id), 0) / nearest.length;
        return this._clamp(avg, 0, 1);
    }

    renderCorridors() {
        const backendPolys = (this.navmeshData && Array.isArray(this.navmeshData.corridor_polygons)) ? this.navmeshData.corridor_polygons : [];
        const corridorPolys = backendPolys.length ? backendPolys : (this.svgCorridorPolygons || []);
        if (!corridorPolys.length) return;

        if (this.layers.corridorOutlines) this.layers.corridorOutlines.removeChildren();

        corridorPolys.forEach(corridor => {
            const polygon = corridor?.polygon;
            if (!polygon || polygon.length < 3) return;

            // Fill (below rooms)
            const fillG = new PIXI.Graphics();
            fillG.zIndex = 10;
            const corridorBaseAlpha = this.heatmapEnabled ? 0.0 : 0.18;
            fillG.beginFill(0x2b2b2b, corridorBaseAlpha);
            fillG.moveTo(polygon[0][0], polygon[0][1]);
            for (let i = 1; i < polygon.length; i++) fillG.lineTo(polygon[i][0], polygon[i][1]);
            fillG.closePath();
            fillG.endFill();
            this.layers.corridors.addChild(fillG);

            // Outline (kept separate so it can't get covered by fill draw order)
            const outG = new PIXI.Graphics();
            outG.zIndex = 11;

            // Outer dark stroke for visibility on light background
            outG.lineStyle({ width: 12, color: 0x111111, alpha: 0.95, join: PIXI.LINE_JOIN.MITER, cap: PIXI.LINE_CAP.BUTT });
            outG.moveTo(polygon[0][0], polygon[0][1]);
            for (let i = 1; i < polygon.length; i++) outG.lineTo(polygon[i][0], polygon[i][1]);
            outG.closePath();

            // Inner light stroke (gives a crisp edge against red fill)
            outG.lineStyle({ width: 6, color: 0xF2F0E6, alpha: 0.95, join: PIXI.LINE_JOIN.MITER, cap: PIXI.LINE_CAP.BUTT });
            outG.moveTo(polygon[0][0], polygon[0][1]);
            for (let i = 1; i < polygon.length; i++) outG.lineTo(polygon[i][0], polygon[i][1]);
            outG.closePath();

            if (this.layers.corridorOutlines) this.layers.corridorOutlines.addChild(outG);
        });
    }


    renderRooms() {
        const roomNodes = this.navmeshData.nodes.filter(n => n.type === 'room');
        this._roomHitTest = [];

        roomNodes.forEach((node, index) => {
            const graphics = new PIXI.Graphics();
            const style = this._getHallStyleByName(node.name || `Hall ${index + 1}`);
            // When heatmap is enabled, we hide hall fills so the overlay doesn't "mix" into a vomit palette.
            const fillAlpha = this.heatmapEnabled ? 0.0 : style.alpha;
            if (fillAlpha > 0) graphics.beginFill(style.color, fillAlpha);
            
            const polygon = node.polygon;
            // Precompute bounding boxes for fast hover hit-testing
            let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
            for (const pt of polygon) {
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
            }
            this._roomHitTest.push({ node, index, polygon, bbox: { minX, minY, maxX, maxY } });
            const drawPoly = () => {
                graphics.moveTo(polygon[0][0], polygon[0][1]);
                for (let i = 1; i < polygon.length; i++) {
                    graphics.lineTo(polygon[i][0], polygon[i][1]);
                }
                graphics.closePath();
            };

            if (this.heatmapEnabled) {
                // Crisp outlines over opaque heatmap
                graphics.lineStyle(10, 0x000000, 1);
                drawPoly();
                graphics.lineStyle(4, 0xffffff, 1);
                drawPoly();
                if (fillAlpha > 0) graphics.endFill();
            } else {
                // Normal mode: keep original fill + outline
                graphics.lineStyle(4, 0x000000, 1);
                drawPoly();
                graphics.endFill();
            }

            // Do not rely on Pixi per-polygon hover events; robust hover is handled at the canvas level.
            try {
                graphics.eventMode = 'none';
            } catch (_) {
                graphics.interactive = false;
            }

            this.layers.rooms.addChild(graphics);
            
            const text = new PIXI.Text(node.name || `Hall ${index + 1}`, {
                fontFamily: 'Arial',
                fontSize: 48,
                fontWeight: '',
                fill: 0xffffff,
                align: 'center',
                stroke: 0x000000,
                strokeThickness: 6
            });
            text.anchor.set(0.5);
            text.position.set(node.position.x, node.position.y);
            this.layers.rooms.addChild(text);
        });
    }

    _pointInPolygon(x, y, poly) {
        // Ray-casting algorithm. poly is [[x,y], ...]
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    _screenToWorld(clientX, clientY) {
        const rect = this.app.view.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const global = new PIXI.Point(x, y);
        const local = this.app.stage.toLocal(global);
        return { x: local.x, y: local.y };
    }

    _setupRobustHoverTooltips() {
        // Robust hall hover detection that does NOT rely on Pixi hit-testing.
        // Fixes cases where pointer events only fire on part of a polygon.
        this.app.view.addEventListener('pointermove', (e) => {
            if (this._isDragging) return;

            const world = this._screenToWorld(e.clientX, e.clientY);
            let hit = null;

            for (const item of this._roomHitTest) {
                const b = item.bbox;
                if (world.x < b.minX || world.x > b.maxX || world.y < b.minY || world.y > b.maxY) continue;
                if (this._pointInPolygon(world.x, world.y, item.polygon)) {
                    hit = item;
                    break;
                }
            }

            if (!hit) {
                if (this._hoveredRoomId !== null) {
                    this._hoveredRoomId = null;
                    this.hideEventTooltip();
                }
                return;
            }

            this._hoveredRoomId = hit.node.id;
            this.showEventTooltip(hit.node, hit.index, e.clientX, e.clientY, true);
        });

        this.app.view.addEventListener('pointerleave', () => {
            this._hoveredRoomId = null;
            this.hideEventTooltip();
        });
    }

    showEventTooltip(node, index, screenX, screenY, isClientCoords = false) {
        const tooltip = document.getElementById('event-tooltip');
        const title = document.getElementById('tooltip-title');
        const content = document.getElementById('tooltip-content');

        const occupancy = this.iotData[node.id] || 0;
        const occupancyText = occupancy > 0
            ? `<strong>Occupancy:</strong> ${(occupancy * 100).toFixed(0)}%<br>`
            : '';

        let crowdStatus = 'Normal';
        if (occupancy > 0.7) crowdStatus = 'Very Crowded';
        else if (occupancy > 0.5) crowdStatus = 'Crowded';
        else if (occupancy > 0.3) crowdStatus = 'Moderate';

        title.textContent = node.name || `Hall ${index + 1}`;
        content.innerHTML = `
            ${occupancyText}
            ${occupancy > 0 ? `<strong>Status:</strong> ${crowdStatus}<br>` : ''}
            <strong>Type:</strong> Exhibition Hall
        `;

        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        let x = (typeof screenX === 'number' ? screenX : rect.width / 2);
        let y = (typeof screenY === 'number' ? screenY : rect.height / 2);
        if (isClientCoords) {
            x = x - rect.left;
            y = y - rect.top;
        }

        const pad = 14;
        let left = x + pad;
        let top = y + pad;

        tooltip.classList.add('visible');

        // Clamp within container bounds
        const tipRect = tooltip.getBoundingClientRect();
        const maxLeft = rect.left + rect.width - tipRect.width - 8;
        const maxTop = rect.top + rect.height - tipRect.height - 8;

        const absLeft = Math.min(rect.left + left, maxLeft);
        const absTop = Math.min(rect.top + top, maxTop);
        tooltip.style.left = `${Math.max(rect.left + 8, absLeft)}px`;
        tooltip.style.top = `${Math.max(rect.top + 8, absTop)}px`;
    }

	    hideEventTooltip() {
        document.getElementById('event-tooltip').classList.remove('visible');
    }

    centerMap() {
        if (!this.navmeshData || !this.navmeshData.scale_info) return;
        const mapWidth = this.navmeshData.scale_info.svg_dimensions.width;
        const mapHeight = this.navmeshData.scale_info.svg_dimensions.height;
        const canvasWidth = this.app.screen.width;
        const canvasHeight = this.app.screen.height;
        const zoomX = canvasWidth / mapWidth;
        const zoomY = canvasHeight / mapHeight;
        this.viewport.zoom = Math.min(zoomX, zoomY) * 0.9;
        this.viewport.x = (canvasWidth / this.viewport.zoom - mapWidth) / 2;
        this.viewport.y = (canvasHeight / this.viewport.zoom - mapHeight) / 2;
        this.updateViewport();
    }

    async findPath() {
        const startId = document.getElementById('startRoom').value;
        const endId = document.getElementById('endRoom').value;
        
        if (!startId || !endId) {
            alert('Please select both start and destination');
            return;
        }
        
        if (startId === endId) {
            alert('Start and destination cannot be the same');
            return;
        }
        
        this.updateStatus('Calculating route...', true);
        
        try {
            const response = await fetch(`${API_BASE}/pathfind`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    start: startId, 
                    end: endId,
                    avoid_crowds: this.crowdAvoidance  // NEW: pass preference
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentPath = result;
                this.renderPath();
                this.showPathInfo();
                
                const crowdNote = result.crowd_avoidance_enabled ? ' (avoiding crowds)' : '';
                this.updateStatus(`Route found: ${result.distance.meters.toFixed(1)}m${crowdNote}`, false);
            } else {
                this.updateStatus('No path found', false);
            }
        } catch (error) {
            console.error('Error finding path:', error);
            this.updateStatus('Error calculating route', false);
        }
    }

    renderPath() {
        if (!this.currentPath) return;
        this.layers.path.removeChildren();
        
        const graphics = new PIXI.Graphics();
        const rawCoords = this.currentPath.path_coordinates || [];
        const coords = this.currentPath.path_coordinates_smooth || rawCoords;
        if (!coords || coords.length < 2) return;
        
        graphics.lineStyle(8, 0x00d4ff, 1);
        graphics.moveTo(coords[0].x, coords[0].y);
        for (let i = 1; i < coords.length; i++) {
            graphics.lineTo(coords[i].x, coords[i].y);
        }
        this.layers.path.addChild(graphics);
        
        const startPoint = new PIXI.Graphics();
        startPoint.beginFill(0x4caf50);
        startPoint.drawCircle(coords[0].x, coords[0].y, 15);
        startPoint.endFill();
        this.layers.path.addChild(startPoint);
        
        const endPoint = new PIXI.Graphics();
        endPoint.beginFill(0xf44336);
        endPoint.drawCircle(coords[coords.length - 1].x, coords[coords.length - 1].y, 15);
        endPoint.endFill();
        this.layers.path.addChild(endPoint);

        if (SHOW_PATH_DEBUG_POINTS) {
            // Show raw nav nodes (usually grid-like and zig-zaggy)
            for (let i = 1; i < rawCoords.length - 1; i++) {
                const point = new PIXI.Graphics();
                point.beginFill(0x00d4ff, 0.6);
                point.drawCircle(rawCoords[i].x, rawCoords[i].y, 4);
                point.endFill();
                this.layers.path.addChild(point);
            }
        }
    }

    showPathInfo() {
        if (!this.currentPath) return;
        
        const pathInfo = document.getElementById('path-info');
        const distanceMeters = document.getElementById('distance-meters');
        const distancePixels = document.getElementById('distance-pixels');
        const pathSteps = document.getElementById('pathSteps');
        
        distanceMeters.textContent = this.currentPath.distance.meters.toFixed(1);
        distancePixels.textContent = this.currentPath.distance.pixels.toFixed(0);
        
        pathSteps.innerHTML = '';
        this.currentPath.path.forEach((nodeId, index) => {
            const step = document.createElement('div');
            step.className = 'path-step';
            const node = this.navmeshData.nodes.find(n => n.id === nodeId);
            let nodeName = nodeId;
            if (node && node.type === 'room') {
                const roomIndex = this.navmeshData.nodes.filter(n => n.type === 'room').indexOf(node);
                nodeName = node.name || `Hall ${roomIndex + 1}`;
            }
            step.textContent = `${index + 1}. ${nodeName}`;
            pathSteps.appendChild(step);
        });
        
        // NEW: Show crowd info if available
        if (this.currentPath.path_crowding && this.currentPath.path_crowding.length > 0) {
            const crowdInfo = document.createElement('div');
            crowdInfo.style.marginTop = '10px';
            crowdInfo.innerHTML = '<strong>Hall Occupancy:</strong>';
            
            this.currentPath.path_crowding.forEach(item => {
                const crowdItem = document.createElement('div');
                crowdItem.style.fontSize = '12px';
                crowdItem.style.padding = '2px 5px';
                const occ = (item.occupancy * 100).toFixed(0);
                crowdItem.textContent = `${item.name}: ${occ}%`;
                
                if (item.occupancy > 0.7) crowdItem.style.color = '#ff6b6b';
                else if (item.occupancy > 0.5) crowdItem.style.color = '#ffa500';
                else crowdItem.style.color = '#4caf50';
                
                crowdInfo.appendChild(crowdItem);
            });
            
            pathSteps.appendChild(crowdInfo);
        }
        
        pathInfo.classList.add('visible');
    }

    clearPath() {
        this.currentPath = null;
        this.layers.path.removeChildren();
        document.getElementById('path-info').classList.remove('visible');
        document.getElementById('startRoom').value = '';
        document.getElementById('endRoom').value = '';
        this.updateStatus('Path cleared', false);
    }

    toggleCrowdAvoidance() {
        this.crowdAvoidance = document.getElementById('crowdToggle').checked;
        console.log('Crowd avoidance:', this.crowdAvoidance ? 'enabled' : 'disabled');
    }

    setupUI() {
        document.getElementById('findPath').addEventListener('click', () => this.findPath());
        document.getElementById('clearPath').addEventListener('click', () => this.clearPath());
        document.getElementById('zoomIn').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoomOut').addEventListener('click', () => this.zoom(0.8));
        document.getElementById('resetView').addEventListener('click', () => this.resetView());

        // Crowd avoidance toggle
        const crowdToggle = document.getElementById('crowdToggle');
        if (crowdToggle) {
            crowdToggle.addEventListener('change', () => this.toggleCrowdAvoidance());
        }


        // Demo toggle (simulate hotspots for visuals)
        const demoToggle = document.getElementById('demoToggle');
        if (demoToggle) {
            demoToggle.checked = !!this.demoMode;
            demoToggle.addEventListener('change', (e) => {
                this.demoMode = !!e.target.checked;
                // Recompute displayed telemetry + heatmap without changing backend data
                const base = this._iotDataReal || this.iotData || {};
                this.iotData = this.demoMode ? this._buildDemoIoTData(base) : base;
                if (this.demoMode) this.iotSummary = this._buildDemoSummary(this.iotData);
                this.updateIoTDisplay();
                this.renderHeatmap();
            });
        }
        // Heatmap toggle
        const heatmapToggle = document.getElementById('heatmapToggle');
        if (heatmapToggle) {
            heatmapToggle.checked = !!this.heatmapEnabled;
            heatmapToggle.addEventListener('change', (e) => {
                this.heatmapEnabled = !!e.target.checked;
                this.renderMap();
            });
        }

        // Tooltip follows cursor (if present)
        document.addEventListener('mousemove', (event) => {
            const tooltip = document.getElementById('event-tooltip');
            if (!tooltip) return;
            tooltip.style.left = (event.clientX + 20) + 'px';
            tooltip.style.top = (event.clientY + 20) + 'px';
        });
    }

    zoom(factor) {
        this.viewport.zoom = this._clamp(this.viewport.zoom * factor, 0.25, 6);
        this.updateViewport();
    }

    updateStatus(message, loading) {
        const statusText = document.getElementById('status-text');
        const loadingSpinner = document.querySelector('.loading');
        statusText.textContent = message;
        loadingSpinner.style.display = loading ? 'inline-block' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ConventionCenterApp();
});
