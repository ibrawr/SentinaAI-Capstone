/**
 * Handles live operations and sustainability dashboard data by reading analytics
 * metrics, applying simulation overrides, calling AI endpoints, and returning
 * formatted results for the main dashboard.
 */

const analyticsDb = require("../dbs/analytics.db");

const AI_BASE = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const SIM_OVERRIDES = new Map();
const SIM_TTL_MS = 5 * 60 * 1000;

async function readJsonSafe(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getLatestTs({ eventId = null, zoneId = null }) {
  const r = await analyticsDb.query(
    `
    SELECT MAX(ts) AS max_ts
    FROM interval_metrics
    WHERE ($1::text IS NULL OR event_id = $1)
      AND ($2::text IS NULL OR zone_id = $2)
    `,
    [eventId, zoneId]
  );
  return r.rows[0]?.max_ts;
}

exports.getVenueStatusProxy = async (req, res) => {
  try {
    const resp = await fetch(`${AI_BASE}/api/venue-status`, { method: "GET" });
    const data = await readJsonSafe(resp);
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: data?.detail || "AI error", data });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

exports.simulatePredictionProxy = async (req, res) => {
  try {
    const resp = await fetch(`${AI_BASE}/api/simulate-prediction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });

    const data = await readJsonSafe(resp);

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: data?.detail || "AI error", data });
    }

    const updates = data?.updates || [];
    const now = Date.now();

    for (const u of updates) {
      if (!u?.hall_id) continue;

      SIM_OVERRIDES.set(String(u.hall_id), {
        occupancyRatio: Number(u.occupancyRatio),
        co2: Number(u.co2),
        aiAction: u.aiAction,
        isAnomaly: !!u.isAnomaly,
        expiresAt: now + SIM_TTL_MS,
      });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getOpsLive = async (req, res) => {
  try {
    const eventId = req.query.event_id || null;
    const zoneId = req.query.zone_id || null;

    const ts = await getLatestTs({ eventId, zoneId });
    if (!ts) return res.json({ ok: true, ts: null, rows: [] });

    const r = await analyticsDb.query(
      `
      SELECT
        zone_id,
        hall_id,
        hall_name,
        hall_capacity,
        current_occupancy,
        occupancy_ratio,
        flow_congestion_index
      FROM interval_metrics
      WHERE ts = $1
        AND ($2::text IS NULL OR event_id = $2)
        AND ($3::text IS NULL OR zone_id = $3)
        AND hall_id IS NOT NULL
      `,
      [ts, eventId, zoneId]
    );

    const baseRows = r.rows.map((x) => {
      const occRatio = Number(x.occupancy_ratio || 0);

      const co2 = 400 + occRatio * 600;

      return {
        zone_id: x.zone_id,
        hall_id: x.hall_id,
        hall_name: x.hall_name,
        hall_capacity: Number(x.hall_capacity || 0),
        current_occupancy: Number(x.current_occupancy || 0),
        occupancyRatio: occRatio,
        flowCongestionIndex: Number(x.flow_congestion_index || 0),
        co2,
      };
    });

    const inferred = await Promise.all(
      baseRows.map(async (h) => {
        const payload = {
          hall_id: String(h.hall_id),
          occupancyRatio: Number(h.occupancyRatio),
          co2: Number(h.co2),
          flowCongestionIndex: Number(h.flowCongestionIndex),
        };

    

        try {
          const resp = await fetch(`${AI_BASE}/api/infer-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const data = await readJsonSafe(resp);

          if (!resp.ok || data?.status !== "success") {
            return { ...h, aiAction: "ai_unavailable", isAnomaly: false };
          }

          return { ...h, aiAction: data.aiAction, isAnomaly: !!data.isAnomaly };
        } catch {
          return { ...h, aiAction: "ai_unavailable", isAnomaly: false };
        }
      })
    );
const now = Date.now();


const merged = inferred.map((h) => {
  const ov = SIM_OVERRIDES.get(String(h.hall_id));
  if (!ov) return h;

  if (ov.expiresAt && ov.expiresAt < now) {
    SIM_OVERRIDES.delete(String(h.hall_id));
    return h;
  }

  const occ = Number.isFinite(ov.occupancyRatio) ? ov.occupancyRatio : Number(h.occupancyRatio || 0);

  const simulatedCongestion =
    occ >= 0.9 ? 0.95 :
    occ >= 0.8 ? 0.85 :
    occ >= 0.65 ? 0.70 :
    occ >= 0.4 ? 0.55 :
    0.35;

  return {
    ...h,
    occupancyRatio: occ,
    co2: Number.isFinite(ov.co2) ? ov.co2 : h.co2,
    flowCongestionIndex: simulatedCongestion,
    aiAction: ov.aiAction ?? h.aiAction,
    isAnomaly: typeof ov.isAnomaly === "boolean" ? ov.isAnomaly : h.isAnomaly,
  };
});

