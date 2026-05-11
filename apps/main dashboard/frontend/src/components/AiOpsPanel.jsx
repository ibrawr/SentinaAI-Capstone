/**
 * Displays live AI operations data for each hall, including occupancy, CO₂,
 * congestion, AI action, and anomaly status in the operations dashboard.
 */

import { useEffect, useState } from "react";
import axios from "axios";
import InfoTooltip from "./InfoTooltip";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function Badge({ children, danger }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        background: danger ? "#fee2e2" : "#dcfce7",
      }}
    >
      {children}
    </span>
  );
}

export default function AiOpsPanel() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/ai/ops-live`);
        if (!alive) return;

        if (r.data && r.data.ok === false) {
          throw new Error(r.data.error || "AI ops-live failed");
        }

        setRows(r.data?.rows || []);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load AI ops-live");
      }
    };

    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="cardHeaderRow">
        <div className="cardHeaderLeft">
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <h3 className="cardTitleBig" style={{ margin: 0 }}>
              AI Operations: Live Status
            </h3>
            <InfoTooltip
              text="Live hall-level AI summary showing occupancy, CO₂, congestion, recommended action and anomaly status."
              color="#64748b"
            />
          </div>
        </div>
      </div>

      {err ? (
        <div style={{ padding: 12, background: "#fff1f2", borderTop: "1px solid #fecdd3" }}>
          <div style={{ fontWeight: 900 }}>AI Error</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{err}</div>
        </div>
      ) : null}

      <div className="cardBody cardBodyNoPad">
        <table className="opsTable">
          <thead>
            <tr>
              <th title="Hall name and hall ID.">Hall</th>
              <th title="Current occupancy ratio for the hall.">Occupancy</th>
              <th title="Latest CO₂ reading in parts per million.">CO₂</th>
              <th title="Latest flow congestion index for the hall.">Congestion</th>
              <th title="Recommended AI action for this hall.">AI Action</th>
              <th title="Whether the AI flagged an anomaly for this hall.">Anomaly</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((h) => (
              <tr key={h.hall_id}>
                <td style={{ fontWeight: 900 }}>
                  {h.hall_name ? `${h.hall_name} (${h.hall_id})` : h.hall_id}
                </td>
                <td>{Math.round((h.occupancyRatio ?? 0) * 100)}%</td>
                <td>{Math.round(Number(h.co2 || 0))}</td>
                <td>{Number(h.flowCongestionIndex ?? 0).toFixed(2)}</td>
                <td>
                  <Badge danger={h.aiAction && String(h.aiAction).toLowerCase() !== "none"}>
                    {h.aiAction || "none"}
                  </Badge>
                </td>
                <td>
                  <Badge danger={!!h.isAnomaly}>{h.isAnomaly ? "Yes" : "No"}</Badge>
                </td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                  No AI rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}