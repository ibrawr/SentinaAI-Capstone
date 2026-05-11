/**
 * Displays, searches, and manages support issues in the admin dashboard,
 * including issue review, admin notes, and status updates through a modal view.
 */
import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const formatRole = (role = "") =>
    String(role || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown";

const formatDate = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleString();
};

function rolePillStyle(role) {
    const normalized = String(role || "").toUpperCase();

    if (normalized.includes("SUPER_ADMIN") || normalized.includes("SOC") || normalized.includes("SECURITY")) {
        return {
            background: "rgba(30, 58, 93, 0.10)",
            color: "#1e3a5d",
            border: "1px solid rgba(30, 58, 93, 0.22)",
        };
    }

    if (normalized.includes("OPERATIONS")) {
        return {
            background: "rgba(233, 69, 111, 0.10)",
            color: "#e9456f",
            border: "1px solid rgba(233, 69, 111, 0.22)",
        };
    }

    if (normalized.includes("SUSTAINABILITY")) {
        return {
            background: "rgba(23, 128, 50, 0.10)",
            color: "#178032",
            border: "1px solid rgba(23, 128, 50, 0.22)",
        };
    }

    if (normalized.includes("EXHIBITOR")) {
        return {
            background: "rgba(55, 0, 94, 0.10)",
            color: "#37005e",
            border: "1px solid rgba(55, 0, 94, 0.22)",
        };
    }

    return {
        background: "rgba(148, 163, 184, 0.12)",
        color: "#475569",
        border: "1px solid rgba(148, 163, 184, 0.20)",
    };
}

function statusPillStyle(status) {
    const normalized = String(status || "").toUpperCase();

    if (normalized === "OPEN") {
        return {
            background: "rgba(245, 158, 11, 0.10)",
            color: "#b45309",
            border: "1px solid rgba(245, 158, 11, 0.18)",
        };
    }

    if (normalized === "IN_PROGRESS") {
        return {
            background: "rgba(59, 130, 246, 0.10)",
            color: "#1d4ed8",
            border: "1px solid rgba(59, 130, 246, 0.18)",
        };
    }

    if (normalized === "RESOLVED" || normalized === "CLOSED") {
        return {
            background: "rgba(22, 163, 74, 0.10)",
            color: "#166534",
            border: "1px solid rgba(22, 163, 74, 0.18)",
        };
    }

    return {
        background: "rgba(148, 163, 184, 0.12)",
        color: "#475569",
        border: "1px solid rgba(148, 163, 184, 0.20)",
    };
}

