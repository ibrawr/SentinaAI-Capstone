/**
 * Writes authentication and access audit records to the core database, capturing
 * request context such as IP address, user agent, request path, status, and
 * structured metadata for security and access tracking.
 */
const core = require("../dbs/core.db");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

async function logAudit({
  req,
  userId = null,
  eventType,
  action,
  statusCode = null,
  success = null,
  failureReason = null,
  attemptedEmail = null,
  metadata = {},
}) {
  try {
    await core.query(
      `
      INSERT INTO auth_access_audit_log (
        event_type,
        outcome,
        user_id,
        email,
        ip_address,
        user_agent,
        request_path,
        http_method,
        http_status,
        reason,
        metadata,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, CURRENT_TIMESTAMP
      )
      `,
      [
        eventType,
        success ? "SUCCESS" : "FAILED",
        userId,
        attemptedEmail,
        getClientIp(req),
        req.get("user-agent") || null,
        req.originalUrl,
        req.method,
        statusCode,
        failureReason || action || null,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (err) {
    console.error("[audit] failed to write audit log:", err.message);
  }
}

module.exports = {
  logAudit,
  getClientIp,
};