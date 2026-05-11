/**
 * Displays live AI sustainability status for each hall, including HVAC energy,
 * carbon output, efficiency, sustainability status, AI action, and anomaly state.
 */

import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import InfoTooltip from "./InfoTooltip";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function badgeClassForStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v === "green") return "badge badgeGreen";
  if (v === "amber") return "badge badgeYellow";
  if (v === "red") return "badge badgeRed";
  return "badge";
}

export default function AiSustPanel() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/ai/sust-live`);
        if (!alive) return;
        if (r.data?.ok === false) throw new Error(r.data.error || "sust-live failed");

        setRows(r.data?.rows || []);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load sust-live");
      }
    };

    load();
    const t = setInterval(load, 15000);
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
            <h3 style={{ margin: 0 }}>AI Sustainability: Live Status</h3>
            <InfoTooltip
              text="Live hall-level sustainability view showing HVAC energy, carbon, efficiency, AI action and anomaly status."
              color="#64748b"
            />
          </div>
        </div>
        <div className="hint">Source: /ai/sust-live</div>
      </div>

      {err ? (
        <div style={{ padding: 12, background: "#fff1f2", borderTop: "1px solid #fecdd3" }}>
          <div style={{ fontWeight: 900 }}>AI Error</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{err}</div>
        </div>
      ) : null}

      <div className="cardBody cardBodyNoPad">
        <table className="tableLike">
          <thead>
            <tr>
              <th title="Hall name and hall ID.">Hall</th>
              <th className="rowRight" title="Latest HVAC energy usage for the hall.">HVAC Energy</th>
              <th className="rowRight" title="Estimated carbon output for the hall.">Carbon</th>
              <th className="rowRight" title="Current energy efficiency score for the hall.">Efficiency</th>
              <th title="Current sustainability status label for the hall.">Status</th>
              <th title="Recommended AI action for sustainability optimisation.">AI Action</th>
              <th title="Whether the sustainability pipeline flagged an anomaly.">Anomaly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr
                key={h.hall_id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/sustainability/hall/${h.hall_id}`)}
              >
                <td style={{ fontWeight: 900 }}>{h.hall_name ? `${h.hall_name} (${h.hall_id})` : h.hall_id}</td>
                <td className="rowRight">{Number(h.hvac_energy_kwh || 0).toFixed(2)}</td>
                <td className="rowRight">{Number(h.carbon_kg_co2 || 0).toFixed(2)}</td>
                <td className="rowRight">{Number(h.energy_efficiency_score || 0).toFixed(0)}</td>
                <td>
                  <span className={badgeClassForStatus(h.sustainability_status)}>{h.sustainability_status}</span>
                </td>
                <td>
                  <span className={h.aiAction && String(h.aiAction).toLowerCase() !== "none" ? "badge badgeYellow" : "badge"}>
                    {h.aiAction || "none"}
                  </span>
                </td>
                <td>
                  <span className={h.isAnomaly ? "badge badgeRed" : "badge badgeGreen"}>
                    {h.isAnomaly ? "Yes" : "No"}
                  </span>
                </td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, opacity: 0.7 }}>
                  No sustainability rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
} 