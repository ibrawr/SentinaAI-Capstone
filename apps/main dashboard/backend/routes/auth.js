/**
 * Handles authentication, login security, password changes, current user lookup,
 * and multi-factor authentication setup and management for the main dashboard.
 */

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const core = require("../dbs/core.db");
const authenticate = require("../middleware/auth.middleware");
const { validatePassword } = require("../security/passwordPolicy");
const { resolveExhibitorContext } = require("../utils/exhibitorAccess");

const router = express.Router();

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

router.post("/login", async (req, res) => {
  const { email, password, totp_code } = req.body;

  req.audit = {
    eventType: "AUTH_ATTEMPT",
    action: "LOGIN",
    attemptedEmail: email || null,
    extra: {
      route: "/auth/login",
    },
  };

  try {
    const result = await core.query(
      `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.password_hash,
        u.employee_id,
        u.failed_login_attempts,
        u.locked_until,
        u.last_failed_login_at,
        u.last_active_at,
        u.mfa_enabled,
        u.mfa_secret,
        r.role_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.user_id
      JOIN roles r ON r.role_id = ur.role_id
      WHERE u.email = $1
      AND u.status = 'active'
      `,
      [email]
    );

    if (result.rows.length === 0) {
      req.audit.authResult = "FAILED";
      req.audit.failureReason = "USER_NOT_FOUND_OR_INACTIVE";
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      req.audit.authResult = "FAILED";
      req.audit.userId = user.user_id;
      req.audit.role = user.role_name;
      req.audit.failureReason = "ACCOUNT_LOCKED";

      return res.status(401).json({
        error: `Account locked. Try again after ${new Date(user.locked_until).toLocaleString()}`,
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      const currentFailedAttempts = Number(user.failed_login_attempts || 0);
      const newFailedAttempts = currentFailedAttempts + 1;

      let newLockedUntil = null;

      if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        newLockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);

        await core.query(
          `
          UPDATE users
          SET 
            failed_login_attempts = $1,
            locked_until = $2,
            last_failed_login_at = CURRENT_TIMESTAMP
          WHERE user_id = $3
          `,
          [newFailedAttempts, newLockedUntil, user.user_id]
        );

        req.audit.authResult = "FAILED";
        req.audit.userId = user.user_id;
        req.audit.role = user.role_name;
        req.audit.failureReason = "ACCOUNT_LOCKED_AFTER_FAILED_ATTEMPTS";

        return res.status(401).json({
          error: `Account locked after too many failed attempts. Try again after ${newLockedUntil.toLocaleString()}`,
        });
      }

      await core.query(
        `
        UPDATE users
        SET 
          failed_login_attempts = $1,
          last_failed_login_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [newFailedAttempts, user.user_id]
      );

      req.audit.authResult = "FAILED";
      req.audit.userId = user.user_id;
      req.audit.role = user.role_name;
      req.audit.failureReason = "PASSWORD_MISMATCH";

      return res.status(401).json({ error: "Invalid credentials" });
    }

    await core.query(
      `
      UPDATE users 
      SET 
        last_active_at = CURRENT_TIMESTAMP,
        failed_login_attempts = 0,
        locked_until = NULL,
        last_failed_login_at = NULL
      WHERE user_id = $1
      `,
      [user.user_id]
    );

    if (user.mfa_enabled) {
      if (!totp_code) {
        return res.status(200).json({ mfa_required: true });
      }
      const valid = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: "base32",
        token: totp_code,
        window: 1,
      });
      if (!valid) {
        req.audit.authResult = "FAILED";
        req.audit.userId = user.user_id;
        req.audit.role = user.role_name;
        req.audit.failureReason = "TOTP_INVALID";
        return res.status(401).json({ error: "Invalid authentication code." });
      }
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const exhibitorContext =
      user.role_name === "exhibitor"
        ? await resolveExhibitorContext(user.user_id)
        : null;

    req.audit.authResult = "SUCCESS";
    req.audit.userId = user.user_id;
    req.audit.role = user.role_name;

    res.json({
      token,
      role: user.role_name,
      full_name: user.full_name,
      email: user.email,
      employee_id: user.employee_id,
      last_active_at: user.last_active_at,
      exhibitor_id: exhibitorContext?.exhibitor_id || null,
      exhibitor_name: exhibitorContext?.exhibitor_name || null,
    });
  } catch (err) {
    req.audit.authResult = "FAILED";
    req.audit.failureReason = "SERVER_ERROR";
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await core.query(
      `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.employee_id,
        u.last_active_at,
        u.mfa_enabled,
        r.role_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.user_id
      JOIN roles r ON r.role_id = ur.role_id
      WHERE u.user_id = $1
      AND u.status = 'active'
      LIMIT 1
      `,
      [req.user.user_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    const exhibitorContext =
      user.role_name === "exhibitor"
        ? await resolveExhibitorContext(user.user_id)
        : null;

    return res.json({
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      employee_id: user.employee_id,
      role: user.role_name,
      last_active_at: user.last_active_at,
      mfa_enabled: user.mfa_enabled,
      exhibitor_id: exhibitorContext?.exhibitor_id || null,
      exhibitor_name: exhibitorContext?.exhibitor_name || null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/change-password", authenticate, async (req, res) => {
  const userId = req.user.user_id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  req.audit = {
    ...(req.audit || {}),
    eventType: "AUTH_ATTEMPT",
    action: "CHANGE_PASSWORD",
    userId,
    role: req.user.role,
    extra: {
      route: "/auth/change-password",
      mode: currentPassword ? "current_password_verified" : "authenticated_session",
    },
  };

  if (!newPassword || !confirmPassword) {
    req.audit.authResult = "FAILED";
    req.audit.failureReason = "MISSING_REQUIRED_FIELDS";
    return res.status(400).json({ error: "newPassword and confirmPassword are required" });
  }

  if (newPassword !== confirmPassword) {
    req.audit.authResult = "FAILED";
    req.audit.failureReason = "PASSWORD_CONFIRMATION_MISMATCH";
    return res.status(400).json({ error: "New password and confirm password must match" });
  }

  try {
    const result = await core.query(
      `SELECT user_id, full_name, email, password_hash
       FROM users
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    if (!result.rows.length) {
      req.audit.authResult = "FAILED";
      req.audit.failureReason = "USER_NOT_FOUND";
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    if (currentPassword) {
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) {
        req.audit.authResult = "FAILED";
        req.audit.failureReason = "INVALID_CURRENT_PASSWORD";
        return res.status(401).json({ error: "Invalid current password" });
      }
    }

    const v = validatePassword(newPassword, { email: user.email, name: user.full_name });
    if (!v.ok) {
      req.audit.authResult = "FAILED";
      req.audit.failureReason = "PASSWORD_POLICY_FAILED";
      req.audit.extra = {
        ...(req.audit.extra || {}),
        passwordPolicyErrors: v.errors,
      };
      return res.status(400).json({ error: v.errors });
    }

    const same = await bcrypt.compare(newPassword, user.password_hash);
    if (same) {
      req.audit.authResult = "FAILED";
      req.audit.failureReason = "PASSWORD_REUSE";
      return res.status(400).json({ error: ["New password must be different from the old password."] });
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await core.query(
      `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
      [hashed, userId]
    );

    req.audit.authResult = "SUCCESS";

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    req.audit.authResult = "FAILED";
    req.audit.failureReason = "SERVER_ERROR";
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/test", (req, res) => {
  res.json({ message: "Auth route works" });
});

router.get("/mfa/setup", authenticate, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: "SentinaAI", length: 20 });
    await core.query(
      `UPDATE users SET mfa_secret = $1 WHERE user_id = $2`,
      [secret.base32, req.user.user_id]
    );
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qr });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/mfa/verify", authenticate, async (req, res) => {
  const { totp_code } = req.body;
  if (!totp_code) {
    return res.status(400).json({ error: "totp_code is required." });
  }
  try {
    const r = await core.query(
      `SELECT mfa_secret FROM users WHERE user_id = $1 AND status = 'active'`,
      [req.user.user_id]
    );
    if (!r.rows.length || !r.rows[0].mfa_secret) {
      return res.status(400).json({ error: "No pending MFA setup. Call /auth/mfa/setup first." });
    }
    const valid = speakeasy.totp.verify({
      secret: r.rows[0].mfa_secret,
      encoding: "base32",
      token: totp_code,
      window: 1,
    });
    if (!valid) {
      return res.status(400).json({ error: "Invalid code. Please try again." });
    }
    await core.query(
      `UPDATE users SET mfa_enabled = TRUE, mfa_enabled_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ message: "Two-factor authentication enabled successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/mfa/disable", authenticate, async (req, res) => {
  try {
    await core.query(
      `UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_enabled_at = NULL WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ message: "Two-factor authentication disabled." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
