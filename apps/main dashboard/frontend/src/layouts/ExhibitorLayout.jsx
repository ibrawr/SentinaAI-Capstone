/**
 * Provides the exhibitor portal layout, dashboard data loading, sidebar navigation,
 * refresh controls, and shared route context for exhibitor pages. This layout
 * fetches profile, event, heatmap, and density data, and passes shared state and
 * helpers to child pages through Outlet context. It also integrates SettingsPage,
 * FloatingAssistant, HelpSupportModal, LogoutConfirmModal, and dashboard settings
 * utilities for refresh timing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "./../pages/ExhibitorDashboard.css";
import SettingsPage from "../pages/SettingsPage";
import FloatingAssistant from "../components/FloatingAssistant";
import LogoutConfirmModal from "../components/LogoutConfirmModal";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";
import HelpSupportModal from "../components/HelpSupportModal";


const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const ACCENT = "#35005C";
const SIDEBAR_STORAGE_KEY = "sentina.sidebarCollapsed";
const EXHIBITOR_HELP_GUIDE_PATH = "/guides/exhibitor-user-guide.pdf";

function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return qs.toString();
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function heatColor(t) {
  const x = clamp01(t);
  const r = Math.round(lerp(228, 53, x));
  const g = Math.round(lerp(233, 0, x));
  const b = Math.round(lerp(246, 92, x));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatMetric(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function formatPercent(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHeaderClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function average(arr) {
  const nums = arr.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function densityTone(label) {
  const v = String(label || "").toLowerCase();
  if (v === "high") return "critical";
  if (v === "medium") return "warning";
  return "good";
}

function statusTone(ok, pending = false) {
  if (pending) return "warning";
  return ok ? "good" : "critical";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m16 16-3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}



function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 21" fill="none" aria-hidden="true">
      <path
        d="M7 19.3333V10.1667H13V19.3333M1 7.41667L10 1L19 7.41667V17.5C19 17.9862 18.7893 18.4525 18.4142 18.7964C18.0391 19.1402 17.5304 19.3333 17 19.3333H3C2.46957 19.3333 1.96086 19.1402 1.58579 18.7964C1.21071 18.4525 1 17.9862 1 17.5V7.41667Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeatMapIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M44,42a2,2,0,0,1-2,2H4V6A2,2,0,0,1,8,6V40H42A2,2,0,0,1,44,42ZM12,30a.9.9,0,0,0-1,1v4a.9.9,0,0,0,1,1h4a.9.9,0,0,0,1-1V31a.9.9,0,0,0-1-1Zm-1-4h6a.9.9,0,0,0,1-1V19a.9.9,0,0,0-1-1H11a.9.9,0,0,0-1,1v6A.9.9,0,0,0,11,26Zm24,0h6a.9.9,0,0,0,1-1V19a.9.9,0,0,0-1-1H35a.9.9,0,0,0-1,1v6A.9.9,0,0,0,35,26ZM23,15h6a.9.9,0,0,0,1-1V8a.9.9,0,0,0-1-1H23a.9.9,0,0,0-1,1v6A.9.9,0,0,0,23,15ZM22,38h8a.9.9,0,0,0,1-1V29a.9.9,0,0,0-1-1H22a.9.9,0,0,0-1,1v8A.9.9,0,0,0,22,38Zm2-19a.9.9,0,0,0-1,1v4a.9.9,0,0,0,1,1h4a.9.9,0,0,0,1-1V20a.9.9,0,0,0-1-1ZM37,31a.9.9,0,0,0-1,1v2a.9.9,0,0,0,1,1h2a.9.9,0,0,0,1-1V32a.9.9,0,0,0-1-1Zm0-18h2a.9.9,0,0,0,1-1V10a.9.9,0,0,0-1-1H37a.9.9,0,0,0-1,1v2A.9.9,0,0,0,37,13ZM13,13h2a.9.9,0,0,0,1-1V10a.9.9,0,0,0-1-1H13a.9.9,0,0,0-1,1v2A.9.9,0,0,0,13,13Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg viewBox="0 0 25 19" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.5 0.5H2V17.375H24.5V18.5H0.5V0.5ZM22.7255 4.00212C22.8018 4.04893 22.865 4.10656 22.9116 4.17171C22.9581 4.23686 22.9871 4.30825 22.9969 4.3818C23.0066 4.45536 22.9969 4.52963 22.9684 4.60038C22.9398 4.67113 22.893 4.73697 22.8305 4.79413L16.0805 10.9816C16.0142 11.0424 15.9316 11.092 15.8381 11.1274C15.7447 11.1627 15.6424 11.183 15.5378 11.1869C15.4332 11.1909 15.3288 11.1783 15.231 11.1501C15.1333 11.1219 15.0446 11.0787 14.9705 11.0233L11.09 8.11287L5.606 13.7682C5.48603 13.8827 5.31161 13.9577 5.11938 13.9777C4.92714 13.9977 4.73207 13.961 4.57516 13.8753C4.41824 13.7897 4.3117 13.6618 4.27792 13.5184C4.24413 13.3751 4.28574 13.2276 4.394 13.1068L10.394 6.91925C10.4577 6.85345 10.5396 6.79879 10.6342 6.75904C10.7288 6.71928 10.8337 6.69537 10.9418 6.68895C11.0498 6.68254 11.1585 6.69377 11.2602 6.72187C11.3619 6.74998 11.4543 6.79429 11.531 6.85175L15.4445 9.788L21.6695 4.08087C21.7319 4.02367 21.8087 3.97625 21.8956 3.94133C21.9825 3.9064 22.0777 3.88467 22.1757 3.87735C22.2738 3.87004 22.3728 3.87729 22.4672 3.8987C22.5615 3.92011 22.6493 3.95526 22.7255 4.00212Z"
        fill="currentColor"
        stroke="currentColor"
      />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 22" fill="none" aria-hidden="true">
      <path
        d="M20.1667 6.41667V20.5H2.91667V6.41667M9.625 10.75H13.4583M1 1H22.0833V6.41667H1V1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToggleChevronIcon({ collapsed }) {
  return collapsed ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: 14, height: 14, display: "block" }}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: 14, height: 14, display: "block" }}>
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg viewBox="0 0 34 24" fill="none" aria-hidden="true">
      <path
        d="M11.3332 18L1.4165 22V6L11.3332 2M11.3332 18L22.6665 22M11.3332 18V2M22.6665 22L32.5832 18V2L22.6665 6M22.6665 22V6M22.6665 6L11.3332 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.2 3.6h3.6l.7 2.2a6.9 6.9 0 0 1 1.6.9l2.2-.8 1.8 3.1-1.6 1.7c.1.5.2 1 .2 1.4 0 .5-.1 1-.2 1.5l1.6 1.7-1.8 3.1-2.2-.8c-.5.4-1 .7-1.6.9l-.7 2.2h-3.6l-.7-2.2c-.6-.2-1.1-.5-1.6-.9l-2.2.8-1.8-3.1 1.6-1.7a7 7 0 0 1 0-2.9L3 9.1l1.8-3.1 2.2.8c.5-.4 1-.7 1.6-.9l.6-2.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.75 9.2a2.75 2.75 0 1 1 4.5 2.1c-.8.6-1.25 1.1-1.25 2.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 17.2h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m14 16 4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function ExhibitorLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const hideTopControls =
    location.pathname.startsWith("/exhibitor/reports") ||
    location.pathname.startsWith("/exhibitor/navigation");

  const dashboardSettings = useDashboardSettings("exhibitor");
  const refreshMs = getDashboardRefreshMs(dashboardSettings);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
    }
  }, [sidebarCollapsed]);

  const [now, setNow] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [exhibitorId, setExhibitorId] = useState(() => sessionStorage.getItem("exhibitor_id") || "");
  const [exhibitorName, setExhibitorName] = useState(() => sessionStorage.getItem("exhibitor_name") || "");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [catchmentK, setCatchmentK] = useState(6);
  const [mcPasses, setMcPasses] = useState(15);

  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [heatmap, setHeatmap] = useState(null);
  const [density, setDensity] = useState(null);

  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState("");

  const hasBootstrapped = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const heatmapUrl = useMemo(() => {
    const qs = buildQuery({ intervalMinutes, catchmentK, mcPasses, agg: "mean" });
    return `${API_BASE}/api/exhibitor-ai/api/exhibitor/${encodeURIComponent(exhibitorId)}/catchment/heatmap?${qs}`;
  }, [exhibitorId, intervalMinutes, catchmentK, mcPasses]);

  const densityUrl = useMemo(() => {
    const qs = buildQuery({ intervalMinutes, catchmentK, mcPasses });
    return `${API_BASE}/api/exhibitor-ai/api/exhibitor/${encodeURIComponent(exhibitorId)}/competition/density?${qs}`;
  }, [exhibitorId, intervalMinutes, catchmentK, mcPasses]);

  const reportDownloadUrl = useMemo(() => {
    const qs = buildQuery({ intervalMinutes, catchmentK, mcPasses });
    return `${API_BASE}/api/exhibitor-ai-download/api/exhibitor/${encodeURIComponent(exhibitorId)}/report/download?${qs}`;
  }, [exhibitorId, intervalMinutes, catchmentK, mcPasses]);

  const loadAll = async (nextExhibitorId = exhibitorId) => {
    const safeId = String(nextExhibitorId || "").trim();
    if (!safeId) {
      setError("No exhibitor profile is linked to this account.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [profileRes, eventsRes, heatmapRes, densityRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/exhibitors/${encodeURIComponent(safeId)}`),
        axios.get(`${API_BASE}/exhibitors/${encodeURIComponent(safeId)}/events`),
        axios.get(heatmapUrl.replace(encodeURIComponent(exhibitorId), encodeURIComponent(safeId))),
        axios.get(densityUrl.replace(encodeURIComponent(exhibitorId), encodeURIComponent(safeId))),
      ]);

      const firstReject = [profileRes, eventsRes, heatmapRes, densityRes].find((r) => r.status === "rejected");
      if (firstReject) {
        const reason = firstReject.reason;
        const message =
          reason?.response?.data?.detail ||
          reason?.response?.data?.error ||
          reason?.message ||
          "Failed to load exhibitor portal data.";
        throw new Error(message);
      }

      setProfile(profileRes.value?.data?.exhibitor || null);
      setEvents(safeArray(eventsRes.value?.data?.rows));
      setHeatmap(heatmapRes.value?.data || null);
      setDensity(densityRes.value?.data || null);
      setExhibitorId(safeId);
    } catch (err) {
      setProfile(null);
      setEvents([]);
      setHeatmap(null);
      setDensity(null);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function bootstrapExhibitor() {
      try {
        setBootstrapping(true);
        setError("");

        const meRes = await axios.get(`${API_BASE}/auth/me`);
        if (ignore) return;

        const linkedExhibitorId = String(meRes.data?.exhibitor_id || sessionStorage.getItem("exhibitor_id") || "").trim();
        const linkedExhibitorName = String(meRes.data?.exhibitor_name || sessionStorage.getItem("exhibitor_name") || "").trim();

        if (!linkedExhibitorId) {
          throw new Error("No exhibitor profile is linked to the logged-in account.");
        }

        sessionStorage.setItem("exhibitor_id", linkedExhibitorId);
        if (linkedExhibitorName) {
          sessionStorage.setItem("exhibitor_name", linkedExhibitorName);
        }

        setExhibitorId(linkedExhibitorId);
        setExhibitorName(linkedExhibitorName);
        await loadAll(linkedExhibitorId);
        hasBootstrapped.current = true;
      } catch (err) {
        if (!ignore) {
          setProfile(null);
          setEvents([]);
          setHeatmap(null);
          setDensity(null);
          setError(String(err?.response?.data?.error || err?.message || err));
        }
      } finally {
        if (!ignore) setBootstrapping(false);
      }
    }

    bootstrapExhibitor();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!hasBootstrapped.current) return;
    loadAll(exhibitorId);
  }, [intervalMinutes, catchmentK, mcPasses]);

  useEffect(() => {
    if (!hasBootstrapped.current) return;

    const t = window.setInterval(() => {
      loadAll(exhibitorId);
    }, refreshMs);

    return () => window.clearInterval(t);
  }, [refreshMs, exhibitorId, intervalMinutes, catchmentK, mcPasses]);

  const densitySeries = safeArray(density?.series);
  const densityLatest = densitySeries.length ? densitySeries[densitySeries.length - 1] : null;

  const confidenceScore = heatmap?.meta?.aiConfidence?.score;
  const confidencePct = Number.isFinite(Number(confidenceScore))
    ? Math.round(Number(confidenceScore) * 100)
    : null;

  const latestHeatRow = useMemo(() => {
    const matrix = safeArray(heatmap?.matrix);
    return matrix.length ? safeArray(matrix[matrix.length - 1]) : [];
  }, [heatmap]);

  const latestHeatValues = latestHeatRow.map(Number).filter(Number.isFinite);
  const avgCatchmentEngagement = average(latestHeatValues);

  const heatStats = useMemo(() => {
    const matrix = safeArray(heatmap?.matrix);
    const values = matrix.flat().map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    return { minV, maxV, range: Math.max(1e-9, maxV - minV) };
  }, [heatmap]);

  const engagementTrendPoints = useMemo(() => {
    const matrix = safeArray(heatmap?.matrix);
    const yLabels = safeArray(heatmap?.yLabels);
    return matrix
      .map((row, idx) => ({
        ts: yLabels[idx],
        value: average(safeArray(row)),
      }))
      .filter((point) => Number.isFinite(Number(point.value)));
  }, [heatmap]);

  const densityTrendPoints = useMemo(
    () =>
      densitySeries.map((item) => ({
        ts: item.bucket_ts,
        value: item.competitive_density_score,
      })),
    [densitySeries]
  );

  const latestHallSnapshot = useMemo(() => {
    const labels = safeArray(heatmap?.xLabels);
    return labels
      .map((hall, idx) => ({ hall, value: Number(latestHeatRow[idx]) }))
      .filter((item) => Number.isFinite(item.value))
      .filter((item) => !searchTerm || item.hall.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.value - a.value);
  }, [heatmap, latestHeatRow, searchTerm]);

  const filteredEvents = useMemo(() => {
    return safeArray(events).filter((event) => {
      if (!searchTerm) return true;
      const needle = searchTerm.toLowerCase();
      return [event.event_id, event.event_name, event.package_tier]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [events, searchTerm]);

  const reportChecklist = useMemo(
    () => [
      {
        label: "Catchment report",
        status: heatmap && density ? "Ready" : loading ? "Updating" : "Unavailable",
        tone: statusTone(Boolean(heatmap && density), loading),
      },
      {
        label: "Density summary",
        status: densityLatest ? densityLatest.competitive_density_label : loading ? "Updating" : "Pending",
        tone: densityLatest ? densityTone(densityLatest.competitive_density_label) : statusTone(false, loading),
      },
      {
        label: "Follow-up pack",
        status: profile ? "Prepared" : loading ? "Updating" : "Pending",
        tone: statusTone(Boolean(profile), loading),
      },
    ],
    [densityLatest, heatmap, loading, profile]
  );

  const quickInsights = useMemo(() => {
    const insights = [];
    if (confidencePct !== null) {
      insights.push(`AI confidence is ${confidencePct}%, indicating how stable the current predictions are.`);
    }
    if (densityLatest?.competitive_density_label) {
      insights.push(
        `Latest surrounding competition is ${densityLatest.competitive_density_label.toLowerCase()} with a score of ${formatMetric(
          densityLatest.competitive_density_score,
          3
        )}.`
      );
    }
    if (avgCatchmentEngagement !== null) {
      insights.push(`Average catchment engagement across nearby halls is ${formatMetric(avgCatchmentEngagement, 3)}.`);
    }
    if (filteredEvents.length) {
      insights.push(`${filteredEvents.length} linked event record${filteredEvents.length === 1 ? "" : "s"} are available for this exhibitor.`);
    }
    return insights;
  }, [avgCatchmentEngagement, confidencePct, densityLatest, filteredEvents.length]);

  const pageTitle = useMemo(() => {
    if (location.pathname === "/exhibitor" || location.pathname === "/exhibitor/") return "Dashboard";
    if (location.pathname.startsWith("/exhibitor/heatmap")) return "Heat Map";
    if (location.pathname.startsWith("/exhibitor/analytics")) return "Analytics";
    if (location.pathname.startsWith("/exhibitor/reports/new")) return "Generate Report";
    if (location.pathname.startsWith("/exhibitor/reports/") && location.pathname.endsWith("/edit")) return "Edit Report Draft";
    if (location.pathname.startsWith("/exhibitor/reports")) return "Reports";
    if (location.pathname.startsWith("/exhibitor/navigation")) return "Navigation";
    if (location.pathname.startsWith("/exhibitor/settings")) return "Settings";
    return "Exhibitor Portal";
  }, [location.pathname]);

  const handleRefresh = () => loadAll(exhibitorId);

  const handleDownloadReport = async () => {
    try {
      const response = await axios.get(reportDownloadUrl, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      const disposition = String(response.headers["content-disposition"] || "");
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      anchor.href = blobUrl;
      anchor.download = decodeURIComponent(match?.[1] || match?.[2] || `${exhibitorId || "exhibitor"}-analytics.xlsx`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to download XLSX.");
    }
  };

  const openHelpGuide = () => {
    setShowHelpModal(true);
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const handleLogoutConfirm = () => {
    const preservedSidebar = localStorage.getItem(SIDEBAR_STORAGE_KEY);

    sessionStorage.clear();
    localStorage.clear();

    if (preservedSidebar !== null) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, preservedSidebar);
    }

    navigate("/", { replace: true });
  };

  const avatarText = (
    sessionStorage.getItem("full_name") ||
    localStorage.getItem("full_name") ||
    "U"
  )
    .charAt(0)
    .toUpperCase();

  return (
    <div className={`exhibitorTheme${sidebarCollapsed ? " sidebarCollapsed" : ""}`}>
      <div className="exhShell">
        <aside className="exhSidebar">
          <button
            type="button"
            className="exhSidebarToggle"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ToggleChevronIcon collapsed={sidebarCollapsed} />
          </button>

          <div className="exhBrand">
            <span className="exhBrandLong">
              <span className="exhBrandLight">Sentina</span>
              <span className="exhBrandBold">AI</span>
            </span>

            <span className="exhBrandShort">
              <span className="exhBrandLight">s</span>
              <span className="exhBrandBold">AI</span>
            </span>
          </div>

          <div className="exhSidebarLabel">MAIN</div>
          <nav className="exhSidebarNav">
            <NavLink
              to="/exhibitor"
              end
              title={sidebarCollapsed ? "Dashboard" : undefined}
              className={({ isActive }) => `exhSideLink${isActive ? " isActive" : ""}`}
            >
              <span className="exhSideIcon"><DashboardIcon /></span>
              <span className="exhLinkText">Dashboard</span>
            </NavLink>

            <NavLink
              to="/exhibitor/heatmap"
              title={sidebarCollapsed ? "Heat Map" : undefined}
              className={({ isActive }) => `exhSideLink${isActive ? " isActive" : ""}`}
            >
              <span className="exhSideIcon"><HeatMapIcon /></span>
              <span className="exhLinkText">Heat Map</span>
            </NavLink>

            <NavLink
              to="/exhibitor/analytics"
              title={sidebarCollapsed ? "Analytics" : undefined}
              className={({ isActive }) => `exhSideLink${isActive ? " isActive" : ""}`}
            >
              <span className="exhSideIcon"><AnalyticsIcon /></span>
              <span className="exhLinkText">Analytics</span>
            </NavLink>

            <NavLink
              to="/exhibitor/reports"
              title={sidebarCollapsed ? "Reports" : undefined}
              className={({ isActive }) => `exhSideLink${isActive ? " isActive" : ""}`}
            >
              <span className="exhSideIcon"><ReportsIcon /></span>
              <span className="exhLinkText">Reports</span>
            </NavLink>

            <NavLink
              to="/exhibitor/navigation"
              title={sidebarCollapsed ? "Navigation" : undefined}
              className={({ isActive }) => `exhSideLink${isActive ? " isActive" : ""}`}
            >
              <span className="exhSideIcon"><NavigationIcon /></span>
              <span className="exhLinkText">Navigation</span>
            </NavLink>
          </nav>

          <div className="exhSidebarSpacer" />

          <div className="exhSidebarLabel">SETTINGS</div>
          <button
            type="button"
            title={sidebarCollapsed ? "Settings" : undefined}
            className={`exhSideLink isGhost${settingsOpen ? " isActive" : ""}`}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="exhSideIcon"><SettingsIcon /></span>
            <span className="exhLinkText">Settings</span>
          </button>
          <button
            type="button"
            title={sidebarCollapsed ? "Help" : undefined}
            className="exhSideLink isGhost"
            onClick={openHelpGuide}
          >
            <span className="exhSideIcon"><HelpIcon /></span>
            <span className="exhLinkText">Help</span>
          </button>

          <button type="button" className="exhLogoutBtn" onClick={handleLogoutClick} title={sidebarCollapsed ? "Logout" : undefined}>
            <span className="exhSideIcon"><LogoutIcon /></span>
            <span className="exhLinkText">Logout</span>
          </button>
        </aside>

        <main className="exhMain">
          <header className="exhHeader">
            <div>
              <div className="exhHeaderTitle" style={{ fontSize: "20px" }}>{pageTitle}</div>
              <div className="exhHeaderSub">Exhibitor Portal | {formatHeaderClock(now)}</div>
            </div>

            <div className="exhHeaderRight">

              <div className="exhUserCard">
                <div>
                  <div className="exhUserName">
                    {sessionStorage.getItem("full_name") || localStorage.getItem("full_name") || "User"}
                  </div>
                  <div className="exhUserMeta">
                    Role: {sessionStorage.getItem("role") || localStorage.getItem("role") || "exhibitor"}
                  </div>
                  <div className="exhUserMeta">
                    Exhibitor: {exhibitorName || exhibitorId || "—"}
                  </div>
                  <div className="exhUserMeta">
                    Employee ID: {sessionStorage.getItem("employee_id") || localStorage.getItem("employee_id") || "—"}
                  </div>
                </div>
                <div className="exhAvatar">{avatarText}</div>
              </div>
            </div>
          </header>

          <div className="exhContent">
            {!hideTopControls ? (
              <div className="exhControlsCard">
                <div className="exhControlsRow">
                  <div className="exhControl">
                    <label>Exhibitor ID</label>
                    <input
                      value={exhibitorId}
                      readOnly
                      disabled
                      placeholder="Linked exhibitor ID"
                    />
                  </div>

                  <div className="exhControl isSmall">
                    <label>Interval</label>
                    <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
                      {[15, 30, 60, 120].map((value) => (
                        <option key={value} value={value}>{value} min</option>
                      ))}
                    </select>
                  </div>

                  <div className="exhControl isSmall">
                    <label>Catchment K</label>
                    <input
                      type="number"
                      min={1}
                      max={26}
                      value={catchmentK}
                      onChange={(e) => setCatchmentK(Number(e.target.value))}
                    />
                  </div>

                  <div className="exhControl isSmall">
                    <label>MC passes</label>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={mcPasses}
                      onChange={(e) => setMcPasses(Number(e.target.value))}
                    />
                  </div>

                  <div className="exhControlActions">
                    <button type="button" className="exhPrimaryBtn" onClick={handleRefresh} disabled={loading || bootstrapping || !exhibitorId}>
                      {loading || bootstrapping ? "Refreshing..." : "Refresh dashboard"}
                    </button>
                    <button type="button" className="exhSecondaryBtn" onClick={handleDownloadReport} disabled={loading || bootstrapping || !exhibitorId}>
                      Download XLSX
                    </button>
                  </div>
                </div>

                {error ? <div className="exhBanner isError">{error}</div> : null}
                {!error && (loading || bootstrapping) ? <div className="exhBanner">Updating exhibitor analytics…</div> : null}
              </div>
            ) : null}

            <Outlet
              context={{
                API_BASE,
                ACCENT,
                exhibitorId,
                exhibitorName,
                profile,
                events,
                heatmap,
                density,
                loading,
                error,
                searchTerm,
                setSearchTerm,
                intervalMinutes,
                catchmentK,
                mcPasses,
                densityLatest,
                confidencePct,
                latestHeatRow,
                latestHallSnapshot,
                filteredEvents,
                reportDownloadUrl,
                reportChecklist,
                quickInsights,
                avgCatchmentEngagement,
                heatStats,
                engagementTrendPoints,
                densityTrendPoints,
                heatColor,
                formatMetric,
                formatPercent,
                formatDateTime,
              }}
            />
          </div>
          {settingsOpen ? (
            <SettingsPage
              section="exhibitor"
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}

          <FloatingAssistant
            section="exhibitor"
            userId={exhibitorId || sessionStorage.getItem("employee_id") || localStorage.getItem("employee_id") || "EXH0215"}
            userName={
              exhibitorName ||
              sessionStorage.getItem("full_name") ||
              localStorage.getItem("full_name") ||
              "Exhibitor"
            }
          />
        </main>
      </div>
      <HelpSupportModal
        open={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        guideUrl={EXHIBITOR_HELP_GUIDE_PATH}
        accentColor="#37005e"
        sectionLabel="Exhibitor Dashboard"
      />
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        accentColor="#37005e"
        roleLabel="Exhibitor Dashboard"
      />
    </div>
  );
}