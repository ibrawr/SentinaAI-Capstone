/**
 * Handles user management, role lookup, assistant log retrieval, and super-admin
 * user administration actions for the main dashboard backend.
 */

const express = require("express");
const bcrypt = require("bcrypt");
const core = require("../dbs/core.db");
const authenticate = require("../middleware/auth.middleware");
const { validatePassword } = require("../security/passwordPolicy");

const router = express.Router();
const ASSISTANT_SERVICE_URL =
  process.env.ASSISTANT_SERVICE_URL || "http://127.0.0.1:8002";

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

function buildLogKey(row = {}, index = 0) {
  return [row.timestamp || "", row.session_id || "", row.user_id || "", index].join("::");
}

function normalizeLog(row = {}, index = 0, userNameMap = new Map(), exhibitorNameMap = new Map()) {
  const payload = row.entities && typeof row.entities === "object" ? row.entities : {};
  const resolvedUserName =
    row.user_name ||
    userNameMap.get(String(row.user_id || "")) ||
    exhibitorNameMap.get(String(row.user_id || "")) ||
    null;

  return {
    log_key: buildLogKey(row, index),
    timestamp: row.timestamp || null,
    session_id: row.session_id || "—",
    user_id: row.user_id || "—",
    user_name: resolvedUserName,
    display_user: resolvedUserName
      ? `${resolvedUserName} (${row.user_id || "—"})`
      : (row.user_id || "Unknown user"),
    role: row.role || "—",
    raw_query: row.raw_query || payload.analysis_type || "guided_action",
    analysis_type: payload.analysis_type || row.raw_query || "guided_action",
    intent: row.intent || payload.analysis_type || "—",
    response_status: row.response_status || "unknown",
    response_type: row.response_type || "—",
    summary: row.summary || "—",
    latency_ms: row.latency_ms ?? null,
    entities: payload,
    date_range:
      payload.start_date && payload.end_date
        ? `${payload.start_date} → ${payload.end_date}`
        : "—",
    scope_type: payload.scope_type || "—",
    zone_ids: Array.isArray(payload.zone_ids) ? payload.zone_ids : [],
    hall_ids: Array.isArray(payload.hall_ids) ? payload.hall_ids : [],
  };
}

router.get("/", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await core.query(`
      SELECT 
        u.user_id,
        u.full_name,
        u.email,
        u.employee_id,
        u.status,
        u.created_at,
        u.last_active_at,
        r.role_id,
        r.role_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.user_id
      JOIN roles r ON r.role_id = ur.role_id
      ORDER BY u.user_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/assistant-logs", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const [assistantRes, usersRes, exhibitorsRes] = await Promise.all([
      fetch(`${ASSISTANT_SERVICE_URL}/admin/ai/logs`),
      core.query(`
        SELECT employee_id, full_name
        FROM users
        WHERE employee_id IS NOT NULL
      `),
      core.query(`
        SELECT exhibitor_id::text AS external_id, exhibitor_name
        FROM exhibitors
      `).catch(() => ({ rows: [] })),
    ]);

    if (!assistantRes.ok) {
      const errorText = await assistantRes.text();
      return res.status(502).json({
        error: "Failed to load assistant logs",
        detail: errorText || `Assistant service returned ${assistantRes.status}`,
      });
    }

    const payload = await assistantRes.json();
    const rawLogs = Array.isArray(payload) ? payload : (payload?.rows || []);

    const userNameMap = new Map(
      (usersRes.rows || []).map((row) => [String(row.employee_id || ""), row.full_name])
    );
    const exhibitorNameMap = new Map(
      (exhibitorsRes.rows || []).map((row) => [String(row.external_id || ""), row.exhibitor_name])
    );

    const rows = rawLogs
      .map((row, index) => normalizeLog(row, index, userNameMap, exhibitorNameMap))
      .sort((a, b) => {
        const aTs = new Date(a.timestamp || 0).getTime();
        const bTs = new Date(b.timestamp || 0).getTime();
        return bTs - aTs;
      });

    res.json({ ok: true, rows });
  } catch (err) {
    console.error("Failed to fetch assistant logs:", err);
    res.status(500).json({ error: "Failed to load assistant logs" });
  }
});

router.get("/roles", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await core.query(`
      SELECT role_id, role_name
      FROM roles
      WHERE role_name != 'super_admin'
      ORDER BY role_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authenticate, requireSuperAdmin, async (req, res) => {
  const { full_name, email, password, role_id } = req.body;

  if (!full_name || !email || !password || !role_id) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const v = validatePassword(password, { email, name: full_name });
  if (!v.ok) {
      return res.status(400).json({ error: v.errors });
}

  const client = await core.connect();

  try {
    await client.query("BEGIN");

    const emailCheck = await client.query(
      `SELECT user_id FROM users WHERE email = $1`,
      [email]
    );

    if (emailCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Email already exists" });
    }

    const lastEmployee = await client.query(`
      SELECT employee_id
      FROM users
      WHERE employee_id LIKE 'ED-%'
      ORDER BY employee_id DESC
      LIMIT 1
    `);

    let nextNumber = 1;

    if (lastEmployee.rows.length > 0) {
      const lastId = lastEmployee.rows[0].employee_id; 
      const numeric = parseInt(lastId.split("-")[1]);
      nextNumber = numeric + 1;
    }

    const employee_id = `ED-${String(nextNumber).padStart(3, "0")}`;

    const hashed = await bcrypt.hash(password, 12);

    const userResult = await client.query(
      `INSERT INTO users
       (full_name, email, password_hash, employee_id, status, created_at, consent_given_at, consent_version)
       VALUES ($1,$2,$3,$4,'active',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5)
       RETURNING user_id`,
      [full_name, email, hashed, employee_id, process.env.CONSENT_VERSION || "v1.0"]
    );

    const userId = userResult.rows[0].user_id;

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1,$2)`,
      [userId, role_id]
    );

    await client.query("COMMIT");

    res.json({ message: "User created successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

router.put("/:id", authenticate, requireSuperAdmin, async (req, res) => {
  const { full_name, email, role_id } = req.body;

  if (!full_name || !email || !role_id) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    await core.query(
      `UPDATE users
       SET full_name = $1,
           email = $2
       WHERE user_id = $3`,
      [full_name, email, req.params.id]
    );

    await core.query(
      `UPDATE user_roles
       SET role_id = $1
       WHERE user_id = $2`,
      [role_id, req.params.id]
    );

    res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


router.delete("/:id", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const check = await core.query(
      `SELECT r.role_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1`,
      [req.params.id]
    );

    if (!check.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    if (check.rows[0].role_name === "super_admin") {
      return res.status(400).json({ error: "Cannot delete super admin" });
    }

    await core.query(`DELETE FROM users WHERE user_id = $1`, [
      req.params.id,
    ]);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
