/**
 * Displays the login page with email and password authentication, optional MFA
 * verification, session storage setup, login flash messaging, and role-based
 * navigation after successful sign-in. This page uses the auth login API,
 * React Router navigation, and Login.css styling for the login flow.
 */

import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const palette = {
  ink: "#123150",
  sub: "#5b728a",
  line: "#d9e6f2",
  panel: "#ffffff",
  panelSoft: "#f7fbff",
  blue: "#123150",
  blueSoft: "#d9e9f8",
  red: "#d14343",
  redSoft: "#fdeaea",
  amber: "#d28c1d",
  amberSoft: "#fff3dd",
  green: "#1d7f5f",
  greenSoft: "#e8f7f1",
  purple: "#7356d6",
  purpleSoft: "#f0ebff",
  orange: "#e06d2f",
  orangeSoft: "#fff0e6",
};

const cardStyle = {
  background: palette.panel,
  border: `1px solid ${palette.line}`,
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(18, 49, 80, 0.06)",
};

function formatNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function formatCompact(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        border: `1px dashed ${palette.line}`,
        borderRadius: 18,
        padding: 24,
        background: "#fbfdff",
        color: palette.sub,
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section style={{ ...cardStyle, padding: 22 }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0, color: palette.ink, fontSize: 18, fontWeight: 800 }}>{title}</h3>
        {subtitle ? <p style={{ margin: "6px 0 0", color: palette.sub, fontSize: 13 }}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, helper, tone = palette.blue }) {
  return (
    <div style={{ ...cardStyle, padding: 18, background: palette.panelSoft }}>
      <div style={{ width: 12, height: 12, borderRadius: 999, background: tone, marginBottom: 14 }} />
      <div style={{ color: palette.sub, fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ color: palette.ink, fontSize: 30, lineHeight: 1.1, fontWeight: 900, marginTop: 8 }}>{value}</div>
      {helper ? <div style={{ color: palette.sub, fontSize: 12, marginTop: 8 }}>{helper}</div> : null}
    </div>
  );
}

