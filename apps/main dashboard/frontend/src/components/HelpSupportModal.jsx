import { useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function HelpSupportModal({
    open,
    onClose,
    guideUrl,
    accentColor = "#1e3a5d",
    sectionLabel = "Dashboard",
}) {
    const [showContactForm, setShowContactForm] = useState(false);
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");

    if (!open) return null;

    const resetForm = () => {
        setShowContactForm(false);
        setReason("");
        setDetails("");
        setErrors({});
        setSubmitting(false);
        setSuccessMsg("");
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const validate = () => {
        const nextErrors = {};
        const cleanReason = reason.trim();
        const cleanDetails = details.trim();

        if (!cleanReason) {
            nextErrors.reason = "Reason is required.";
        } else if (cleanReason.length > 120) {
            nextErrors.reason = "Reason must be 120 characters or less.";
        }

        if (!cleanDetails) {
            nextErrors.details = "Please tell us more about the issue.";
        } else if (cleanDetails.length < 10) {
            nextErrors.details = "Details must be at least 10 characters long.";
        }

        return nextErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const nextErrors = validate();
        setErrors(nextErrors);
        setSuccessMsg("");

        if (Object.keys(nextErrors).length > 0) return;

        try {
            setSubmitting(true);

            const token =
                sessionStorage.getItem("token") || localStorage.getItem("token");

            await axios.post(
                `${API_BASE}/support/issues`,
                {
                    reason: reason.trim(),
                    details: details.trim(),
                    source_section: sectionLabel,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            setSuccessMsg("Issue submitted successfully.");
            setReason("");
            setDetails("");
            setErrors({});

            setTimeout(() => {
                handleClose();
            }, 900);
        } catch (err) {
            const message =
                err?.response?.data?.error || "Failed to submit issue.";
            setErrors({ api: message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.headerRow}>
                    <div>
                        <h2 style={styles.title}>
                            {showContactForm ? "Contact Admin" : "Help"}
                        </h2>
                        <p style={styles.subtitle}>
                            {showContactForm
                                ? `Report an issue for ${sectionLabel}.`
                                : `Choose how you want help for ${sectionLabel}.`}
                        </p>
                    </div>

                    <button type="button" onClick={handleClose} style={styles.closeBtn}>
                        ×
                    </button>
                </div>

                {!showContactForm ? (
                    <div style={styles.optionGrid}>
                        <button
                            type="button"
                            style={{
                                ...styles.optionCard,
                                borderColor: accentColor,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = `${accentColor}12`;
                                e.currentTarget.style.boxShadow = `0 10px 24px ${accentColor}18`;
                                e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#ffffff";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                            onClick={() =>
                                window.open(guideUrl, "_blank", "noopener,noreferrer")
                            }
                        >
                            <div style={styles.optionTextWrap}>
                                <div style={styles.optionTitle}>User Guide</div>
                                <div style={styles.optionText}>
                                    Open the user guide PDF for this dashboard.
                                </div>
                            </div>
                        </button>

                        <button
                            type="button"
                            style={{
                                ...styles.optionCard,
                                borderColor: accentColor,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = `${accentColor}12`;
                                e.currentTarget.style.boxShadow = `0 10px 24px ${accentColor}18`;
                                e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#ffffff";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                            onClick={() => {
                                setShowContactForm(true);
                                setErrors({});
                                setSuccessMsg("");
                            }}
                        >
                            <div style={styles.optionTextWrap}>
                                <div style={styles.optionTitle}>Contact Admin</div>
                                <div style={styles.optionText}>
                                    Report an issue directly to the admin team.
                                </div>
                            </div>
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Reason</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => {
                                    setReason(e.target.value);
                                    if (errors.reason) {
                                        setErrors((prev) => ({ ...prev, reason: "" }));
                                    }
                                }}
                                placeholder="Example: Help guide is missing"
                                maxLength={120}
                                style={styles.input}
                            />
                            {errors.reason ? (
                                <div style={styles.errorText}>{errors.reason}</div>
                            ) : null}
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Tell us more about it</label>
                            <textarea
                                value={details}
                                onChange={(e) => {
                                    setDetails(e.target.value);
                                    if (errors.details) {
                                        setErrors((prev) => ({ ...prev, details: "" }));
                                    }
                                }}
                                placeholder="Describe the issue clearly."
                                rows={5}
                                style={styles.textarea}
                            />
                            {errors.details ? (
                                <div style={styles.errorText}>{errors.details}</div>
                            ) : null}
                        </div>

                        {errors.api ? (
                            <div style={styles.errorBanner}>{errors.api}</div>
                        ) : null}
                        {successMsg ? (
                            <div style={styles.successBanner}>{successMsg}</div>
                        ) : null}

                        <div style={styles.actions}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowContactForm(false);
                                    setErrors({});
                                    setSuccessMsg("");
                                }}
                                style={styles.secondaryBtn}
                            >
                                Back
                            </button>

                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    ...styles.primaryBtn,
                                    background: accentColor,
                                }}
                            >
                                {submitting ? "Submitting..." : "Submit Issue"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5000,
        padding: 20,
    },
    modal: {
        width: "100%",
        maxWidth: 620,
        background: "#ffffff",
        borderRadius: 20,
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.20)",
        padding: 24,
        border: "1px solid #e5e7eb",
    },
    headerRow: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 18,
        paddingRight: 6,
    },
    title: {
        margin: 0,
        fontSize: 26,
        fontWeight: 900,
        color: "#0f172a",
    },
    subtitle: {
        margin: "8px 0 0",
        color: "#64748b",
        fontSize: 14,
        lineHeight: 1.5,
    },
    closeBtn: {
        border: "none",
        background: "#f8fafc",
        color: "#475569",
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        borderRadius: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        marginTop: 2,
        marginRight: 2,
    },
    optionGrid: {
        display: "grid",
        gap: 14,
    },
    optionCard: {
        width: "100%",
        border: "1.5px solid #cbd5e1",
        background: "#ffffff",
        borderRadius: 24,
        padding: "22px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
    },
    optionTextWrap: {
        display: "grid",
        gap: 6,
    },
    optionTitle: {
        fontSize: 18,
        fontWeight: 800,
        color: "#0f172a",
    },
    optionText: {
        fontSize: 14,
        color: "#64748b",
        lineHeight: 1.5,
    },
    form: {
        display: "grid",
        gap: 16,
    },
    formGroup: {
        display: "grid",
        gap: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: 800,
        color: "#334155",
    },
    input: {
        height: 48,
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        padding: "0 14px",
        fontSize: 15,
        outline: "none",
    },
    textarea: {
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        padding: 14,
        fontSize: 15,
        outline: "none",
        resize: "vertical",
        minHeight: 120,
    },
    errorText: {
        color: "#dc2626",
        fontSize: 13,
        fontWeight: 600,
    },
    errorBanner: {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
    },
    successBanner: {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
    },
    actions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        marginTop: 4,
    },
    secondaryBtn: {
        border: "none",
        background: "#e5e7eb",
        color: "#0f172a",
        padding: "10px 16px",
        borderRadius: 10,
        fontWeight: 700,
        cursor: "pointer",
    },
    primaryBtn: {
        border: "none",
        color: "#ffffff",
        padding: "10px 16px",
        borderRadius: 10,
        fontWeight: 800,
        cursor: "pointer",
    },
};