return res.json({ ok: true, ts, rows: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getOccupancyForecast = async (req, res) => {
  try {
    const hallId = req.query.hall_id;
    if (!hallId) return res.status(400).json({ ok: false, error: "hall_id is required" });

    const rTs = await analyticsDb.query(`SELECT MAX(ts) AS max_ts FROM interval_metrics`);
    const ts = rTs.rows[0]?.max_ts;
    if (!ts) return res.json({ ok: true, ts: null, hall_id: hallId, points: [] });

    const rHall = await analyticsDb.query(
      `
      SELECT hall_id, hall_name, venue_role, hall_capacity, current_occupancy, occupancy_ratio
      FROM interval_metrics
      WHERE ts = $1 AND hall_id = $2
      LIMIT 1
      `,
      [ts, hallId]
    );

    if (!rHall.rows.length) {
      return res.status(404).json({ ok: false, error: `No interval_metrics row found for hall_id=${hallId}` });
    }

    const row = rHall.rows[0];

    const dt = new Date(ts);
    const hourOfDay = dt.getHours();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayOfWeek = dayNames[dt.getDay()];

    const payload = {
      hall_id: String(row.hall_id),
      venueRole: String(row.venue_role || "default"),
      hourOfDay,
      dayOfWeek,
    };

    const capacity = Number(row.hall_capacity || 0);
    const baseOccRatio = Number(row.occupancy_ratio || 0);
    const baseCurrent = Number(row.current_occupancy || 0);

    let data;
    try {
      const resp = await fetch(`${AI_BASE}/api/occupancy-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = await readJsonSafe(resp);
      if (resp.ok && parsed?.status === "success") {
        data = parsed;
      }
    } catch {
    }

    if (!data) {
      const baseCount = baseCurrent || Math.round(baseOccRatio * capacity);
      const syntheticPoints = [10, 20, 30, 40, 50, 60].map((offsetMinutes) => ({
        offsetMinutes,
        predictedOccupancy: baseCount,
      }));
      return res.json({
        ok: true,
        ts,
        hall_id: row.hall_id,
        hall_name: row.hall_name,
        venue_role: row.venue_role,
        scaleApplied: 1,
        points: syntheticPoints,
        synthetic: true,
      });
    }

    const ov = SIM_OVERRIDES.get(String(row.hall_id));
    let scale = 1;

    if (ov && (!ov.expiresAt || ov.expiresAt >= Date.now())) {
      const simOccRatio = Number(ov.occupancyRatio);
      const simCurrent = capacity > 0 ? simOccRatio * capacity : baseCurrent;

      if (baseOccRatio >= 0.05) {
        scale = simOccRatio / baseOccRatio;
      } else if (baseCurrent > 0) {
        scale = simCurrent / baseCurrent;
      } else {
        scale = 1;
      }
    }

    const points = (data.points || []).map((p) => {
      const rawPred = Number(p.predictedOccupancy || 0);
      let adjusted = Math.round(rawPred * scale);

      if (capacity > 0) adjusted = Math.max(0, Math.min(capacity, adjusted));
      return { ...p, predictedOccupancy: adjusted };
    });

    return res.json({
      ok: true,
      ts,
      hall_id: row.hall_id,
      hall_name: row.hall_name,
      venue_role: row.venue_role,
      scaleApplied: scale,
      points,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getSustKpis = async (req, res) => {
  try {
    const eventId = req.query.event_id || null;
    const zoneId = req.query.zone_id || null;

    const ts = await getLatestTs({ eventId, zoneId });
    if (!ts) return res.json({ ok: true, ts: null, kpis: {} });

    const r = await analyticsDb.query(
      `
      SELECT
        COALESCE(SUM(hvac_energy_kwh),0)::float8 AS total_energy_kwh,
        COALESCE(SUM(carbon_kg_co2),0)::float8 AS total_carbon_kg,
        COALESCE(AVG(energy_efficiency_score),0)::float8 AS avg_eff_score,
        COALESCE(SUM(CASE WHEN sustainability_status='green' THEN 1 ELSE 0 END),0)::int AS green_count,
        COALESCE(SUM(CASE WHEN sustainability_status='amber' THEN 1 ELSE 0 END),0)::int AS amber_count,
        COALESCE(SUM(CASE WHEN sustainability_status='red' THEN 1 ELSE 0 END),0)::int AS red_count
      FROM interval_metrics
      WHERE ts = $1
        AND ($2::text IS NULL OR event_id = $2)
        AND ($3::text IS NULL OR zone_id = $3)
      `,
      [ts, eventId, zoneId]
    );

    const k = r.rows[0] || {};
    const red = Number(k.red_count || 0);
    const amber = Number(k.amber_count || 0);

    const automationStatus =
      red > 0 ? "Optimization Required" :
      amber > 0 ? "Monitor & Optimize" :
      "Optimal";

    return res.json({
      ok: true,
      ts,
      kpis: {
        totalEnergyKWh: Number(k.total_energy_kwh || 0),
        totalCarbonKg: Number(k.total_carbon_kg || 0),
        avgEfficiencyScore: Number(k.avg_eff_score || 0),
        statusCounts: { green: Number(k.green_count||0), amber: amber, red: red },
        automationStatus,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getSustLive = async (req, res) => {
  try {
    const eventId = req.query.event_id || null;
    const zoneId = req.query.zone_id || null;

    const ts = await getLatestTs({ eventId, zoneId });
    if (!ts) return res.json({ ok: true, ts: null, rows: [] });

    const r = await analyticsDb.query(
      `
      SELECT
        zone_id,
        hall_id,
        hall_name,
        day_of_week,
        hour_of_day,
        venue_role,
        occupancy_ratio,
        comfort_index,
        indoor_temp_c,
        outdoor_temp_c,
        humidity_pct,
        hvac_energy_kwh,
        carbon_kg_co2,
        energy_efficiency_score,
        sustainability_status
      FROM interval_metrics
      WHERE ts = $1
        AND ($2::text IS NULL OR event_id = $2)
        AND ($3::text IS NULL OR zone_id = $3)
        AND hall_id IS NOT NULL
      `,
      [ts, eventId, zoneId]
    );

    const base = (r.rows || []).map((x) => ({
      zone_id: x.zone_id,
      hall_id: x.hall_id,
      hall_name: x.hall_name,
      dayOfWeek: x.day_of_week || "Monday",
      hourOfDay: Number(x.hour_of_day || 0),
      venueRole: x.venue_role || "default",
      occupancyRatio: Number(x.occupancy_ratio || 0),
      comfortIndex: Number(x.comfort_index || 0),
      indoorTempC: Number(x.indoor_temp_c || 0),
      outdoorTempC: Number(x.outdoor_temp_c || 0),
      humidityPct: Number(x.humidity_pct || 0),
      hvacEnergyKWh: Number(x.hvac_energy_kwh || 0),
      carbonKgCO2: Number(x.carbon_kg_co2 || 0),
      energyEfficiencyScore: Number(x.energy_efficiency_score || 0),
      sustainabilityStatusRaw: x.sustainability_status || null,
    }));

    let aiRowsByHall = new Map();
    try {
      const resp = await fetch(`${AI_BASE}/api/infer-sustainability-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ halls: base.map((h) => ({
          hall_id: String(h.hall_id),
          hvacEnergyKWh: h.hvacEnergyKWh,
          carbonKgCO2: h.carbonKgCO2,
          energyEfficiencyScore: h.energyEfficiencyScore,
          comfortIndex: h.comfortIndex,
          occupancyRatio: h.occupancyRatio,
          indoorTempC: h.indoorTempC,
          outdoorTempC: h.outdoorTempC,
          humidityPct: h.humidityPct,
          hourOfDay: h.hourOfDay,
          dayOfWeek: h.dayOfWeek,
          venueRole: h.venueRole,
        })) }),
      });

      const data = await readJsonSafe(resp);
      if (resp.ok && data?.status === "success") {
        for (const row of (data.rows || [])) {
          if (row?.hall_id) aiRowsByHall.set(String(row.hall_id), row);
        }
      }
    } catch {
    }

    const rows = base.map((h) => {
      const ai = aiRowsByHall.get(String(h.hall_id));

      const sustStatus = ai?.sustainabilityStatus || h.sustainabilityStatusRaw || "unknown";
      const aiAction =
        ai?.aiAction ||
        (String(sustStatus).toLowerCase() === "red" ? "reduceHVACLoad" :
         String(sustStatus).toLowerCase() === "amber" ? "optimizeHVAC" : "none");

      const isAnomaly = typeof ai?.isAnomaly === "boolean"
        ? ai.isAnomaly
        : String(sustStatus).toLowerCase() !== "green";

      return {
        zone_id: h.zone_id,
        hall_id: h.hall_id,
        hall_name: h.hall_name,
        hvac_energy_kwh: h.hvacEnergyKWh,
        carbon_kg_co2: h.carbonKgCO2,
        energy_efficiency_score: h.energyEfficiencyScore,
        sustainability_status: sustStatus,
        aiAction,
        isAnomaly,
      };
    });

    return res.json({ ok: true, ts, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};