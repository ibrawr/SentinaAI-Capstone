/**
 * Displays the devices page with searchable, filterable, and paginated device
 * listings across operations and sustainability views. This page fetches device
 * rows and filter options from the devices API, uses MultiSelectPill for filter
 * controls, and applies route-based theme styling from DevicesPage.css.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import axios from "axios";
import "./DevicesPage.css";
import MultiSelectPill from "../components/MultiSelectPill";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "isActive";
  if (s === "inactive") return "isInactive";
  if (s === "offline") return "isOffline";
  if (s === "quarantined") return "isQuarantined";
  if (s === "needs_attention" || s === "needs attention") return "isNeedsAttention";
  return "isNeutral";
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
          d="M13.75 7.5C13.75 10.9518 10.9518 13.75 7.5 13.75M13.75 7.5C13.75 4.04822 10.9518 1.25 7.5 1.25M13.75 7.5H1.25M7.5 13.75C4.04822 13.75 1.25 10.9518 1.25 7.5M7.5 13.75C9.0633 12.0385 9.95172 9.81748 10 7.5C9.95172 5.18252 9.0633 2.96147 7.5 1.25M7.5 13.75C5.9367 12.0385 5.04828 9.81748 5 7.5C5.04828 5.18252 5.9367 2.96147 7.5 1.25M1.25 7.5C1.25 4.04822 4.04822 1.25 7.5 1.25"
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

function IconDeviceType() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15.4483 9.93008H13.2414V7.72318H12.138V12.6887H3.31035V3.86112L8.27589 3.86062V2.75767H6.06898V0.550781H4.96553V2.75767H3.31035C3.01779 2.75797 2.73729 2.87432 2.53042 3.08119C2.32354 3.28806 2.20719 3.56856 2.2069 3.86112V5.51629H0V6.61974H2.2069V9.93008H0V11.0335H2.2069V12.6887C2.20724 12.9812 2.3236 13.2617 2.53047 13.4686C2.73733 13.6754 3.0178 13.7918 3.31035 13.7921H4.96553V15.999H6.06898V13.7921H9.37934V15.999H10.4828V13.7921H12.138C12.4305 13.7917 12.7109 13.6754 12.9178 13.4685C13.1246 13.2617 13.241 12.9812 13.2414 12.6887V11.0335H15.4483V9.93008Z"
        fill="currentColor"
      />
      <path
        d="M10.4828 11.0348H4.96558V5.51758H10.4828V11.0348ZM6.06903 9.93136H9.37938V6.62102H6.06903V9.93136Z"
        fill="currentColor"
      />
      <path
        d="M16.0003 6.62068H14.8969C14.8952 5.15794 14.3134 3.7556 13.279 2.72129C12.2447 1.68698 10.8424 1.10515 9.37964 1.10345V0C11.135 0.0019131 12.8179 0.700061 14.0591 1.94126C15.3003 3.18247 15.9984 4.86535 16.0003 6.62068Z"
        fill="currentColor"
      />
      <path
        d="M13.2417 6.61987H12.1383C12.1374 5.88851 11.8465 5.18734 11.3293 4.67019C10.8122 4.15304 10.111 3.86212 9.37964 3.86126V2.75781C10.4035 2.75905 11.3852 3.16635 12.1092 3.89036C12.8332 4.61436 13.2405 5.59597 13.2417 6.61987Z"
        fill="currentColor"
      />
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
      <path
        d="M9.16659 1.5H0.833252L4.16659 6.23V9.5L5.83325 10.5V6.23L9.16659 1.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DevicesPage() {
  const [filters, setFilters] = useState(null);

  const [q, setQ] = useState("");
  const [zoneIds, setZoneIds] = useState([]);
  const [hallIds, setHallIds] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [sort, setSort] = useState("last_seen_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [openSelect, setOpenSelect] = useState(null);

  const location = useLocation();
  const isSustainability = location.pathname.startsWith("/sustainability");
  const themeClass = isSustainability ? "sustTheme" : "opsTheme";

  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/devices/filters`)
      .then((res) => setFilters(res.data))
      .catch((e) => setError(e?.response?.data?.error || e.message || "Failed to load filters"));
  }, []);

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/devices`, {
          params: {
            q: qLive || undefined,
            zone_id: zoneIds.length ? zoneIds.join(",") : undefined,
            hall_id: hallIds.length ? hallIds.join(",") : undefined,
            device_type: deviceTypes.length ? deviceTypes.join(",") : undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            sort,
            page,
            pageSize,
          },
        });

        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || e.message || "Failed to load devices");
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [qLive, zoneIds, hallIds, deviceTypes, statuses, sort, page, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const deviceTypeLabelMap = useMemo(() => {
    if (!filters?.deviceTypes) return {};
    const m = {};
    for (const d of filters.deviceTypes) m[d.device_type] = d.metric_type;
    return m;
  }, [filters]);

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
    setZoneIds([]);
    setHallIds([]);
    setDeviceTypes([]);
    setStatuses([]);
    setSort("last_seen_desc");
    setPage(1);
    setPageSize(10);
  };

  useEffect(() => setPage(1), [zoneIds, hallIds, deviceTypes, statuses, sort, pageSize]);

  return (
    <div className={`devicesPage ${themeClass}`}>
      <div className="pageInner">
        <div className="devicesHeaderRow">
          <div className="devicesTitleWrap"></div>

          <div className="devicesHeaderRight">
            <div className="devicesCountTop">{loading ? "Loading…" : `${total} devices`}</div>
          </div>
        </div>

        <div className="devicesControlsCard">
          <div className="devicesFiltersRow">
            <div className="filterPill pillSearch" role="search">
              <span className="pillLeftIcon" aria-hidden>
                <IconSearch />
              </span>

              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search here" className="pillInput" />
            </div>

            <MultiSelectPill
              className="pillZone"
              icon={<IconZone />}
              label="Zones"
              options={filters?.zones || []}
              value={zoneIds}
              onChange={setZoneIds}
            />

            <MultiSelectPill
              className="pillHall"
              icon={<IconZone />}
              label="Halls"
              options={hallOptions}
              value={hallIds}
              onChange={setHallIds}
              getOptionValue={(option) => option.hall_id}
              getOptionLabel={(option) => option.hall_id}
            />

            <MultiSelectPill
              className="pillDeviceType"
              icon={<IconDeviceType />}
              label="Types"
              options={filters?.deviceTypes || []}
              value={deviceTypes}
              onChange={setDeviceTypes}
              getOptionValue={(option) => option.device_type}
              getOptionLabel={(option) => option.device_type}
            />

            <MultiSelectPill
              className="pillStatus"
              icon={<IconStatus />}
              label="Status"
              options={filters?.statuses || []}
              value={statuses}
              onChange={setStatuses}
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
                    {s}
                  </option>
                ))}
              </select>

              <span className="pillRightCaret" aria-hidden />
            </div>
          </div>

          <div className="devicesControlsBottomRow">
            <button onClick={clearFilters} className="clearFiltersBtn">
              Clear filters
            </button>

            <div className="rowsControl">
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
        </div>

        {error ? (
          <div className="devicesError">
            <div className="devicesErrorTitle">Error</div>
            <div className="devicesErrorBody">{error}</div>
          </div>
        ) : null}

        <div className="devicesTableCard">
          <div className="devicesTableScroll">
            <table className="devicesTable">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Type</th>
                  <th>Zone</th>
                  <th>Hall</th>
                  <th>Edge</th>
                  <th>Status</th>
                  <th>Last Communicated</th>
                  <th>Metrics</th>
                  <th>MAC</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="devicesTableEmpty">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="devicesTableEmpty">
                      No devices found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.device_id}>
                      <td className="tdStrong">{r.device_id}</td>
                      <td>{r.device_type}</td>
                      <td>{r.zone_id || "-"}</td>
                      <td>{r.hall_id || "-"}</td>
                      <td>{r.connected_edge || "-"}</td>
                      <td>
                        <span className={`statusPill ${statusClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td>{formatDate(r.last_heartbeat_at)}</td>
                      <td>{r.metric_type || deviceTypeLabelMap[r.device_type] || "-"}</td>
                      <td className="tdMono">{r.mac_address || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="devicesPager">
          <div className="devicesPagerLeft">
            Page {page} of {totalPages}
          </div>

          <div className="devicesPagerRight">
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
  );
}