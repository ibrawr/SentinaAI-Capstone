/**
 * Validates JWT bearer tokens, attaches authenticated user data to the request,
 * and records token validation results for request auditing.
 */

const jwt = require("jsonwebtoken");

module.exports = function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.audit = {
      ...(req.audit || {}),
      eventType: "AUTH_ATTEMPT",
      action: "TOKEN_VALIDATION",
      authResult: "FAILED",
      tokenStatus: "MISSING",
      failureReason: "MISSING_BEARER_TOKEN",
    };

    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    req.audit = {
      ...(req.audit || {}),
      eventType: "ACCESS_ATTEMPT",
      action: "TOKEN_VALIDATION",
      userId: decoded.user_id,
      role: decoded.role,
      authResult: "SUCCESS",
      tokenStatus: "VALID",
    };

    next();
  } catch (err) {
    req.audit = {
      ...(req.audit || {}),
      eventType: "AUTH_ATTEMPT",
      action: "TOKEN_VALIDATION",
      authResult: "FAILED",
      tokenStatus: "INVALID",
      failureReason: "INVALID_TOKEN",
    };

    return res.status(401).json({ error: "Invalid token" });
  }
};