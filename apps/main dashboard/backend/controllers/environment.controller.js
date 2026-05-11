/**
 * Handles environment filter data, overview KPIs, zone comparisons, trend data,
 * and sustainability anomaly summaries for the main dashboard environment views.
 */

const analyticsDb = require("../dbs/analytics.db");
const coreDb = require("../dbs/core.db");

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function airQualityScore({ tempC, humidityPct, carbonAvg }) {
  const tempPenalty = Math.abs((tempC ?? 0) - 23) * 6.0;
  const humPenalty = Math.abs((humidityPct ?? 0) - 50) * 0.8;
  const carbonPenalty = (carbonAvg ?? 0) * 0.02;

  const raw = 100 - (tempPenalty + humPenalty + carbonPenalty);
  return Math.round(clamp(raw, 0, 100));
}

async function getLatestMetricsTs({ zoneId = null, hallId = null } = {}) {
  const r = await analyticsDb.query(
    `
    SELECT MAX(ts) AS max_ts
    FROM interval_metrics
    WHERE ($1::text IS NULL OR zone_id = $1)
      AND ($2::text IS NULL OR hall_id = $2)
    `,
    [zoneId, hallId]
  );

  return r.rows?.[0]?.max_ts || null;
}

async function getLatestAlertsTs(domain = "SUSTAINABILITY") {
  const r = await coreDb.query(
    `
    SELECT MAX(detected_at) AS max_ts
    FROM alerts
    WHERE domain = $1
    `,
    [domain]
  );

  return r.rows?.[0]?.max_ts || null;
}

function zeroOverview(hours, zoneId, hallId, windowEndTs = null) {
  return {
    ok: true,
    hours,
    window_end_ts: windowEndTs,
    filters: { zone_id: zoneId, hall_id: hallId },
    kpis: {
      air_quality_score: 0,
      avg_temp_c: 0,
      avg_humidity_pct: 0,
      avg_comfort_index: 0,
      avg_efficiency_score: 0,
      avg_carbon_kgco2: 0,
      total_carbon_kgco2: 0,
      min_temp_c: 0,
      max_temp_c: 0,
    },
  };
}

