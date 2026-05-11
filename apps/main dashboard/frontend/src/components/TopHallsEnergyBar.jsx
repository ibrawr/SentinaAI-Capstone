import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const ACCENT = "var(--sust-accent, #E8486F)";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export default function TopHallsEnergyBar({
  title = "Top 5 halls by energy",
  zoneId,
  eventId,
  limit = 5,

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
            metric: "energy",
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
        setErr(e?.response?.data?.error || e.message || "Failed to load halls energy");
      }
    };

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [zoneId, eventId, limit]);

  const maxVal = useMemo(() => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => Number(r.hvac_energy_kwh || 0)), 0.01);
  }, [rows]);

  const total = useMemo(() => {
    return rows.reduce((s, r) => s + Number(r.hvac_energy_kwh || 0), 0);
  }, [rows]);

  const body = (
    <>
      <div style={{ marginTop: 2, fontSize: 12, opacity: 0.7 }}>
        Total (top {rows.length || limit}): {total.toFixed(2)} kWh
        {ts ? ` • Latest: ${new Date(ts).toLocaleString()}` : ""}
      </div>

      {err ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            fontSize: 12,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {!rows.length ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No data yet.</div>
        ) : (
          rows.map((r, idx) => {
            const v = Number(r.hvac_energy_kwh || 0);
            const width = Math.round(clamp01(v / maxVal) * 100);

            return (
              <div
                key={r.hall_id || idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 80px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {r.hall_id}
                  <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700 }}>{r.zone_id}</div>
                </div>

                {/* Track */}
                <div
                  style={{
                    height: 12,
                    background: "#f1f5f9",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  {/* Fill */}
                  <div
                    style={{
                      width: `${width}%`,
                      height: "100%",
                      background: ACCENT,
                    }}
                  />
                </div>

                <div style={{ textAlign: "right", fontWeight: 900 }}>{v.toFixed(2)}</div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, background: "white", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{zoneId ? `Zone: ${zoneId}` : ""}</div>
      </div>
      {body}
    </div>
  );
}