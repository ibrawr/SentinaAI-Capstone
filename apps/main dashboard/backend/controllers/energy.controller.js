/**
 * Handles energy consumption data, latest-day summaries, sustainability KPI snapshots,
 * anomaly summaries, and 24-hour energy metrics for the main dashboard sustainability views.
 */
const sustainabilityDb = require("../dbs/sustainability.db");
const analyticsDb = require("../dbs/analytics.db");
const coreDb = require("../dbs/core.db");

exports.getEnergyConsumption = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
    const result = await sustainabilityDb.query(
      `
      SELECT
        ts,
        venue_id,
        zone_id,
        hall_id,
        source,
        device_id,
        metadata,
        hvac_energy_kwh,
        energy_kwh::float8 AS energy_kwh
      FROM energy_consumption
      ORDER BY ts DESC
      LIMIT $1
      `,
      [limit]
    );
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.getTopHallsLatestDay = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 50);
    const zoneId = req.query.zone_id || null;
    const source = req.query.source || null;

    const q = `
      WITH latest AS (
        SELECT MAX(ts) AS max_ts FROM energy_consumption
      ),
      bounds AS (
        SELECT
          date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai' AS start_ts,
          (date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') + interval '1 day') AT TIME ZONE 'Asia/Dubai' AS end_ts
        FROM latest
      )
      SELECT
        ec.hall_id,
        ec.zone_id,
        SUM(ec.energy_kwh)::float8 AS total_kwh,
        COUNT(*)::int AS records
      FROM energy_consumption ec
      CROSS JOIN bounds b
      WHERE ec.ts >= b.start_ts
        AND ec.ts <  b.end_ts
        AND ec.hall_id IS NOT NULL
        AND ($1::text IS NULL OR ec.zone_id = $1)
        AND ($2::text IS NULL OR ec.source = $2)
      GROUP BY ec.hall_id, ec.zone_id
      ORDER BY total_kwh DESC
      LIMIT $3;
    `;

    const result = await sustainabilityDb.query(q, [zoneId, source, limit]);
    res.json({
      ok: true,
      timezone: "Asia/Dubai",
      zone_id: zoneId,
      source,
      limit,
      rows: result.rows,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};


exports.getZonesLatestDay = async (req, res) => {
  try {
    const source = req.query.source || null;

    const q = `
      WITH latest AS (
        SELECT MAX(ts) AS max_ts FROM energy_consumption
      ),
      bounds AS (
        SELECT
          date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai' AS start_ts,
          (date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') + interval '1 day') AT TIME ZONE 'Asia/Dubai' AS end_ts
        FROM latest
      )
      SELECT
        ec.zone_id,
        SUM(ec.energy_kwh)::float8 AS total_kwh,
        COUNT(*)::int AS records
      FROM energy_consumption ec
      CROSS JOIN bounds b
      WHERE ec.ts >= b.start_ts
        AND ec.ts <  b.end_ts
        AND ec.zone_id IS NOT NULL
        AND ($1::text IS NULL OR ec.source = $1)
      GROUP BY ec.zone_id
      ORDER BY ec.zone_id ASC;
    `;

    const result = await sustainabilityDb.query(q, [source]);
    res.json({ ok: true, timezone: "Asia/Dubai", source, rows: result.rows || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};


exports.getSourcesLatestDay = async (req, res) => {
  try {
    const zoneId = req.query.zone_id || null;
    const limit = Math.min(parseInt(req.query.limit || "12", 10), 50);

    const q = `
      WITH latest AS (
        SELECT MAX(ts) AS max_ts FROM energy_consumption
      ),
      bounds AS (
        SELECT
          date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai' AS start_ts,
          (date_trunc('day', max_ts AT TIME ZONE 'Asia/Dubai') + interval '1 day') AT TIME ZONE 'Asia/Dubai' AS end_ts
        FROM latest
      )
      SELECT
        COALESCE(ec.source,'UNKNOWN') AS source,
        SUM(ec.energy_kwh)::float8 AS total_kwh,
        COUNT(*)::int AS records
      FROM energy_consumption ec
      CROSS JOIN bounds b
      WHERE ec.ts >= b.start_ts
        AND ec.ts <  b.end_ts
        AND ($1::text IS NULL OR ec.zone_id = $1)
      GROUP BY COALESCE(ec.source,'UNKNOWN')
      ORDER BY total_kwh DESC
      LIMIT $2;
    `;

    const result = await sustainabilityDb.query(q, [zoneId, limit]);
    res.json({ ok: true, timezone: "Asia/Dubai", zone_id: zoneId, rows: result.rows || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.getEnergyKpisLatest = async (req, res) => {
  try {
    const zoneId = req.query.zone_id || null;

    const tsQ = await analyticsDb.query(
      `
      SELECT MAX(ts) AS max_ts
      FROM interval_metrics
      WHERE ($1::text IS NULL OR zone_id = $1)
      `,
      [zoneId]
    );
    const ts = tsQ.rows?.[0]?.max_ts || null;
    if (!ts) return res.json({ ok: true, ts: null, kpis: {} });

    const k = await analyticsDb.query(
      `
      SELECT
        AVG(energy_efficiency_score)::float8 AS energy_efficiency_score,
        AVG(hvac_energy_kwh)::float8 AS hvac_energy_kwh,
        AVG(carbon_kg_co2)::float8 AS carbon_kg_co2
      FROM interval_metrics
      WHERE ts = $1
        AND ($2::text IS NULL OR zone_id = $2)
      `,
      [ts, zoneId]
    );

    const row = k.rows?.[0] || {};
    res.json({
      ok: true,
      ts,
      zone_id: zoneId,
      kpis: {
        energyEfficiencyScore: Number(row.energy_efficiency_score || 0),
        hvacLoadIndex: Number(row.hvac_energy_kwh || 0),
        carbonKgCO2: Number(row.carbon_kg_co2 || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.getSustAnomaliesSummary = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "6", 10), 20);
    const hours = Math.min(Math.max(parseInt(req.query.hours || "24", 10), 1), 168);

    const r = await coreDb.query(
      `
      SELECT
        COALESCE(r.rule_name, a.rule_key) AS label,
        COUNT(*)::int AS count
      FROM alerts a
      LEFT JOIN rules r ON r.rule_key = a.rule_key
      WHERE a.domain = 'SUSTAINABILITY'
        AND a.detected_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY COALESCE(r.rule_name, a.rule_key)
      ORDER BY count DESC
      LIMIT $2;
      `,
      [hours, limit]
    );

    res.json({ ok: true, hours, rows: r.rows || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.getEnergyKpis24h = async (req, res) => {
  try {
    const zoneId = req.query.zone_id || null;

    const q = `
      WITH bounds AS (
        SELECT NOW() - interval '24 hours' AS start_ts, NOW() AS end_ts
      )
      SELECT
        SUM(ec.energy_kwh)::float8 AS total_kwh_24h,
        MAX(ec.energy_kwh)::float8 AS peak_kwh_interval,
        SUM(ec.hvac_energy_kwh)::float8 AS hvac_kwh_24h,
        CASE 
          WHEN SUM(ec.energy_kwh) > 0 
          THEN (SUM(ec.hvac_energy_kwh) / SUM(ec.energy_kwh)) * 100
          ELSE 0
        END AS hvac_share_pct
      FROM energy_consumption ec
      CROSS JOIN bounds b
      WHERE ec.ts >= b.start_ts AND ec.ts <= b.end_ts
        AND ($1::text IS NULL OR ec.zone_id = $1);
    `;

    const r = await sustainabilityDb.query(q, [zoneId]);
    const row = r.rows?.[0] || {};

    res.json({
      ok: true,
      zone_id: zoneId,
      kpis: {
        totalKwh24h: Number(row.total_kwh_24h || 0),
        peakKwhInterval: Number(row.peak_kwh_interval || 0),
        hvacKwh24h: Number(row.hvac_kwh_24h || 0),
        hvacSharePct: Number(row.hvac_share_pct || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};