exports.getEnvironmentFilters = async (_req, res) => {
  try {
    const [zonesCore, zonesAnalytics] = await Promise.all([
      coreDb
        .query(
          `
          SELECT DISTINCT zone_id
          FROM zones
          WHERE zone_id IS NOT NULL
          ORDER BY zone_id ASC
          `
        )
        .catch(() => ({ rows: [] })),
      analyticsDb
        .query(
          `
          SELECT DISTINCT zone_id
          FROM interval_metrics
          WHERE zone_id IS NOT NULL
          ORDER BY zone_id ASC
          `
        )
        .catch(() => ({ rows: [] })),
    ]);

    const zones = Array.from(
      new Set(
        [
          ...(zonesCore.rows || []).map((r) => r.zone_id),
          ...(zonesAnalytics.rows || []).map((r) => r.zone_id),
        ].filter(Boolean)
      )
    ).sort();

    res.json({
      ok: true,
      zones,
      metrics: ["air_quality", "temperature", "humidity", "carbon", "efficiency", "comfort"],
      sort_options: ["desc", "asc"],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getEnvironmentOverview = async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const zoneId = req.query.zone_id || null;
    const hallId = req.query.hall_id || null;

    const endTs = await getLatestMetricsTs({ zoneId, hallId });
    if (!endTs) {
      return res.json(zeroOverview(hours, zoneId, hallId, null));
    }

    const r = await analyticsDb.query(
      `
      WITH bounds AS (
        SELECT
          $1::timestamptz AS end_ts,
          ($1::timestamptz - make_interval(hours => $2::int)) AS start_ts
      )
      SELECT
        COALESCE(AVG(im.indoor_temp_c), 0)::float8            AS avg_temp_c,
        COALESCE(AVG(im.humidity_pct), 0)::float8             AS avg_humidity_pct,
        COALESCE(AVG(im.comfort_index), 0)::float8            AS avg_comfort_index,
        COALESCE(AVG(im.energy_efficiency_score), 0)::float8  AS avg_efficiency_score,
        COALESCE(AVG(im.carbon_kg_co2), 0)::float8            AS avg_carbon_kgco2,
        COALESCE(SUM(im.carbon_kg_co2), 0)::float8            AS total_carbon_kgco2,
        COALESCE(MAX(im.indoor_temp_c), 0)::float8            AS max_temp_c,
        COALESCE(MIN(im.indoor_temp_c), 0)::float8            AS min_temp_c
      FROM interval_metrics im
      CROSS JOIN bounds b
      WHERE im.ts > b.start_ts
        AND im.ts <= b.end_ts
        AND ($3::text IS NULL OR im.zone_id = $3)
        AND ($4::text IS NULL OR im.hall_id = $4);
      `,
      [endTs, hours, zoneId, hallId]
    );

    const row = (r.rows && r.rows[0]) || {};
    const avgTempC = Number(row.avg_temp_c || 0);
    const avgHumidityPct = Number(row.avg_humidity_pct || 0);
    const avgComfortIndex = Number(row.avg_comfort_index || 0);
    const avgEfficiencyScore = Number(row.avg_efficiency_score || 0);
    const avgCarbonKg = Number(row.avg_carbon_kgco2 || 0);
    const totalCarbonKg = Number(row.total_carbon_kgco2 || 0);

    const aq = airQualityScore({
      tempC: avgTempC,
      humidityPct: avgHumidityPct,
      carbonAvg: avgCarbonKg,
    });

    res.json({
      ok: true,
      hours,
      window_end_ts: endTs,
      filters: { zone_id: zoneId, hall_id: hallId },
      kpis: {
        air_quality_score: aq,
        avg_temp_c: avgTempC,
        avg_humidity_pct: avgHumidityPct,
        avg_comfort_index: avgComfortIndex,
        avg_efficiency_score: avgEfficiencyScore,
        avg_carbon_kgco2: avgCarbonKg,
        total_carbon_kgco2: totalCarbonKg,
        min_temp_c: Number(row.min_temp_c || 0),
        max_temp_c: Number(row.max_temp_c || 0),
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getEnvironmentByZone = async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const metric = String(req.query.metric || "air_quality").toLowerCase();
    const zoneId = req.query.zone_id || null;

    const endTs = await getLatestMetricsTs();
    if (!endTs) {
      return res.json({ ok: true, hours, metric, window_end_ts: null, rows: [] });
    }

    const r = await analyticsDb.query(
      `
      WITH bounds AS (
        SELECT
          $1::timestamptz AS end_ts,
          ($1::timestamptz - make_interval(hours => $2::int)) AS start_ts
      )
      SELECT
        im.zone_id,
        COALESCE(AVG(im.indoor_temp_c), 0)::float8            AS avg_temp_c,
        COALESCE(AVG(im.humidity_pct), 0)::float8             AS avg_humidity_pct,
        COALESCE(AVG(im.carbon_kg_co2), 0)::float8            AS avg_carbon_kgco2,
        COALESCE(AVG(im.energy_efficiency_score), 0)::float8  AS avg_efficiency_score,
        COALESCE(AVG(im.comfort_index), 0)::float8            AS avg_comfort_index
      FROM interval_metrics im
      CROSS JOIN bounds b
      WHERE im.ts > b.start_ts
        AND im.ts <= b.end_ts
        AND im.zone_id IS NOT NULL
        AND ($3::text IS NULL OR im.zone_id = $3)
      GROUP BY im.zone_id
      ORDER BY im.zone_id ASC;
      `,
      [endTs, hours, zoneId]
    );

    const rows = (r.rows || []).map((z) => {
      const tempC = Number(z.avg_temp_c || 0);
      const hum = Number(z.avg_humidity_pct || 0);
      const carbon = Number(z.avg_carbon_kgco2 || 0);
      const eff = Number(z.avg_efficiency_score || 0);
      const comfort = Number(z.avg_comfort_index || 0);
      const aq = airQualityScore({ tempC, humidityPct: hum, carbonAvg: carbon });

      const value =
        metric === "temperature" ? tempC :
        metric === "humidity" ? hum :
        metric === "carbon" ? carbon :
        metric === "efficiency" ? eff :
        metric === "comfort" ? comfort :
        aq;

      return {
        zone_id: z.zone_id,
        value: Number.isFinite(value) ? value : 0,
        meta: { aq, tempC, hum, carbon, eff, comfort },
      };
    });

    res.json({ ok: true, hours, metric, window_end_ts: endTs, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getEnvironmentTrends = async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const metric = String(req.query.metric || "air_quality").toLowerCase();
    const zoneId = req.query.zone_id || null;
    const hallId = req.query.hall_id || null;

    const endTs = await getLatestMetricsTs({ zoneId, hallId });
    if (!endTs) {
      return res.json({
        ok: true,
        metric,
        hours,
        window_end_ts: null,
        filters: { zone_id: zoneId, hall_id: hallId },
        points: [],
      });
    }

    const metricExpr =
      metric === "temperature" ? "AVG(im.indoor_temp_c)::float8" :
      metric === "humidity" ? "AVG(im.humidity_pct)::float8" :
      metric === "carbon" ? "AVG(im.carbon_kg_co2)::float8" :
      metric === "efficiency" ? "AVG(im.energy_efficiency_score)::float8" :
      metric === "comfort" ? "AVG(im.comfort_index)::float8" :
      `AVG(
        GREATEST(
          0,
          LEAST(
            100,
            100 - (
              ABS(COALESCE(im.indoor_temp_c, 0) - 23) * 6.0 +
              ABS(COALESCE(im.humidity_pct, 0) - 50) * 0.8 +
              COALESCE(im.carbon_kg_co2, 0) * 0.02
            )
          )
        )
      )::float8`;

    const unit =
      metric === "temperature" ? "°C" :
      metric === "humidity" ? "%" :
      metric === "carbon" ? "kgCO2" :
      metric === "efficiency" ? "%" :
      metric === "comfort" ? "index" :
      "/100";

    const r = await analyticsDb.query(
      `
      WITH bounds AS (
        SELECT
          $1::timestamptz AS end_ts,
          ($1::timestamptz - make_interval(hours => $2::int)) AS start_ts
      )
      SELECT
        im.ts,
        ${metricExpr} AS value
      FROM interval_metrics im
      CROSS JOIN bounds b
      WHERE im.ts > b.start_ts
        AND im.ts <= b.end_ts
        AND ($3::text IS NULL OR im.zone_id = $3)
        AND ($4::text IS NULL OR im.hall_id = $4)
      GROUP BY im.ts
      ORDER BY im.ts ASC;
      `,
      [endTs, hours, zoneId, hallId]
    );

    const points = (r.rows || []).map((row) => ({
      ts: row.ts,
      value: Number(row.value || 0),
    }));

    res.json({
      ok: true,
      metric,
      unit,
      hours,
      window_end_ts: endTs,
      filters: { zone_id: zoneId, hall_id: hallId },
      points,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getEnvironmentAnomalies = async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const limit = Math.max(3, Math.min(12, Number(req.query.limit || 6)));

    const endTs = await getLatestAlertsTs("SUSTAINABILITY");
    if (!endTs) {
      return res.json({ ok: true, hours, window_end_ts: null, rows: [] });
    }

    const r = await coreDb.query(
      `
      WITH bounds AS (
        SELECT
          $1::timestamptz AS end_ts,
          ($1::timestamptz - make_interval(hours => $2::int)) AS start_ts
      )
      SELECT
        COALESCE(r.rule_name, a.rule_key) AS label,
        COUNT(*)::int AS count
      FROM alerts a
      LEFT JOIN rules r
        ON r.rule_key = a.rule_key
      CROSS JOIN bounds b
      WHERE a.domain = 'SUSTAINABILITY'
        AND a.detected_at > b.start_ts
        AND a.detected_at <= b.end_ts
      GROUP BY COALESCE(r.rule_name, a.rule_key)
      ORDER BY COUNT(*) DESC
      LIMIT $3;
      `,
      [endTs, hours, limit]
    );

    res.json({ ok: true, hours, window_end_ts: endTs, rows: r.rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};