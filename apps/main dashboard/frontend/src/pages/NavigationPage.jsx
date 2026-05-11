/**
 * Displays the navigation page with room selection, pathfinding controls,
 * heatmap and crowd-avoidance toggles, and the embedded NavigationMap view.
 * This page fetches room options from the navigation API, sends pathfinding
 * requests, applies route-based theme colors, and passes map state into
 * the NavigationMap component.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import NavigationMap from "../components/NavigationMap.jsx";

const API_BASE = import.meta.env.VITE_NAV_URL || import.meta.env.VITE_API_BASE_URL || "";

function toRoomOption(r) {
  const id = r?.id || r?.room_id || r?.name || r?.label;
  const label = r?.name || r?.label || r?.id || r?.room_id;
  return id ? { id, label } : null;
}

function normalizePoint(p) {
  if (Array.isArray(p) && p.length >= 2) {
    const x = Number(p[0]);
    const y = Number(p[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  if (p && typeof p === "object") {
    const x = Number(p.x ?? p.X ?? p.cx ?? p.left ?? p[0]);
    const y = Number(p.y ?? p.Y ?? p.cy ?? p.top ?? p[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  return null;
}

function getTheme(pathname) {
  if (pathname.startsWith("/sustainability")) {
    return {
      accent: "#00802B",
      accentSoft: "rgba(0,128,43,0.12)",
      accentShadow: "rgba(0,128,43,0.30)",
      title: "Navigation",
    };
  }

  if (pathname.startsWith("/soc")) {
    return {
      accent: "#123150",
      accentSoft: "rgba(18,49,80,0.12)",
      accentShadow: "rgba(18,49,80,0.30)",
      title: "Map",
    };
  }

  if (pathname.startsWith("/exhibitor")) {
    return {
      accent: "#35005C",
      accentSoft: "rgba(53,0,92,0.12)",
      accentShadow: "rgba(53,0,92,0.28)",
      title: "Navigation",
    };
  }

  return {
    accent: "#E8486F",
    accentSoft: "rgba(232,72,111,0.12)",
    accentShadow: "rgba(232,72,111,0.30)",
    title: "Navigation",
  };
}

export default function NavigationPage() {
  const location = useLocation();
  const theme = getTheme(location.pathname);

  const [roomsRaw, setRoomsRaw] = useState([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pathPts, setPathPts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [avoidCrowds, setAvoidCrowds] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/rooms`);
        const data = await res.json();
        if (!alive) return;

        if (!res.ok) throw new Error(data?.error || "Failed to load rooms");

        const list = Array.isArray(data) ? data : data.rooms || [];
        setRoomsRaw(Array.isArray(list) ? list : []);

        const opts = (Array.isArray(list) ? list : []).map(toRoomOption).filter(Boolean);
        if (!start && opts[0]) setStart(opts[0].id);
        if (!end && opts[1]) setEnd(opts[1].id);
      } catch (e) {
        setError(e.message || "Failed to load navigation data");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(
    () => (Array.isArray(roomsRaw) ? roomsRaw : []).map(toRoomOption).filter(Boolean),
    [roomsRaw]
  );

  async function findPath() {
    setError("");
    setPathPts([]);

    try {
      const r = await fetch(`${API_BASE}/api/pathfind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          end,
          avoid_crowds: avoidCrowds,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pathfind failed");

      const raw = data.path_coordinates_smooth || data.path_coordinates || [];
      setPathPts((Array.isArray(raw) ? raw : []).map(normalizePoint).filter(Boolean));
    } catch (e) {
      setError(e.message || "Pathfind failed");
    }
  }

  const btnStyle = {
    ...btnBase,
    background: theme.accent,
    boxShadow: `0 4px 10px ${theme.accentShadow}`,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={start} onChange={(e) => setStart(e.target.value)} style={sel} disabled={loading}>
            <option value="">{loading ? "Loading..." : "Start"}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select value={end} onChange={(e) => setEnd(e.target.value)} style={sel} disabled={loading}>
            <option value="">{loading ? "Loading..." : "End"}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <button onClick={findPath} disabled={!start || !end || loading} style={btnStyle}>
            Find Path
          </button>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            <label style={toggleWrap}>
              <span
                style={toggleTrack(showHeatmap, theme.accent)}
                onClick={() => setShowHeatmap((v) => !v)}
              >
                <span style={toggleThumb(showHeatmap)} />
              </span>
              <span style={toggleLabel}>Heatmap</span>
            </label>

            <label style={toggleWrap}>
              <span
                style={toggleTrack(avoidCrowds, theme.accent)}
                onClick={() => setAvoidCrowds((v) => !v)}
              >
                <span style={toggleThumb(avoidCrowds)} />
              </span>
              <span style={toggleLabel}>Avoid Crowds</span>
            </label>

            <label style={toggleWrap}>
              <span
                style={toggleTrack(demoMode, theme.accent)}
                onClick={() => setDemoMode((v) => !v)}
              >
                <span style={toggleThumb(demoMode)} />
              </span>
              <span style={toggleLabel}>Demo IoT</span>
            </label>
          </div>

          {error ? <div style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</div> : null}
        </div>
      </div>

      <div
        style={{
          ...card,
          padding: 0,
          overflow: "hidden",
          height: 520,
          borderColor: theme.accentSoft,
        }}
      >
        <NavigationMap
          apiBase={API_BASE}
          pathPoints={pathPts}
          showHeatmap={showHeatmap}
          avoidCrowds={avoidCrowds}
          demoMode={demoMode}
        />
      </div>

      <div style={{ fontSize: 12, opacity: 0.6, paddingLeft: 4 }}>
        {pathPts.length ? `Path: ${pathPts.length} waypoints` : "Select Start & End, then click Find Path."}
      </div>
    </div>
  );
}

// styles

const card = {
  padding: 16,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "white",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
};

const titleStyle = {
  fontWeight: 900,
  marginBottom: 10,
  fontSize: 18,
};

const sel = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
};

const btnBase = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const toggleWrap = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  userSelect: "none",
};

const toggleLabel = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const toggleTrack = (on, accent) => ({
  display: "inline-flex",
  alignItems: "center",
  width: 40,
  height: 22,
  borderRadius: 11,
  background: on ? accent : "#d1d5db",
  position: "relative",
  transition: "background 0.2s",
  cursor: "pointer",
  flexShrink: 0,
});

const toggleThumb = (on) => ({
  position: "absolute",
  left: on ? 20 : 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "white",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  transition: "left 0.2s",
});