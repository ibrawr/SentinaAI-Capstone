/**
 * Displays the environmental monitoring page with live environmental trends,
 * zone-based metric comparisons, anomaly summaries, KPI cards, and CSV export.
 * This page fetches overview, anomaly, by-zone, and trend data from the
 * environment API, uses dashboard refresh settings utilities, and composes
 * Sparkline, InfoTooltip, and filter icons from FilterIcons.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sparkline from "../components/Sparkline";
import "./EnvironmentalPage.css";
import InfoTooltip from "../components/InfoTooltip";
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

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function fmt(n, digits = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

function metricLabel(metric) {
  if (metric === "temperature") return "Temperature (°C)";
  if (metric === "humidity") return "Humidity (%)";
  if (metric === "carbon") return "Carbon (kgCO2)";
  if (metric === "efficiency") return "Efficiency (%)";
  if (metric === "comfort") return "Comfort Index";
  return "Air Quality Score";
}

function metricDigits(metric) {
  return metric === "temperature" ? 1 : metric === "carbon" ? 1 : 0;
}

function BarTrend({ points = [], height = 220 }) {
  const w = 520;
  const h = height;
  const pad = 14;

  if (!points.length) return <div style={{ height, opacity: 0.6 }}>No data yet.</div>;

  const vals = points.map((p) => Number(p.value || 0)).filter(Number.isFinite);
  const maxV = Math.max(...vals, 1);

  const barCount = points.length;
  const barGap = 3;
  const usableW = w - pad * 2;
  const barW = Math.max(4, Math.floor((usableW - barGap * (barCount - 1)) / barCount));

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {points.map((p, i) => {
        const v = Number(p.value || 0);
        const bh = Math.round(clamp01(v / maxV) * (h - pad * 2));
        const x = pad + i * (barW + barGap);
        const y = h - pad - bh;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={bh}
            rx="3"
            fill="var(--green)"
            opacity={i % 5 === 0 ? 0.55 : 0.28}
          />
        );
      })}
    </svg>
  );
}

export default function EnvironmentalPage() {
  const settings = useDashboardSettings("sustainability");
  const refreshMs = getDashboardRefreshMs(settings);
  const [q, setQ] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [metric, setMetric] = useState("air_quality");
  const [sort, setSort] = useState("desc");

  const [zones, setZones] = useState([]);
  const [overview, setOverview] = useState(null);
  const [byZone, setByZone] = useState([]);
  const [anoms, setAnoms] = useState([]);

  const [trendSelected, setTrendSelected] = useState([]);
  const [trendAQ, setTrendAQ] = useState([]);
  const [trendTemp, setTrendTemp] = useState([]);
  const [trendHum, setTrendHum] = useState([]);
  const [trendCarbon, setTrendCarbon] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;

    const loadFilters = async () => {
      try {
        const r = await axios.get(`${API_BASE}/environment/filters`);
        if (!alive) return;
        setZones(r.data?.zones || []);
      } catch {
        if (!alive) return;
      }
    };

    loadFilters();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setErr("");

      try {
        const [ov, bz, an, tSel, tAQ, tTemp, tHum, tCarb] = await Promise.all([
          axios.get(`${API_BASE}/environment/overview`, {
            params: { hours: 24, zone_id: zoneId || undefined },
          }),
          axios.get(`${API_BASE}/environment/by-zone`, {
            params: { hours: 24, metric },
          }),
          axios.get(`${API_BASE}/environment/anomalies`, {
            params: { hours: 24, limit: 6 },
          }),
          axios.get(`${API_BASE}/environment/trends`, {
            params: { metric, hours: metric === "air_quality" ? 6 : 24, zone_id: zoneId || undefined },
          }),
          axios.get(`${API_BASE}/environment/trends`, {
            params: { metric: "air_quality", hours: 24, zone_id: zoneId || undefined },
          }),
          axios.get(`${API_BASE}/environment/trends`, {
            params: { metric: "temperature", hours: 24, zone_id: zoneId || undefined },
          }),
          axios.get(`${API_BASE}/environment/trends`, {
            params: { metric: "humidity", hours: 24, zone_id: zoneId || undefined },
          }),
          axios.get(`${API_BASE}/environment/trends`, {
            params: { metric: "carbon", hours: 24, zone_id: zoneId || undefined },
          }),
        ]);

        if (!alive) return;

        setOverview(ov.data?.kpis || null);
        setByZone(bz.data?.rows || []);
        setAnoms(an.data?.rows || []);
        setTrendSelected((tSel.data?.points || []).map((p) => ({ ts: p.ts, value: p.value })));
        setTrendAQ((tAQ.data?.points || []).map((p) => ({ ts: p.ts, value: p.value })));
        setTrendTemp((tTemp.data?.points || []).map((p) => ({ ts: p.ts, value: p.value })));
        setTrendHum((tHum.data?.points || []).map((p) => ({ ts: p.ts, value: p.value })));
        setTrendCarbon((tCarb.data?.points || []).map((p) => ({ ts: p.ts, value: p.value })));
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || "Failed to load environmental data");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const t = setInterval(load, refreshMs);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [zoneId, metric, refreshMs]);

  const zoneOptions = useMemo(() => {
    if (zones.length) return zones;
    return [...new Set((byZone || []).map((r) => r.zone_id).filter(Boolean))].sort();
  }, [zones, byZone]);

  const byZoneFiltered = useMemo(() => {
    let rows = [...(byZone || [])];

    if (zoneId) {
      rows = rows.filter((r) => String(r.zone_id || "") === zoneId);
    }

    if (qLive) {
      rows = rows.filter((r) => String(r.zone_id || "").toLowerCase().includes(qLive));
    }

    rows.sort((a, b) => {
      const av = Number(a.value || 0);
      const bv = Number(b.value || 0);
      return sort === "asc" ? av - bv : bv - av;
    });

    return rows;
  }, [byZone, zoneId, qLive, sort]);

  const byZoneMax = useMemo(() => {
    if (!byZoneFiltered.length) return 1;
    return Math.max(...byZoneFiltered.map((r) => Number(r.value || 0)), 1);
  }, [byZoneFiltered]);

  const currentMetricLabel = useMemo(() => metricLabel(metric), [metric]);

  const downloadReport = () => {
    const now = new Date();
    const lines = [];

    lines.push(["Environmental Report", now.toISOString()].join(","));
    lines.push(["zone_filter", zoneId || "ALL"].join(","));
    lines.push(["metric", metric].join(","));
    lines.push(["sort", sort].join(","));
    lines.push("");

    if (overview) {
      lines.push("Overview (latest 24h window)");
      lines.push("air_quality_score,avg_temp_c,avg_humidity_pct,total_carbon_kgco2,avg_efficiency_score,avg_comfort_index,min_temp_c,max_temp_c");
      lines.push(
        [
          overview.air_quality_score,
          overview.avg_temp_c,
          overview.avg_humidity_pct,
          overview.total_carbon_kgco2,
          overview.avg_efficiency_score,
          overview.avg_comfort_index,
          overview.min_temp_c,
          overview.max_temp_c,
        ].join(",")
      );
      lines.push("");
    }

    lines.push(`By Zone (${currentMetricLabel})`);
    lines.push("zone_id,value");
    byZoneFiltered.forEach((r) => lines.push([r.zone_id, r.value].join(",")));
    lines.push("");

    lines.push("Anomalies (latest 24h window)");
    lines.push("label,count");
    anoms.forEach((r) => lines.push([r.label, r.count].join(",")));

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Environment_Report_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
    const tooltipText = {
      liveEnvironmentalSignal: "Live trend for the selected environmental metric and zone.",
      averageByZone: "Average metric value by zone across the latest 24 hours.",
      anomaliesAlerts: "Latest environmental anomalies and alerts detected in the past 24 hours.",
      totalCarbon24h: "Total estimated carbon emissions across the latest 24 hours.",
      avgIndoorTemp24h: "Average indoor temperature across the latest 24 hours.",
      avgHumidity24h: "Average humidity across the latest 24 hours.",
      airQualityScore24h: "Composite air quality score derived from environmental conditions over the latest 24 hours.",
    };

  return (
    <div className="sustTheme envPage">
      <div className="envInner">
        <div className="envControls">
          <div className="envPill envSearch">
            <span className="pillLeftIcon" aria-hidden>
              <IconSearch />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search here"
              className="envInput"
            />
          </div>

          <div className="envPill envSelectWrap">
            <span className="pillLeftIcon" aria-hidden>
              <IconZone />
            </span>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="envSelectEl">
              <option value="">Zone</option>
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <span className="envCaret" />
          </div>

          <div className="envPill envSelectWrap">
            <span className="pillLeftIcon" aria-hidden>
              <IconMetrics />
            </span>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="envSelectEl">
              <option value="air_quality">Metrics: Air quality</option>
              <option value="temperature">Metrics: Temperature</option>
              <option value="humidity">Metrics: Humidity</option>
              <option value="carbon">Metrics: Carbon</option>
              <option value="efficiency">Metrics: Efficiency</option>
              <option value="comfort">Metrics: Comfort</option>
            </select>
            <span className="envCaret" />
          </div>

          <div className="envPill envSelectWrap">
            <span className="pillLeftIcon" aria-hidden>
              <IconSort />
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="envSelectEl">
              <option value="desc">Sort: {currentMetricLabel} (desc)</option>
              <option value="asc">Sort: {currentMetricLabel} (asc)</option>
            </select>
            <span className="envCaret" />
          </div>

          <button className="envDownloadBtn" onClick={downloadReport}>
            Download Report
          </button>
        </div>

        {err ? <div className="envError">{err}</div> : null}

        <div className="envGridTop">
          <div className="envCard">
            <div className="envCardHead">
              <div className="envCardTitle">
                Live Environmental Signal
                <InfoTooltip text={tooltipText.liveEnvironmentalSignal} color="#64748b" />
              </div>
            </div>
            <div className="envCardBody">
              {loading ? <div className="envMuted">Loading…</div> : <BarTrend points={trendSelected} />}
            </div>
          </div>

          <div className="envCard">
            <div className="envCardHead">
              <div className="envCardTitle">
                Average by Zone (24h)
                <InfoTooltip text={tooltipText.averageByZone} color="#64748b" />
              </div>
            </div>
            <div className="envCardBody">
              {loading ? (
                <div className="envMuted">Loading…</div>
              ) : !byZoneFiltered.length ? (
                <div className="envMuted">No zone data found.</div>
              ) : (
                <div className="envBars">
                  {byZoneFiltered.map((r) => {
                    const v = Number(r.value || 0);
                    const pct = clamp01(v / byZoneMax) * 100;
                    return (
                      <div className="envBarRow" key={r.zone_id}>
                        <div className="envBarLabel">{r.zone_id}</div>
                        <div className="envBarTrack">
                          <div className="envBarFill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="envBarValue">{fmt(v, metricDigits(metric))}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="envCard">
            <div className="envCardHead">
              <div className="envCardTitle">
                Anomalies / Alerts
                <InfoTooltip text={tooltipText.anomaliesAlerts} color="#64748b" />
              </div>
              <div className="envPillMini">Last 24h</div>
            </div>
            <div className="envCardBody">
              {loading ? (
                <div className="envMuted">Loading…</div>
              ) : !anoms.length ? (
                <div className="envMuted">No anomalies in the latest 24h window.</div>
              ) : (
                <div className="envList">
                  {anoms.map((a, idx) => (
                    <div className="envListRow" key={`${a.label}-${idx}`}>
                      <div className="envListLabel">{a.label}</div>
                      <div className="envListCount">{a.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="envGridBottom">
          <div className="envKpi">
            <div className="envKpiTop">
              <div className="envKpiLabel">
                Total Carbon (24h)
                <InfoTooltip text={tooltipText.totalCarbon24h} color="#64748b" />
              </div>
              <div className="envKpiValue">
                {overview ? fmt(overview.total_carbon_kgco2, 0) : "—"} <span className="envUnit">kgCO2</span>
              </div>
              <div className="envKpiSub">Sum across halls/intervals</div>
            </div>
            <div className="envKpiChart">
              <Sparkline points={trendCarbon} height={110} xMode="time" />
            </div>
          </div>

          <div className="envKpi">
            <div className="envKpiTop">
              <div className="envKpiLabel">
                Avg Indoor Temp (24h)
                <InfoTooltip text={tooltipText.avgIndoorTemp24h} color="#64748b" />
              </div>
              <div className="envKpiValue">
                {overview ? fmt(overview.avg_temp_c, 1) : "—"} <span className="envUnit">°C</span>
              </div>
              <div className="envKpiSub">
                Range: {overview ? `${fmt(overview.min_temp_c, 1)}–${fmt(overview.max_temp_c, 1)}°C` : "—"}
              </div>
            </div>
            <div className="envKpiChart">
              <Sparkline points={trendTemp} height={110} xMode="time" />
            </div>
          </div>

          <div className="envKpi">
            <div className="envKpiTop">
             <div className="envKpiLabel">
                Avg Humidity (24h)
                <InfoTooltip text={tooltipText.avgHumidity24h} color="#64748b" />
              </div>
              <div className="envKpiValue">
                {overview ? fmt(overview.avg_humidity_pct, 0) : "—"} <span className="envUnit">%</span>
              </div>
              <div className="envKpiSub">Comfort band target ~45–55%</div>
            </div>
            <div className="envKpiChart">
              <Sparkline points={trendHum} height={110} xMode="time" />
            </div>
          </div>

          <div className="envKpi">
            <div className="envKpiTop">
              <div className="envKpiLabel">
                Air Quality Score (24h)
                <InfoTooltip text={tooltipText.airQualityScore24h} color="#64748b" />
              </div>
              <div className="envKpiValue">
                {overview ? fmt(overview.air_quality_score, 0) : "—"} <span className="envUnit">/100</span>
              </div>
              <div className="envKpiSub">Derived from temp + humidity + carbon</div>
            </div>
            <div className="envKpiChart">
              <Sparkline points={trendAQ} height={110} xMode="time" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}