/**
 * Records access and authentication audit events for incoming requests by
 * capturing request context, response outcome, and failure details.
 */

const { logAudit } = require("../utils/auditLogger");

function shouldSkip(req) {
  if (req.path === "/health") return true;
  return false;
}

function getEventType(req) {
  if (req.originalUrl.startsWith("/auth/login")) return "AUTH_ATTEMPT";
  if (req.originalUrl.startsWith("/auth/change-password")) return "AUTH_ATTEMPT";
  return "ACCESS_ATTEMPT";
}

function getAction(req) {
  if (req.originalUrl.startsWith("/auth/login")) return "LOGIN";
  if (req.originalUrl.startsWith("/auth/change-password")) return "CHANGE_PASSWORD";
  if (req.originalUrl.startsWith("/users")) return "USER_MANAGEMENT_ACCESS";
  return "API_ACCESS";
}

module.exports = function accessAudit(req, res, next) {
  if (shouldSkip(req)) {
    return next();
  }

  res.on("finish", () => {
    const audit = req.audit || {};
    const userId = req.user?.user_id || audit.userId || null;
    const role = req.user?.role || audit.role || null;

    let failureReason = audit.failureReason || null;

    if (!failureReason && res.statusCode === 401) {
      failureReason = "UNAUTHORIZED";
    }

    if (!failureReason && res.statusCode === 403) {
      failureReason = "FORBIDDEN";
    }

    logAudit({
      req,
      userId,
      eventType: audit.eventType || getEventType(req),
      action: audit.action || getAction(req),
      resource: req.baseUrl || req.path,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      failureReason,
      attemptedEmail: audit.attemptedEmail || null,
      metadata: {
        role,
        tokenStatus: audit.tokenStatus || null,
        authResult: audit.authResult || null,
        extra: audit.extra || null,
      },
    });
  });

  next();
};