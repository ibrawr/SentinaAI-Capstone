/**
 * Configures Axios request and response interceptors to attach session tokens,
 * clear expired sessions, and redirect users after inactivity logout.
 */

import axios from "axios";

const SESSION_KEYS = ["token", "role", "full_name", "employee_id", "email", "last_login", "exhibitor_id", "exhibitor_name"];

function clearSession() {
  SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
}

axios.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axios.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const code = err?.response?.data?.error;

    if (status === 401 && code === "SESSION_EXPIRED") {
      clearSession();
      sessionStorage.setItem("loginFlash", "Logged out due to inactivity.");
      window.location.assign("/");
    }

    return Promise.reject(err);
  }
);