export default function AdminSupportIssues() {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");

    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [adminNotes, setAdminNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const isClosed = String(selectedIssue?.status || "").toUpperCase() === "CLOSED";
    const [search, setSearch] = useState("");

    const fetchIssues = async () => {
        try {
            setLoading(true);
            setError("");

            const res = await fetch(`${API_BASE}/support/issues`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || "Failed to fetch issues");
                setIssues([]);
                return;
            }

            setIssues(Array.isArray(data?.rows) ? data.rows : []);
        } catch (err) {
            console.error(err);
            setError("Failed to fetch issues");
            setIssues([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIssues();
    }, []);

    const openModal = (issue) => {
        setSelectedIssue(issue);
        setAdminNotes(issue.admin_notes || "");
    };

    const closeModal = () => {
        setSelectedIssue(null);
        setAdminNotes("");
        setSaving(false);
    };

    const updateIssue = async (status) => {
        if (!selectedIssue || isClosed) return;

        try {
            setSaving(true);

            const res = await fetch(`${API_BASE}/support/issues/${selectedIssue.issue_id}/resolve`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    status,
                    admin_notes: adminNotes,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data?.error || "Failed to update issue");
                return;
            }

            await fetchIssues();
            closeModal();
        } catch (err) {
            console.error(err);
            alert("Failed to update issue");
        } finally {
            setSaving(false);
        }
    };

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();

        return issues.filter((issue) => {
            if (!q) return true;

            const haystack = [
                issue.reason,
                issue.full_name,
                issue.email,
                issue.role_name,
                issue.employee_id,
                issue.user_id,
                issue.status,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [issues, search]);

    return (
        <section style={styles.section}>
            <div style={styles.headerRow}>
                <div>
                    <h2 style={styles.title}>Support Issues</h2>
                    <p style={styles.subtitle}>Submitted help requests and reported issues.</p>
                </div>
                <div style={styles.countBadge}>{rows.length} total</div>
            </div>

            <div style={styles.searchRow}>
                <input
                    type="text"
                    placeholder="Search by subject, user, email, role, ID, or status"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={styles.searchInput}
                />
            </div>

            {error ? <div style={styles.errorBanner}>{error}</div> : null}

            <div style={styles.tableWrap}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Subject</th>
                            <th style={styles.th}>User</th>
                            <th style={styles.th}>Email</th>
                            <th style={styles.th}>Role</th>
                            <th style={styles.th}>ID</th>
                            <th style={styles.th}>Status</th>
                            <th style={styles.th}>Submitted</th>
                            <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} style={styles.emptyCell}>Loading support issues…</td>
                            </tr>
                        ) : rows.length ? (
                            rows.map((issue, index) => (
                                <tr key={issue.issue_id} style={index % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                                    <td style={styles.td}>
                                        <div style={styles.primaryText}>{issue.reason || "—"}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.primaryText}>{issue.full_name || "Unknown User"}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.secondaryText}>{issue.email || "—"}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{ ...styles.softPill, ...rolePillStyle(issue.role_name) }}>
                                            {formatRole(issue.role_name)}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.primaryText}>{issue.employee_id || issue.user_id || "—"}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{ ...styles.softPill, ...statusPillStyle(issue.status) }}>
                                            {issue.status}
                                        </span>
                                    </td>
                                    <td style={styles.td}>{formatDate(issue.created_at)}</td>
                                    <td style={{ ...styles.td, textAlign: "right" }}>
                                        <button style={styles.viewBtn} onClick={() => openModal(issue)}>
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={8} style={styles.emptyCell}>No support issues found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selectedIssue ? (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalTop}>
                            <div>
                                <h3 style={styles.modalTitle}>{selectedIssue.reason}</h3>
                                <p style={styles.modalSubtitle}>
                                    {selectedIssue.full_name || "Unknown User"} • {formatRole(selectedIssue.role_name)} • {selectedIssue.employee_id || selectedIssue.user_id || "—"} • {selectedIssue.status}
                                </p>
                            </div>
                            <button type="button" style={styles.closeBtn} onClick={closeModal} aria-label="Close">
                                ×
                            </button>
                        </div>

                        <div style={styles.detailCard}>
                            <div style={styles.detailLabel}>Issue Details</div>
                            <div style={styles.detailValue}>{selectedIssue.details || "—"}</div>
                        </div>

                        <div style={styles.detailGrid}>
                            <div style={styles.detailCard}>
                                <div style={styles.detailLabel}>Status</div>
                                <div style={styles.detailValue}>{selectedIssue.status}</div>
                            </div>
                            <div style={styles.detailCard}>
                                <div style={styles.detailLabel}>Submitted</div>
                                <div style={styles.detailValue}>{formatDate(selectedIssue.created_at)}</div>
                            </div>
                        </div>

                        <div style={styles.notesWrap}>
                            <label style={styles.notesLabel}>Admin Notes</label>
                            <textarea
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                style={{
                                    ...styles.textarea,
                                    opacity: isClosed ? 0.6 : 1,
                                    cursor: isClosed ? "not-allowed" : "text",
                                }}
                                placeholder="Add notes before resolving or closing this issue"
                                disabled={isClosed}
                            />
                        </div>

                        <div style={styles.modalActions}>
                            <button style={styles.cancelBtn} onClick={closeModal}>
                                {isClosed ? "Done" : "Close"}
                            </button>

                            {!isClosed && (
                                <>
                                    <button
                                        style={styles.resolveBtn}
                                        onClick={() => updateIssue("RESOLVED")}
                                        disabled={saving}
                                    >
                                        {saving ? "Saving..." : "Resolve"}
                                    </button>

                                    <button
                                        style={styles.closeIssueBtn}
                                        onClick={() => updateIssue("CLOSED")}
                                        disabled={saving}
                                    >
                                        {saving ? "Saving..." : "Close Issue"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

const styles = {
    section: {
        marginTop: 32,
        border: "1px solid #dbe4ee",
        borderRadius: 24,
        padding: 26,
        background: "linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%)",
        boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
    },
    headerRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 18,
        flexWrap: "wrap",
    },
    searchInput: {
        width: "100%",
        height: 56,
        borderRadius: 18,
        border: "1px solid #cbd5e1",
        padding: "0 20px",
        background: "#fff",
        fontSize: 15,
        color: "#0f172a",
        outline: "none",
        boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
        boxSizing: "border-box",
    },
    searchRow: {
        width: "100%",
        marginBottom: 20,
    },
    title: {
        margin: 0,
        fontSize: 24,
        fontWeight: 900,
        color: "#0f172a",
    },
    subtitle: {
        margin: "8px 0 0",
        color: "#64748b",
        fontSize: 15,
        lineHeight: 1.5,
    },
    countBadge: {
        background: "rgba(30, 58, 93, 0.08)",
        color: "#1e3a5d",
        border: "1px solid rgba(30, 58, 93, 0.16)",
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
    },
    errorBanner: {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
        padding: "10px 14px",
        borderRadius: 10,
        marginBottom: 16,
    },
    tableWrap: {
        width: "100%",
        overflowX: "auto",
        border: "1px solid #dbe4ee",
        borderRadius: 20,
        background: "#ffffff",
        boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
    },
    table: {
        width: "100%",
        minWidth: 1080,
        borderCollapse: "separate",
        borderSpacing: 0,
    },
    th: {
        textAlign: "left",
        fontSize: 12,
        fontWeight: 800,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        padding: "18px 22px",
        background: "#f8fbff",
        borderBottom: "1px solid #e5edf5",
        whiteSpace: "nowrap",
    },
    td: {
        padding: "18px 22px",
        borderBottom: "1px solid #eef3f8",
        verticalAlign: "middle",
    },
    rowEven: { background: "#ffffff" },
    rowOdd: { background: "#fbfdff" },
    primaryText: {
        fontWeight: 800,
        color: "#0f172a",
        lineHeight: 1.35,
        fontSize: 16,
    },
    secondaryText: {
        color: "#334155",
        fontWeight: 600,
        lineHeight: 1.45,
        wordBreak: "break-word",
        fontSize: 15,
    },
    softPill: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 34,
        padding: "0 14px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
        letterSpacing: 0.2,
    },
    emptyCell: {
        textAlign: "center",
        padding: 22,
        color: "#64748b",
    },
    viewBtn: {
        background: "#1e3a5d",
        color: "#ffffff",
        border: "none",
        padding: "9px 16px",
        borderRadius: 10,
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 14,
        boxShadow: "0 8px 18px rgba(30, 58, 93, 0.18)",
    },
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 4000,
        padding: 20,
    },
    modal: {
        width: "100%",
        maxWidth: 760,
        background: "#ffffff",
        borderRadius: 22,
        padding: 26,
        border: "1px solid #dbe4ee",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.20)",
    },
    modalTop: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 18,
    },
    modalTitle: {
        margin: 0,
        fontSize: 24,
        fontWeight: 900,
        color: "#0f172a",
    },
    modalSubtitle: {
        margin: "8px 0 0",
        color: "#64748b",
        fontSize: 14,
    },
    closeBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        border: "none",
        background: "#f1f5f9",
        color: "#475569",
        fontSize: 20,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        lineHeight: 1,
        flexShrink: 0,
    },
    detailGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 16,
    },
    detailCard: {
        border: "1px solid #e5edf5",
        borderRadius: 16,
        padding: 16,
        background: "#fbfdff",
        marginBottom: 16,
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: 800,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    detailValue: {
        fontSize: 15,
        color: "#0f172a",
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
    },
    notesWrap: {
        display: "grid",
        gap: 8,
        marginBottom: 18,
    },
    notesLabel: {
        fontSize: 13,
        fontWeight: 800,
        color: "#334155",
    },
    textarea: {
        width: "100%",
        minHeight: 120,
        borderRadius: 14,
        border: "1px solid #cbd5e1",
        padding: 14,
        fontSize: 15,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        boxSizing: "border-box",
    },
    modalActions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        flexWrap: "wrap",
    },
    cancelBtn: {
        background: "#e5e7eb",
        border: "none",
        padding: "10px 18px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 700,
        color: "#334155",
    },
    resolveBtn: {
        background: "#16a34a",
        color: "#ffffff",
        border: "none",
        padding: "10px 18px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
    },
    closeIssueBtn: {
        background: "#1e3a5d",
        color: "#ffffff",
        border: "none",
        padding: "10px 18px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
    },
};