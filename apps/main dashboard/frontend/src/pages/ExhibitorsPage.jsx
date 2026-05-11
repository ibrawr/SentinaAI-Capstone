/**
 * Displays the exhibitors page with searchable and filterable exhibitor listings,
 * event-linked package tier filtering, exhibitor detail modal viewing, and total
 * exhibitor count display. This page fetches exhibitor rows, exhibitor filters,
 * and event options from the API, and uses MultiSelectPill for multi-select
 * filter controls.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./ExhibitorsPage.css";
import MultiSelectPill from "../components/MultiSelectPill";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

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

function IconTier() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.04175 4.08366V9.91699C2.04175 11.6662 2.74175 12.3662 4.49175 12.3662H9.50841C11.2584 12.3662 11.9584 11.6662 11.9584 9.91699V4.08366C11.9584 2.33366 11.2584 1.63366 9.50841 1.63366H4.49175C2.74175 1.63366 2.04175 2.33366 2.04175 4.08366Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M4.66675 5.25H9.33341" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.66675 7H8.16675" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.66675 8.75H7.00008" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconIndustry() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.1875 13.125V4.6875C2.1875 4.34268 2.46768 4.0625 2.8125 4.0625H6.5625C6.90732 4.0625 7.1875 4.34268 7.1875 4.6875V13.125M7.1875 13.125V2.8125C7.1875 2.46768 7.46768 2.1875 7.8125 2.1875H11.5625C11.9073 2.1875 12.1875 2.46768 12.1875 2.8125V13.125M1.25 13.125H13.125"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.0625 5.625H5.3125M4.0625 7.5H5.3125M8.75 4.0625H10M8.75 5.9375H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconCountry() {
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


export default function ExhibitorsPage() {
  const [filters, setFilters] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedExhibitor, setSelectedExhibitor] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Query state
  const [q, setQ] = useState("");
  const [industries, setIndustries] = useState([]);
  const [hqCountries, setHqCountries] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [eventIds, setEventIds] = useState([]);
  const [packageTiers, setPackageTiers] = useState([]);
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Data state
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // Debounce search
  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Load filters + events list
  useEffect(() => {
    const load = async () => {
      try {
        const [f, ev] = await Promise.all([
          axios.get(`${API_BASE}/exhibitors/filters`),
          axios.get(`${API_BASE}/events`, {
            params: { page: 1, pageSize: 50, sort: "start_desc" },
          }),
        ]);
        setFilters(f.data);
        setEvents(ev.data.rows || []);
      } catch (e) {
        setError(e?.response?.data?.error || e.message || "Failed to load filters");
      }
    };
    load();
  }, []);

  // Fetch exhibitors
  useEffect(() => {
    const fetchExhibitors = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/exhibitors`, {
          params: {
            q: qLive || undefined,
            industry: industries.length ? industries.join(",") : undefined,
            hq_country: hqCountries.length ? hqCountries.join(",") : undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            event_id: eventIds.length ? eventIds.join(",") : undefined,
            package_tier: packageTiers.length ? packageTiers.join(",") : undefined,
            sort,
            page,
            pageSize,
          },
        });
        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        setError(e?.response?.data?.error || e.message || "Failed to load exhibitors");
      } finally {
        setLoading(false);
      }
    };

    fetchExhibitors();
  }, [qLive, industries, hqCountries, statuses, eventIds, packageTiers, sort, page, pageSize]);

  useEffect(() => setPage(1), [industries, hqCountries, statuses, eventIds, packageTiers, sort, pageSize]);
  useEffect(() => {
    if (!eventIds.length) setPackageTiers([]);
  }, [eventIds]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  const clearFilters = () => {
    setQ("");
    setIndustries([]);
    setHqCountries([]);
    setStatuses([]);
    setEventIds([]);
    setPackageTiers([]);
    setSort("name_asc");
    setPage(1);
    setPageSize(10);
  };

  return (
    <div className="exhibitorsPage">
      <div className="pageInner">

        <div className="exhibitorsHeaderRow">

          <div className="exhibitorsHeaderRight">
            <div className="exhibitorsCountTop">
              {loading ? "Loading…" : `${total} exhibitors`}
            </div>
          </div>
        </div>

        <div className="exhibitorsControlsCard">

          <div className="exhibitorsFiltersRow">

            <div className="filterPill pillSearch" role="search">
              <span className="pillLeftIcon" aria-hidden>
                <IconSearch />
              </span>
              <input
                className="pillInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search (Exhibitor ID / Name)"
              />
            </div>

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

            <MultiSelectPill
              className="pillTier"
              icon={<IconTier />}
              label={eventIds.length ? "Tier" : "Select event first"}
              options={filters?.packageTiers || []}
              value={packageTiers}
              onChange={setPackageTiers}
              disabled={!eventIds.length}
            />

            <MultiSelectPill
              className="pillIndustry"
              icon={<IconIndustry />}
              label="Industry"
              options={filters?.industries || []}
              value={industries}
              onChange={setIndustries}
            />

            <MultiSelectPill
              className="pillCountry"
              icon={<IconCountry />}
              label="HQ Country"
              options={filters?.hqCountries || []}
              value={hqCountries}
              onChange={setHqCountries}
            />

            <MultiSelectPill
              className="pillStatus"
              icon={<IconStatus />}
              label="Status"
              options={filters?.statuses || []}
              value={statuses}
              onChange={setStatuses}
            />

          </div>

          <div className="exhibitorsControlsBottomRow">

            <button
              className="clearFiltersBtn"
              onClick={clearFilters}
            >
              Clear filters
            </button>

          </div>

        </div>

        <div className="exhibitorsTableCard">
          <div className="exhibitorsTableScroll">

            <table className="exhibitorsTable">

              <thead>
                <tr>
                  <th>Exhibitor</th>
                  <th>Industry</th>
                  <th>HQ</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Events</th>
                  <th>Total Paid</th>
                  <th>Tier</th>
                </tr>
              </thead>

              <tbody>

                {rows.map(r => (
                  <tr
                    key={r.exhibitor_id}
                    className="exhibitorsRow"
                    onClick={async () => {
                      const res = await axios.get(`${API_BASE}/exhibitors/${r.exhibitor_id}`)
                      setSelectedExhibitor(res.data.exhibitor)
                      setShowModal(true)
                    }}
                  >

                    <td>
                      <div className="exhibitorName">{r.exhibitor_name}</div>
                      <div className="exhibitorId">{r.exhibitor_id}</div>
                    </td>

                    <td>{r.industry}</td>
                    <td>{r.hq_country}</td>

                    <td>
                      <span className={`statusPill ${r.status}`}>
                        {r.status}
                      </span>
                    </td>

                    <td>
                      {r.contact_name}
                      <div className="exhibitorContact">{r.contact_email}</div>
                      <div className="exhibitorContact">{r.contact_phone}</div>
                    </td>

                    <td>{r.events_count}</td>
                    <td>{formatAED(r.total_paid_aed)}</td>
                    <td>{r.any_package_tier}</td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        </div>

        {showModal && selectedExhibitor && (
          <div className="modalOverlay">
            <div className="modalBox">

              <h2>{selectedExhibitor.exhibitor_name}</h2>

              <div className="modalGrid">
                <Detail label="Exhibitor ID" value={selectedExhibitor.exhibitor_id} />
                <Detail label="Industry" value={selectedExhibitor.industry} />
                <Detail label="HQ Country" value={selectedExhibitor.hq_country} />
                <Detail label="Contact Name" value={selectedExhibitor.contact_name} />
                <Detail label="Contact Email" value={selectedExhibitor.contact_email} />
                <Detail label="Contact Phone" value={selectedExhibitor.contact_phone?.replace(/^'/, "")} />
                <Detail label="Status" value={selectedExhibitor.status} />
              </div>

              <div className="modalFooter">
                <button className="closeBtn" onClick={() => setShowModal(false)}>
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="modalLabel">{label}</div>
      <div className="modalValue">{value || "-"}</div>
    </div>
  );
}

const inputStyle = { padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" };
const selectStyle = { padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "white" };
const th = { padding: 10 };
const td = { padding: 10 };
const tdStrong = { ...td, fontWeight: 700 };

const btnSecondary = { padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", background: "white" };

function pill(status) {
  const bg = status === "active" ? "#dcfce7" : "#e5e7eb";
  return { padding: "4px 10px", borderRadius: 999, background: bg };
}

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalBox = {
  background: "white",
  padding: 30,
  borderRadius: 14,
  width: 700,
  maxHeight: "80vh",
  overflowY: "auto",
};

const modalGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginTop: 20,
};

const closeBtn = {
  marginTop: 20,
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: "#133250",
  color: "white",
  cursor: "pointer",
};