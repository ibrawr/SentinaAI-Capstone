/**
 * Displays an alerts trend panel with a headline total and sparkline chart,
 * using the selected range and domain for the main dashboard alert views.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sparkline from "./Sparkline";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function rangeToParams(range) {
  const r = String(range || "lifetime").toLowerCase();
  if (r === "lifetime") return { lifetime: 1 };

  const m = r.match(/^(\d+)\s*d$/);
  if (m) return { days: Number(m[1]) };

  return { lifetime: 1 };
}

function subtitleFor(range) {
  const r = String(range || "lifetime").toLowerCase();
  if (r === "lifetime") return "Total alerts (lifetime)";
  return `Total alerts (last ${r})`;
}

function getAccentForDomain(domain) {
  const d = String(domain || "OPERATIONS").toUpperCase();
  if (d === "SECURITY") return "#123150";
  if (d === "SUSTAINABILITY") return "#178032";
  return "#E8486F";
}

export default function AlertsTrendPanel({
  range = "lifetime",
  domain = "OPERATIONS",
  embedded = false,
}) {
  const [points, setPoints] = useState([]);
  const [total, setTotal] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/alerts-trend`, {
          params: {
            ...rangeToParams(range),
            domain,
          },
        });

        if (!alive) return;

        setPoints(r.data?.points || []);
        const t = r.data?.total;
        setTotal(Number.isFinite(Number(t)) ? Number(t) : null);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load alerts trend");
        setTotal(null);
        setPoints([]);
      }
    };

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [range, domain]);

  const sumFromPoints = useMemo(
    () => points.reduce((s, p) => s + Number(p.value || 0), 0),
    [points]
  );

  const headline = useMemo(() => {
    if (total === null) return "—";
    if (total === 0) return "—";
    return String(total);
  }, [total]);

  const subtitle = useMemo(() => subtitleFor(range), [range]);
  const accent = useMemo(() => getAccentForDomain(domain), [domain]);
  const r = String(range || "lifetime").toLowerCase();
  const daysMatch = r.match(/^(\d+)\s*d$/);
  const days = daysMatch ? Number(daysMatch[1]) : null;
  const xMode = days === 1 ? "time" : "date";

  const body = (
    <div
      className="alertsPanel"
      style={{
        display: "flex",
        gap: 16,
        alignItems: "stretch",
        justifyContent: "space-between",
        minHeight: 190,
        height: "100%",
      }}
    >
      <div className="alertsLeft" style={{ display: "grid", alignContent: "start", minWidth: 0 }}>
        <div style={{ fontSize: 40, fontWeight: 950, lineHeight: 1.02 }}>{headline}</div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>{subtitle}</div>

        {total === null && sumFromPoints > 0 ? (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>Computed: {sumFromPoints}</div>
        ) : null}

        {err ? (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 10,
              background: `${accent}14`,
              border: `1px solid ${accent}33`,
              fontSize: 12,
            }}
          >
            {err}
          </div>
        ) : null}
      </div>

      <div className="alertsRight" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        <Sparkline points={points} height={130} xMode={xMode} accent={accent} />
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, background: "white", padding: 16 }}>
      {body}
    </div>
  );
}