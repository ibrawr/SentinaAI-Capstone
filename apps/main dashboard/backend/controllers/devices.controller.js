/**
 * Handles device listing and device filter data for the main dashboard by
 * querying device records, applying search and filter conditions, and
 * returning paginated results.
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

exports.listDevices = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const zoneIds = parseMulti(req.query.zone_id);
    const hallIds = parseMulti(req.query.hall_id);
    const deviceTypes = parseMulti(req.query.device_type);
    const statuses = parseMulti(req.query.status);

    const from = req.query.from || null;
    const to = req.query.to || null;

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSize = Math.min(Math.max(toInt(req.query.pageSize, 10), 1), 100);
    const offset = (page - 1) * pageSize;

    const sort = (req.query.sort || "last_seen_desc").toLowerCase();
    const sortSql = {
      last_seen_desc: `last_seen_ts DESC NULLS LAST`,
      last_seen_asc: `last_seen_ts ASC NULLS LAST`,
      deviceid_asc: `device_id ASC`,
      deviceid_desc: `device_id DESC`,
      status_asc: `status ASC NULLS LAST`,
      status_desc: `status DESC NULLS LAST`,
      type_asc: `device_type ASC NULLS LAST`,
      type_desc: `device_type DESC NULLS LAST`,
    }[sort] || `last_seen_ts DESC NULLS LAST`;

    const baseCTE = `
      WITH device_rows AS (
        SELECT
          d.deviceid AS device_id,
          d.devicetype AS device_type,
          d.macaddress AS mac_address,
          d.zoneid AS zone_id,
          d.hallid AS hall_id,
          d.connectededge AS connected_edge,
          d.status,
          NULLIF(d.installedat, '')::timestamptz AS installed_at,
          NULLIF(d.connectedat, '')::timestamptz AS connected_at,
          NULLIF(d.lastheartbeatat, '')::timestamptz AS last_seen_ts,
          dt.metric_type,
          di.is_active
        FROM devices d
        LEFT JOIN device_types dt
          ON dt.device_type = d.devicetype
        LEFT JOIN device_info di
          ON di.device_id = d.deviceid
        WHERE 1=1
          AND (cardinality($1::text[]) = 0 OR d.zoneid = ANY($1::text[]))
          AND (cardinality($2::text[]) = 0 OR d.hallid = ANY($2::text[]))
          AND (cardinality($3::text[]) = 0 OR d.devicetype = ANY($3::text[]))
          AND (cardinality($4::text[]) = 0 OR d.status = ANY($4::text[]))
          AND (
            $5::text = '' OR
            d.deviceid ILIKE '%' || $5 || '%' OR
            d.macaddress ILIKE '%' || $5 || '%' OR
            d.connectededge ILIKE '%' || $5 || '%'
          )
          AND ($6::timestamptz IS NULL OR NULLIF(d.lastheartbeatat,'')::timestamptz >= $6)
          AND ($7::timestamptz IS NULL OR NULLIF(d.lastheartbeatat,'')::timestamptz < $7)
      )
    `;

    const countQuery = `
      ${baseCTE}
      SELECT COUNT(*)::int AS total
      FROM device_rows;
    `;

    const dataQuery = `
      ${baseCTE}
      SELECT
        device_id,
        device_type,
        mac_address,
        zone_id,
        hall_id,
        connected_edge,
        status,
        installed_at,
        connected_at,
        last_seen_ts AS last_heartbeat_at,
        metric_type,
        is_active
      FROM device_rows
      ORDER BY ${sortSql}
      LIMIT $8 OFFSET $9;
    `;

    const params = [zoneIds, hallIds, deviceTypes, statuses, q, from, to, pageSize, offset];

    const [countRes, dataRes] = await Promise.all([
      coreDb.query(countQuery, params.slice(0, 7)),
      coreDb.query(dataQuery, params),
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

exports.getDeviceFilters = async (req, res) => {
  try {
    const [zones, halls, statuses, types] = await Promise.all([
      coreDb.query(`SELECT DISTINCT zoneid AS zone_id FROM devices WHERE zoneid IS NOT NULL ORDER BY zoneid;`),
      coreDb.query(`
        SELECT DISTINCT
          hallid AS hall_id,
          zoneid AS zone_id
        FROM devices
        WHERE hallid IS NOT NULL
        ORDER BY zoneid, hallid;
      `),
      coreDb.query(`SELECT DISTINCT status FROM devices WHERE status IS NOT NULL ORDER BY status;`),
      coreDb.query(`SELECT device_type, metric_type FROM device_types ORDER BY device_type;`),
    ]);

    res.json({
      ok: true,
      zones: zones.rows.map((r) => r.zone_id),
      halls: halls.rows,
      statuses: statuses.rows.map((r) => r.status),
      deviceTypes: types.rows,
      sortOptions: [
        "last_seen_desc",
        "last_seen_asc",
        "deviceid_asc",
        "deviceid_desc",
        "status_asc",
        "status_desc",
        "type_asc",
        "type_desc",
      ],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
