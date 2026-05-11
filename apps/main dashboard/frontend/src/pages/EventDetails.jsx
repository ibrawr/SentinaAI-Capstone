/**
 * Displays the event details page with event metadata, exhibitor and booth
 * listings, exhibitor search, and an exhibitor detail modal. This page uses
 * route params to fetch event, exhibitor, and booth data from the API and
 * loads full exhibitor details when a table row is selected.
 */

import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function EventDetails() {
    const { id } = useParams();

    const [event, setEvent] = useState(null);
    const [exhibitors, setExhibitors] = useState([]);
    const [booths, setBooths] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedExhibitor, setSelectedExhibitor] = useState(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);

                const [eventRes, exhibitorRes, boothRes] = await Promise.all([
                    axios.get(`${API_BASE}/events/${id}`),
                    axios.get(`${API_BASE}/events/${id}/exhibitors`),
                    axios.get(`${API_BASE}/events/${id}/booths`)
                ]);

                setEvent(eventRes.data);
                setExhibitors(exhibitorRes.data || []);
                setBooths(boothRes.data || []);
            } catch (e) {
                setError(e?.response?.data?.error || e.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id]);

    const filteredExhibitors = useMemo(() => {
        const s = search.toLowerCase().trim();

        if (!s) return exhibitors;

        return exhibitors.filter(ex =>
            ex.name?.toLowerCase().includes(s) ||
            ex.company?.toLowerCase().includes(s) ||
            ex.booth_id?.toLowerCase().includes(s) ||
            ex.contact_phone?.toLowerCase().includes(s)
        );
    }, [exhibitors, search]);

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (error) return <div style={{ padding: 20 }}>Error: {error}</div>;
    if (!event) return <div style={{ padding: 20 }}>Event not found.</div>;

    return (
        <div style={{ padding: 20, maxWidth: 1300 }}>
            <h1>{event.event_name}</h1>

            <div style={card}>
                <div style={grid}>
                    <Detail label="Event ID" value={event.event_id} />
                    <Detail label="Venue" value={event.venue_name || event.venue_id} />
                    <Detail label="Start" value={new Date(event.start_datetime_utc).toLocaleString()} />
                    <Detail label="End" value={new Date(event.end_datetime_utc).toLocaleString()} />
                    <Detail label="Expected Attendance" value={event.expected_attendance_total} />
                    <Detail label="Expected Exhibitors" value={event.expected_exhibitors} />
                    <Detail label="Revenue" value={`AED ${Number(event.revenue_aed).toLocaleString()}`} />
                </div>
            </div>

            <div style={card}>
                <h2>Exhibitors</h2>

                <input
                    type="text"
                    placeholder="Search by exhibitor or booth..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={searchInput}
                />

                {filteredExhibitors.length === 0 ? (
                    <div>No exhibitors found.</div>
                ) : (
                    <table style={table}>
                        <thead>
                            <tr>
                                <th>Exhibitor</th>
                                <th>Lead</th>
                                <th>Contact</th>
                                <th>Booth</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExhibitors.map((ex) => (
                                <tr
                                    key={ex.exhibitor_id}
                                    style={{ cursor: "pointer" }}
                                    onClick={async () => {
                                        try {
                                            const res = await axios.get(
                                                `${API_BASE}/exhibitors/${ex.exhibitor_id}`
                                            );

                                            setSelectedExhibitor({
                                                ...res.data.exhibitor,
                                                booth_id: ex.booth_id
                                            });

                                            setShowModal(true);
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }}
                                >
                                    <td>{ex.company || "-"}</td>
                                    <td>{ex.name || "-"}</td>
                                    <td>{ex.contact_phone?.replace(/^'/, "") || "-"}</td>
                                    <td>{ex.booth_id || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={card}>
                <h2>Booths</h2>
                {booths.length === 0 ? (
                    <div>No booths found.</div>
                ) : (
                    <table style={table}>
                        <thead>
                            <tr>
                                <th>Booth ID</th>
                                <th>Hall</th>
                                <th>Zone</th>
                            </tr>
                        </thead>
                        <tbody>
                            {booths.map((b) => (
                                <tr key={b.booth_id}>
                                    <td>{b.booth_id}</td>
                                    <td>{b.hall_id}</td>
                                    <td>{b.zone_id}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && selectedExhibitor && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h2>{selectedExhibitor.exhibitor_name}</h2>

                        <div style={modalGrid}>
                            <Detail label="Exhibitor ID" value={selectedExhibitor.exhibitor_id} />
                            <Detail label="Booth ID" value={selectedExhibitor.booth_id} />
                            <Detail label="Industry" value={selectedExhibitor.industry} />
                            <Detail label="HQ Country" value={selectedExhibitor.hq_country} />
                            <Detail label="Contact Name" value={selectedExhibitor.contact_name} />
                            <Detail label="Contact Email" value={selectedExhibitor.contact_email} />
                            <Detail
                                label="Contact Phone"
                                value={selectedExhibitor.contact_phone?.replace(/^'/, "")}
                            />
                            <Detail label="Status" value={selectedExhibitor.status} />
                            <Detail
                                label="Created At"
                                value={new Date(selectedExhibitor.created_at).toLocaleString()}
                            />
                            <Detail
                                label="Updated At"
                                value={new Date(selectedExhibitor.updated_at).toLocaleString()}
                            />
                        </div>

                        <button
                            style={closeBtn}
                            onClick={() => {
                                setShowModal(false);
                                setSelectedExhibitor(null);
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Detail({ label, value }) {
    return (
        <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
            <div style={{ fontWeight: 600 }}>{value || "-"}</div>
        </div>
    );
}

const card = {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white"
};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 20
};

const table = {
    width: "100%",
    marginTop: 10,
    borderCollapse: "collapse"
};

const searchInput = {
    padding: "8px 12px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    width: 320
};

const modalOverlay = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000
};

const modalBox = {
    background: "white",
    padding: 30,
    borderRadius: 12,
    width: 600,
    maxHeight: "80vh",
    overflowY: "auto"
};

const modalGrid = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: 20
};

const closeBtn = {
    marginTop: 25,
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "#133250",
    color: "white",
    cursor: "pointer"
};