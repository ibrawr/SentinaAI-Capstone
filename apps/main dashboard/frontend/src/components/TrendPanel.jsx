import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sparkline from "./Sparkline";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function formatValue(metric, unit, n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (metric === "occupancy" || unit === "people") return String(Math.round(x));
  if (Math.abs(x) >= 1000) return x.toFixed(0);
  if (Math.abs(x) >= 100) return x.toFixed(1);
  return x.toFixed(2);
}

export default function TrendPanel({
  title,
  metric,
  unit,
  hours = 6,
  eventId,
  zoneId,
  hallId,
  refreshMs = 15000,

  embedded = false,
  accent
}) {
  const [points, setPoints] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/trends`, {
          params: {
            metric,
            hours,
            event_id: eventId || undefined,
            zone_id: zoneId || undefined,
            hall_id: hallId || undefined,
          },
        });
        if (!alive) return;
        setPoints(r.data?.points || []);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load trend");
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [metric, hours, eventId, zoneId, hallId, refreshMs]);

  const latest = useMemo(() => (points.length ? points[points.length - 1].value : null), [points]);
  const delta = useMemo(() => {
    if (points.length < 2) return null;
    const a = Number(points[0].value || 0);
    const b = Number(points[points.length - 1].value || 0);
    return b - a;
  }, [points]);

  const showUnitOnHeadline = !(metric === "occupancy" || unit === "people");

  const content = (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 16,
      alignItems: "center",
      justifyContent: "space-between",
      minWidth: 0,
    }}
  >
    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
      <div style={{ fontSize: 40, fontWeight: 950, lineHeight: 1.02 }}>
        {latest === null
          ? "—"
          : `${formatValue(metric, unit, latest)}${showUnitOnHeadline && unit ? ` ${unit}` : ""}`}
      </div>

      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
        {delta === null
          ? ""
          : `Change: ${delta >= 0 ? "+" : ""}${formatValue(metric, unit, delta)}${unit ? ` ${unit}` : ""}`}
      </div>

      {err ? (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "#fff1f2", border: "1px solid #fecdd3", fontSize: 12 }}>
          {err}
        </div>
      ) : null}
    </div>

    <div style={{ flex: "0 1 340px", minWidth: 180, maxWidth: "100%", justifySelf: "end" }}>
      <Sparkline points={points} height={110} />
    </div>
  </div>
);

  if (embedded) return content;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "white",
        padding: 16,
        height: 170,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{hours}h</div>
      </div>
      {content}
    </div>
  );
}