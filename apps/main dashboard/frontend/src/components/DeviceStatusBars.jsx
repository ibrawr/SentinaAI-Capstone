/**
 * Displays a comfort gauge component with a semi-circular progress arc,
 * numeric comfort value, status label, and optional embedded display mode.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function DevicesStatusBars({ hoursLabel = "Now", embedded = false }) {
  const [counts, setCounts] = useState({ active: 0, inactive: 0, quarantined: 0, other: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/device-status`);
        if (!alive) return;
        setCounts(r.data?.counts || { active: 0, inactive: 0, quarantined: 0, other: 0 });
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load device status");
      }
    };

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const totalDevices = useMemo(
    () => (counts.active + counts.inactive + counts.quarantined + counts.other) || 0,
    [counts]
  );

  const bars = useMemo(() => {
    const items = [
      { key: "active", label: "Active", value: Number(counts.active || 0), color: "#22c55e" },
      { key: "inactive", label: "Inactive", value: Number(counts.inactive || 0), color: "#9ca3af" },
      { key: "quarantined", label: "Quarantined", value: Number(counts.quarantined || 0), color: "#ef4444" },
    ];
    const max = Math.max(1, ...items.map((x) => x.value));
    return items.map((x) => ({ ...x, pct: Math.round((x.value / max) * 100) }));
  }, [counts]);

  const body = (
    <div style={{ display: "grid", gap: 12, minHeight: 190, height: "100%", alignContent: "space-between" }}>
      {err ? (
        <div
          style={{
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

      {/* ✅ Top row: move Total devices to the right, remove "Current" */}
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, opacity: 0.7 }}>
        <span style={{ fontWeight: 800 }}>Total devices: {totalDevices}</span>
      </div>

      <div style={{ minHeight: 140, flex: 1, display: "flex", gap: 18, alignItems: "flex-end", justifyContent: "center" }}>
        {bars.map((b) => (
          <div key={b.key} style={{ width: 90, textAlign: "center" }}>
            <div
              style={{
                height: `${Math.max(8, Math.round((b.pct / 100) * 120))}px`,
                borderRadius: 10,
                background: b.color,
                boxShadow: "0 10px 20px rgba(15,23,42,0.08)",
              }}
            />
            <div style={{ marginTop: 10, fontWeight: 900 }}>{b.value}</div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{b.label}</div>
          </div>
        ))}
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