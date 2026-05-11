/**
 * Handles event filter data, event listing, event details, exhibitor data,
 * and booth data for the main dashboard event management views.
 */
const coreDb = require("../dbs/core.db");

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function parseMulti(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

exports.getEventFilters = async (req, res) => {
  try {
    const [venues, statuses] = await Promise.all([
      coreDb.query(`
        SELECT venue_id, venue_name
        FROM venues
        ORDER BY venue_id;
      `),
      coreDb.query(`
        SELECT DISTINCT status
        FROM events
        WHERE status IS NOT NULL
        ORDER BY status;
      `),
    ]);

    res.json({
      ok: true,
      venues: venues.rows,
      statuses: statuses.rows.map((row) => row.status),
      sortOptions: [
        "start_desc",
        "start_asc",
        "end_desc",
        "end_asc",
        "name_asc",
        "name_desc",
        "attendance_desc",
        "attendance_asc",
        "exhibitors_desc",
        "exhibitors_asc",
        "revenue_desc",
        "revenue_asc",
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listEvents = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const venueIds = parseMulti(req.query.venue_id);
    const statuses = parseMulti(req.query.status);
    const from = req.query.from || null;
    const to = req.query.to || null;

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSize = Math.min(Math.max(toInt(req.query.pageSize, 10), 1), 100);
    const offset = (page - 1) * pageSize;

    const sort = (req.query.sort || "start_desc").toLowerCase();
    const sortSql = {
      start_desc: `e.start_datetime_utc DESC NULLS LAST`,
      start_asc: `e.start_datetime_utc ASC NULLS LAST`,
      end_desc: `e.end_datetime_utc DESC NULLS LAST`,
      end_asc: `e.end_datetime_utc ASC NULLS LAST`,
      name_asc: `e.event_name ASC`,
      name_desc: `e.event_name DESC`,
      attendance_desc: `e.expected_attendance_total DESC NULLS LAST`,
      attendance_asc: `e.expected_attendance_total ASC NULLS LAST`,
      exhibitors_desc: `exhibitors_joined DESC NULLS LAST`,
      exhibitors_asc: `exhibitors_joined ASC NULLS LAST`,
      revenue_desc: `revenue_aed DESC NULLS LAST`,
      revenue_asc: `revenue_aed ASC NULLS LAST`,
    }[sort] || `e.start_datetime_utc DESC NULLS LAST`;

    const baseQuery = `
      FROM events e
      LEFT JOIN event_contacts ec ON ec.event_id = e.event_id
      LEFT JOIN venues v ON v.venue_id = e.venue_id
      LEFT JOIN (
        SELECT
          event_id,
          COUNT(*)::int AS exhibitors_joined,
          COALESCE(SUM(amount_paid_aed), 0)::float8 AS revenue_aed
        FROM event_exhibitors
        GROUP BY event_id
      ) ex ON ex.event_id = e.event_id
      WHERE 1=1
        AND (cardinality($1::text[]) = 0 OR e.venue_id = ANY($1::text[]))
        AND (cardinality($2::text[]) = 0 OR e.status = ANY($2::text[]))
        AND (
          $3::text = '' OR
          e.event_id ILIKE '%' || $3 || '%' OR
          e.event_name ILIKE '%' || $3 || '%'
        )
        AND ($4::timestamptz IS NULL OR e.start_datetime_utc >= $4)
        AND ($5::timestamptz IS NULL OR e.start_datetime_utc < $5)
    `;

    const countSql = `SELECT COUNT(*)::int AS total ${baseQuery};`;

    const dataSql = `
      SELECT
        e.event_id,
        e.venue_id,
        v.venue_name,
        e.event_name,
        e.status,
        e.start_datetime_utc,
        e.end_datetime_utc,
        e.expected_attendance_total,
        e.expected_exhibitors,
        e.created_at,
        e.updated_at,
        ec.person_in_charge_name,
        ec.person_in_charge_email,
        COALESCE(ex.exhibitors_joined, 0) AS exhibitors_joined,
        COALESCE(ex.revenue_aed, 0) AS revenue_aed
      ${baseQuery}
      ORDER BY ${sortSql}, e.event_id ASC
      LIMIT $6 OFFSET $7;
    `;

    const params = [venueIds, statuses, q, from, to, pageSize, offset];

    const [countRes, dataRes] = await Promise.all([
      coreDb.query(countSql, params.slice(0, 5)),
      coreDb.query(dataSql, params),
    ]);

    res.json({
      ok: true,
      page,
      pageSize,
      total: countRes.rows[0]?.total || 0,
      rows: dataRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        e.event_id,
        e.venue_id,
        v.venue_name,
        e.event_name,
        e.status,
        e.start_datetime_utc,
        e.end_datetime_utc,
        e.expected_attendance_total,
        e.expected_exhibitors,
        e.created_at,
        e.updated_at,
        ec.person_in_charge_name,
        ec.person_in_charge_email,
        COALESCE(ex.exhibitors_joined, 0) AS exhibitors_joined,
        COALESCE(ex.revenue_aed, 0) AS revenue_aed
      FROM events e
      LEFT JOIN event_contacts ec ON ec.event_id = e.event_id
      LEFT JOIN venues v ON v.venue_id = e.venue_id
      LEFT JOIN (
        SELECT
          event_id,
          COUNT(*)::int AS exhibitors_joined,
          COALESCE(SUM(amount_paid_aed), 0)::float8 AS revenue_aed
        FROM event_exhibitors
        GROUP BY event_id
      ) ex ON ex.event_id = e.event_id
      WHERE e.event_id = $1;
    `;

    const r = await coreDb.query(sql, [id]);

    if (!r.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getEventExhibitors = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    const sql = `
      SELECT
        e.exhibitor_id,
        e.exhibitor_name AS company,
        ec.contact_name AS name,
        ec.contact_phone,
        ba.booth_id,
        ba.status AS booth_status,
        ba.assigned_at
      FROM booth_assignments ba
      JOIN exhibitors e
        ON e.exhibitor_id = ba.exhibitor_id
      LEFT JOIN exhibitor_contacts ec
        ON ec.exhibitor_id = e.exhibitor_id
      WHERE LOWER(ba.event_id) = LOWER($1)
      ORDER BY e.exhibitor_name;
    `;

    const r = await coreDb.query(sql, [id]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getEventBooths = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        booth_id,
        hall_id,
        zone_id
      FROM booths
      WHERE event_id = $1
      ORDER BY booth_id;
    `;

    const r = await coreDb.query(sql, [id]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
