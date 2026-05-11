/**
 * Displays a hall-based occupancy forecast panel with a short-term line chart
 * and predicted occupancy points for the next 60 minutes.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import InfoTooltip from "./InfoTooltip";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const ACCENT = "#E8486F";

function LineChart({ points }) {
  const w = 520;
  const h = 160;
  const pad = 18;

  const xs = points.map((p) => p.offsetMinutes);
  const ys = points.map((p) => Number(p.predictedOccupancy || 0));

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yRawMin = Math.min(...ys);
  const yRawMax = Math.max(...ys);

  const yMin = Math.max(0, Math.floor(yRawMin - (yRawMax - yRawMin) * 0.08));
  const yMax = Math.ceil(yRawMax + (yRawMax - yRawMin) * 0.08);

  const xScale = (x) => {
    if (xMax === xMin) return pad;
    return pad + ((x - xMin) / (xMax - xMin)) * (w - pad * 2);
  };
  const yScale = (y) => {
    if (yMax === yMin) return h / 2;
    return h - pad - ((y - yMin) / (yMax - yMin)) * (h - pad * 2);
  };

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.offsetMinutes)} ${yScale(Number(p.predictedOccupancy || 0))}`)
    .join(" ");

  const baselineY = h - pad;
  const areaD = `${lineD} L ${xScale(points[points.length - 1].offsetMinutes)} ${baselineY} L ${xScale(points[0].offsetMinutes)} ${baselineY} Z`;

  const last = points[points.length - 1];
  const lastX = xScale(last.offsetMinutes);
  const lastY = yScale(Number(last.predictedOccupancy || 0));

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />

      <path d={areaD} fill={ACCENT} opacity="0.12" />

      <path d={lineD} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p) => (
        <circle
          key={p.offsetMinutes}
          cx={xScale(p.offsetMinutes)}
          cy={yScale(Number(p.predictedOccupancy || 0))}
          r="3"
          fill={ACCENT}
          stroke="#ffffff"
          strokeWidth="2"
        />
      ))}

      <circle cx={lastX} cy={lastY} r="3.8" fill={ACCENT} stroke="#ffffff" strokeWidth="2" />

      <text x={pad} y={pad - 4} fontSize="10" fill="#6b7280">
        {yRawMax} ppl
      </text>
      <text x={pad} y={h - 4} fontSize="10" fill="#6b7280">
        {yRawMin} ppl
      </text>
    </svg>
  );
}

export default function PredictedOccupancyChart({ refreshSignal }) {
  const [rows, setRows] = useState([]);
  const [hallId, setHallId] = useState("");
  const [forecast, setForecast] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/ai/ops-live`);
        if (!alive) return;
        const list = r.data?.rows || [];
        setRows(list);
        if (!hallId && list.length) setHallId(list[0].hall_id);
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load halls");
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [refreshSignal]);

  useEffect(() => {
    let alive = true;
    const loadForecast = async () => {
      try {
        if (!hallId) return;
        const r = await axios.get(`${API_BASE}/ai/occupancy-forecast`, { params: { hall_id: hallId } });
        if (!alive) return;
        if (r.data?.ok === false) throw new Error(r.data.error || "Forecast error");
        console.log("Forecast response in frontend:", r.data);
        setForecast(r.data);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load forecast");
      }
    };
    loadForecast();
    const t = setInterval(loadForecast, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hallId, refreshSignal]);

  const selected = useMemo(() => rows.find((x) => x.hall_id === hallId), [rows, hallId]);

  return (
    <div className="card">
      <div className="cardHeaderRow">
        <div className="cardHeaderLeft">
          <h3 className="cardTitleBig" style={{ margin: 0 }}>
            Predicted Occupancy (Next 60 min)
            <InfoTooltip
              text="Short-term AI forecast for the selected hall over the next 60 minutes."
              color="#64748b"
            />
          </h3>
        </div>
      </div>

      <div className="cardBody">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Hall:</div>
          <select
            value={hallId}
            onChange={(e) => setHallId(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              minWidth: 240,
              outline: "none",
            }}
          >
            {rows.map((h) => (
              <option key={h.hall_id} value={h.hall_id}>
                {h.hall_name ? `${h.hall_name} (${h.hall_id})` : h.hall_id}
              </option>
            ))}
          </select>

          {selected ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Current: <b>{Math.round((selected.occupancyRatio || 0) * 100)}%</b> ({selected.current_occupancy} ppl)
            </div>
          ) : null}
        </div>

        {err ? (
          <div style={{ padding: 12, background: "#fff1f2", borderRadius: 12, border: "1px solid #fecdd3", fontWeight: 700 }}>
            {err}
          </div>
        ) : null}

        {forecast?.points?.length ? (
          <>
            <div style={{ marginTop: 6 }}>
              <LineChart points={forecast.points} />
            </div>

            <div style={{ display: "flex", gap: 12, fontSize: 12, opacity: 0.75, flexWrap: "wrap", marginTop: 8 }}>
              {forecast.points.map((p) => (
                <div key={p.offsetMinutes}>
                  +{p.offsetMinutes}m: <b>{p.predictedOccupancy}</b>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No forecast points yet.</div>
        )}
      </div>
    </div>
  );
}