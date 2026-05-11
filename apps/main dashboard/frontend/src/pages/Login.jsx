/**
 * Displays the login page with email and password authentication, optional MFA
 * verification, session storage setup, login flash messaging, and role-based
 * navigation after successful sign-in. This page uses the auth login API,
 * React Router navigation, and Login.css styling for the login flow.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Login.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mfaRequired, setMfaRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const [flash, setFlash] = useState("");

  useEffect(() => {
    const msg = sessionStorage.getItem("loginFlash");
    if (msg) {
      setFlash(msg);
      sessionStorage.removeItem("loginFlash");
    }
  }, []);

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!mfaRequired) {
      if (!validateEmail(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!password) {
        setError("Password cannot be empty.");
        return;
      }
    } else {
      if (!totpCode || totpCode.length !== 6) {
        setError("Please enter the 6-digit code from your authenticator app.");
        return;
      }
    }

    setLoading(true);

    try {
      const payload = mfaRequired
        ? { email, password, totp_code: totpCode }
        : { email, password };

      const res = await axios.post(`${API_BASE}/auth/login`, payload);

      if (res.data.mfa_required) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      const { token, role, full_name, employee_id, email: accountEmail, last_active_at, exhibitor_id, exhibitor_name } = res.data;

      sessionStorage.setItem("token", token);
      window.dispatchEvent(new Event("sentina:login"));
      sessionStorage.setItem("role", role);
      sessionStorage.setItem("full_name", full_name);
      sessionStorage.setItem("employee_id", employee_id);
      sessionStorage.setItem("email", accountEmail || email);
      if (last_active_at) {
        sessionStorage.setItem("last_login", last_active_at);
      }
      if (exhibitor_id) {
        sessionStorage.setItem("exhibitor_id", exhibitor_id);
      } else {
        sessionStorage.removeItem("exhibitor_id");
      }
      if (exhibitor_name) {
        sessionStorage.setItem("exhibitor_name", exhibitor_name);
      } else {
        sessionStorage.removeItem("exhibitor_name");
      }

      switch (role) {
        case "super_admin":
          navigate("/admin");
          break;

        case "operations_manager":
          navigate("/operations");
          break;

        case "soc_analyst":
          navigate("/soc");
          break;

        case "sustainability_manager":
          navigate("/sustainability");
          break;

        case "exhibitor":
          navigate("/exhibitor");
          break;

        default:
          navigate("/");
      }
    } catch (err) {
      const backendMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Invalid email or password.";

      if (Array.isArray(backendMessage)) {
        setError(backendMessage.join(" "));
      } else {
        setError(backendMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (error) setError("");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-title">
          <span className="login-title-light">Sentina</span>
          <span className="login-title-bold">AI</span>
        </div>

        {flash && (
          <div
            style={{
              padding: "10px",
              marginBottom: "12px",
              borderRadius: "10px",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              fontWeight: 700,
            }}
          >
            {flash}
          </div>
        )}

        <form onSubmit={handleLogin}>
          {!mfaRequired ? (
            <>
              <input
                type="email"
                placeholder="Email"
                className="login-input"
                value={email}
                onChange={handleEmailChange}
              />

              <div className="password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="login-input"
                  value={password}
                  onChange={handlePasswordChange}
                />

                <span
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="login-mfa-hint">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                className="login-input login-input--otp"
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value.replace(/\D/g, ""));
                  if (error) setError("");
                }}
                autoFocus
                autoComplete="one-time-code"
              />
            </>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : mfaRequired ? "Verify" : "Login"}
          </button>

          {mfaRequired && (
            <button
              type="button"
              className="login-back-link"
              onClick={() => { setMfaRequired(false); setTotpCode(""); setError(""); }}
            >
              Back
            </button>
          )}
        </form>

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
