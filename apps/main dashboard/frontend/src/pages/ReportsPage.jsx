/**
 * Displays the reports page with searchable, filterable, and paginated report
 * listings across dashboard domains, including draft generation, draft editing,
 * downloading, previewing, deleting, and success toast feedback. This page uses
 * report API helpers, route-based domain config from reportConfig, React Router
 * navigation, and the MultiSelectPill component for status filtering.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MultiSelectPill from "../components/MultiSelectPill";
import { deleteReport, downloadReportFile, fetchReports, finalizeDraftReport, openReportFile } from "../api/reports";
import { getDomainFromPath } from "../utils/reportConfig";
import "./ReportsPage.css";

function IconSearch() {
  return (
    <svg width="15" height="16" viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 15L9 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconReportType() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1.75" width="10" height="10.5" rx="2" stroke="currentColor" />
      <path d="M4.5 4.5H9.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M4.5 7H8.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function IconDate() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2.75" width="10" height="8.5" rx="2" stroke="currentColor" />
      <path d="M4 1.75V4" stroke="currentColor" strokeLinecap="round" />
      <path d="M10 1.75V4" stroke="currentColor" strokeLinecap="round" />
      <path d="M2 5.25H12" stroke="currentColor" />
    </svg>
  );
}

function IconFormat() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.25" y="1.75" width="9.5" height="10.5" rx="2" stroke="currentColor" />
      <path d="M4.5 5H9.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M4.5 7.5H8" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.91675 13.2702H4.08341C1.51091 13.2702 0.729248 12.4885 0.729248 9.91602V4.08268C0.729248 1.51018 1.51091 0.728516 4.08341 0.728516H4.95841C5.97925 0.728516 6.30008 1.06102 6.70841 1.60352L7.58341 2.77018C7.77591 3.02685 7.80508 3.06185 8.16675 3.06185H9.91675C12.4892 3.06185 13.2709 3.84352 13.2709 6.41602V9.91602C13.2709 12.4885 12.4892 13.2702 9.91675 13.2702Z" fill="currentColor" />
    </svg>
  );
}

function IconSort() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.16659 1.5H0.833252L4.16659 6.23V9.5L5.83325 10.5V6.23L9.16659 1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDraft() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M17 1H10C8.674 1 7.402 1.527 6.464 2.464C5.527 3.402 5 4.674 5 6V26C5 27.326 5.527 28.598 6.464 29.536C7.402 30.473 8.674 31 10 31H22C23.326 31 24.598 30.473 25.536 29.536C26.473 28.598 27 27.326 27 26V11L22 11C20.674 11 19.402 10.473 18.464 9.536C17.527 8.598 17 7.326 17 6V1ZM11 26H16C16.552 26 17 25.552 17 25C17 24.448 16.552 24 16 24H11C10.448 24 10 24.448 10 25C10 25.552 10.448 26 11 26ZM11 21H21C21.552 21 22 20.552 22 20C22 19.448 21.552 19 21 19H11C10.448 19 10 19.448 10 20C10 20.552 10.448 21 11 21ZM11 16H21C21.552 16 22 15.552 22 15C22 14.448 21.552 14 21 14H11C10.448 14 10 14.448 10 15C10 15.552 10.448 16 11 16ZM19 1.593V6C19 6.796 19.316 7.559 19.879 8.121C20.441 8.684 21.204 9 22 9H26.416L19 1.593Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 4V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 10L12 14L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 19H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPreview() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9.55 22.7498C5.40164 22.7498 3.32747 22.7498 2.03873 21.461C0.75 20.1724 0.75 19.1981 0.75 15.0498" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22.75 15.0498C22.75 19.1981 22.75 20.1724 21.4612 21.461C20.1725 22.7498 18.0983 22.7498 13.95 22.7498" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.95 0.75C18.0983 0.75 20.1725 0.75 21.4612 2.03873C22.75 3.32747 22.75 4.30164 22.75 8.45" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.55 0.75C5.40164 0.75 3.32747 0.75 2.03873 2.03873C0.75 3.32747 0.75 4.30164 0.75 8.45" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.03172 14.0158C4.37728 13.2567 4.05005 12.8771 4.05005 11.75C4.05005 10.6229 4.37727 10.2433 5.03171 9.48423C6.33846 7.96844 8.53 6.25 11.75 6.25C14.9701 6.25 17.1616 7.96844 18.4684 9.48423C19.1228 10.2433 19.45 10.6229 19.45 11.75C19.45 12.8771 19.1228 13.2567 18.4684 14.0158C17.1616 15.5316 14.9701 17.25 11.75 17.25C8.53 17.25 6.33847 15.5316 5.03172 14.0158Z" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M11.75 13.9498C12.9651 13.9498 13.95 12.9648 13.95 11.7498C13.95 10.5348 12.9651 9.5498 11.75 9.5498C10.535 9.5498 9.55005 10.5348 9.55005 11.7498C9.55005 12.9648 10.535 13.9498 11.75 13.9498Z" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12.965 5.462C12.965 5.462 10.381 5.466 7.986 5.47C4.952 5.476 2.496 7.937 2.496 10.97V24C2.496 25.459 3.075 26.858 4.107 27.889C5.138 28.921 6.537 29.5 7.996 29.5H20.999C24.037 29.5 26.499 27.038 26.499 24C26.499 21.595 26.499 18.996 26.499 18.996C26.499 18.168 25.827 17.496 24.999 17.496C24.172 17.496 23.499 18.168 23.499 18.996V24C23.499 25.381 22.38 26.5 20.999 26.5H7.996C7.333 26.5 6.697 26.237 6.228 25.768C5.759 25.299 5.496 24.663 5.496 24V10.97C5.496 9.591 6.613 8.473 7.992 8.47C10.386 8.466 12.971 8.462 12.971 8.462C13.799 8.46 14.469 7.787 14.468 6.959C14.467 6.131 13.793 5.46 12.965 5.462Z"
        fill="currentColor"
      />
      <path
        d="M20.046 6.411L13.201 13.257C13.064 13.394 12.969 13.568 12.93 13.758L11.849 18.91C11.78 19.239 11.881 19.581 12.117 19.819C12.354 20.058 12.694 20.162 13.024 20.096L18.218 19.058C18.411 19.019 18.589 18.924 18.729 18.784L25.574 11.939L20.046 6.411ZM21.461 4.997L26.988 10.525L28.1 9.414C29.626 7.887 29.626 5.413 28.1 3.887L28.099 3.886C26.572 2.36 24.098 2.36 22.572 3.886L21.461 4.997Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.44925 0.0000241556H13.676C13.9465 -0.000150844 14.1821 -0.000301006 14.4046 0.0352365C15.2837 0.175611 16.0445 0.723937 16.4557 1.51355C16.5597 1.71341 16.6341 1.93701 16.7195 2.19367L16.8591 2.6123C16.8828 2.68316 16.8895 2.70322 16.8951 2.71902C17.1141 3.32416 17.6816 3.73324 18.3249 3.74955C18.3419 3.74997 18.3625 3.75005 18.4376 3.75005H22.1876C22.7054 3.75005 23.1251 4.16977 23.1251 4.68755C23.1251 5.20531 22.7054 5.62505 22.1876 5.62505H0.9375C0.419738 5.62505 0 5.20531 0 4.68755C0 4.16977 0.419738 3.75005 0.9375 3.75005H4.6876C4.76266 3.75005 4.78337 3.74997 4.80029 3.74955C5.4436 3.73324 6.01114 3.3242 6.23003 2.71905C6.23579 2.70314 6.2424 2.68351 6.26614 2.6123L6.40565 2.1937C6.49101 1.93705 6.56541 1.71341 6.66949 1.51355C7.08066 0.723937 7.84141 0.175611 8.72054 0.0352365C8.94306 -0.000301006 9.17875 -0.000150844 9.44925 0.0000241556ZM7.82269 3.75005C7.88707 3.62377 7.94414 3.49255 7.99323 3.35685C8.00813 3.31564 8.02275 3.27177 8.04152 3.21542L8.16628 2.84115C8.28024 2.49926 8.30649 2.42954 8.33251 2.37955C8.46957 2.11634 8.72316 1.93357 9.0162 1.88677C9.07188 1.87789 9.14625 1.87505 9.50663 1.87505H13.6185C13.9789 1.87505 14.0534 1.87789 14.109 1.88677C14.402 1.93357 14.6556 2.11634 14.7927 2.37955C14.8187 2.42954 14.845 2.49925 14.9589 2.84115L15.0836 3.2152L15.132 3.35687C15.1811 3.49256 15.2381 3.62377 15.3025 3.75005H7.82269Z" fill="currentColor" />
      <path d="M3.95597 7.75017C3.92153 7.23355 3.47481 6.84267 2.95818 6.87711C2.44157 6.91155 2.05068 7.35827 2.08512 7.8749L2.66443 16.5646C2.77131 18.168 2.85763 19.4631 3.06009 20.4795C3.27059 21.5361 3.62862 22.4187 4.36811 23.1106C5.10761 23.8024 6.01204 24.101 7.08036 24.2406C8.10788 24.3751 9.40586 24.3751 11.0129 24.375H12.1115C13.7185 24.3751 15.0165 24.3751 16.0441 24.2406C17.1124 24.101 18.0169 23.8024 18.7564 23.1106C19.4959 22.4187 19.8539 21.5361 20.0644 20.4795C20.2669 19.4632 20.3531 18.168 20.46 16.5646L21.0394 7.8749C21.0737 7.35827 20.6829 6.91155 20.1662 6.87711C19.6496 6.84267 19.2029 7.23355 19.1685 7.75017L18.5935 16.3741C18.4812 18.0589 18.4012 19.2311 18.2255 20.1132C18.055 20.9687 17.8171 21.4216 17.4754 21.7414C17.1336 22.0611 16.6659 22.2684 15.8009 22.3815C14.9091 22.4981 13.7341 22.5 12.0456 22.5H11.0789C9.39036 22.5 8.21529 22.4981 7.32354 22.3815C6.45854 22.2684 5.99084 22.0611 5.64908 21.7414C5.30732 21.4216 5.06939 20.9687 4.89896 20.1132C4.72326 19.2311 4.64322 18.0589 4.53089 16.3741L3.95597 7.75017Z" fill="currentColor" />
      <path d="M8.34428 10.0047C8.85948 9.95311 9.31896 10.3291 9.37046 10.8442L9.99546 17.0942C10.047 17.6095 9.67108 18.0689 9.15583 18.1204C8.64066 18.1719 8.18125 17.796 8.12972 17.2809L7.50472 11.0309C7.45321 10.5156 7.8291 10.0562 8.34428 10.0047Z" fill="currentColor" />
      <path d="M14.7808 10.0047C15.2961 10.0562 15.672 10.5156 15.6205 11.0309L14.9955 17.2809C14.944 17.796 14.4845 18.1719 13.9693 18.1204C13.4541 18.0689 13.0782 17.6095 13.1297 17.0942L13.7547 10.8442C13.8062 10.3291 14.2657 9.95311 14.7808 10.0047Z" fill="currentColor" />
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReportStatus(status) {
  const normalized = String(status || "").trim();
  if (!normalized) return "unknown";
  return normalized.toLowerCase();
}

function statusPill(status) {
  const s = String(status || "").toUpperCase();

  if (s === "DRAFT") {
    return {
      background: "#fef3c7",
      color: "#8a4b00",
    };
  }

  if (s === "GENERATED") {
    return {
      background: "#dff4e4",
      color: "#0b7a2a",
    };
  }

  return {
    background: "#f1f5f9",
    color: "#475569",
  };
}

function buildDateMatches(dateFilter, timestamp) {
  if (!dateFilter) return true;
  const now = new Date();
  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) return true;
  if (dateFilter === "last_7_days") return now - ts <= 7 * 24 * 60 * 60 * 1000;
  if (dateFilter === "last_30_days") return now - ts <= 30 * 24 * 60 * 60 * 1000;
  if (dateFilter === "this_year") return ts.getFullYear() === now.getFullYear();
  return true;
}

export default function ReportsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const domain = getDomainFromPath(location.pathname);
  const themeClass = domain === "sustainability" ? "sustTheme" : domain === "exhibitors" ? "exhTheme" : domain === "soc" ? "socTheme" : "opsTheme";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [format, setFormat] = useState("");
  const [statuses, setStatuses] = useState([]);
  const [sort, setSort] = useState("timestamp_desc");
  const [page, setPage] = useState(1);
  const [busyKey, setBusyKey] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [successToast, setSuccessToast] = useState("");


  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchReports(domain);
        if (!ignore) setRows(data);
      } catch (err) {
        if (!ignore) setError(err?.response?.data?.error || err.message || "Failed to load reports.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [domain]);

  useEffect(() => {
    const toastMessage = location.state?.reportGeneratedToast;
    if (!toastMessage) return undefined;

    setSuccessToast(toastMessage);
    navigate(location.pathname, { replace: true, state: {} });

    const timer = window.setTimeout(() => {
      setSuccessToast("");
    }, 5400);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  const statusOptions = useMemo(() => [...new Set(rows.map((row) => formatReportStatus(row.status)).filter(Boolean))], [rows]);

  const advancedFilterCount = sort !== "timestamp_desc" ? 1 : 0;

  const moreFiltersLabel = showMoreFilters
    ? "Less options"
    : `More options${advancedFilterCount ? ` (${advancedFilterCount})` : ""}`;

  const filteredRows = useMemo(() => {
    let next = [...rows];

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      next = next.filter((row) =>
        [row.report_code, row.report_title, row.description, row.report_type, row.format, row.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }

    if (format) next = next.filter((row) => String(row.format).toLowerCase() === format.toLowerCase());
    if (statuses.length) next = next.filter((row) => statuses.includes(formatReportStatus(row.status)));
    if (dateFilter) next = next.filter((row) => buildDateMatches(dateFilter, row.timestamp));

    if (sort === "timestamp_desc") next.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (sort === "timestamp_asc") next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (sort === "title_asc") next.sort((a, b) => String(a.report_title).localeCompare(String(b.report_title)));
    if (sort === "title_desc") next.sort((a, b) => String(b.report_title).localeCompare(String(a.report_title)));

    return next;
  }, [dateFilter, format, q, rows, sort, statuses]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, dateFilter, format, statuses, sort, domain]);

  async function refreshRows() {
    const refreshed = await fetchReports(domain);
    setRows(refreshed);
  }

  async function handleGenerateDraft(reportId) {
    const key = `generate:${reportId}`;
    try {
      setBusyKey(key);
      setError("");
      await finalizeDraftReport(reportId);
      await refreshRows();
      setSuccessToast("Report has been successfully generated.");

      window.setTimeout(() => {
        setSuccessToast("");
      }, 5400);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to generate draft.");
    } finally {
      setBusyKey("");
    }
  }

  async function handleDelete(reportId, reportTitle) {
    const confirmed = window.confirm(`Delete report "${reportTitle || reportId}"?`);
    if (!confirmed) return;

    const key = `delete:${reportId}`;
    try {
      setBusyKey(key);
      setError("");
      await deleteReport(reportId);
      await refreshRows();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to delete report.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <>
      {domain === "soc" ? (
        <style>{`
          .reportsPage.socTheme .reportsCountTop { color: #123150; }
          .reportsPage.socTheme .newReportBtn { background: #123150; }
          .reportsPage.socTheme .reportsTable th { color: #123150; }
          .reportsPage.socTheme .actionIconBtn.isPrimary { background: #123150; }
        `}</style>
      ) : null}

      <style>{`
        .reportsSuccessToast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 1200;
          max-width: min(360px, calc(100vw - 32px));
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          color: #166534;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
          font-size: 13px;
          font-weight: 700;
          pointer-events: none;
          opacity: 0;
          transform: translateY(10px);
          animation: reportsToastInOut 5.3s ease forwards;
        }

        @keyframes reportsToastInOut {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          8% {
            opacity: 1;
            transform: translateY(0);
          }
          82% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(10px);
          }
        }
      `}</style>

      <div className={`reportsPage ${themeClass}`}>
        <div className="pageInner">
          <div className="reportsHeaderRow">
            <div />
            <div className="reportsCountTop">{filteredRows.length} reports</div>
          </div>

          {error ? <div className="reportsErrorBanner">{error}</div> : null}
          {successToast ? (
            <div className="reportsSuccessToast">
              {successToast}
            </div>
          ) : null}

          <div className="reportsControlsCard">
            <div className="reportsControlsTopRow">
              <div className="filterPill pillSearch" role="search">
                <span className="pillLeftIcon" aria-hidden>
                  <IconSearch />
                </span>
                <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search here" className="pillInput" />
              </div>

              <div className="filterPill pillSelectWrap pillDate">
                <span className="pillLeftIcon" aria-hidden>
                  <IconDate />
                </span>
                <select value={dateFilter} className="pillSelect" onChange={(event) => setDateFilter(event.target.value)}>
                  <option value="">Date</option>
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="this_year">This Year</option>
                </select>
                <span className="pillRightCaret" aria-hidden />
              </div>

              <div className="filterPill pillSelectWrap pillFormat">
                <span className="pillLeftIcon" aria-hidden>
                  <IconFormat />
                </span>
                <select value={format} className="pillSelect" onChange={(event) => setFormat(event.target.value)}>
                  <option value="">Format</option>
                  <option value="PDF">PDF</option>
                  <option value="XLSX">XLSX</option>
                </select>
                <span className="pillRightCaret" aria-hidden />
              </div>

              <MultiSelectPill className="pillStatus" label="Status" icon={<IconStatus />} options={statusOptions} value={statuses} onChange={setStatuses} />

              <div className="reportsTopActions">
                <button
                  type="button"
                  className={`moreOptionsBtn ${showMoreFilters ? "isOpen" : ""}`}
                  onClick={() => setShowMoreFilters((prev) => !prev)}
                >
                  {moreFiltersLabel}
                </button>

                <button type="button" className="newReportBtn" onClick={() => navigate(`${location.pathname}/new`)}>
                  + New Report
                </button>
              </div>
            </div>

            {showMoreFilters ? (
              <div className="reportsFiltersSecondary">
                <div className="filterPill pillSelectWrap pillSort">
                  <span className="pillLeftIcon" aria-hidden>
                    <IconSort />
                  </span>
                  <select value={sort} className="pillSelect" onChange={(event) => setSort(event.target.value)}>
                    <option value="timestamp_desc">Newest</option>
                    <option value="timestamp_asc">Oldest</option>
                    <option value="title_asc">Title A-Z</option>
                    <option value="title_desc">Title Z-A</option>
                  </select>
                  <span className="pillRightCaret" aria-hidden />
                </div>
              </div>
            ) : null}
          </div>

          <div className="reportsTableCard">
            <div className="reportsTableScroll">
              <table className="reportsTable">
                <thead>
                  <tr>
                    <th>Report ID</th>
                    <th>Report Title</th>
                    <th>Description</th>
                    <th>Timestamp</th>
                    <th>Format</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="reportsTableEmpty">Loading reports…</td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="reportsTableEmpty">No reports found.</td>
                    </tr>
                  ) : (
                    pageRows.map((row) => {
                      const statusStyle = statusPill(row.status);
                      const normalizedStatus = String(row.status || "").toUpperCase();
                      const normalizedFormat = String(row.format || "").toUpperCase();
                      const isDraft = normalizedStatus === "DRAFT";
                      const isPdf = normalizedFormat === "PDF";
                      const deleteBusy = busyKey === `delete:${row.report_id}`;
                      const generateBusy = busyKey === `generate:${row.report_id}`;
                      const canPreview = isPdf;
                      const previewTitle = canPreview ? "Preview" : "Cannot preview xlsx file";
                      
                      

                      return (
                        <tr key={row.report_id}>
                          <td className="tdStrong">{row.report_code}</td>
                          <td>{row.report_title}</td>
                          <td className="reportsDesc">{row.description}</td>
                          <td>{formatDateTime(row.timestamp)}</td>
                          <td>{row.format}</td>
                          <td>
                            <span className="statusTag" style={statusStyle}>{formatReportStatus(row.status)}</span>
                          </td>
                          <td>
                            <div className="reportsActionBtns">
                              {isDraft ? (
                                <>
                                  <button
                                    type="button"
                                    className="actionIconBtn"
                                    title="Generate draft"
                                    onClick={() => handleGenerateDraft(row.report_id)}
                                    disabled={generateBusy || deleteBusy}
                                  >
                                    <IconDraft />
                                  </button>
                                  <button
                                    type="button"
                                    className="actionIconBtn isPrimary"
                                    title="Edit draft"
                                    onClick={() => navigate(`${location.pathname}/${row.report_id}/edit`)}
                                    disabled={generateBusy || deleteBusy}
                                  >
                                    <IconEdit />
                                  </button>
                                  <button
                                    type="button"
                                    className="actionIconBtn isDanger"
                                    title="Delete draft"
                                    onClick={() => handleDelete(row.report_id, row.report_title)}
                                    disabled={generateBusy || deleteBusy}
                                  >
                                    <IconDelete />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="actionIconBtn isPrimary"
                                    title="Download"
                                    onClick={() => downloadReportFile(row.report_id)}
                                    disabled={deleteBusy}
                                  >
                                    <IconDownload />
                                  </button>
                                  <button
                                      type="button"
                                      className={`actionIconBtn ${canPreview ? "" : "isDisabledPreview"}`}
                                      title={previewTitle}
                                      aria-disabled={!canPreview}
                                      onClick={() => {
                                        if (!canPreview || deleteBusy) return;
                                        openReportFile(row.report_id);
                                      }}
                                      disabled={canPreview ? deleteBusy : false}
                                    >
                                      <IconPreview />
                                    </button>
                                  
                                  <button
                                    type="button"
                                    className="actionIconBtn isDanger"
                                    title="Delete"
                                    onClick={() => handleDelete(row.report_id, row.report_title)}
                                    disabled={deleteBusy}
                                  >
                                    <IconDelete />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="reportsPager">
              <div className="reportsPagerNums">
                <button type="button" className="reportsPageBtn" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Prev
                </button>
                <span className="reportsPagerLabel">Page {currentPage} of {totalPages}</span>
              </div>
              <button type="button" className="reportsNextBtn" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}