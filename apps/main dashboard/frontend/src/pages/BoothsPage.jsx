/**
 * Displays the booths page with event-based booth filtering, booth listing,
 * pagination, and advanced filter controls for zone, hall, size, assignment,
 * and sorting. This page fetches event data and booth filter options from the
 * backend, and uses the MultiSelectPill component for multi-select filter inputs.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./BoothsPage.css";
import MultiSelectPill from "../components/MultiSelectPill";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";


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

function IconEvent() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 3V5M16 3V5M4 9H20M6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconZone() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.75 7.5C13.75 10.9518 10.9518 13.75 7.5 13.75M13.75 7.5C13.75 4.04822 10.9518 1.25 7.5 1.25M13.75 7.5H1.25M7.5 13.75C9.0633 12.0385 9.95172 9.81748 10 7.5C9.95172 5.18252 9.0633 2.96147 7.5 1.25M7.5 13.75C5.9367 12.0385 5.04828 9.81748 5 7.5C5.04828 5.18252 5.9367 2.96147 7.5 1.25M1.25 7.5C1.25 4.04822 4.04822 1.25 7.5 1.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHall() {
  return <IconZone />;
}

function IconSize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 4.5H9.5V9.5H4.5V4.5Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.91675 13.2702H4.08341C1.51091 13.2702 0.729248 12.4885 0.729248 9.91602V4.08268C0.729248 1.51018 1.51091 0.728516 4.08341 0.728516H4.95841C5.97925 0.728516 6.30008 1.06102 6.70841 1.60352L7.58341 2.77018C7.77591 3.02685 7.80508 3.06185 8.16675 3.06185H9.91675C12.4892 3.06185 13.2709 3.84352 13.2709 6.41602V9.91602C13.2709 12.4885 12.4892 13.2702 9.91675 13.2702Z"
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


export default function BoothsPage() {
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState(null);

  const [eventIds, setEventIds] = useState([]);
  const [q, setQ] = useState("");
  const [zoneIds, setZoneIds] = useState([]);
  const [hallIds, setHallIds] = useState([]);
  const [sizeTypes, setSizeTypes] = useState([]);
  const [assignedValues, setAssignedValues] = useState([]);
  const [sort, setSort] = useState("booth_code_asc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const [qLive, setQLive] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/events`, {
        params: { page: 1, pageSize: 50, sort: "start_desc" },
      })
      .then((res) => {
        setEvents(res.data.rows || []);
      })
      .catch((e) =>
        setError(e?.response?.data?.error || e.message || "Failed to load events")
      );
  }, []);

  useEffect(() => {
    axios
      .get(`${API_BASE}/booths/filters`, {
        params: { event_id: eventIds.length ? eventIds.join(",") : undefined },
      })
      .then((res) => setFilters(res.data))
      .catch((e) =>
        setError(
          e?.response?.data?.error ||
            e.message ||
            "Failed to load booth filters"
        )
      );
  }, [eventIds]);

  useEffect(() => {
    const selectedAssigned = assignedValues.length === 1 ? assignedValues[0] : undefined;

    const fetchBooths = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await axios.get(`${API_BASE}/booths`, {
          params: {
            event_id: eventIds.length ? eventIds.join(",") : undefined,
            q: qLive || undefined,
            zone_id: zoneIds.length ? zoneIds.join(",") : undefined,
            hall_id: hallIds.length ? hallIds.join(",") : undefined,
            booth_size_type: sizeTypes.length ? sizeTypes.join(",") : undefined,
            assigned: selectedAssigned || undefined,
            sort,
            page,
            pageSize,
          },
        });

        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        setError(
          e?.response?.data?.error || e.message || "Failed to load booths"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBooths();
  }, [eventIds, qLive, zoneIds, hallIds, sizeTypes, assignedValues, sort, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [eventIds, zoneIds, hallIds, sizeTypes, assignedValues, sort, pageSize]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  const hallOptions = useMemo(() => {
    const allHalls = filters?.halls || [];
    if (!zoneIds.length) return allHalls;
    return allHalls.filter((hall) => zoneIds.includes(String(hall.zone_id || "")));
  }, [filters, zoneIds]);

  useEffect(() => {
    setHallIds((prev) => prev.filter((hallId) => hallOptions.some((hall) => String(hall.hall_id) === String(hallId))));
  }, [hallOptions]);

  const assignedOptions = useMemo(
    () => [
      { value: "true", label: "Assigned" },
      { value: "false", label: "Unassigned" },
    ],
    []
  );

  const advancedFilterCount =
    sizeTypes.length + assignedValues.length + (sort !== "booth_code_asc" ? 1 : 0);

  const moreFiltersLabel = showMoreFilters
    ? "Less options"
    : `More options${advancedFilterCount ? ` (${advancedFilterCount})` : ""}`;

  return (
    <div className="boothsPage">
      <div className="pageInner">

        <div className="boothsHeaderRow">
          <div className="boothsHeaderRight">
            <div className="boothsCountTop">
              {loading ? "Loading…" : `${total} booths`}
            </div>
          </div>
        </div>

        <div className="boothsControlsCard">

          <div className="boothsControlsTopRow">
            <MultiSelectPill
              className="pillEvent"
              icon={<IconEvent />}
              label="Event"
              options={events}
              value={eventIds}
              onChange={setEventIds}
              getOptionValue={(option) => option.event_id}
              getOptionLabel={(option) => `${option.event_id} — ${option.event_name}`}
            />

            <div className="filterPill pillSearch" role="search">
              <span className="pillLeftIcon" aria-hidden>
                <IconSearch />
              </span>
              <input
                className="pillInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search booth/exhibitor..."
              />
            </div>

            <MultiSelectPill
              className="pillZone"
              icon={<IconZone />}
              label="Zone"
              options={filters?.zones || []}
              value={zoneIds}
              onChange={setZoneIds}
            />

            <MultiSelectPill
              className="pillHall"
              icon={<IconHall />}
              label="Hall"
              options={hallOptions}
              value={hallIds}
              onChange={setHallIds}
              getOptionValue={(option) => option.hall_id}
              getOptionLabel={(option) => option.hall_id}
            />

            <div className="boothsTopActions">
              <button
                type="button"
                className={`moreOptionsBtn ${showMoreFilters ? "isOpen" : ""}`}
                onClick={() => setShowMoreFilters((prev) => !prev)}
              >
                {moreFiltersLabel}
              </button>
            </div>
          </div>

          {showMoreFilters ? (
            <div className="boothsFiltersSecondary">
              <MultiSelectPill
                className="pillSize"
                icon={<IconSize />}
                label="Size"
                options={filters?.boothSizeTypes || []}
                value={sizeTypes}
                onChange={setSizeTypes}
              />

              <MultiSelectPill
                className="pillAssigned"
                icon={<IconStatus />}
                label="Assigned"
                options={assignedOptions}
                value={assignedValues}
                onChange={setAssignedValues}
                getOptionValue={(option) => option.value}
                getOptionLabel={(option) => option.label}
              />

              <div className="filterPill pillSelectWrap pillSortCompact">
                <span className="pillLeftIcon" aria-hidden>
                  <IconSort />
                </span>
                <select
                  className="pillSelect"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  {filters?.sortOptions?.map((s) => (
                    <option key={s} value={s}>
                      Sort: {s}
                    </option>
                  ))}
                </select>
                <div className="pillRightCaret"></div>
              </div>

              <div className="rowsControl secondaryRowsControl">
                <div className="rowsLabel">Rows:</div>
                <div className="filterPill pillSelectWrap pillRowsCompact">
                  <select
                    className="pillSelect"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="pillRightCaret"></div>
                </div>
              </div>
            </div>
          ) : null}

        </div>

        {error ? (
          <div className="boothsError">
            <div className="boothsErrorTitle">Error</div>
            <div className="boothsErrorBody">{error}</div>
          </div>
        ) : null}

        <div className="boothsTableCard">
          <div className="boothsTableScroll">

            <table className="boothsTable">

              <thead>
                <tr>
                  <th>Booth</th>
                  <th>Zone</th>
                  <th>Hall</th>
                  <th>Hall Name</th>
                  <th>Size</th>
                  <th>Area (sqm)</th>
                  <th>Assigned?</th>
                  <th>Exhibitor</th>
                  <th>Assigned At</th>
                  <th>Assignment Status</th>
                </tr>
              </thead>

              <tbody>

                {loading ? (
                  <tr>
                    <td colSpan="10">Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan="10">No booths found.</td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.booth_id} className="boothsRow">

                      <td>
                        <div className="boothCode">{r.booth_code}</div>
                        <div className="boothId">{r.booth_id}</div>
                      </td>

                      <td>{r.zone_id}</td>
                      <td>{r.hall_id}</td>
                      <td>{r.hall_name || "-"}</td>
                      <td>{r.booth_size_type}</td>
                      <td>{r.booth_area_sqm ?? "-"}</td>

                      <td>
                        <span
                          className={`statusPill ${
                            r.is_assigned ? "assigned" : "unassigned"
                          }`}
                        >
                          {r.is_assigned ? "Assigned" : "Unassigned"}
                        </span>
                      </td>

                      <td>
                        {r.exhibitor_name ? (
                          <>
                            <div>{r.exhibitor_name}</div>
                            <div className="exhibitorId">{r.exhibitor_id}</div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>

                      <td>
                        {r.assigned_at
                          ? new Date(r.assigned_at).toLocaleString()
                          : "-"}
                      </td>

                      <td>{r.assignment_status || "-"}</td>

                    </tr>
                  ))
                )}

              </tbody>

            </table>

          </div>
        </div>

        <div className="boothsPager">

          <div className="boothsPagerLeft">
            Page {page} of {totalPages}
          </div>

          <div className="boothsPagerRight">

            <button
              className="pagerBtn"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              {"<<"}
            </button>

            <button
              className="pagerBtn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>

            <button
              className="pagerBtn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>

            <button
              className="pagerBtn"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              {">>"}
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}