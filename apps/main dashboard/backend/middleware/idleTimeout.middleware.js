/**
 * Enforces session idle timeout by checking the last activity timestamp and
 * refreshing it for authenticated requests that still have a valid session token.
 */
const IDLE_TIMEOUT_MINUTES = 15;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

function idleTimeout(req, res, next) {
  const cookieToken = req.cookies?.token || req.cookies?.access_token;

  const headerAuth = req.headers.authorization;
  const headerToken =
    typeof headerAuth === "string" && headerAuth.startsWith("Bearer ")
      ? headerAuth.slice("Bearer ".length)
      : null;

  const token = cookieToken || headerToken;
  if (!token) return next();

  const now = Date.now();
  const last = Number(req.cookies?.last_activity || 0);

  if (last && now - last > IDLE_TIMEOUT_MS) {
    res.clearCookie("access_token");
    res.clearCookie("token");
    res.clearCookie("last_activity");

    return res.status(401).json({ error: "SESSION_EXPIRED" });
  }

  res.cookie("last_activity", String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: IDLE_TIMEOUT_MS + 5 * 60 * 1000
  });

  next();
}

module.exports = idleTimeout;