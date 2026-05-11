/**
 * Displays the SOC logs page with searchable and filterable audit log records,
 * including outcome, event type, and HTTP method filters, plus timed refresh of
 * the latest SOC log data. This page fetches SOC log rows from the dashboard API
 * and renders an in-page searchable audit table with inline status styling.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function fmtTs(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SOCLogsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/dashboard/soc-logs`);
        if (!alive) return;
        setRows(res.data?.rows || []);
        setError("");
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || "Failed to load SOC logs");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const t = setInterval(load, 15000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const eventTypeOptions = useMemo(() => {
    const vals = Array.from(
      new Set(rows.map((row) => String(row.event_type || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...vals];
  }, [rows]);

  const methodOptions = useMemo(() => {
    const vals = Array.from(
      new Set(rows.map((row) => String(row.http_method || "").trim().toUpperCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...vals];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const outcomeOk =
        outcomeFilter === "ALL" ||
        String(row.outcome || "").toUpperCase() === outcomeFilter;

      const eventTypeOk =
        eventTypeFilter === "ALL" ||
        String(row.event_type || "").trim() === eventTypeFilter;

      const methodOk =
        methodFilter === "ALL" ||
        String(row.http_method || "").trim().toUpperCase() === methodFilter;

      if (!outcomeOk || !eventTypeOk || !methodOk) return false;

      if (!q) return true;

      const haystack = [
        row.event_type,
        row.outcome,
        row.full_name,
        row.user_id,
        row.email,
        row.request_path,
        row.http_method,
        row.http_status,
        row.ip_address,
        row.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, search, outcomeFilter, eventTypeFilter, methodFilter]);

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #dbeafe",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                position: "relative",
                minWidth: 260,
                flex: "1 1 300px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 16,
                  height: 16,
                  color: "#64748b",
                  pointerEvents: "none",
                }}
              >
                <SearchIcon />
              </span>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs"
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #dbeafe",
                  padding: "0 12px 0 38px",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="ALL">All outcomes</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>

            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={selectStyle}
            >
              {eventTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All event types" : option}
                </option>
              ))}
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={selectStyle}
            >
              {methodOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All methods" : option}
                </option>
              ))}
            </select>
          </div>

          <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>
            {loading ? "Refreshing..." : `${filteredRows.length} records`}
          </div>
        </div>

        {error ? (
          <div
            style={{
              margin: 16,
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

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={th}>Time</th>
                <th style={th}>Event</th>
                <th style={th}>Outcome</th>
                <th style={th}>User</th>
                <th style={th}>Email</th>
                <th style={th}>Path</th>
                <th style={th}>Method</th>
                <th style={th}>Status</th>
                <th style={th}>IP</th>
                <th style={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.log_id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={td}>{fmtTs(row.created_at)}</td>
                    <td style={tdStrong}>{row.event_type || "-"}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background: row.outcome === "SUCCESS" ? "#dbeafe" : "#fee2e2",
                          color: row.outcome === "SUCCESS" ? "#1d4ed8" : "#b91c1c",
                        }}
                      >
                        {row.outcome || "-"}
                      </span>
                    </td>
                    <td style={td}>{row.full_name || row.user_id || "-"}</td>
                    <td style={td}>{row.email || "-"}</td>
                    <td style={tdMono}>{row.request_path || "-"}</td>
                    <td style={td}>{row.http_method || "-"}</td>
                    <td style={td}>{row.http_status ?? "-"}</td>
                    <td style={tdMono}>{row.ip_address || "-"}</td>
                    <td style={td}>{row.reason || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" style={{ padding: 22, color: "#6b7280", textAlign: "center" }}>
                    No audit logs available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  height: 40,
  borderRadius: 12,
  border: "1px solid #dbeafe",
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  fontWeight: 900,
  color: "#64748b",
};

const td = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#334155",
  verticalAlign: "top",
};

const tdStrong = {
  ...td,
  fontWeight: 800,
  color: "#0f172a",
};

const tdMono = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};