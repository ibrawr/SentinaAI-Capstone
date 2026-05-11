/**
 * Handles support issue creation, issue listing, and issue status updates
 * for the main dashboard support and admin issue management workflow.
 */

const coreDb = require("../dbs/core.db");

function normalizeRole(role = "") {
    return String(role || "").trim().toLowerCase();
}

exports.createIssue = async (req, res) => {
    try {
        const authUserId = req.user?.user_id ?? null;
        const { reason, details, source_section } = req.body;

        const cleanReason = String(reason || "").trim();
        const cleanDetails = String(details || "").trim();
        const cleanSourceSection = String(source_section || "").trim();

        if (!cleanReason) {
            return res.status(400).json({ error: "Reason is required." });
        }

        if (!cleanDetails) {
            return res.status(400).json({ error: "Please tell us more about the issue." });
        }

        if (cleanReason.length > 120) {
            return res.status(400).json({ error: "Reason must be 120 characters or less." });
        }

        if (cleanDetails.length < 10) {
            return res.status(400).json({ error: "Details must be at least 10 characters long." });
        }

        let fullName = req.user?.full_name || null;
        let email = req.user?.email || null;
        let employeeId = req.user?.employee_id || null;
        let roleName = req.user?.role || null;
        let userId = authUserId;

        if (authUserId) {
            const userResult = await coreDb.query(
                `
        SELECT
          u.user_id,
          u.full_name,
          u.email,
          u.employee_id,
          r.role_name
        FROM users u
        LEFT JOIN user_roles ur
          ON ur.user_id = u.user_id
        LEFT JOIN roles r
          ON r.role_id = ur.role_id
        WHERE u.user_id = $1
        LIMIT 1
        `,
                [authUserId]
            );

            const dbUser = userResult.rows[0];

            if (dbUser) {
                userId = dbUser.user_id;
                fullName = dbUser.full_name || fullName;
                email = dbUser.email || email;
                employeeId = dbUser.employee_id || employeeId;
                roleName = dbUser.role_name || roleName;
            }
        }

        const query = `
      INSERT INTO support_issues (
        user_id,
        employee_id,
        full_name,
        email,
        role_name,
        source_section,
        reason,
        details,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', NOW())
      RETURNING *
    `;

        const values = [
            userId,
            employeeId,
            fullName || "Unknown User",
            email,
            roleName,
            cleanSourceSection || null,
            cleanReason,
            cleanDetails,
        ];

        const { rows } = await coreDb.query(query, values);

        return res.status(201).json({
            message: "Issue submitted successfully.",
            issue: rows[0],
        });
    } catch (err) {
        return res.status(500).json({ error: "Failed to submit issue." });
    }
};

exports.getAllIssues = async (req, res) => {
    try {
        if (normalizeRole(req.user?.role) !== "super_admin") {
            return res.status(403).json({ error: "Admin access only." });
        }

        const query = `
      SELECT
        issue_id,
        user_id,
        full_name,
        email,
        role_name,
        source_section,
        reason,
        details,
        status,
        admin_notes,
        created_at,
        updated_at,
        resolved_at,
        resolved_by
      FROM support_issues
      ORDER BY created_at DESC
    `;

        const { rows } = await coreDb.query(query);
        return res.json({ rows });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch issues" });
    }
};

exports.resolveIssue = async (req, res) => {
  try {
    if (normalizeRole(req.user?.role) !== "super_admin") {
      return res.status(403).json({ error: "Admin access only." });
    }

    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const cleanStatus = String(status || "").trim().toUpperCase();
    const allowedStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

    if (!allowedStatuses.includes(cleanStatus)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const existing = await coreDb.query(
      `SELECT status FROM support_issues WHERE issue_id = $1`,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ error: "Issue not found." });
    }

    if (existing.rows[0].status === "CLOSED") {
      return res.status(400).json({
        error: "Closed issues cannot be modified.",
      });
    }


    const query = `
      UPDATE support_issues
      SET
        status = $1,
        admin_notes = $2,
        resolved_at = CASE 
          WHEN $1 IN ('RESOLVED', 'CLOSED') THEN NOW() 
          ELSE resolved_at 
        END,
        resolved_by = CASE 
          WHEN $1 IN ('RESOLVED', 'CLOSED') THEN $3 
          ELSE resolved_by 
        END,
        updated_at = NOW()
      WHERE issue_id = $4
      RETURNING *
    `;

    const { rows } = await coreDb.query(query, [
      cleanStatus,
      admin_notes ? String(admin_notes).trim() : null,
      req.user?.user_id ?? null,
      id,
    ]);

    return res.json({
      success: true,
      issue: rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update issue" });
  }
};