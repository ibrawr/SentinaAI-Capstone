/**
 * Renders the super admin page and manages all major admin workflows, including
 * user management, support issue review, assistant chat log monitoring, account
 * security settings, password and MFA flows, and admin modals for creating,
 * editing, and deleting users. This page is wrapped by AdminLayout and uses the
 * AdminSupportIssues component for support issue management.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import AdminLayout from "../layouts/AdminLayout";
import AdminSupportIssues from "../components/AdminSupportIssues";


const rule = (valid) => ({
  color: valid ? "#16a34a" : "#94a3b8",
  fontWeight: valid ? 600 : 400,
});

const formatRole = (role = "") =>
  String(role)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (date) =>
  date ? new Date(date).toLocaleString() : "—";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function prettyLabel(value) {
  return String(value || "guided_action")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusPillStyle(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCESS") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }
  if (normalized === "ERROR" || normalized === "FAILED") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }
  return {
    background: "#e2e8f0",
    color: "#334155",
    border: "1px solid #cbd5e1",
  };
}

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
    background: "rgba(30, 58, 93, 0.08)",
    color: "#1e3a5d",
    border: "1px solid rgba(30, 58, 93, 0.16)",
  };
}

function userStatusPillStyle(status) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "ACTIVE") {
    return {
      background: "rgba(22, 163, 74, 0.10)",
      color: "#166534",
      border: "1px solid rgba(22, 163, 74, 0.18)",
    };
  }

  if (normalized === "INACTIVE") {
    return {
      background: "rgba(148, 163, 184, 0.14)",
      color: "#475569",
      border: "1px solid rgba(148, 163, 184, 0.22)",
    };
  }

  return {
    background: "rgba(245, 158, 11, 0.10)",
    color: "#b45309",
    border: "1px solid rgba(245, 158, 11, 0.18)",
  };
}

export default function Admin() {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [assistantLogs, setAssistantLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");
  const [logsSearch, setLogsSearch] = useState("");
  const [logsRoleFilter, setLogsRoleFilter] = useState("ALL");
  const [logsStatusFilter, setLogsStatusFilter] = useState("ALL");
  const [openLogKeys, setOpenLogKeys] = useState({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [activeSection, setActiveSection] = useState("users");
  const [usersSearch, setUsersSearch] = useState("");
  const [issuesSearch, setIssuesSearch] = useState("");

  const [accountProfile, setAccountProfile] = useState({
    status: "idle",
    email:
      sessionStorage.getItem("email") ||
      localStorage.getItem("email") ||
      "superadmin@sentina.ai",
    full_name:
      sessionStorage.getItem("full_name") ||
      localStorage.getItem("full_name") ||
      "Super Admin",
    role:
      sessionStorage.getItem("role") ||
      localStorage.getItem("role") ||
      "super_admin",
    last_active_at:
      sessionStorage.getItem("last_login") ||
      localStorage.getItem("last_login") ||
      null,
    mfa_enabled: false,
  });

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordState, setPasswordState] = useState({
    status: "idle",
    message: "",
  });
  const [passwordVisibility, setPasswordVisibility] = useState({
    newPassword: false,
    confirmPassword: false,
  });

  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaState, setMfaState] = useState({
    status: "idle",
    message: "",
    qr: null,
    secret: null,
    code: "",
    enabled: false,
  });




  const formatLastActivity = (value) => {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const handlePasswordFieldChange = (key, value) => {
    setPasswordForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (passwordState.status !== "idle") {
      setPasswordState({ status: "idle", message: "" });
    }
  };

  const togglePasswordVisibility = (key) => {
    setPasswordVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const openPasswordModal = () => {
    setPasswordForm({ newPassword: "", confirmPassword: "" });
    setPasswordVisibility({ newPassword: false, confirmPassword: false });
    setPasswordState({ status: "idle", message: "" });
    setPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    if (passwordState.status === "submitting") return;
    setPasswordModalOpen(false);
    setPasswordVisibility({ newPassword: false, confirmPassword: false });
    setPasswordState({ status: "idle", message: "" });
  };

  const openMfaModal = async () => {
    setMfaModalOpen(true);
    setMfaState({
      status: "loading",
      message: "",
      qr: null,
      secret: null,
      code: "",
      enabled: false,
    });

    try {
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meData = await meRes.json();

      if (meData?.mfa_enabled) {
        setMfaState((s) => ({
          ...s,
          status: "ready",
          enabled: true,
        }));
        return;
      }

      const setupRes = await fetch(`${API_BASE}/auth/mfa/setup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const setupData = await setupRes.json();

      if (!setupRes.ok) {
        throw new Error(setupData?.error || "Could not load MFA setup");
      }

      setMfaState((s) => ({
        ...s,
        status: "ready",
        enabled: false,
        qr: setupData.qr,
        secret: setupData.secret,
      }));
    } catch {
      setMfaState((s) => ({
        ...s,
        status: "error",
        message: "Could not load MFA setup. Please try again.",
      }));
    }
  };

  const closeMfaModal = () => {
    if (mfaState.status === "submitting" || mfaState.status === "disabling") return;
    setMfaModalOpen(false);
    setMfaState({
      status: "idle",
      message: "",
      qr: null,
      secret: null,
      code: "",
      enabled: false,
    });
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();

    if (!mfaState.code || mfaState.code.length !== 6) {
      setMfaState((s) => ({
        ...s,
        status: "error",
        message: "Enter the 6-digit code from your authenticator app.",
      }));
      return;
    }

    setMfaState((s) => ({
      ...s,
      status: "submitting",
      message: "Verifying...",
    }));

    try {
      const res = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ totp_code: mfaState.code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Invalid code. Please try again.");
      }

      setMfaState((s) => ({
        ...s,
        status: "success",
        message: data.message || "Two-factor authentication enabled.",
        enabled: true,
      }));

      fetchAccountProfile();
    } catch (err) {
      setMfaState((s) => ({
        ...s,
        status: "error",
        message: err.message || "Invalid code. Please try again.",
        code: "",
      }));
    }
  };

  const handleMfaDisable = async () => {
    setMfaState((s) => ({
      ...s,
      status: "disabling",
      message: "Disabling...",
    }));

    try {
      const res = await fetch(`${API_BASE}/auth/mfa/disable`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Could not disable MFA.");
      }

      const setupRes = await fetch(`${API_BASE}/auth/mfa/setup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const setupData = await setupRes.json();

      setMfaState((s) => ({
        ...s,
        status: "ready",
        enabled: false,
        message: "",
        qr: setupData?.qr || null,
        secret: setupData?.secret || null,
        code: "",
      }));

      fetchAccountProfile();
    } catch {
      setMfaState((s) => ({
        ...s,
        status: "error",
        message: "Could not disable MFA. Please try again.",
      }));
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    const { newPassword, confirmPassword } = passwordForm;

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setPasswordState({
        status: "error",
        message: "Please complete both password fields.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordState({
        status: "error",
        message: "New password and confirm password must match.",
      });
      return;
    }

    setPasswordState({
      status: "submitting",
      message: "Updating password...",
    });

    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          Array.isArray(data?.error) ? data.error.join(" ") : data?.error || "Could not update password."
        );
      }

      setPasswordState({
        status: "success",
        message: data?.message || "Password changed successfully.",
      });

      setPasswordForm({ newPassword: "", confirmPassword: "" });
      setPasswordVisibility({ newPassword: false, confirmPassword: false });

      window.setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordState({ status: "idle", message: "" });
      }, 1200);
    } catch (error) {
      setPasswordState({
        status: "error",
        message: error.message || "Could not update password. Please try again.",
      });
    }
  };


  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role_id: "",
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setErrors((prevErrors) => {
      const updatedErrors = { ...prevErrors };

      if (field === "full_name" && value.trim()) {
        delete updatedErrors.full_name;
      }

      if (field === "email") {
        if (value.trim() && emailRegex.test(value)) {
          delete updatedErrors.email;
        }
      }

      if (field === "password") {
        const tempPasswordRules = {
          length: value.length >= 12,
          upper: /[A-Z]/.test(value),
          lower: /[a-z]/.test(value),
          number: /\d/.test(value),
          special: /[^A-Za-z0-9]/.test(value),
        };

        const valid = Object.values(tempPasswordRules).every(Boolean);
        if (value && valid) {
          delete updatedErrors.password;
        }
      }

      if (field === "role_id" && value) {
        delete updatedErrors.role_id;
      }

      delete updatedErrors.api;

      return updatedErrors;
    });
  };

  const fetchUsers = async () => {
    try {
      if (!token) {
        setUsers([]);
        setErrors((prev) => ({
          ...prev,
          api: "No auth token found. Please log in again.",
        }));
        return;
      }

      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch users:", data);
        setUsers([]);
        setErrors((prev) => ({
          ...prev,
          api: data?.error || "Failed to load users",
        }));
        return;
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setUsers([]);
      setErrors((prev) => ({
        ...prev,
        api: "Failed to load users",
      }));
    }
  };

  const fetchRoles = async () => {
    try {
      if (!token) {
        setRoles([]);
        setErrors((prev) => ({
          ...prev,
          api: "No auth token found. Please log in again.",
        }));
        return;
      }

      const res = await fetch(`${API_BASE}/users/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch roles:", data);
        setRoles([]);
        setErrors((prev) => ({
          ...prev,
          api: data?.error || "Failed to load roles",
        }));
        return;
      }

      setRoles(Array.isArray(data) ? data : []);

      if (Array.isArray(data) && data.length === 0) {
        setErrors((prev) => ({
          ...prev,
          api: "No assignable roles were returned by the backend.",
        }));
      }
    } catch (err) {
      console.error("Failed to fetch roles:", err);
      setRoles([]);
      setErrors((prev) => ({
        ...prev,
        api: "Failed to load roles",
      }));
    }
  };

  const fetchAccountProfile = async () => {
    try {
      if (!token) return;

      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) return;

      if (data?.email) sessionStorage.setItem("email", data.email);
      if (data?.full_name) sessionStorage.setItem("full_name", data.full_name);
      if (data?.role) sessionStorage.setItem("role", data.role);
      if (data?.last_active_at) sessionStorage.setItem("last_login", data.last_active_at);

      setAccountProfile({
        status: "ready",
        email: data?.email || "superadmin@sentina.ai",
        full_name: data?.full_name || "Super Admin",
        role: data?.role || "super_admin",
        last_active_at: data?.last_active_at || null,
        mfa_enabled: Boolean(data?.mfa_enabled),
      });
    } catch (err) {
      console.error("Failed to fetch account profile:", err);
    }
  };

  const fetchAssistantLogs = async () => {
    try {
      if (!token) {
        setAssistantLogs([]);
        setLogsError("No auth token found. Please log in again.");
        setLogsLoading(false);
        return;
      }

      setLogsLoading(true);
      const res = await fetch(`${API_BASE}/users/assistant-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setAssistantLogs([]);
        setLogsError(data?.error || "Failed to load assistant logs");
        return;
      }

      setAssistantLogs(Array.isArray(data?.rows) ? data.rows : []);
      setLogsError("");
    } catch (err) {
      console.error("Failed to fetch assistant logs:", err);
      setAssistantLogs([]);
      setLogsError("Failed to load assistant logs");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchAssistantLogs();
    fetchAccountProfile();



    const logsTimer = setInterval(fetchAssistantLogs, 15000);
    return () => clearInterval(logsTimer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (mfaModalOpen) {
          closeMfaModal();
          return;
        }
        if (passwordModalOpen) {
          closePasswordModal();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mfaModalOpen, passwordModalOpen]);

  const passwordRules = {
    length: form.password.length >= 12,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    number: /\d/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password),
  };

  const isPasswordValid = Object.values(passwordRules).every(Boolean);

  const logsRoleOptions = useMemo(() => {
    const values = Array.from(
      new Set(assistantLogs.map((row) => String(row.role || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [assistantLogs]);

  const logsStatusOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        assistantLogs
          .map((row) => String(row.response_status || "").trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [assistantLogs]);

  const filteredAssistantLogs = useMemo(() => {
    const q = logsSearch.trim().toLowerCase();

    return assistantLogs.filter((row) => {
      const roleOk = logsRoleFilter === "ALL" || String(row.role || "") === logsRoleFilter;
      const statusOk =
        logsStatusFilter === "ALL" ||
        String(row.response_status || "").toUpperCase() === logsStatusFilter;

      if (!roleOk || !statusOk) return false;

      if (!q) return true;

      const haystack = [
        row.display_user,
        row.user_name,
        row.user_id,
        row.role,
        row.raw_query,
        row.analysis_type,
        row.intent,
        row.summary,
        row.session_id,
        row.date_range,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [assistantLogs, logsRoleFilter, logsSearch, logsStatusFilter]);

  const filteredUsers = useMemo(() => {
    const q = usersSearch.trim().toLowerCase();

    return users.filter((user) => {
      if (!q) return true;

      const haystack = [
        user.full_name,
        user.email,
        user.employee_id,
        user.role_name,
        user.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [users, usersSearch]);

  const toggleLogOpen = (logKey) => {
    setOpenLogKeys((prev) => ({
      ...prev,
      [logKey]: !prev[logKey],
    }));
  };

  const handleCreateUser = async () => {
    const newErrors = {};

    if (!form.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(form.email)) {
      newErrors.email = "Enter a valid email address";
    }

    if (!form.password) {
      newErrors.password = "Password is required";
    } else if (!isPasswordValid) {
      newErrors.password = "Password does not meet requirements";
    }

    if (!form.role_id) {
      newErrors.role_id = "Please select a role";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        const apiMsg = Array.isArray(data.error)
          ? data.error.join(" | ")
          : data.error || "Failed to create user";

        setErrors({ api: apiMsg });
        return;
      }

      setShowAddModal(false);
      setForm({ full_name: "", email: "", password: "", role_id: "" });
      setShowPassword(false);
      setErrors({});
      fetchUsers();
    } catch (err) {
      console.error("Failed to create user:", err);
      setErrors({ api: "Failed to create user" });
    }
  };

  const handleUpdateUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/users/${selectedUser.user_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: selectedUser.full_name,
          email: selectedUser.email,
          role_id: selectedUser.role_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors((prev) => ({
          ...prev,
          api: data?.error || "Failed to update user",
        }));
        return;
      }

      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      setErrors((prev) => ({
        ...prev,
        api: "Failed to update user",
      }));
    }
  };

  const handleDeleteUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/users/${selectedUser.user_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors((prev) => ({
          ...prev,
          api: data?.error || "Failed to delete user",
        }));
        return;
      }

      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setErrors((prev) => ({
        ...prev,
        api: "Failed to delete user",
      }));
    }
  };

  return (
    <AdminLayout>
      <div style={styles.sectionTabsWrap}>
        <button
          type="button"
          onClick={() => setActiveSection("users")}
          style={{
            ...styles.sectionTab,
            ...(activeSection === "users" ? styles.sectionTabActive : {}),
          }}
        >
          User Management
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("issues")}
          style={{
            ...styles.sectionTab,
            ...(activeSection === "issues" ? styles.sectionTabActive : {}),
          }}
        >
          Support Issues
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("logs")}
          style={{
            ...styles.sectionTab,
            ...(activeSection === "logs" ? styles.sectionTabActive : {}),
          }}
        >
          Assistant Chat Logs
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("settings")}
          style={{
            ...styles.sectionTab,
            ...(activeSection === "settings" ? styles.sectionTabActive : {}),
          }}
        >
          Settings
        </button>
      </div>

      {activeSection === "users" && (
        <>
          <div style={styles.headerRow}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0f172a" }}>
                User Management
              </h2>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                Manage platform users, access roles, and account activity.
              </p>
            </div>
            <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
              + Add User
            </button>
          </div>

          <div style={styles.sectionSearchRow}>
            <input
              type="text"
              placeholder="Search by name, email, ID, role, or status"
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
              style={styles.sectionSearchInput}
            />
          </div>

          {errors.api && !showAddModal && !showEditModal && (
            <div style={styles.errorBanner}>{errors.api}</div>
          )}

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, minWidth: 220 }}>Name</th>
                  <th style={{ ...styles.th, minWidth: 280 }}>Email</th>
                  <th style={{ ...styles.th, minWidth: 200 }}>Role</th>
                  <th style={{ ...styles.th, minWidth: 140 }}>Status</th>
                  <th style={{ ...styles.th, minWidth: 190 }}>Created</th>
                  <th style={{ ...styles.th, minWidth: 190 }}>Last Active</th>
                  <th style={{ ...styles.th, minWidth: 120, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr
                    key={user.user_id}
                    style={index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
                  >
                    <td style={styles.td}>
                      <div style={styles.primaryText}>{user.full_name}</div>
                      <div style={styles.userMetaText}>{user.employee_id || "—"}</div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.secondaryTextStrong}>{user.email}</div>
                    </td>

                    <td style={styles.td}>
                      <span style={{ ...styles.softPill, ...rolePillStyle(user.role_name) }}>
                        {formatRole(user.role_name)}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <span style={{ ...styles.softPill, ...userStatusPillStyle(user.status) }}>
                        {user.status}
                      </span>
                    </td>

                    <td style={{ ...styles.td, ...styles.cellDate }}>
                      {formatDate(user.created_at)}
                    </td>

                    <td style={{ ...styles.td, ...styles.cellDate }}>
                      {formatDate(user.last_active_at)}
                    </td>

                    <td style={{ ...styles.td, ...styles.actionsCell }}>
                      {user.role_name !== "super_admin" && (
                        <button
                          style={styles.editBtn}
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditModal(true);
                            setErrors({});
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeSection === "issues" && <AdminSupportIssues />}

      {activeSection === "logs" && (
        <section style={styles.logsSection}>
          <div style={styles.logsHeaderRow}>
            <div>
              <h2 style={styles.logsTitle}>Rule-Based Assistant Chat Logs</h2>
              <p style={styles.logsSubtitle}>
                All assistant interactions across operations, sustainability, SOC, and exhibitor users.
              </p>
            </div>
            <div style={styles.logsCountBadge}>{assistantLogs.length} total</div>
          </div>

          <div style={styles.logsFiltersRow}>
            <input
              style={styles.logsSearchInput}
              placeholder="Search by user, query, summary, role, or session"
              value={logsSearch}
              onChange={(e) => setLogsSearch(e.target.value)}
            />

            <select
              style={styles.logsSelect}
              value={logsRoleFilter}
              onChange={(e) => setLogsRoleFilter(e.target.value)}
            >
              {logsRoleOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All roles" : formatRole(option)}
                </option>
              ))}
            </select>

            <select
              style={styles.logsSelect}
              value={logsStatusFilter}
              onChange={(e) => setLogsStatusFilter(e.target.value)}
            >
              {logsStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All statuses" : prettyLabel(option)}
                </option>
              ))}
            </select>
          </div>

          {logsError ? <div style={styles.errorBanner}>{logsError}</div> : null}

          <div style={styles.logsTableWrap}>
            <table style={styles.logsTable}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 180 }}>Time</th>
                  <th style={{ ...styles.th, width: 240 }}>User</th>
                  <th style={{ ...styles.th, width: 160 }}>Role</th>
                  <th style={{ ...styles.th, width: 260 }}>Query</th>
                  <th style={{ ...styles.th, width: 140 }}>Status</th>
                  <th style={{ ...styles.th, minWidth: 420 }}>Summary</th>
                  <th style={{ ...styles.th, width: 200 }}>Session</th>
                  <th style={{ ...styles.th, width: 120, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr>
                    <td colSpan={8} style={styles.logsEmptyCell}>Loading assistant logs…</td>
                  </tr>
                ) : filteredAssistantLogs.length ? (
                  filteredAssistantLogs.map((row) => (
                    <Fragment key={row.log_key}>
                      <tr>
                        <td style={styles.logsCellTop}>{formatDate(row.timestamp)}</td>
                        <td style={styles.logsCellTop}>
                          <div style={styles.userCellPrimary}>{row.user_name || row.user_id || "Unknown user"}</div>
                          <div style={styles.userCellSecondary}>{row.user_id || "—"}</div>
                        </td>
                        <td style={{ ...styles.logsCellTop, ...styles.logsCenterCell }}>
                          <span style={{ ...styles.softPill, ...rolePillStyle(row.role) }}>
                            {formatRole(row.role)}
                          </span>
                        </td>
                        <td style={styles.logsCellTop}>
                          <div style={styles.logQueryTitle}>{prettyLabel(row.analysis_type || row.raw_query)}</div>
                          <div style={styles.logQueryRange}>{row.date_range || "—"}</div>
                        </td>
                        <td style={{ ...styles.logsCellTop, ...styles.logsCenterCell }}>
                          <span style={{ ...styles.statusPill, ...statusPillStyle(row.response_status) }}>
                            {prettyLabel(row.response_status)}
                          </span>
                        </td>
                        <td style={styles.logsCellTop}>
                          <div style={styles.summaryClamp}>{row.summary || "—"}</div>
                        </td>
                        <td style={{ ...styles.logsCellTop, ...styles.logsSessionCell }}>
                          <div style={styles.sessionText}>{row.session_id || "—"}</div>
                        </td>
                        <td style={{ ...styles.logsCellTop, ...styles.logsActionCell }}>
                          <button
                            type="button"
                            style={styles.detailsBtn}
                            onClick={() => toggleLogOpen(row.log_key)}
                          >
                            {openLogKeys[row.log_key] ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {openLogKeys[row.log_key] ? (
                        <tr>
                          <td colSpan={8} style={styles.logDetailsCell}>
                            <div style={styles.logDetailGrid}>
                              <div>
                                <div style={styles.logDetailLabel}>Intent</div>
                                <div style={styles.logDetailValue}>{row.intent || "—"}</div>
                              </div>
                              <div>
                                <div style={styles.logDetailLabel}>Response type</div>
                                <div style={styles.logDetailValue}>{row.response_type || "—"}</div>
                              </div>
                              <div>
                                <div style={styles.logDetailLabel}>Scope</div>
                                <div style={styles.logDetailValue}>{row.scope_type || "—"}</div>
                              </div>
                              <div>
                                <div style={styles.logDetailLabel}>Latency</div>
                                <div style={styles.logDetailValue}>
                                  {row.latency_ms !== null && row.latency_ms !== undefined
                                    ? `${row.latency_ms} ms`
                                    : "—"}
                                </div>
                              </div>
                            </div>

                            <div style={styles.logJsonWrap}>
                              <div style={styles.logDetailLabel}>Payload</div>
                              <pre style={styles.logJson}>{JSON.stringify(row.entities || {}, null, 2)}</pre>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={styles.logsEmptyCell}>No assistant logs found for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "settings" && (
        <section style={styles.settingsSection}>
          <div style={styles.settingsHeaderRow}>
            <div>
              <div style={styles.settingsEyebrow}>SUPER ADMIN PREFERENCES</div>
              <h2 style={styles.settingsTitle}>Dashboard Settings</h2>
              <p style={styles.settingsSubtitle}>
                Control admin dashboard behaviour and account session settings.
              </p>
            </div>
          </div>


          <div style={styles.settingsGrid}>
            <div style={styles.settingsCard}>
              <h3 style={styles.settingsCardTitle}>Account & session</h3>
              <p style={styles.settingsCardText}>
                Cloud-linked account details for the current admin session.
              </p>

              <div style={styles.settingsActionRow}>
                <button type="button" style={styles.settingsActionBtn} onClick={openPasswordModal}>
                  Change Password
                </button>
                <button type="button" style={styles.settingsActionBtn} onClick={openMfaModal}>
                  {accountProfile.mfa_enabled ? "Manage Two-Factor Authentication" : "Two-Factor Authentication"}
                </button>
              </div>

              <div style={styles.settingsInfoGrid}>
                <div style={styles.settingsInfoBlock}>
                  <div style={styles.settingsInfoLabel}>SIGNED IN AS</div>
                  <div style={styles.settingsReadonlyBox}>
                    {accountProfile.email || "superadmin@sentina.ai"}
                  </div>
                </div>

                <div style={styles.settingsInfoBlock}>
                  <div style={styles.settingsInfoLabel}>ROLE</div>
                  <div style={styles.settingsReadonlyBox}>
                    {formatRole(accountProfile.role || "super_admin")}
                  </div>
                </div>

                <div style={styles.settingsInfoBlock}>
                  <div style={styles.settingsInfoLabel}>LAST ACTIVITY</div>
                  <div style={styles.settingsReadonlyBox}>
                    {formatLastActivity(accountProfile.last_active_at)}
                  </div>
                </div>

                <div style={styles.settingsInfoBlock}>
                  <div style={styles.settingsInfoLabel}>SESSION TIMEOUT</div>
                  <div style={styles.settingsReadonlyBox}>
                    20 minutes of inactivity
                  </div>
                  <div style={styles.settingsHintText}>
                    After timeout, re-authentication is required.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {passwordModalOpen && (
        <div
          style={styles.settingsSubModalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordModal();
          }}
        >
          <div style={styles.settingsSubModal} role="dialog" aria-modal="true">
            <div style={styles.settingsSubModalHeader}>
              <div>
                <div style={styles.settingsEyebrowAdmin}>ACCOUNT SECURITY</div>
                <h2 style={styles.settingsSubModalTitle}>Change Password</h2>
                <p style={styles.settingsSubModalText}>
                  Update your password for the current SentinaAI account.
                </p>
              </div>
              <button
                type="button"
                style={styles.settingsModalClose}
                onClick={closePasswordModal}
                aria-label="Close change password dialog"
              >
                ×
              </button>
            </div>

            <form style={styles.settingsSubModalBody} onSubmit={handlePasswordSubmit}>
              <div style={styles.settingsFieldBlock}>
                <div style={styles.settingsInfoLabel}>NEW PASSWORD</div>
                <div style={styles.settingsPasswordInputWrap}>
                  <input
                    type={passwordVisibility.newPassword ? "text" : "password"}
                    style={styles.settingsInputWithAction}
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordFieldChange("newPassword", e.target.value)}
                    placeholder="Enter your new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    style={styles.settingsPasswordToggle}
                    onClick={() => togglePasswordVisibility("newPassword")}
                  >
                    {passwordVisibility.newPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div style={styles.settingsFieldBlock}>
                <div style={styles.settingsInfoLabel}>CONFIRM PASSWORD</div>
                <div style={styles.settingsPasswordInputWrap}>
                  <input
                    type={passwordVisibility.confirmPassword ? "text" : "password"}
                    style={styles.settingsInputWithAction}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordFieldChange("confirmPassword", e.target.value)}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    style={styles.settingsPasswordToggle}
                    onClick={() => togglePasswordVisibility("confirmPassword")}
                  >
                    {passwordVisibility.confirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div style={styles.settingsPasswordRules}>
                <div style={styles.settingsInfoLabel}>PASSWORD REQUIREMENTS</div>
                <ul style={styles.settingsPasswordRulesList}>
                  <li>At least 12 characters</li>
                  <li>Include uppercase, lowercase, number, and symbol</li>
                  <li>Must not include your name or email</li>
                </ul>
              </div>

              {passwordState.message ? (
                <div
                  style={{
                    ...styles.settingsPasswordMessage,
                    ...(passwordState.status === "error"
                      ? styles.settingsPasswordMessageError
                      : passwordState.status === "success"
                        ? styles.settingsPasswordMessageSuccess
                        : styles.settingsPasswordMessageNeutral),
                  }}
                >
                  {passwordState.message}
                </div>
              ) : null}

              <div style={styles.settingsSubModalActions}>
                <button
                  type="button"
                  style={styles.settingsGhostButtonModal}
                  onClick={closePasswordModal}
                  disabled={passwordState.status === "submitting"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.settingsPrimaryButtonAdmin}
                  disabled={passwordState.status === "submitting"}
                >
                  {passwordState.status === "submitting" ? "Saving..." : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mfaModalOpen && (
        <div
          style={styles.settingsSubModalOverlay}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              mfaState.status !== "submitting" &&
              mfaState.status !== "disabling"
            ) {
              closeMfaModal();
            }
          }}
        >
          <div style={styles.settingsSubModal} role="dialog" aria-modal="true">
            <div style={styles.settingsSubModalHeader}>
              <div>
                <div style={styles.settingsEyebrowPink}>ACCOUNT SECURITY</div>
                <h2 style={styles.settingsSubModalTitle}>Two-Factor Authentication</h2>
                <p style={styles.settingsSubModalText}>
                  {mfaState.enabled
                    ? "Your account is protected with an authenticator app."
                    : "Scan the QR code with Google Authenticator or any TOTP app."}
                </p>
              </div>
              <button
                type="button"
                style={styles.settingsModalClose}
                onClick={closeMfaModal}
                aria-label="Close two-factor authentication dialog"
              >
                ×
              </button>
            </div>

            <div style={styles.settingsSubModalBody}>
              {mfaState.status === "loading" && (
                <div style={styles.settingsInlineStatus}>Loading…</div>
              )}

              {!mfaState.enabled && mfaState.status !== "loading" && mfaState.qr ? (
                <form onSubmit={handleMfaVerify}>
                  <div style={styles.settingsQrWrap}>
                    <img
                      src={mfaState.qr}
                      alt="Scan with your authenticator app"
                      style={styles.settingsQrImage}
                    />
                  </div>

                  <p style={styles.settingsManualKey}>
                    Manual entry key: <code style={{ userSelect: "all" }}>{mfaState.secret}</code>
                  </p>

                  <div style={styles.settingsFieldBlock}>
                    <div style={styles.settingsInfoLabel}>VERIFICATION CODE</div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      style={styles.settingsMfaCodeInput}
                      value={mfaState.code}
                      onChange={(e) =>
                        setMfaState((s) => ({
                          ...s,
                          code: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      autoFocus
                      autoComplete="one-time-code"
                    />
                  </div>

                  {mfaState.message ? (
                    <div
                      style={{
                        ...styles.settingsPasswordMessage,
                        ...(mfaState.status === "error"
                          ? styles.settingsPasswordMessageError
                          : mfaState.status === "success"
                            ? styles.settingsPasswordMessageSuccess
                            : styles.settingsPasswordMessageNeutral),
                      }}
                    >
                      {mfaState.message}
                    </div>
                  ) : null}

                  <div style={styles.settingsSubModalActions}>
                    <button
                      type="button"
                      style={styles.settingsGhostButtonModal}
                      onClick={closeMfaModal}
                      disabled={mfaState.status === "submitting"}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={styles.settingsPrimaryButtonPink}
                      disabled={mfaState.status === "submitting"}
                    >
                      {mfaState.status === "submitting" ? "Verifying..." : "Activate 2FA"}
                    </button>
                  </div>
                </form>
              ) : null}

              {!mfaState.enabled && mfaState.status === "error" && !mfaState.qr ? (
                <div style={{ ...styles.settingsPasswordMessage, ...styles.settingsPasswordMessageError }}>
                  {mfaState.message}
                </div>
              ) : null}

              {mfaState.enabled && mfaState.status !== "loading" ? (
                <div>
                  <div style={styles.settingsSecuritySummary}>
                    <div>
                      <div style={styles.settingsMiniLabel}>STATUS</div>
                      <strong>Active — authenticator app enrolled</strong>
                    </div>
                  </div>

                  {mfaState.message ? (
                    <div
                      style={{
                        ...styles.settingsPasswordMessage,
                        ...(mfaState.status === "error"
                          ? styles.settingsPasswordMessageError
                          : mfaState.status === "success"
                            ? styles.settingsPasswordMessageSuccess
                            : styles.settingsPasswordMessageNeutral),
                      }}
                    >
                      {mfaState.message}
                    </div>
                  ) : null}

                  <div style={styles.settingsSubModalActions}>
                    <button
                      type="button"
                      style={styles.settingsGhostButtonPinkModal}
                      onClick={closeMfaModal}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      style={styles.settingsDangerButton}
                      onClick={handleMfaDisable}
                      disabled={mfaState.status === "disabling"}
                    >
                      {mfaState.status === "disabling" ? "Disabling..." : "Disable 2FA"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h2>Create New User</h2>

            <input
              style={styles.modalInput}
              placeholder="Full Name"
              value={form.full_name}
              onChange={(e) => handleChange("full_name", e.target.value)}
            />
            {errors.full_name && (
              <div style={styles.errorText}>{errors.full_name}</div>
            )}

            <input
              style={styles.modalInput}
              placeholder="Email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
            {errors.email && (
              <div style={styles.errorText}>{errors.email}</div>
            )}

            <div style={styles.passwordWrap}>
              <input
                style={styles.modalInputFlex}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={form.password}
                onChange={(e) => handleChange("password", e.target.value)}
              />
              <button
                type="button"
                style={styles.showBtn}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && (
              <div style={styles.errorText}>{errors.password}</div>
            )}

            {roles.length === 0 && (
              <div style={styles.errorText}>
                No roles loaded from backend. Check /users/roles response.
              </div>
            )}

            <select
              style={styles.modalInput}
              value={form.role_id}
              onChange={(e) => handleChange("role_id", e.target.value)}
            >
              <option value="">Select Role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {formatRole(role.role_name)}
                </option>
              ))}
            </select>
            {errors.role_id && (
              <div style={styles.errorText}>{errors.role_id}</div>
            )}

            {errors.api && (
              <div style={styles.errorText}>{errors.api}</div>
            )}

            <div style={styles.passwordRulesBox}>
              <div style={rule(passwordRules.length)}>Minimum 12 characters</div>
              <div style={rule(passwordRules.upper)}>1 uppercase letter</div>
              <div style={rule(passwordRules.lower)}>1 lowercase letter</div>
              <div style={rule(passwordRules.number)}>1 number</div>
              <div style={rule(passwordRules.special)}>1 special character (., @, $, etc.)</div>
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setErrors({});
                }}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button onClick={handleCreateUser} style={styles.saveBtn}>
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedUser && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h2>Edit User</h2>

            <input
              style={styles.modalInput}
              value={selectedUser.full_name}
              onChange={(e) =>
                setSelectedUser({
                  ...selectedUser,
                  full_name: e.target.value,
                })
              }
            />

            <input
              style={styles.modalInput}
              value={selectedUser.email}
              onChange={(e) =>
                setSelectedUser({
                  ...selectedUser,
                  email: e.target.value,
                })
              }
            />

            <select
              style={styles.modalInput}
              value={selectedUser.role_id}
              onChange={(e) =>
                setSelectedUser({
                  ...selectedUser,
                  role_id: e.target.value,
                })
              }
            >
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {formatRole(role.role_name)}
                </option>
              ))}
            </select>

            {errors.api && (
              <div style={styles.errorText}>{errors.api}</div>
            )}

            <div style={styles.modalActionsBetween}>
              <button style={styles.deleteBtn} onClick={handleDeleteUser}>
                Delete
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    setErrors({});
                  }}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button onClick={handleUpdateUser} style={styles.saveBtn}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

const styles = {
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    gap: 16,
    flexWrap: "wrap",
  },
  sectionTabsWrap: {
    display: "flex",
    gap: 12,
    marginBottom: 28,
    flexWrap: "wrap",
  },

  sectionTab: {
    border: "1px solid #dbe4ee",
    background: "#ffffff",
    color: "#334155",
    padding: "12px 18px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  },

  sectionTabActive: {
    background: "#1e3a5d",
    color: "#ffffff",
    border: "1px solid #1e3a5d",
    boxShadow: "0 10px 24px rgba(30, 58, 93, 0.20)",
  },

  sectionSearchRow: {
    width: "100%",
    marginBottom: 20,
  },

  sectionSearchInput: {
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
  addBtn: {
    background: "#1e3a5d",
    color: "white",
    border: "none",
    padding: "12px 20px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
    boxShadow: "0 10px 24px rgba(30, 58, 93, 0.20)",
  },
  editBtn: {
    background: "#1e3a5d",
    color: "white",
    border: "none",
    padding: "9px 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    boxShadow: "0 8px 18px rgba(30, 58, 93, 0.18)",
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
    minWidth: 1120,
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
  tableRowEven: {
    background: "#ffffff",
  },
  tableRowOdd: {
    background: "#fbfdff",
  },
  primaryText: {
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.35,
    fontSize: 16,
  },
  userMetaText: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
    lineHeight: 1.4,
  },
  secondaryTextStrong: {
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
  cellDate: {
    whiteSpace: "normal",
    color: "#334155",
    fontWeight: 500,
    lineHeight: 1.55,
    minWidth: 160,
  },
  actionsCell: {
    textAlign: "right",
    whiteSpace: "nowrap",
    minWidth: 110,
  },
  logsSection: {
    marginTop: 32,
    border: "1px solid #dbe4ee",
    borderRadius: 24,
    padding: 26,
    background: "linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
  },
  logsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  logsTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: "#0f172a",
  },
  logsSubtitle: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: 15,
    lineHeight: 1.5,
  },
  logsCountBadge: {
    background: "rgba(30, 58, 93, 0.08)",
    color: "#1e3a5d",
    border: "1px solid rgba(30, 58, 93, 0.16)",
    borderRadius: 999,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
  },
  logsFiltersRow: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 2fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr)",
    gap: 14,
    marginBottom: 20,
  },
  logsSearchInput: {
    height: 48,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    padding: "0 16px",
    background: "#fff",
    fontSize: 15,
    color: "#0f172a",
    outline: "none",
    boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  logsSelect: {
    minWidth: 180,
    height: 48,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    background: "#fff",
    fontSize: 15,
    color: "#0f172a",
    outline: "none",
  },
  logsTableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid #dbe4ee",
    borderRadius: 20,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
  },
  logsTable: {
    width: "100%",
    minWidth: 1320,
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  logsCellTop: {
    verticalAlign: "top",
    padding: "18px 20px",
    borderBottom: "1px solid #eef3f8",
  },
  logsActionCell: {
    textAlign: "right",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  logsSessionCell: {
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  logsCenterCell: {
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  logQueryTitle: {
    fontWeight: 800,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.35,
    marginBottom: 8,
  },

  logQueryRange: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.45,
  },
  userCellPrimary: {
    fontWeight: 800,
    color: "#0f172a",
    marginBottom: 6,
    lineHeight: 1.35,
    fontSize: 15,
  },
  userCellSecondary: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.4,
    marginTop: 6,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  sessionText: {
    fontSize: 12,
    color: "#475569",
    fontFamily: "monospace",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "8px 12px",
    display: "inline-flex",
    alignItems: "center",
    minHeight: 36,
    maxWidth: 190,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailsBtn: {
    background: "#1e3a5d",
    color: "#ffffff",
    border: "none",
    padding: "8px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    boxShadow: "0 8px 18px rgba(30, 58, 93, 0.16)",
  },
  logsEmptyCell: {
    textAlign: "center",
    padding: 22,
    color: "#64748b",
  },
  logDetailsCell: {
    background: "#f8fafc",
    padding: 18,
    borderTop: "1px solid #e2e8f0",
  },
  logDetailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  logDetailLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  logDetailValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
  },
  logJsonWrap: {
    marginTop: 8,
  },
  logJson: {
    margin: 0,
    background: "#0f172a",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  modal: {
    background: "white",
    padding: 30,
    borderRadius: 22,
    width: "min(720px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.20)",
    border: "1px solid #e5edf5",
  },
  passwordWrap: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 110px",
    gap: 12,
    alignItems: "center",
  },
  showBtn: {
    height: 48,
    background: "#eef2f7",
    border: "1px solid #dbe3ee",
    padding: "0 16px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
    color: "#334155",
  },
  passwordRulesBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: 18,
    borderRadius: 16,
    fontSize: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    lineHeight: 1.5,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  modalActionsBetween: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 20,
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
  saveBtn: {
    background: "#4da851",
    color: "white",
    border: "none",
    padding: "10px 18px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 800,
  },
  deleteBtn: {
    background: "#dc2626",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 4,
  },
  errorBanner: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    padding: "10px 14px",
    borderRadius: 10,
    marginBottom: 16,
  },
  modalInput: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 15,
    color: "#0f172a",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
  },

  modalInputFlex: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 15,
    color: "#0f172a",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
  },

  successBanner: {
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "10px 14px",
    borderRadius: 10,
    marginBottom: 16,
  },

  settingsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  settingsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
  },

  settingsEyebrow: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 32,
    padding: "0 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    color: "#1e3a5d",
    background: "rgba(30, 58, 93, 0.08)",
    border: "1px solid rgba(30, 58, 93, 0.14)",
    marginBottom: 16,
  },

  settingsTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: "#0f172a",
  },

  settingsSubtitle: {
    margin: "8px 0 0",
    fontSize: 14,
    color: "#64748b",
  },

  settingsHeaderActions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  settingsGhostBtn: {
    height: 48,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid #d7dee8",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  settingsPrimaryBtn: {
    height: 48,
    padding: "0 18px",
    borderRadius: 14,
    border: "none",
    background: "#1e3a5d",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(30, 58, 93, 0.16)",
  },

  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 20,
  },

  settingsCard: {
    background: "#ffffff",
    border: "1px solid #dbe4ee",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  settingsCardTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
    color: "#1e3a5d",
  },

  settingsCardText: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },

  settingsField: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  settingsLabel: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    color: "#64748b",
  },

  settingsSelect: {
    height: 52,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    padding: "0 16px",
    background: "#ffffff",
    fontSize: 15,
    color: "#0f172a",
    outline: "none",
  },

  settingsActionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 2,
    marginBottom: 2,
  },

  settingsInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },

  settingsInfoBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  settingsInfoLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },

  settingsActionBtn: {
    minHeight: 46,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#1e3a5d",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  settingsHintText: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.45,
    marginTop: 2,
  },

  settingsSubModalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 3100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "rgba(15, 23, 42, 0.5)",
    backdropFilter: "blur(4px)",
  },

  settingsSubModal: {
    width: "min(560px, calc(100vw - 40px))",
    maxHeight: "calc(100vh - 40px)",
    overflowY: "auto",
    borderRadius: 24,
    border: "1px solid rgba(255, 255, 255, 0.6)",
    background: "#f6f7fb",
    boxShadow: "0 28px 80px rgba(15, 23, 42, 0.28)",
    color: "#0f172a",
    padding: "4px 20px 22px",
  },

  settingsSubModalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "22px 20px 0",
    margin: "0 -20px",
  },

  settingsEyebrowAdmin: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 30,
    padding: "0 12px",
    borderRadius: 999,
    background: "rgba(30, 58, 93, 0.1)",
    color: "#1e3a5d",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },

  settingsSubModalTitle: {
    margin: "14px 0 8px",
    fontSize: 28,
    fontWeight: 900,
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    color: "#0f172a",
  },

  settingsSubModalText: {
    maxWidth: 740,
    margin: 0,
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 1.6,
  },

  settingsModalClose: {
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    position: "relative",
    zIndex: 20,
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1,
  },

  settingsSubModalBody: {
    padding: "18px 20px 20px",
    margin: "0 -20px",
    display: "flex",
    flexDirection: "column",
  },

  settingsFieldBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },

  settingsPasswordInputWrap: {
    position: "relative",
  },

  settingsInputWithAction: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    padding: "0 84px 0 14px",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    fontWeight: 700,
    background: "#fff",
    color: "#0f172a",
    outline: "none",
  },

  settingsPasswordToggle: {
    position: "absolute",
    top: "50%",
    right: 12,
    transform: "translateY(-50%)",
    border: 0,
    background: "transparent",
    color: "#1e3a5d",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    lineHeight: 1,
    padding: 0,
  },

  settingsPasswordRules: {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
  },

  settingsPasswordRulesList: {
    margin: "8px 0 0",
    paddingLeft: 18,
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.6,
  },

  settingsPasswordMessage: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },

  settingsPasswordMessageError: {
    background: "rgba(239, 68, 68, 0.1)",
    color: "#991b1b",
    border: "1px solid rgba(239, 68, 68, 0.18)",
  },

  settingsPasswordMessageSuccess: {
    background: "rgba(16, 185, 129, 0.12)",
    color: "#065f46",
    border: "1px solid rgba(16, 185, 129, 0.2)",
  },

  settingsPasswordMessageNeutral: {
    background: "rgba(59, 130, 246, 0.1)",
    color: "#1d4ed8",
    border: "1px solid rgba(59, 130, 246, 0.18)",
  },

  settingsSubModalActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 14,
  },

  settingsGhostButtonModal: {
    minHeight: 46,
    padding: "0 16px",
    borderRadius: 14,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#0f172a",
  },

  settingsPrimaryButtonAdmin: {
    minHeight: 46,
    padding: "0 16px",
    borderRadius: 14,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    border: "1px solid #1e3a5d",
    background: "#1e3a5d",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.08)",
  },

  settingsDangerButton: {
    minHeight: 46,
    padding: "0 16px",
    borderRadius: 14,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    border: "1px solid #b91c1c",
    background: "#b91c1c",
    color: "#fff",
  },

  settingsQrWrap: {
    textAlign: "center",
    marginBottom: 16,
  },

  settingsQrImage: {
    width: 180,
    height: 180,
  },

  settingsManualKey: {
    fontSize: 12,
    color: "#666",
    marginBottom: 12,
  },

  settingsMfaCodeInput: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#0f172a",
    outline: "none",
    letterSpacing: "0.3em",
    textAlign: "center",
    fontSize: 20,
    fontWeight: 700,
  },

  settingsInlineStatus: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: 700,
  },

  settingsSecuritySummary: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },

  settingsMiniLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },


  settingsReadonlyBox: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
    fontSize: 14,
    fontWeight: 700,
  },
};