function TimelineChart({ rows, color = palette.blue, emptyText = "No activity in the selected window." }) {
  if (!rows?.length) return <EmptyState text={emptyText} />;

  const width = 820;
  const height = 260;
  const left = 18;
  const top = 18;
  const bottom = 42;
  const innerWidth = width - left * 2;
  const innerHeight = height - top - bottom;
  const max = Math.max(1, ...rows.map((row) => Number(row?.count || 0)));
  const step = rows.length === 1 ? innerWidth : innerWidth / (rows.length - 1);

  const points = rows.map((row, index) => {
    const x = left + index * step;
    const y = top + innerHeight - (Number(row?.count || 0) / max) * innerHeight;
    return { x, y, label: row.label, count: Number(row?.count || 0) };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${top + innerHeight} L${points[0].x},${top + innerHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 260, display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = top + innerHeight * ratio;
        return <line key={ratio} x1={left} x2={width - left} y1={y} y2={y} stroke={palette.line} strokeWidth="1" />;
      })}
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={point.x} cy={point.y} r="4.5" fill={color} />
          <text x={point.x} y={height - 12} textAnchor="middle" fontSize="11" fill={palette.sub}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DonutChart({ rows, emptyText = "No data available." }) {
  const colorMap = [palette.blue, palette.red, palette.amber, palette.green, palette.purple, palette.orange];
  const items = (rows || []).map((row, index) => ({
    ...row,
    color: colorMap[index % colorMap.length],
  }));

  const total = items.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  if (!items.length || total <= 0) return <EmptyState text={emptyText} />;

  let cursor = 0;
  const gradient = items
    .map((item) => {
      const start = (cursor / total) * 360;
      cursor += Number(item.count || 0);
      const end = (cursor / total) * 360;
      return `${item.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, alignItems: "center" }}>
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: `conic-gradient(${gradient})`,
          position: "relative",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 24,
            borderRadius: "50%",
            background: palette.panel,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: palette.ink }}>{formatCompact(total)}</div>
            <div style={{ fontSize: 12, color: palette.sub }}>Total</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color }} />
                <span style={{ color: palette.ink, fontWeight: 700 }}>{item.label}</span>
              </div>
              <span style={{ color: palette.sub, fontWeight: 700 }}>{formatNumber(item.count)}</span>
            </div>
            <div style={{ height: 8, background: "#edf4fb", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(6, (Number(item.count || 0) / total) * 100)}%`,
                  height: "100%",
                  background: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedList({ rows, accent = palette.blue, emptyText = "No data available.", maxRows = 8 }) {
  const list = (rows || []).slice(0, maxRows);
  if (!list.length) return <EmptyState text={emptyText} />;

  const max = Math.max(1, ...list.map((row) => Number(row?.count || 0)));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {list.map((row, index) => {
        const count = Number(row.count || 0);
        const width = Math.max(8, Math.round((count / max) * 100));

        return (
          <div
            key={`${row.label}-${index}`}
            style={{
              border: `1px solid ${palette.line}`,
              borderRadius: 16,
              padding: "12px 14px",
              background: "#fbfdff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ color: palette.ink, fontWeight: 700, fontSize: 13 }}>{row.label}</div>
              <div style={{ color: palette.sub, fontWeight: 700, fontSize: 13 }}>{formatNumber(count)}</div>
            </div>
            <div style={{ height: 8, background: "#edf4fb", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${width}%`, height: "100%", background: accent, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HallChips({ rows, emptyText = "No hall-level hotspot data available." }) {
  if (!rows?.length) return <EmptyState text={emptyText} />;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          style={{
            padding: "12px 14px",
            borderRadius: 16,
            background: palette.purpleSoft,
            color: palette.purple,
            minWidth: 120,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>{row.label}</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{formatNumber(row.count)}</div>
        </div>
      ))}
    </div>
  );
}

export default function SOCAnalyticsPage() {
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await axios.get(`${API_BASE}/dashboard/soc-analytics`, { params: { hours } });
        if (!active) return;
        setData(res.data || null);
      } catch (e) {
        if (!active) return;
        setError(e?.response?.data?.error || e.message || "Failed to load SOC analytics.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hours]);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const topSignal = kpis.most_active_signal || { label: "No dominant signal", count: 0 };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          ...cardStyle,
          padding: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: palette.ink }}>SOC activity overview</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label htmlFor="soc-hours" style={{ fontSize: 13, color: palette.ink, fontWeight: 700 }}>
            Window
          </label>
          <select
            id="soc-hours"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            style={{
              border: `1px solid ${palette.line}`,
              borderRadius: 12,
              padding: "10px 12px",
              color: palette.ink,
              fontWeight: 700,
              background: palette.panel,
            }}
          >
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={72}>Last 72 hours</option>
            <option value={168}>Last 7 days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 24, color: palette.sub }}>Loading analytics…</div>
      ) : error ? (
        <div style={{ ...cardStyle, padding: 24, color: palette.red }}>{error}</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
            <StatCard
              label="Open Alerts"
              value={formatNumber(kpis.open_alerts)}
              helper={`${formatNumber(kpis.critical_open_alerts)} critical still open`}
              tone={palette.blue}
            />
            <StatCard
              label="Raw Security Events"
              value={formatCompact(kpis.raw_security_events)}
              helper="Auth + MQTT + identity + integrity"
              tone={palette.red}
            />
            <StatCard
              label="Most Active Signal"
              value={topSignal.count > 0 ? formatCompact(topSignal.count) : "—"}
              helper={topSignal.label}
              tone={palette.amber}
            />
            <StatCard
              label="Affected Devices"
              value={formatCompact(kpis.affected_devices)}
              helper="Distinct devices across the active evidence streams"
              tone={palette.green}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 }}>
            <SectionCard
              title="Security activity timeline"
              subtitle="Merged raw security evidence over time, not just alerts."
            >
              <TimelineChart
                rows={charts.security_activity_timeline}
                color={palette.blue}
                emptyText="No security activity data was returned for the selected window."
              />
            </SectionCard>

            <SectionCard
              title="Security signal mix"
              subtitle="Which evidence stream is contributing most to the current volume."
            >
              <DonutChart
                rows={charts.signal_mix}
                emptyText="No signal mix data was returned for the selected window."
              />
            </SectionCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <SectionCard
              title="Authentication outcomes"
              subtitle="Outcome split for authentication activity in the selected window."
            >
              <DonutChart
                rows={charts.auth_outcomes}
                emptyText="No authentication outcome data was returned for the selected window."
              />
            </SectionCard>

            <SectionCard
              title="Alert severity"
              subtitle={data?.fallbacks?.alert_severity_derived
                ? "Derived from raw security evidence because alert rows were sparse in this window."
                : "Severity distribution for triggered alert rows."}
            >
              <DonutChart
                rows={charts.alert_severity}
                emptyText="No alert severity data was returned for the selected window."
              />
            </SectionCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <SectionCard
              title="MQTT violation reasons"
              subtitle="Most common denial or authorization-failure reasons."
            >
              <RankedList
                rows={charts.mqtt_reason_breakdown}
                accent={palette.amber}
                emptyText="No MQTT reason breakdown data was returned for the selected window."
              />
            </SectionCard>

            <SectionCard
              title="Integrity issue types"
              subtitle="What kinds of manipulated or invalid readings are appearing most."
            >
              <RankedList
                rows={charts.integrity_issue_types}
                accent={palette.green}
                emptyText="No integrity issue type data was returned for the selected window."
              />
            </SectionCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <SectionCard
              title="MAC mismatches by hall"
              subtitle="Halls seeing the most identity mismatch activity."
            >
              <HallChips
                rows={charts.identity_mismatches_by_hall}
                emptyText="No hall-level identity mismatch data was returned for the selected window."
              />
            </SectionCard>

            <SectionCard
              title="Security hotspots by hall"
              subtitle="Combined hall-level pressure across auth, MQTT, identity, and integrity events."
            >
              <RankedList
                rows={charts.security_hotspots_by_hall}
                accent={palette.purple}
                emptyText="No hall hotspot data was returned for the selected window."
              />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}