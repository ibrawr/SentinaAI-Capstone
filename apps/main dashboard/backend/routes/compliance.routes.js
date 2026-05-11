/**
 * Defines compliance-related API routes for consent recording, user data export,
 * audit log retention cleanup, and account data erasure for the main dashboard backend.
 */

const express = require("express");
const core = require("../dbs/core.db");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || "90", 10);
const CONSENT_VERSION = process.env.CONSENT_VERSION || "v1.0";

function requireSelfOrAdmin(req, res, next) {
  const targetId = parseInt(req.params.id, 10);
  if (req.user.role === "super_admin" || req.user.user_id === targetId) {
    return next();
  }
  return res.status(403).json({ error: "Forbidden" });
}

/* ================================================================
   POST /compliance/erase/:id
   GDPR Art.17 — Right to Erasure
   Anonymises all PII fields on the users row. Preserves the row so
   foreign-key references (audit logs, roles) remain intact.
================================================================= */
router.post("/erase/:id", authenticate, requireSelfOrAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  const client = await core.connect();
  try {
    await client.query("BEGIN");

    const check = await client.query(
      `SELECT u.user_id, r.role_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1`,
      [targetId]
    );

    if (!check.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    if (check.rows[0].role_name === "super_admin") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cannot erase a super_admin account" });
    }

    await client.query(
      `UPDATE users SET
         full_name             = 'ERASED_' || $1,
         email                 = 'erased_' || $1 || '@erased.invalid',
         employee_id           = 'ERASED_' || $1,
         password_hash         = 'ERASED',
         failed_login_attempts = 0,
         locked_until          = NULL,
         last_failed_login_at  = NULL,
         last_active_at        = NULL,
         consent_given_at      = NULL,
         consent_version       = NULL,
         status                = 'inactive'
       WHERE user_id = $1`,
      [targetId]
    );

    await client.query("COMMIT");
    return res.json({ message: "User data erased successfully", user_id: targetId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[compliance/erase]", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

/* ================================================================
   GET /compliance/export/:id
   GDPR Art.20 — Data Portability
   Returns the subject's own profile and their auth audit history as JSON.
================================================================= */
router.get("/export/:id", authenticate, requireSelfOrAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  try {
    const userResult = await core.query(
      `SELECT
         u.user_id,
         u.full_name,
         u.email,
         u.employee_id,
         u.status,
         u.created_at,
         u.last_active_at,
         u.consent_given_at,
         u.consent_version,
         r.role_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1`,
      [targetId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const auditResult = await core.query(
      `SELECT event_type, outcome, ip_address, request_path, http_method, created_at
       FROM auth_access_audit_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [targetId]
    );

    res.setHeader("Content-Disposition", `attachment; filename="gdpr_export_${targetId}.json"`);
    return res.json({
      exported_at: new Date().toISOString(),
      gdpr_article: "Art.20",
      subject: userResult.rows[0],
      audit_history: auditResult.rows,
    });
  } catch (err) {
    console.error("[compliance/export]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ================================================================
   DELETE /compliance/audit-log
   GDPR Art.5(1)(e) — Storage Limitation
   Purges auth_access_audit_log rows older than AUDIT_RETENTION_DAYS.
   super_admin only. Safe to call from a cron or manually.
================================================================= */
router.delete("/audit-log", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const result = await core.query(
      `DELETE FROM auth_access_audit_log WHERE created_at < $1::timestamptz`,
      [cutoff]
    );
    return res.json({
      message: "Audit log purged",
      deleted_rows: result.rowCount,
      cutoff,
      retention_days: AUDIT_RETENTION_DAYS,
    });
  } catch (err) {
    console.error("[compliance/audit-log purge]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ================================================================
   POST /compliance/consent/:id
   GDPR Art.7 — Record or refresh explicit consent for a user.
   super_admin only (consent is captured at account creation normally).
================================================================= */
router.post("/consent/:id", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const targetId = parseInt(req.params.id, 10);
  const version = req.body.consent_version || CONSENT_VERSION;

  try {
    const result = await core.query(
      `UPDATE users
       SET consent_given_at = CURRENT_TIMESTAMP,
           consent_version   = $1
       WHERE user_id = $2
       RETURNING user_id, consent_given_at, consent_version`,
      [version, targetId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ message: "Consent recorded", ...result.rows[0] });
  } catch (err) {
    console.error("[compliance/consent]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
