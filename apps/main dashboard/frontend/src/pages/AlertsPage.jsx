/**
 * Displays the alerts page with domain-based filtering, alert listing, pagination,
 * and alert actions for acknowledge and resolve workflows. This page fetches
 * alert filters and alert rows from the alerts API, uses MultiSelectPill for
 * filter controls, applies dashboard refresh settings from dashboardSettings,
 * and uses React Router navigation for alert detail routing.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./AlertsPage.css";
import MultiSelectPill from "../components/MultiSelectPill";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const roleDomainMap = {
  operations_manager: "OPERATIONS",
  sustainability_manager: "SUSTAINABILITY",
  soc_analyst: "SECURITY",
  exhibitor: "EXHIBITOR",
};

function fmtTs(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function IconSearch() {
  return (
    <svg width="15" height="16" viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 15L9 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconZone() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_9_8863)">
        <path
          d="M13.75 7.5C13.75 10.9518 10.9518 13.75 7.5 13.75M13.75 7.5C13.75 4.04822 10.9518 1.25 7.5 1.25M13.75 7.5H1.25M7.5 13.75C9.0633 12.0385 9.95172 9.81748 10 7.5C9.95172 5.18252 9.0633 2.96147 7.5 1.25M7.5 13.75C5.9367 12.0385 5.04828 9.81748 5 7.5C5.04828 5.18252 5.9367 2.96147 7.5 1.25M1.25 7.5C1.25 4.04822 4.04822 1.25 7.5 1.25"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_9_8863">
          <rect width="15" height="15" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function IconStatus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.91675 13.2702H4.08341C1.51091 13.2702 0.729248 12.4885 0.729248 9.91602V4.08268C0.729248 1.51018 1.51091 0.728516 4.08341 0.728516H4.95841C5.97925 0.728516 6.30008 1.06102 6.70841 1.60352L7.58341 2.77018C7.77591 3.02685 7.80508 3.06185 8.16675 3.06185H9.91675C12.4892 3.06185 13.2709 3.84352 13.2709 6.41602V9.91602C13.2709 12.4885 12.4892 13.2702 9.91675 13.2702ZM4.08341 1.60352C1.99508 1.60352 1.60425 2.00018 1.60425 4.08268V9.91602C1.60425 11.9985 1.99508 12.3952 4.08341 12.3952H9.91675C12.0051 12.3952 12.3959 11.9985 12.3959 9.91602V6.41602C12.3959 4.33352 12.0051 3.93685 9.91675 3.93685H8.16675C7.42008 3.93685 7.17508 3.68018 6.88341 3.29518L6.00841 2.12852C5.70508 1.72602 5.61175 1.60352 4.95841 1.60352H4.08341Z"
        fill="currentColor"
      />
      <path
        d="M11.6667 4.15852C11.4276 4.15852 11.2292 3.96018 11.2292 3.72102V2.91602C11.2292 1.99435 10.8384 1.60352 9.91675 1.60352H4.66675C4.42758 1.60352 4.22925 1.40518 4.22925 1.16602C4.22925 0.926849 4.42758 0.728516 4.66675 0.728516H9.91675C11.3284 0.728516 12.1042 1.50435 12.1042 2.91602V3.72102C12.1042 3.96018 11.9059 4.15852 11.6667 4.15852Z"
        fill="currentColor"
      />
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

const IconSeverity = IconStatus;
const IconRule = IconStatus;

export default function AlertsPage() {
  const navigate = useNavigate();

  const location = useLocation();
  const role = localStorage.getItem("role") || "operations_manager";

  const isSustainability = location.pathname.startsWith("/sustainability");
  const isOperations = location.pathname.startsWith("/operations");
  const isSoc = location.pathname.startsWith("/soc");
  const isExhibitor = location.pathname.startsWith("/exhibitor");

  const settingsSection = isSustainability
    ? "sustainability"
    : isExhibitor
      ? "exhibitor"
      : "operations";

  const dashboardSettings = useDashboardSettings(settingsSection);
  const refreshMs = getDashboardRefreshMs(dashboardSettings);

  const domain = isSustainability
    ? "SUSTAINABILITY"
    : isSoc
      ? "SECURITY"
      : isExhibitor
        ? "EXHIBITOR"
        : "OPERATIONS";

  const themeClass = isSustainability ? "sustTheme" : "opsTheme";

  const [filters, setFilters] = useState(null);

  const [q, setQ] = useState("");
  const [severities, setSeverities] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [ruleKeys, setRuleKeys] = useState([]);
  const [zoneIds, setZoneIds] = useState([]);
  const [hallIds, setHallIds] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [sort, setSort] = useState("detected_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const [expandedId, setExpandedId] = useState(null);
  const [openSelect, setOpenSelect] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/alerts/filters`, { params: { domain } })
      .then((res) => setFilters(res.data))
      .catch((e) => setError(e?.response?.data?.error || e.message || "Failed to load alert filters"));
  }, [domain]);

  useEffect(() => {
    let alive = true;

    const fetchAlerts = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/alerts`, {
          params: {
            domain,
            q: qLive || undefined,
            severity: severities.length ? severities.join(",") : undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            rule_key: ruleKeys.length ? ruleKeys.join(",") : undefined,
            zone_id: zoneIds.length ? zoneIds.join(",") : undefined,
            hall_id: hallIds.length ? hallIds.join(",") : undefined,
            device_id: deviceId || undefined,
            sort,
            page,
            pageSize,
          },
        });

        if (!alive) return;
        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || "Failed to load alerts");
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchAlerts();
    const t = setInterval(fetchAlerts, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [domain, qLive, severities, statuses, ruleKeys, zoneIds, hallIds, deviceId, sort, page, pageSize, refreshMs]);

  useEffect(() => setPage(1), [severities, statuses, ruleKeys, zoneIds, hallIds, deviceId, sort, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const advancedFilterCount =
    hallIds.length + ruleKeys.length + (sort !== "detected_desc" ? 1 : 0);

  const moreFiltersLabel = showMoreFilters
    ? "Less options"
    : `More options${advancedFilterCount ? ` (${advancedFilterCount})` : ""}`;

  const hallOptions = useMemo(() => {
    const allHalls = filters?.halls || [];
    if (!zoneIds.length) return allHalls;
    return allHalls.filter((hall) => zoneIds.includes(String(hall.zone_id || "")));
  }, [filters, zoneIds]);

  useEffect(() => {
    setHallIds((prev) => prev.filter((hallId) => hallOptions.some((hall) => String(hall.hall_id) === String(hallId))));
  }, [hallOptions]);

  const clearFilters = () => {
    setQ("");
    setSeverities([]);
    setStatuses([]);
    setRuleKeys([]);
    setZoneIds([]);
    setHallIds([]);
    setDeviceId("");
    setSort("detected_desc");
    setPage(1);
    setPageSize(10);
  };

  const ack = async (alertId) => {
    try {
      const res = await axios.patch(
        `${API_BASE}/alerts/${alertId}/ack`,
        {
          user_id: localStorage.getItem("user_id") || null,
        },
        {
          params: { domain },
        }
      );

      const updated = res.data?.alert;
      if (updated) {
        setRows((prev) =>
          prev.map((r) =>
            r.alert_id === alertId
              ? {
                ...r,
                status: updated.status,
                acknowledged_by: updated.acknowledged_by,
                acknowledged_at: updated.acknowledged_at,
              }
              : r
          )
        );
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to acknowledge alert");
    }
  };

  const resolve = async (alertId) => {
    try {
      const res = await axios.patch(
        `${API_BASE}/alerts/${alertId}/resolve`,
        {},
        {
          params: { domain },
        }
      );

      const updated = res.data?.alert;
      
      if (updated) {
        setRows((prev) =>
          prev.map((r) =>
            r.alert_id === alertId
              ? { ...r, status: updated.status, resolved_at: updated.resolved_at }
              : r
          )
        );
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to resolve alert");
    }
  };

  return (
    <div className={themeClass}>
      <div className="alertsPage">
        <div className="pageInner">
          <div className="alertsHeaderRow">
            <div className="alertsTitleWrap"></div>

            <div className="alertsHeaderRight">
              <div className="alertsCountTop">{loading ? "Loading…" : `${total} alerts`}</div>
            </div>
          </div>

          <div className="alertsControlsCard">
            <div className="alertsControlsTopRow">
              <div className="filterPill pillSearch" role="search">
                <span className="pillLeftIcon" aria-hidden>
                  <IconSearch />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search (message, rule, zone/hall/device)…"
                  className="pillInput"
                />
              </div>

              <MultiSelectPill
                className="pillSeverity"
                icon={<IconSeverity />}
                label="Severity"
                options={filters?.severities || []}
                value={severities}
                onChange={setSeverities}
              />

              <MultiSelectPill
                className="pillAlertStatus"
                icon={<IconStatus />}
                label="Status"
                options={filters?.statuses || []}
                value={statuses}
                onChange={setStatuses}
              />

              <MultiSelectPill
                className="pillZone"
                icon={<IconZone />}
                label="Zone"
                options={filters?.zones || []}
                value={zoneIds}
                onChange={setZoneIds}
              />

              <div className="alertsTopActions">
                <button
                  type="button"
                  className={`moreOptionsBtn ${showMoreFilters ? "isOpen" : ""}`}
                  onClick={() => setShowMoreFilters((prev) => !prev)}
                >
                  {moreFiltersLabel}
                </button>

                <button onClick={clearFilters} className="clearFiltersBtn">
                  Clear filters
                </button>
              </div>
            </div>

            {showMoreFilters ? (
              <div className="alertsFiltersSecondary">
                <MultiSelectPill
                  className="pillHall"
                  icon={<IconZone />}
                  label="Hall"
                  options={hallOptions}
                  value={hallIds}
                  onChange={setHallIds}
                  getOptionValue={(option) => option.hall_id}
                  getOptionLabel={(option) => option.hall_id}
                />

                <MultiSelectPill
                  className="pillRule"
                  icon={<IconRule />}
                  label="Rule"
                  options={filters?.rules || []}
                  value={ruleKeys}
                  onChange={setRuleKeys}
                  getOptionValue={(option) => option.rule_key}
                  getOptionLabel={(option) => `${option.rule_key} — ${option.rule_name}`}
                />

                <div className={`filterPill pillSelectWrap pillSort ${openSelect === "sort" ? "isOpen" : ""}`}>
                  <span className="pillLeftIcon" aria-hidden>
                    <IconSort />
                  </span>
                  <select
                    value={sort}
                    className="pillSelect"
                    onFocus={() => setOpenSelect("sort")}
                    onBlur={() => setOpenSelect(null)}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setOpenSelect(null);
                      e.currentTarget.blur();
                    }}
                  >
                    {filters?.sortOptions?.map((s) => (
                      <option key={s} value={s}>
                        Sort: {s}
                      </option>
                    ))}
                  </select>
                  <span className="pillRightCaret" aria-hidden />
                </div>

                <div className="rowsControl secondaryRowsControl">
                  <span className="rowsLabel">Rows:</span>
                  <div className={`filterPill pillSelectWrap pillRows ${openSelect === "rows" ? "isOpen" : ""}`}>
                    <select
                      value={pageSize}
                      className="pillSelect"
                      onFocus={() => setOpenSelect("rows")}
                      onBlur={() => setOpenSelect(null)}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setOpenSelect(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {[10, 20, 50].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="pillRightCaret" aria-hidden />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="alertsError">
              <div className="alertsErrorTitle">Error</div>
              <div className="alertsErrorBody">{error}</div>
            </div>
          ) : null}

          <div className="alertsTableCard">
            <div className="alertsTableScroll">
              <table className="alertsTable">
                <thead>
                  <tr>
                    <th>Detected</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Rule</th>
                    <th>Zone</th>
                    <th>Hall</th>
                    <th>Device</th>
                    <th>Trigger</th>
                    <th>Recommended Action</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="alertsTableEmpty">
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="alertsTableEmpty">
                        No alerts found.
                      </td>
                    </tr>
                  ) : (
                    rows.flatMap((r) => {
                      const isOpen = expandedId === r.alert_id;
                      const meta = safeJson(r.metadata);

                      const triggerStr =
                        r.trigger_value === null || r.trigger_value === undefined
                          ? "-"
                          : `${Number(r.trigger_value).toFixed(3)} / ${Number(r.threshold_value ?? 0).toFixed(3)}`;

                      return [
                        (
                          <tr
                            key={r.alert_id}
                            className="alertsRow"
                            onClick={() => {
                              const basePath = isSustainability
                                ? "sustainability"
                                : isSoc
                                  ? "soc"
                                  : isExhibitor
                                    ? "exhibitor"
                                    : "operations";

                              navigate(`/${basePath}/alerts/${r.alert_id}`);
                            }}
                          >
                            <td>{fmtTs(r.detected_at)}</td>
                            <td>
                              <span style={pillSeverity(r.severity)}>
                                {String(r.severity || "").toLowerCase()}
                              </span>
                            </td>
                            <td>
                              <span style={pillStatus(r.status)}>
                                {String(r.status || "").toLowerCase()}
                              </span>
                            </td>
                            <td className={`tdStrong ${!isExhibitor ? "tdRuleClickable" : ""}`}>{r.rule_name || r.rule_key}</td>

                            <td className="tdMono">{r.zone_id || "-"}</td>
                            <td className="tdMono">{r.hall_id || "-"}</td>
                            <td className="tdMono">{r.device_id || "-"}</td>

                            <td className="tdMono">{triggerStr}</td>
                            <td>{r.recommended_action || r.response_action || "-"}</td>

                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="alertsActionBtns">
                                <button
                                  disabled={r.status !== "NEW"}
                                  onClick={() => ack(r.alert_id)}
                                  className={`alertsTinyBtn ${r.status !== "NEW" ? "isDisabled" : ""}`}
                                >
                                  Ack
                                </button>
                                <button
                                  disabled={r.status === "RESOLVED" || r.status === "CLOSED"}
                                  onClick={() => resolve(r.alert_id)}
                                  className={`alertsTinyBtn ${r.status === "RESOLVED" || r.status === "CLOSED" ? "isDisabled" : ""
                                    }`}
                                >
                                  Resolve
                                </button>
                              </div>
                            </td>
                          </tr>
                        ),
                        isOpen ? (
                          <tr key={`${r.alert_id}-details`} className="alertsDetailsRow">
                            <td colSpan={10} className="alertsDetailsCell">
                              <div className="alertsDetailsGrid">
                                <div>
                                  <div className="alertsDetailsTitle">Details</div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Alert ID</span>
                                    <span className="alertsV">{r.alert_id}</span>
                                  </div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Rule Key</span>
                                    <span className="alertsV">{r.rule_key}</span>
                                  </div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Event Timestamp</span>
                                    <span className="alertsV">{fmtTs(r.event_timestamp)}</span>
                                  </div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Action Status</span>
                                    <span className="alertsV">{r.action_status || "-"}</span>
                                  </div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Acknowledged At</span>
                                    <span className="alertsV">{fmtTs(r.acknowledged_at)}</span>
                                  </div>
                                  <div className="alertsKv">
                                    <span className="alertsK">Resolved At</span>
                                    <span className="alertsV">{fmtTs(r.resolved_at)}</span>
                                  </div>
                                </div>

                                <div>
                                  <div className="alertsDetailsTitle">Metadata</div>
                                  <pre className="alertsMetaPre">{JSON.stringify(meta || {}, null, 2)}</pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ].filter(Boolean);
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alertsPager">
            <div className="alertsPagerLeft">
              Page {page} of {totalPages}
            </div>
            <div className="alertsPagerRight">
              <button disabled={page <= 1} onClick={() => setPage(1)} className="pagerBtn">
                {"<<"}
              </button>
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="pagerBtn">
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="pagerBtn"
              >
                Next
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="pagerBtn">
                {">>"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function pillSeverity(severity) {
  const s = String(severity || "").toLowerCase();

  let bg = "#eef2ff";
  let color = "#1d4ed8";

  if (s === "low") {
    bg = "rgba(34,197,94,.12)";
    color = "#166534";
  } else if (s === "medium") {
    bg = "rgba(245,158,11,.14)";
    color = "#92400e";
  } else if (s === "high") {
    bg = "rgba(239,68,68,.12)";
    color = "#991b1b";
  } else if (s === "critical") {
    bg = "rgba(239,68,68,.18)";
    color = "#7f1d1d";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "22px",
    padding: "0 10px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    border: "none",
    textTransform: "lowercase",
  };
}

function pillStatus(status) {
  const s = String(status || "").toLowerCase();

  let bg = "#eef2ff";
  let color = "#475569";

  if (s === "new") {
    bg = "#dfe7ff";
    color = "#1d4ed8";
  } else if (s === "acknowledged") {
    bg = "rgba(245,158,11,.16)";
    color = "#92400e";
  } else if (s === "resolved") {
    bg = "#d9f3e4";
    color = "#166534";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "22px",
    padding: "0 10px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    border: "none",
    textTransform: "lowercase",
  };
}