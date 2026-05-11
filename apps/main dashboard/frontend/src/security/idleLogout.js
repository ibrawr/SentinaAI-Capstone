/**
 * Manages client-side idle logout by tracking user activity, resetting an
 * inactivity timer, clearing session storage on timeout, and redirecting the
 * user back to the login page. This utility also listens for login events and
 * storage updates to start or refresh the idle session timer.
 */

const DEFAULT_IDLE_MS = 20 * 60 * 1000; // 20 mins

let timer = null;
let idleMs = DEFAULT_IDLE_MS;

const SESSION_KEYS = ["token", "role", "full_name", "employee_id", "email", "last_login", "exhibitor_id", "exhibitor_name"];

function isAuthenticated() {
  return !!sessionStorage.getItem("token");
}

function clearSession() {
  SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
}

function doLogout() {
  clearSession();
  sessionStorage.setItem("loginFlash", "Logged out due to inactivity.");
  window.location.assign("/");
}

export function markActivity() {
  if (!isAuthenticated()) return;

  if (timer) clearTimeout(timer);
  timer = setTimeout(doLogout, idleMs);
}

export function setIdleTimeoutMs(ms) {
  idleMs = ms;
  markActivity();
}

export function initIdleLogout() {
  const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
  events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
  window.addEventListener("focus", markActivity);

  window.addEventListener("storage", (e) => {
    if (e.key === "token" && e.newValue) {
      markActivity();
    }
  });

  window.addEventListener("sentina:login", markActivity);

  if (isAuthenticated()) markActivity();
}
