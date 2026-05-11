/**
 * Provides exhibitor ownership and access-control helpers by resolving the
 * logged-in exhibitor context, enforcing ownership checks, and fetching the
 * exhibitor’s assigned events and booth details from the core database.
 */

const core = require("../dbs/core.db");

async function resolveExhibitorContext(userId) {
  if (!userId) return null;

  const result = await core.query(
    `
      SELECT
        e.exhibitor_id,
        e.exhibitor_name,
        ec.contact_email,
        u.email AS user_email
      FROM users u
      JOIN exhibitor_contacts ec
        ON LOWER(ec.contact_email) = LOWER(u.email)
      JOIN exhibitors e
        ON e.exhibitor_id = ec.exhibitor_id
      WHERE u.user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function requireOwnedExhibitorContext(req) {
  if (req.user?.role !== "exhibitor") return null;

  if (req.exhibitorContext) return req.exhibitorContext;

  const context = await resolveExhibitorContext(req.user?.user_id);
  if (!context?.exhibitor_id) {
    const error = new Error("No exhibitor profile is linked to the logged-in account.");
    error.statusCode = 403;
    throw error;
  }

  req.exhibitorContext = context;
  return context;
}

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

async function assertExhibitorOwnership(req, targetExhibitorId) {
  if (req.user?.role !== "exhibitor") return null;

  const context = await requireOwnedExhibitorContext(req);
  if (normalizeId(context.exhibitor_id) !== normalizeId(targetExhibitorId)) {
    const error = new Error("You can only access analytics for your own exhibitor profile.");
    error.statusCode = 403;
    throw error;
  }

  return context;
}

async function getOwnedEventAssignments(exhibitorId, eventId) {
  const result = await core.query(
    `
      SELECT
        ev.event_id,
        ev.event_name,
        ev.start_datetime_utc,
        ev.end_datetime_utc,
        b.booth_id,
        b.booth_code,
        h.hall_name,
        b.zone_id,
        b.hall_id
      FROM booth_assignments ba
      JOIN events ev
        ON ev.event_id = ba.event_id
      JOIN booths b
        ON b.booth_id = ba.booth_id
      LEFT JOIN halls h
        ON h.hall_id = b.hall_id
      WHERE ba.exhibitor_id = $1
        AND ba.event_id = $2
      ORDER BY h.hall_name ASC NULLS LAST, b.booth_code ASC
    `,
    [exhibitorId, eventId]
  );

  return result.rows;
}

module.exports = {
  resolveExhibitorContext,
  requireOwnedExhibitorContext,
  assertExhibitorOwnership,
  getOwnedEventAssignments,
};
