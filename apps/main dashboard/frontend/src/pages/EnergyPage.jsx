/**
 * Displays the sustainability energy page with live energy trends, zone-level
 * consumption analysis, top hall energy usage, KPI summary cards, and anomaly
 * monitoring. This page fetches energy trends and summary data from dashboard
 * and energy APIs, uses dashboard refresh settings utilities, and composes
 * Sparkline, InfoTooltip, TopHallsEnergyBar, and filter icons from FilterIcons.
 */

import "./EnergyPage.css";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sparkline from "../components/Sparkline";
import InfoTooltip from "../components/InfoTooltip";
import TopHallsEnergyBar from "../components/TopHallsEnergyBar";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";
import {
  IconMetrics,
  IconSearch,
  IconSort,
  IconZone,
} from "../components/FilterIcons";


const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const SUST_GREEN = "#00802B";

function CardShell({ title, tooltip, right, children }) {
  return (
    <div className="energyCard">
      <div className="energyCardHeader">
        <div className="energyCardTitle">
          {title}
          <InfoTooltip text={tooltip} color="#64748b" />
        </div>
        {right ? <div className="energyCardRight">{right}</div> : null}
      </div>
      <div className="energyCardBody">{children}</div>
    </div>
  );
}

function BarsMiniChart({ points = [] }) {
  const vals = points.map((p) => Number(p.value || 0)).filter(Number.isFinite);
  const max = Math.max(...vals, 1);

  return (
    <div className="barsWrap" aria-hidden="true">
      {points.map((p, i) => {
        const v = Number(p.value || 0);
        const h = Math.max(2, Math.round((v / max) * 92));
        return <div key={i} className="bar" style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}

function HorizontalBars({ rows = [] }) {
  const max = useMemo(() => Math.max(...rows.map((r) => Number(r.value || 0)), 1), [rows]);

  return (
    <div className="hBars">
      {rows.map((r, idx) => {
        const v = Number(r.value || 0);
        const w = Math.round((v / max) * 100);
        return (
          <div className="hBarRow" key={`${r.label}-${idx}`}>
            <div className="hBarLabel">{r.label}</div>
            <div className="hBarTrack">
              <div className="hBarFill" style={{ width: `${w}%` }} />
            </div>
            <div className="hBarVal">{Number.isFinite(v) ? v.toFixed(0) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

function KpiMiniCard({ label, tooltip, value, sub, points }) {
  return (
    <div className="kpiMini" style={{ overflow: "hidden" }}>
      <div className="kpiMiniTop">
        <div className="kpiMiniLabel">
          {label}
          <InfoTooltip text={tooltip} color="#64748b" />
        </div>
        <div className="kpiMiniValue">{value}</div>
      </div>
      {sub ? <div className="kpiMiniSub">{sub}</div> : null}
      <div className="kpiMiniSpark" style={{ width: "100%", overflow: "hidden", marginTop: 10 }}>
        <Sparkline points={points} height={85} accent={SUST_GREEN} />
      </div>
    </div>
  );
}

export default function EnergyPage() {
  const settings = useDashboardSettings("sustainability");
  const refreshMs = getDashboardRefreshMs(settings);
  const [q, setQ] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [metric, setMetric] = useState("energy");
  const [sortBy, setSortBy] = useState("kwh_desc");

  const [err, setErr] = useState("");

  const [energyPoints24h, setEnergyPoints24h] = useState([]);
  const [sparkEnergy6h, setSparkEnergy6h] = useState([]);

  const [zones, setZones] = useState([]);
  const [sources, setSources] = useState([]);
  const [anoms, setAnoms] = useState([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/trends`, {
          params: {
            metric,
            hours: 24,
            zone_id: zoneId || undefined,
          },
        });
        if (!alive) return;
        setEnergyPoints24h(r.data?.points || []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load live energy usage");
      }
    };

    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [metric, zoneId, refreshMs]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [z, s, a, e6] = await Promise.all([
          axios.get(`${API_BASE}/energy/zones-latest-day`, { params: { zone_id: zoneId || undefined } }),
          axios.get(`${API_BASE}/energy/sources-latest-day`, { params: { zone_id: zoneId || undefined } }),
          axios.get(`${API_BASE}/energy/anomalies-summary`, { params: { hours: 24, limit: 6 } }),
          axios.get(`${API_BASE}/dashboard/trends`, { params: { metric: "energy", hours: 6, zone_id: zoneId || undefined } }),
        ]);

        if (!alive) return;

        setZones(z.data?.rows || []);
        setSources(s.data?.rows || []);
        setAnoms(a.data?.rows || []);
        setSparkEnergy6h(e6.data?.points || []);
        setErr("");
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load energy widgets");
      }
    };

    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [zoneId, refreshMs]);

  const kpis = useMemo(() => {
    const totalKwh24h = (sources || []).reduce((sum, r) => sum + Number(r.total_kwh || 0), 0);

    const hvacKwh24h = (sources || [])
      .filter((r) => {
        const src = String(r.source || "").toLowerCase();
        return src === "derived_csv" || src.includes("hvac");
      })
      .reduce((sum, r) => sum + Number(r.total_kwh || 0), 0);

    const hvacSharePct = totalKwh24h > 0 ? (hvacKwh24h / totalKwh24h) * 100 : 0;

    const peakKwhInterval = Math.max(...(energyPoints24h || []).map((p) => Number(p.value || 0)), 0);

    return {
      totalKwh24h,
      peakKwhInterval,
      hvacKwh24h,
      hvacSharePct,
    };
  }, [sources, energyPoints24h]);

  const zonesFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const rows = (zones || []).map((z) => ({
      label: z.zone_id,
      value: Number(z.total_kwh || 0),
    }));

    const filtered = !qq ? rows : rows.filter((r) => String(r.label || "").toLowerCase().includes(qq));

    if (sortBy === "kwh_asc") return filtered.sort((a, b) => a.value - b.value);
    return filtered.sort((a, b) => b.value - a.value);
  }, [zones, q, sortBy]);

  const barsPoints = useMemo(() => energyPoints24h.slice(-36), [energyPoints24h]);

  const tooltipText = {
    liveEnergyUsage: "Live energy trend for the selected metric and zone over the latest time window.",
    avgConsumptionZone: "Average energy consumption by zone for the selected filter set.",
    energyByDeviceType: "Energy usage grouped by device or source type.",
    totalEnergy24h: "Total recorded energy consumption across the latest 24 hours.",
    peakInterval24h: "Highest single 15-minute energy interval recorded in the latest 24 hours.",
    hvacShare24h: "HVAC contribution as a share of total energy consumption over the latest 24 hours.",
    anomaliesAlerts: "Latest anomaly and alert summary for energy-related signals in the past 24 hours.",
  };

  return (
    <div className="sustTheme">
      <div className="energyPage">
        <div className="energyInner">
          <div className="energyFiltersRow">
            <div className="filterPill pillSearch">
              <span className="pillLeftIcon" aria-hidden>
                <IconSearch />
              </span>
              <input
                className="pillInput"
                placeholder="Search here"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="filterPill pillSelectWrap pillZone">
              <span className="pillLeftIcon" aria-hidden>
                <IconZone />
              </span>
              <select className="pillSelect" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Zone</option>
                {["zoneA", "zoneB", "zoneC", "zoneD"].map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <span className="pillRightCaret" aria-hidden />
            </div>

            <div className="filterPill pillSelectWrap pillMetric">
              <span className="pillLeftIcon" aria-hidden>
                <IconMetrics />
              </span>
              <select className="pillSelect" value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="energy">Metrics: HVAC energy</option>
                <option value="temperature">Metrics: Temperature</option>
                <option value="carbon">Metrics: Carbon</option>
              </select>
              <span className="pillRightCaret" aria-hidden />
            </div>

            <div className="filterPill pillSelectWrap pillSort">
              <span className="pillLeftIcon" aria-hidden>
                <IconSort />
              </span>
              <select className="pillSelect" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="kwh_desc">Sort by: kWh (desc)</option>
                <option value="kwh_asc">Sort by: kWh (asc)</option>
              </select>
              <span className="pillRightCaret" aria-hidden />
            </div>

            <button className="downloadBtn">
              Download Report
            </button>
          </div>

          {err ? <div className="energyError">{err}</div> : null}

          <div className="energyGridTop">
            <CardShell title="Live Energy Usage" tooltip={tooltipText.liveEnergyUsage}>
              <div className="liveChart">
                <BarsMiniChart points={barsPoints} />
              </div>
            </CardShell>

            <CardShell
              title="Average Consumption Per Zone (kWh)"
              tooltip={tooltipText.avgConsumptionZone}
            >
              <HorizontalBars rows={zonesFiltered} />
            </CardShell>

            <CardShell
              title="Top Halls by Energy Use"
              tooltip="Ranks halls by total energy consumption so the highest-usage halls are visible at a glance."
            >
              <div
                style={{
                  transform: "scale(0.9)",
                  transformOrigin: "top left",
                  width: "111%",
                  marginBottom: "-28px",
                }}
              >
                <TopHallsEnergyBar
                  title={null}
                  limit={3}
                  zoneId={zoneId || undefined}
                  embedded
                />
              </div>
            </CardShell>
          </div>

          <div className="energyGridBottom">
            <div className="kpiRow">
              <KpiMiniCard
                label="Total Energy (24h)"
                tooltip={tooltipText.totalEnergy24h}
                value={`${kpis.totalKwh24h.toFixed(0)} kWh`}
                sub="Sum of all intervals"
                points={sparkEnergy6h}
              />

              <KpiMiniCard
                label="Peak Interval (24h)"
                tooltip={tooltipText.peakInterval24h}
                value={`${kpis.peakKwhInterval.toFixed(1)} kWh`}
                sub="Max 15-min interval"
                points={sparkEnergy6h}
              />

              <KpiMiniCard
                label="HVAC Share (24h)"
                tooltip={tooltipText.hvacShare24h}
                value={`${kpis.hvacSharePct.toFixed(0)}%`}
                sub={`${kpis.hvacKwh24h.toFixed(0)} kWh HVAC`}
                points={sparkEnergy6h}
              />
            </div>

            <CardShell
              title="Anomalies / Alerts"
              tooltip={tooltipText.anomaliesAlerts}
              right={<span className="hintPill">Last 24h</span>}
            >
              <div className="anomList">
                {!anoms.length ? (
                  <div className="anomEmpty">No anomalies found.</div>
                ) : (
                  anoms.map((a, i) => (
                    <div className="anomRow" key={i}>
                      <div className="anomLabel">{a.label}</div>
                      <div className="anomCount">{a.count}</div>
                    </div>
                  ))
                )}
              </div>
            </CardShell>
          </div>


        </div>
      </div>
    </div>
  );
}