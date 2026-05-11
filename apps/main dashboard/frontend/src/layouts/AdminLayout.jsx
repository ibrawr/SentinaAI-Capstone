/**
 * Provides the super admin layout shell for dashboard pages, including the top bar,
 * user profile display, logout flow, and shared page container. This layout uses
 * React Router navigation and the LogoutConfirmModal component to handle sign-out.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LogoutConfirmModal from "../components/LogoutConfirmModal";

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const fullName = localStorage.getItem("full_name");
  const role = localStorage.getItem("role");
  const employeeId = localStorage.getItem("employee_id");

  const formattedRole = role
    ? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const handleLogoutConfirm = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("full_name");
    localStorage.removeItem("employee_id");

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("role");
    sessionStorage.removeItem("full_name");
    sessionStorage.removeItem("employee_id");

    navigate("/login");
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <span style={styles.brandLight}>Sentina</span>
          <span style={styles.brandBold}>AI</span>
        </div>

        <div style={styles.rightSection}>
          <div style={styles.profileInfo}>
            <div style={styles.name}>{fullName || "Super Admin"}</div>
            <div style={styles.meta}>{formattedRole}</div>
          </div>

          <div style={styles.avatar}>
            {fullName ? fullName.charAt(0).toUpperCase() : "A"}
          </div>

          <button onClick={handleLogoutClick} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.contentWrapper}>
        <div style={styles.contentCard}>
          <h1 style={styles.title}>Super Admin Dashboard</h1>
          <div style={styles.divider} />
          {children}
        </div>
      </div>

      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        accentColor="#1e3a5d"
        roleLabel="Super Admin Dashboard"
      />
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "#f4f6fb",
    display: "flex",
    flexDirection: "column",
  },

  topBar: {
    height: 72,
    background: "#1e3a5d",
    color: "white",
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 6px 18px rgba(30, 58, 93, 0.18)",
  },

  brand: {
    fontSize: 22,
    letterSpacing: -0.5,
    display: "flex",
    alignItems: "baseline",
    fontFamily: "'Oxanium', sans-serif",
  },

  brandLight: {
    fontWeight: 500,
  },

  brandBold: {
    fontWeight: 800,
  },

  rightSection: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  profileInfo: {
    textAlign: "right",
  },

  name: {
    fontWeight: 700,
    fontSize: 14,
  },

  meta: {
    fontSize: 12,
    opacity: 0.8,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: "#e9456f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 16,
    boxShadow: "0 6px 14px rgba(233, 69, 111, 0.24)",
  },

  logoutBtn: {
    background: "#e9456f",
    border: "none",
    color: "white",
    padding: "9px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(233, 69, 111, 0.20)",
  },

  contentWrapper: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    padding: "28px 14px",
  },

  contentCard: {
    width: "100%",
    maxWidth: 1680,
    background: "white",
    borderRadius: 22,
    padding: 28,
    boxShadow: "0 12px 34px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5edf5",
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
    color: "#0f172a",
  },

  divider: {
    height: 1,
    background: "#e5e7eb",
    margin: "20px 0 30px 0",
  },
};