/**
 * Handles booth filter options, booth listing, and booth assignment updates
 * for the main dashboard exhibitor management workflow.
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

exports.getBoothFilters = async (req, res) => {
  try {
    const eventIds = parseMulti(req.query.event_id);

    const [zones, halls, sizes, statuses] = await Promise.all([
      coreDb.query(
        `
        SELECT DISTINCT zone_id
        FROM booths
        WHERE zone_id IS NOT NULL
          AND (cardinality($1::text[]) = 0 OR event_id = ANY($1::text[]))
        ORDER BY zone_id;
        `,
        [eventIds]
      ),
      coreDb.query(
        `
        SELECT DISTINCT hall_id, zone_id
        FROM booths
        WHERE hall_id IS NOT NULL
          AND (cardinality($1::text[]) = 0 OR event_id = ANY($1::text[]))
        ORDER BY zone_id, hall_id;
        `,
        [eventIds]
      ),
      coreDb.query(
        `
        SELECT DISTINCT booth_size_type
        FROM booths
        WHERE booth_size_type IS NOT NULL
          AND (cardinality($1::text[]) = 0 OR event_id = ANY($1::text[]))
        ORDER BY booth_size_type;
        `,
        [eventIds]
      ),
      coreDb.query(
        `
        SELECT DISTINCT status
        FROM booth_assignments
        WHERE status IS NOT NULL
          AND (cardinality($1::text[]) = 0 OR event_id = ANY($1::text[]))
        ORDER BY status;
        `,
        [eventIds]
      ),
    ]);

    res.json({
      ok: true,
      zones: zones.rows.map((r) => r.zone_id),
      halls: halls.rows,
      boothSizeTypes: sizes.rows.map((r) => r.booth_size_type),
      assignmentStatuses: statuses.rows.map((r) => r.status),
      sortOptions: ["booth_code_asc", "booth_code_desc", "area_desc", "area_asc"],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.listBooths = async (req, res) => {
  try {
    const eventIds = parseMulti(req.query.event_id);
    const q = (req.query.q || "").trim();
    const zoneIds = parseMulti(req.query.zone_id);
    const hallIds = parseMulti(req.query.hall_id);
    const boothSizeTypes = parseMulti(req.query.booth_size_type);

    const assignedSelections = parseMulti(req.query.assigned);
    const assigned = assignedSelections.length === 1 ? assignedSelections[0] === "true" : null;

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSize = Math.min(Math.max(toInt(req.query.pageSize, 10), 1), 100);
    const offset = (page - 1) * pageSize;

    const sort = (req.query.sort || "booth_code_asc").toLowerCase();
    const sortSql = {
      booth_code_asc: `b.booth_code ASC`,
      booth_code_desc: `b.booth_code DESC`,
      area_desc: `b.booth_area_sqm DESC NULLS LAST`,
      area_asc: `b.booth_area_sqm ASC NULLS LAST`,
    }[sort] || `b.booth_code ASC`;

    const base = `
      FROM booths b
      LEFT JOIN booth_assignments ba
        ON ba.event_id = b.event_id AND ba.booth_id = b.booth_id
      LEFT JOIN exhibitors ex
        ON ex.exhibitor_id = ba.exhibitor_id
      LEFT JOIN halls h
        ON h.hall_id = b.hall_id
      LEFT JOIN zones z
        ON z.zone_id = b.zone_id
      WHERE (cardinality($1::text[]) = 0 OR b.event_id = ANY($1::text[]))
        AND (cardinality($2::text[]) = 0 OR b.zone_id = ANY($2::text[]))
        AND (cardinality($3::text[]) = 0 OR b.hall_id = ANY($3::text[]))
        AND (cardinality($4::text[]) = 0 OR b.booth_size_type = ANY($4::text[]))
        AND (
          $5::text = '' OR
          b.booth_id ILIKE '%' || $5 || '%' OR
          b.booth_code ILIKE '%' || $5 || '%' OR
          ex.exhibitor_name ILIKE '%' || $5 || '%' OR
          ex.exhibitor_id ILIKE '%' || $5 || '%'
        )
        AND (
          $6::bool IS NULL OR
          ($6 = true AND ba.exhibitor_id IS NOT NULL) OR
          ($6 = false AND ba.exhibitor_id IS NULL)
        )
    `;

    const countSql = `SELECT COUNT(*)::int AS total ${base};`;

    const dataSql = `
      SELECT
        b.event_id,
        b.booth_id,
        b.booth_code,
        b.zone_id,
        b.hall_id,
        h.hall_name,
        h.hall_role,
        b.booth_size_type,
        b.booth_area_sqm,
        ba.exhibitor_id,
        ex.exhibitor_name,
        ba.assigned_at,
        ba.status AS assignment_status,
        (ba.exhibitor_id IS NOT NULL) AS is_assigned
      ${base}
      ORDER BY ${sortSql}, b.booth_id ASC
      LIMIT $7 OFFSET $8;
    `;

    const params = [eventIds, zoneIds, hallIds, boothSizeTypes, q, assigned, pageSize, offset];

    const [countRes, dataRes] = await Promise.all([
      coreDb.query(countSql, params.slice(0, 6)),
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
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.assignBooth = async (req, res) => {
  try {
    const { event_id, booth_id, exhibitor_id } = req.body || {};
    if (!event_id || !booth_id || !exhibitor_id) {
      return res.status(400).json({ ok: false, error: "event_id, booth_id, exhibitor_id are required" });
    }

    const sql = `
      INSERT INTO booth_assignments (event_id, booth_id, exhibitor_id, assigned_at, status)
      VALUES ($1, $2, $3, NOW(), 'active')
      ON CONFLICT (event_id, booth_id)
      DO UPDATE SET exhibitor_id = EXCLUDED.exhibitor_id, assigned_at = NOW(), status = 'active'
      RETURNING event_id, booth_id, exhibitor_id, assigned_at, status;
    `;

    const r = await coreDb.query(sql, [event_id, booth_id, exhibitor_id]);
    res.json({ ok: true, assignment: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.unassignBooth = async (req, res) => {
  try {
    const { event_id, booth_id } = req.body || {};
    if (!event_id || !booth_id) {
      return res.status(400).json({ ok: false, error: "event_id and booth_id are required" });
    }

    const r = await coreDb.query(
      `DELETE FROM booth_assignments WHERE event_id = $1 AND booth_id = $2 RETURNING event_id, booth_id;`,
      [event_id, booth_id]
    );

    res.json({ ok: true, deleted: r.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
