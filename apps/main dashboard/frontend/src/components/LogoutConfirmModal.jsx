export default function LogoutConfirmModal({
  open,
  onConfirm,
  onCancel,
  accentColor = "#1e3a5d",
  roleLabel = "Dashboard",
}) {
  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div
          style={{
            ...styles.iconWrap,
            background: `${accentColor}14`,
            border: `1px solid ${accentColor}33`,
            color: accentColor,
          }}
        >
          !
        </div>

        <h2 style={styles.title}>Log out?</h2>
        <p style={styles.subtitle}>
          Are you sure you want to log out of the {roleLabel}?
        </p>

        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={onCancel}>
            No
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...styles.confirmBtn,
              background: accentColor,
              boxShadow: `0 10px 24px ${accentColor}33`,
            }}
          >
            Yes, Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5000,
    padding: 20,
  },

  modal: {
    width: "min(460px, 100%)",
    background: "#ffffff",
    borderRadius: 22,
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.20)",
    padding: 28,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },

  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 24,
    marginBottom: 16,
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
    color: "#0f172a",
  },

  subtitle: {
    margin: "10px 0 0",
    fontSize: 15,
    lineHeight: 1.6,
    color: "#64748b",
    maxWidth: 360,
  },

  actions: {
    display: "flex",
    gap: 12,
    marginTop: 24,
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
  },

  cancelBtn: {
    minWidth: 120,
    height: 46,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#f8fafc",
    color: "#334155",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    padding: "0 18px",
  },

  confirmBtn: {
    minWidth: 150,
    height: 46,
    borderRadius: 12,
    border: "none",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    padding: "0 18px",
  },
};