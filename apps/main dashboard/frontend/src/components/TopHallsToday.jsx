import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function TopHallsToday({ zoneId = "zoneB", limit = 5 }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.total_kwh) || 0), 0),
    [rows]
  );

  useEffect(() => {
    const fetchTop = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/energy/top-halls-latest-day`, {
          params: { zone_id: zoneId, limit },
        });
        setMeta({
          timezone: res.data.timezone,
          zone_id: res.data.zone_id,
          limit: res.data.limit,
        });
        setRows(res.data.rows || []);
      } catch (e) {
        setError(e?.response?.data?.error || e.message || "Request failed");
      } finally {
        setLoading(false);
      }
    };

    fetchTop();
  }, [zoneId, limit]);

  return (
    <div style={{ maxWidth: 680, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Top {limit} halls by energy</h2>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {meta ? `Zone: ${meta.zone_id || "All"} • TZ: ${meta.timezone}` : null}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
        {loading ? "Loading..." : error ? "Couldn’t load data." : `Total (top ${limit}): ${total.toFixed(2)} kWh`}
      </div>

      {error ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff1f2" }}>
          <div style={{ fontWeight: 600 }}>Error</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{error}</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            Check backend is running and CORS allows {API_BASE}.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 8px" }}>Rank</th>
                <th style={{ padding: "10px 8px" }}>Hall</th>
                <th style={{ padding: "10px 8px" }}>Zone</th>
                <th style={{ padding: "10px 8px" }}>kWh</th>
                <th style={{ padding: "10px 8px" }}>Records</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                    No data returned.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.hall_id}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 8px" }}>{idx + 1}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>{r.hall_id}</td>
                    <td style={{ padding: "10px 8px" }}>{r.zone_id}</td>
                    <td style={{ padding: "10px 8px" }}>{Number(r.total_kwh).toFixed(2)}</td>
                    <td style={{ padding: "10px 8px" }}>{r.records}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}