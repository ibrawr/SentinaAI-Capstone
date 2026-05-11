/**
 * Displays the events page with searchable, filterable, and paginated event
 * listings, including status, venue, date range, sorting, and row count controls.
 * This page fetches event rows and filter options from the events API, uses
 * MultiSelectPill for filter inputs, and uses React Router navigation to open
 * event detail pages.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./EventsPage.css";
import MultiSelectPill from "../components/MultiSelectPill";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAED(n) {
  if (n === null || n === undefined) return "-";
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return `AED ${num.toLocaleString()}`;
}

function IconSearch() {
  return (
    <svg width="15" height="16" viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z"
        stroke="#E8486F"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 15L9 10" stroke="#E8486F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.91675 13.2702H4.08341C1.51091 13.2702 0.729248 12.4885 0.729248 9.91602V4.08268C0.729248 1.51018 1.51091 0.728516 4.08341 0.728516H4.95841C5.97925 0.728516 6.30008 1.06102 6.70841 1.60352L7.58341 2.77018C7.77591 3.02685 7.80508 3.06185 8.16675 3.06185H9.91675C12.4892 3.06185 13.2709 3.84352 13.2709 6.41602V9.91602C13.2709 12.4885 12.4892 13.2702 9.91675 13.2702ZM4.08341 1.60352C1.99508 1.60352 1.60425 2.00018 1.60425 4.08268V9.91602C1.60425 11.9985 1.99508 12.3952 4.08341 12.3952H9.91675C12.0051 12.3952 12.3959 11.9985 12.3959 9.91602V6.41602C12.3959 4.33352 12.0051 3.93685 9.91675 3.93685H8.16675C7.42008 3.93685 7.17508 3.68018 6.88341 3.29518L6.00841 2.12852C5.70508 1.72602 5.61175 1.60352 4.95841 1.60352H4.08341Z"
        fill="#E8486F"
      />
      <path
        d="M11.6667 4.15852C11.4276 4.15852 11.2292 3.96018 11.2292 3.72102V2.91602C11.2292 1.99435 10.8384 1.60352 9.91675 1.60352H4.66675C4.42758 1.60352 4.22925 1.40518 4.22925 1.16602C4.22925 0.926849 4.42758 0.728516 4.66675 0.728516H9.91675C11.3284 0.728516 12.1042 1.50435 12.1042 2.91602V3.72102C12.1042 3.96018 11.9059 4.15852 11.6667 4.15852Z"
        fill="#E8486F"
      />
    </svg>
  );
}

function IconVenue() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.75 7.5C13.75 10.9518 10.9518 13.75 7.5 13.75M13.75 7.5C13.75 4.04822 10.9518 1.25 7.5 1.25M13.75 7.5H1.25M7.5 13.75C9.0633 12.0385 9.95172 9.81748 10 7.5C9.95172 5.18252 9.0633 2.96147 7.5 1.25M7.5 13.75C5.9367 12.0385 5.04828 9.81748 5 7.5C5.04828 5.18252 5.9367 2.96147 7.5 1.25M1.25 7.5C1.25 4.04822 4.04822 1.25 7.5 1.25"
        stroke="#E8486F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 3V5M16 3V5M4 9H20M6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5Z"
        stroke="#E8486F"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSort() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.16659 1.5H0.833252L4.16659 6.23V9.5L5.83325 10.5V6.23L9.16659 1.5Z"
        stroke="#E8486F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function eventStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "isActive";
  if (s === "planned" || s === "upcoming") return "isPlanned";
  if (s === "completed" || s === "closed") return "isCompleted";
  if (s === "cancelled" || s === "canceled") return "isCancelled";
  return "isNeutral";
}

export default function EventsPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(null);

  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState([]);
  const [venueIds, setVenueIds] = useState([]);
  const [sort, setSort] = useState("start_desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const [openSelect, setOpenSelect] = useState(null);

  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/events/filters`)
      .then((res) => {
        setFilters(res.data);
        if (res.data?.venues?.length === 1) setVenueIds([res.data.venues[0].venue_id]);
      })
      .catch((e) => setError(e?.response?.data?.error || e.message || "Failed to load filters"));
  }, []);

  const fromISO = useMemo(() => (from ? new Date(from).toISOString() : undefined), [from]);
  const toISO = useMemo(() => (to ? new Date(to).toISOString() : undefined), [to]);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/events`, {
          params: {
            q: qLive || undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            venue_id: venueIds.length ? venueIds.join(",") : undefined,
            sort,
            from: fromISO,
            to: toISO,
            page,
            pageSize,
          },
        });

        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || e.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [qLive, statuses, venueIds, sort, fromISO, toISO, page, pageSize]);

  useEffect(() => setPage(1), [statuses, venueIds, sort, fromISO, toISO, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const clearFilters = () => {
    setQ("");
    setStatuses([]);
    if (!(filters?.venues?.length === 1)) setVenueIds([]);
    setSort("start_desc");
    setFrom("");
    setTo("");
    setPage(1);
    setPageSize(10);
  };

  return (
    <div className="eventsPage">
      <div className="pageInner">
        <div className="eventsHeaderRow">
          <div className="eventsTitleWrap"></div>
          <div className="eventsHeaderRight">
            <div className="eventsCountTop">{loading ? "Loading…" : `${total} events`}</div>
          </div>
        </div>

        <div className="eventsControlsCard">
          <div className="eventsFiltersRow">
            <div className="filterPill pillSearch" role="search">
              <span className="pillLeftIcon" aria-hidden>
                <IconSearch />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search (Event ID / Event Name)…"
                className="pillInput"
              />
            </div>

            <MultiSelectPill
              className="pillStatus"
              icon={<IconStatus />}
              label="Status"
              options={filters?.statuses || []}
              value={statuses}
              onChange={setStatuses}
            />

            <MultiSelectPill
              className="pillVenue"
              icon={<IconVenue />}
              label="Venue"
              options={filters?.venues || []}
              value={venueIds}
              onChange={setVenueIds}
              getOptionValue={(option) => option.venue_id}
              getOptionLabel={(option) => `${option.venue_name} (${option.venue_id})`}
            />
            <div className="filterPill pillDate pillFrom">
              <span className="pillLeftIcon" aria-hidden>
                <IconCalendar />
              </span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="pillInput pillDateInput"
                title="From"
              />
            </div>

            <div className="filterPill pillDate pillTo">
              <span className="pillLeftIcon" aria-hidden>
                <IconCalendar />
              </span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="pillInput pillDateInput"
                title="To"
              />
            </div>

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
          </div>

          <div className="eventsControlsBottomRow">
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
                  {[5, 10, 20, 50].map((n) => (
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
          <div className="eventsError">
            <div className="eventsErrorTitle">Error</div>
            <div className="eventsErrorBody">{error}</div>
          </div>
        ) : null}

        <div className="eventsTableCard">
          <div className="eventsTableScroll">
            <table className="eventsTable">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Venue</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Expected Attendance</th>
                  <th>Expected Exhibitors</th>
                  <th>Exhibitors Joined</th>
                  <th>Revenue</th>
                  <th>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="eventsTableEmpty">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="eventsTableEmpty">
                      No events found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.event_id}
                      className="eventsRow"
                      onClick={() => navigate(`/operations/events/${r.event_id}`)}
                    >
                      <td className="tdStrong eventsEventCell">
                        <div className="eventsEventName">{r.event_name}</div>
                        <div className="eventsEventId">{r.event_id}</div>
                      </td>
                      <td>{r.venue_name || r.venue_id}</td>
                      <td>{formatDate(r.start_datetime_utc)}</td>
                      <td>{formatDate(r.end_datetime_utc)}</td>
                      <td>{Number(r.expected_attendance_total || 0).toLocaleString()}</td>
                      <td>{Number(r.expected_exhibitors || 0).toLocaleString()}</td>
                      <td>{Number(r.exhibitors_joined || 0).toLocaleString()}</td>
                      <td>{formatAED(r.revenue_aed)}</td>
                      <td>
                        <div>{r.person_in_charge_name || "-"}</div>
                        <div className="eventsPicEmail">{r.person_in_charge_email || ""}</div>
                      </td>
                      <td>
                        <span className={`statusPill ${eventStatusClass(r.status)}`}>{r.status || "-"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="eventsPager">
          <div className="eventsPagerLeft">
            Page {page} of {totalPages}
          </div>

          <div className="eventsPagerRight">
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