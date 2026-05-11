import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const ACCENT = "#E8486F";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export default function TopHallsBar({
  title = "Busiest halls (snapshot)",
  zoneId,
  eventId,
  limit = 8,


  embedded = false,
}) {
  const [rows, setRows] = useState([]);
  const [ts, setTs] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/top-halls`, {
          params: {
            metric: "occupancy_ratio",
            limit,
            zone_id: zoneId || undefined,
            event_id: eventId || undefined,
          },
        });
        if (!alive) return;
        setRows(r.data?.rows || []);
        setTs(r.data?.ts || null);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load halls");
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [zoneId, eventId, limit]);

  const maxRatio = useMemo(() => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => Number(r.occupancy_ratio || 0)), 0.01);
  }, [rows]);

  const body = (
    <div style={{ display: "grid", gap: 10 }}>
      {err ? (
        <div style={{ padding: 10, borderRadius: 10, background: "#fff1f2", border: "1px solid #fecdd3", fontSize: 12 }}>
          {err}
        </div>
      ) : null}

      {!rows.length ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>No hall data yet.</div>
      ) : (
        rows.map((r) => {
          const ratio = Number(r.occupancy_ratio || 0);
          const pct = Math.round(ratio * 100);
          const widthPct = Math.round(clamp01(ratio / maxRatio) * 100);
          const overcrowded = Boolean(r.is_overcrowded);

          return (
            <div
              key={r.hall_id}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr 70px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.hall_name || r.hall_id}
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6, fontWeight: 700 }}>{r.hall_id}</span>
              </div>

              <div style={{ height: 10, background: "#f1f5f9", borderRadius: 999, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: overcrowded
                      ? "#ef4444"
                      : `linear-gradient(90deg, ${ACCENT} 0%, rgba(232,72,111,0.75) 100%)`,
                  }}
                />
              </div>

              <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900 }}>{pct}%</div>
            </div>
          );
        })
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "white" }}>
      <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{ts ? `Latest: ${new Date(ts).toLocaleString()}` : ""}</div>
      </div>

      <div style={{ padding: 14, paddingTop: 0 }}>{body}</div>
    </div>
  );
}