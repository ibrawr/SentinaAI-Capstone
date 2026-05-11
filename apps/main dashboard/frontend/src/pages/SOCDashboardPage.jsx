/**
 * Displays the SOC dashboard page with security KPI cards, alert trend and device
 * status panels, recent critical alert activity, hotspot zone summaries, and
 * quick navigation actions. This page fetches SOC overview data from the dashboard
 * API, uses dashboard refresh settings utilities, and composes AlertsTrendPanel
 * and DeviceStatusBars for live monitoring widgets.
 */

import "./DashboardPage.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import AlertsTrendPanel from "../components/AlertsTrendPanel";
import DeviceStatusBars from "../components/DeviceStatusBars";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const IconCircle = ({ children }) => <div className="iconCircle">{children}</div>;

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L19 6V11C19 15.4183 16.134 19.4186 12 21C7.866 19.4186 5 15.4183 5 11V6L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 11.5L11 13L14.5 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9V13M12 17H12.01M10.615 3.892L2.39 18.098C1.934 18.886 1.706 19.28 1.74 19.604C1.769 19.886 1.917 20.142 2.146 20.309C2.409 20.5 2.864 20.5 3.775 20.5H20.225C21.135 20.5 21.591 20.5 21.854 20.309C22.083 20.142 22.231 19.886 22.26 19.604C22.294 19.28 22.066 18.886 21.609 18.098L13.385 3.892C12.93 3.107 12.703 2.714 12.406 2.582C12.147 2.467 11.852 2.467 11.594 2.582C11.297 2.714 11.07 3.107 10.615 3.892Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="none">
      <path
        d="M27.0347 17.3792H23.1726V13.5171H21.2415V22.2068H5.79314V6.75845L14.4829 6.75758V4.82741H10.6208V0.965332H8.68971V4.82741H5.79314C5.28115 4.82792 4.79028 5.03153 4.42825 5.39356C4.06622 5.75559 3.8626 6.24646 3.86209 6.75845V9.655H0V11.586H3.86209V17.3792H0V19.3102H3.86209V22.2068C3.86268 22.7187 4.06632 23.2095 4.42833 23.5716C4.79035 23.9336 5.28118 24.1372 5.79314 24.1378H8.68971V27.9999H10.6208V24.1378H16.4139V27.9999H18.3449V24.1378H21.2415C21.7534 24.1371 22.2442 23.9334 22.6062 23.5714C22.9682 23.2094 23.1719 22.7187 23.1726 22.2068V19.3102H27.0347V17.3792Z"
        fill="currentColor"
      />
      <path d="M18.3447 19.3105H8.68945V9.65527H18.3447V19.3105ZM10.6205 17.3794H16.4136V11.5863H10.6205V17.3794Z" fill="currentColor" />
    </svg>
  );
}

function ZoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21C16.9706 21 21 16.9706 21 12M12 21C7.02944 21 3 16.9706 3 12M12 21C14.2513 18.536 15.5305 15.3372 15.6 12C15.5305 8.66283 14.2513 5.46398 12 3M12 21C9.74868 18.536 8.46954 15.3372 8.4 12C8.46954 8.66283 9.74868 5.46398 12 3M21 12C21 7.02944 16.9706 3 12 3M21 12H3M3 12C3 7.02944 7.02944 3 12 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KpiCard({ title, value, sub, icon }) {
  return (
    <div className="card">
      <div className="cardInner">
        <IconCircle>{icon}</IconCircle>
        <p className="cardTitle">{title}</p>
        <div className="cardValue">{value}</div>
        {sub ? (
          <div className="metricMetaRow">
            <p className="cardSub" style={{ margin: 0 }}>
              {sub}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardShell({ title, right, icon, children }) {
  return (
    <div className="card">
      <div className="cardHeaderRow">
        <div className="cardHeaderLeft">
          {icon ? <div className="iconCircle iconCircleFloat">{icon}</div> : null}
          <h3>{title}</h3>
        </div>
        {right ? <span className="hint">{right}</span> : null}
      </div>
      <div className="cardBody">{children}</div>
    </div>
  );
}

function fmtTs(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function severityStyle(severity) {
  const s = String(severity || "").toUpperCase();

  if (s === "CRITICAL") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
    };
  }

  if (s === "HIGH") {
    return {
      background: "#fee2e2",
      color: "#dc2626",
    };
  }

  if (s === "MEDIUM") {
    return {
      background: "#fef3c7",
      color: "#b45309",
    };
  }

  return {
    background: "#e5e7eb",
    color: "#374151",
  };
}

const quickActionBtn = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  padding: "12px",
  cursor: "pointer",
  fontWeight: 800,
};

export default function SOCDashboardPage() {
  const navigate = useNavigate();
  const settings = useDashboardSettings("operations");
  const refreshMs = getDashboardRefreshMs(settings);

  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/dashboard/soc-overview`);
        if (!alive) return;
        setOverview(res.data || null);
        setError("");
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || "Failed to load SOC overview");
      }
    };

    load();
    const t = setInterval(load, refreshMs);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshMs]);

  const kpis = overview?.kpis || {};
  const recentAlerts = overview?.recent_alerts || [];
  const hotZones = overview?.hot_zones || [];
  const severityBreakdown = overview?.breakdowns?.severity || {};
  const statusBreakdown = overview?.breakdowns?.status || {};

  const criticalLabel = useMemo(() => String(Number(kpis.critical_open_alerts || 0)), [kpis.critical_open_alerts]);
  const openLabel = useMemo(() => String(Number(kpis.open_alerts || 0)), [kpis.open_alerts]);
  const quarantinedLabel = useMemo(() => String(Number(kpis.quarantined_devices || 0)), [kpis.quarantined_devices]);
  const containmentLabel = useMemo(() => `${Number(kpis.containment_rate_pct || 0)}%`, [kpis.containment_rate_pct]);

  return (
    <div className="opsTheme socTheme">
      <style>{`
        .socTheme .dashboardWrap{
          display:flex;
          flex-direction:column;
          gap:22px;
          padding-top:24px;
        }

        .socTheme .topRow{
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:22px;
          overflow: visible;
        }

        .socTheme .grid2{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:22px;
          padding-top:0;
          align-items:stretch;
        }

        .socTheme .grid2 > .card{
          height:100%;
          display:flex;
          flex-direction:column;
        }

        .socTheme .grid2 > .card .cardBody{
          flex:1;
          display:flex;
          flex-direction:column;
        }

        .socTheme .cardTitle,
        .socTheme .cardHeaderRow h3 {
          color: #123150 !important;
        }

        .socTheme .iconCircle,
        .socTheme .iconCircleFloat {
          background: #123150 !important;
        }

        @media (max-width: 1200px){
          .socTheme .topRow{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 1100px){
          .socTheme .grid2{
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px){
          .socTheme .topRow{
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="dashboardWrap">
        {error ? (
          <div
            style={{
              marginBottom: 0,
              padding: 12,
              borderRadius: 12,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="topRow">
          <KpiCard title="Open Security Alerts" value={openLabel} sub="NEW + ACKNOWLEDGED" icon={<ShieldIcon />} />
          <KpiCard title="Critical Open Alerts" value={criticalLabel} sub="Highest priority" icon={<AlertIcon />} />
          <KpiCard title="Quarantined Devices" value={quarantinedLabel} sub="Current device state" icon={<DeviceIcon />} />
          <KpiCard title="Containment Rate Today" value={containmentLabel} sub="Resolved today / total today" icon={<ZoneIcon />} />
        </div>

        <div className="grid2">
          <CardShell title="Security Alerts Trend" right="Last 7 days" icon={<AlertIcon />}>
            <AlertsTrendPanel range="7d" domain="SECURITY" embedded />
          </CardShell>

          <CardShell title="Device Status Overview" right="Live" icon={<DeviceIcon />}>
            <DeviceStatusBars embedded />
          </CardShell>
        </div>

        <div className="grid2">
          <CardShell title="Recent Critical Activity" icon={<ShieldIcon />}>
            <div style={{ display: "grid", gap: 12 }}>
              {recentAlerts.length ? (
                recentAlerts.map((alert) => (
                  <button
                    key={alert.alert_id}
                    type="button"
                    onClick={() => navigate(`/soc/alerts/${alert.alert_id}`)}
                    style={{
                      border: "1px solid #dbeafe",
                      background: "#fff",
                      borderRadius: 14,
                      padding: "12px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 800, color: "#111827" }}>
                        {alert.rule_name || alert.rule_key}
                      </div>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          ...severityStyle(alert.severity),
                        }}
                      >
                        {alert.severity}
                      </span>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, color: "#4b5563" }}>
                      {alert.message || "No description"}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <span>Zone: {alert.zone_id || "-"}</span>
                      <span>Hall: {alert.hall_id || "-"}</span>
                      <span>Status: {alert.status || "-"}</span>
                      <span>{fmtTs(alert.detected_at)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ color: "#6b7280", fontSize: 14 }}>No active high-priority alerts found.</div>
              )}
            </div>
          </CardShell>

          <CardShell title="Hot Zones & Quick Actions" icon={<ZoneIcon />}>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 10 }}>
                {hotZones.length ? (
                  hotZones.map((zone) => (
                    <div
                      key={zone.zone_id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        border: "1px solid #dbeafe",
                        borderRadius: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{zone.zone_id || "Unknown zone"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {zone.open_count} open alert{Number(zone.open_count) === 1 ? "" : "s"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/soc/alerts`)}
                        style={{
                          border: "none",
                          background: "#123150",
                          color: "#fff",
                          borderRadius: 10,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        Review
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#6b7280", fontSize: 14 }}>No active hotspot zones right now.</div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <button type="button" onClick={() => navigate("/soc/alerts")} style={quickActionBtn}>
                  Open Alerts
                </button>

                <button type="button" onClick={() => navigate("/soc/devices")} style={quickActionBtn}>
                  Device Overview
                </button>

                <button type="button" onClick={() => navigate("/soc/map")} style={quickActionBtn}>
                  Open Digital Twin
                </button>

                <button type="button" onClick={() => navigate("/soc/logs")} style={quickActionBtn}>
                  Open Logs
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                  fontSize: 13,
                  color: "#4b5563",
                }}
              >
                <div>Critical: {severityBreakdown.CRITICAL || 0}</div>
                <div>High: {severityBreakdown.HIGH || 0}</div>
                <div>New: {statusBreakdown.NEW || 0}</div>
                <div>Acknowledged: {statusBreakdown.ACKNOWLEDGED || 0}</div>
              </div>
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  );
}