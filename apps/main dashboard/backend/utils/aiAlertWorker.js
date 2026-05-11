/**
 * Runs the backend AI alert worker for operations and sustainability by reading
 * the latest interval metrics, calling the AI services, selecting alert rules,
 * computing severity, upserting alerts, and resolving stale AI alerts. This
 * service uses analytics and core database connections together with
 * aiAvailability and unifiedAlertWriter helpers to control AI-driven alert flow.
 */

const analyticsDb = require("../dbs/analytics.db");
const coreDb = require("../dbs/core.db");
const {
  getAiBaseUrl,
  getAiPrimaryState,
} = require("./aiAvailability");
const {
  buildEntityKey,
  upsertAlert,
  resolveStaleAiAlerts,
} = require("./unifiedAlertWriter");

const fetchFn = typeof fetch === "function" ? fetch : require("node-fetch");
const AI_BASE = getAiBaseUrl();
let isRunning = false;

function nowIso() {
  return new Date().toISOString();
}

async function readJsonSafe(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


async function getLatestTs() {
  const result = await analyticsDb.query(`
    SELECT MAX(ts) AS max_ts
    FROM interval_metrics
    WHERE hall_id IS NOT NULL
  `);
  return result.rows[0]?.max_ts || null;
}

function deriveCo2Proxy(occupancyRatio) {
  return 400 + toNumber(occupancyRatio, 0) * 600;
}

function titleizeAction(action) {
  return String(action || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function selectOperationsRule(row) {
  const action = String(row.aiAction || "").toLowerCase();
  if (action.includes("vent")) {
    return {
      rule_key: "AI_OPS_AIR_QUALITY_001",
      threshold_value: 1200,
      metric_value: toNumber(row.co2, 0),
      metric_label: "CO₂ proxy",
    };
  }

  if (action.includes("redirect") || action.includes("dispatch") || toNumber(row.flowCongestionIndex, 0) >= 0.8) {
    return {
      rule_key: "AI_OPS_CONGESTION_001",
      threshold_value: 0.85,
      metric_value: toNumber(row.flowCongestionIndex, 0),
      metric_label: "Flow congestion index",
    };
  }

  return {
    rule_key: "AI_OPS_OCCUPANCY_001",
    threshold_value: 0.8,
    metric_value: toNumber(row.occupancyRatio, 0),
    metric_label: "Occupancy ratio",
  };
}

function computeOperationsSeverity(row) {
  const occupancyRatio = toNumber(row.occupancyRatio, 0);
  const co2 = toNumber(row.co2, 0);
  const flowCongestionIndex = toNumber(row.flowCongestionIndex, 0);
  const action = String(row.aiAction || "").toLowerCase();

  if (
    occupancyRatio >= 0.95 ||
    flowCongestionIndex >= 0.9 ||
    co2 >= 1500 ||
    action.includes("dispatch")
  ) {
    return "CRITICAL";
  }

  if (
    occupancyRatio >= 0.85 ||
    flowCongestionIndex >= 0.8 ||
    co2 >= 1200 ||
    action.includes("redirect") ||
    action.includes("vent")
  ) {
    return "HIGH";
  }

  return "MEDIUM";
}

function buildOperationsMessage(row, ruleInfo, severity) {
  const actionLabel = titleizeAction(row.aiAction) || "Operational response";
  return `${actionLabel} recommended for ${row.hall_name || row.hall_id}. ` +
    `${ruleInfo.metric_label} is ${Number(ruleInfo.metric_value).toFixed(2)} and AI classified this as ${severity.toLowerCase()} priority.`;
}

async function processOperations(ts) {
  const result = await analyticsDb.query(
    `
  SELECT
  zone_id,
  hall_id,
  hall_name,
  hall_capacity,
  current_occupancy,
  occupancy_ratio,
  flow_congestion_index,
  camera_device_id
  FROM interval_metrics
  WHERE ts = (
      SELECT MAX(ts)
      FROM interval_metrics
      WHERE hall_id IS NOT NULL
    )
    AND hall_id IS NOT NULL
  ORDER BY hall_id ASC
  `
  );

  const halls = (result.rows || []).map((row) => ({
    zone_id: row.zone_id,
    hall_id: row.hall_id,
    hall_name: row.hall_name,
    hall_capacity: toNumber(row.hall_capacity, 0),
    current_occupancy: toNumber(row.current_occupancy, 0),
    occupancyRatio: toNumber(row.occupancy_ratio, 0),
    flowCongestionIndex: toNumber(row.flow_congestion_index, 0),
    cameraDeviceId: row.camera_device_id || null,
    co2: deriveCo2Proxy(row.occupancy_ratio),
  }));

  if (!halls.length) {
    return { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] };
  }

  const inferred = await Promise.all(
    halls.map(async (hall) => {
      try {
        const response = await fetchFn(`${AI_BASE}/api/infer-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hall_id: String(hall.hall_id),
            occupancyRatio: hall.occupancyRatio,
            co2: hall.co2,
            flowCongestionIndex: hall.flowCongestionIndex,
          }),
        });

        const data = await readJsonSafe(response);
        if (!response.ok || data?.status !== "success") {
          return { ...hall, aiAction: "ai_error", isAnomaly: false };
        }

        return {
          ...hall,
          aiAction: data.aiAction,
          isAnomaly: Boolean(data.isAnomaly),
        };
      } catch {
        return { ...hall, aiAction: "ai_error", isAnomaly: false };
      }
    })
  );

  let inserted = 0;
  let updated = 0;
  const alerts = [];
  const activeEntityKeys = new Set();
  const hallIds = [];

  for (const hall of inferred) {
    hallIds.push(String(hall.hall_id));

    const thresholdHit =
      hall.occupancyRatio >= 0.85 ||
      hall.flowCongestionIndex >= 0.8 ||
      hall.co2 >= 1200;

    const aiAction =
      hall.aiAction && String(hall.aiAction).toLowerCase() !== "none"
        ? hall.aiAction
        : (hall.flowCongestionIndex >= 0.9 || hall.occupancyRatio >= 0.95
          ? "dispatchSecurity"
          : thresholdHit
            ? "redirectCrowd"
            : "none");

    const isAnomaly =
      (typeof hall.isAnomaly === "boolean" ? hall.isAnomaly : false) || thresholdHit;


    if (!isAnomaly || String(aiAction || "").toLowerCase() === "none") {
      continue;
    }

    const mergedHall = {
      ...hall,
      aiAction,
    };

    const ruleInfo = selectOperationsRule(mergedHall);
    const severity = computeOperationsSeverity(mergedHall);
    const payload = {
      rule_key: ruleInfo.rule_key,
      domain: "OPERATIONS",
      severity,
      device_id: hall.cameraDeviceId || null,
      zone_id: hall.zone_id || null,
      hall_id: hall.hall_id || null,
      event_timestamp: ts,
      detected_at: nowIso(),
      trigger_value: ruleInfo.metric_value,
      threshold_value: ruleInfo.threshold_value,
      message: buildOperationsMessage(mergedHall, ruleInfo, severity),
      metadata: {
        source: "AI_ENGINE",
        worker: "OPS_AI_PRIMARY",
        ai_action: mergedHall.aiAction,
        camera_device_id: hall.cameraDeviceId || null,
        occupancy_ratio: mergedHall.occupancyRatio,
        co2_proxy_ppm: mergedHall.co2,
        flow_congestion_index: mergedHall.flowCongestionIndex,
        current_occupancy: mergedHall.current_occupancy,
        hall_capacity: mergedHall.hall_capacity,
      },
    };

    const out = await upsertAlert(payload);
    activeEntityKeys.add(buildEntityKey(payload));
    alerts.push({ hall_id: hall.hall_id, alert_id: out.alert_id, severity, rule_key: ruleInfo.rule_key, action: out.action });
    if (out.action === "inserted") inserted += 1;
    if (out.action === "updated") updated += 1;
  }

  const resolvedResult = await resolveStaleAiAlerts({
    domain: "OPERATIONS",
    worker: "OPS_AI_PRIMARY",
    hallIds,
    activeEntityKeys,
  });

  return {
    halls: halls.length,
    inserted,
    updated,
    resolved: resolvedResult.resolved,
    alerts,
  };
}

function selectSustainabilityRule(row) {
  const efficiency = toNumber(row.energyEfficiencyScore, 0);
  const carbon = toNumber(row.carbonKgCO2, 0);
  const hvac = toNumber(row.hvacEnergyKWh, 0);

  if (carbon >= hvac && carbon >= 60) {
    return {
      rule_key: "AI_SUS_CARBON_001",
      threshold_value: 60,
      metric_value: carbon,
      metric_label: "Carbon output",
    };
  }

  if (hvac >= 60 || String(row.aiAction || "").toLowerCase().includes("reduce")) {
    return {
      rule_key: "AI_SUS_ENERGY_WASTE_001",
      threshold_value: 60,
      metric_value: hvac,
      metric_label: "HVAC energy draw",
    };
  }

  return {
    rule_key: "AI_SUS_EFFICIENCY_001",
    threshold_value: 70,
    metric_value: efficiency,
    metric_label: "Efficiency score",
  };
}

function computeSustainabilitySeverity(row) {
  const efficiency = toNumber(row.energyEfficiencyScore, 100);
  const carbon = toNumber(row.carbonKgCO2, 0);
  const hvac = toNumber(row.hvacEnergyKWh, 0);
  const status = String(row.sustainabilityStatus || "").toLowerCase();

  if (status === "red" && (efficiency <= 50 || carbon >= 70 || hvac >= 70)) {
    return "CRITICAL";
  }

  if (status === "red" || efficiency <= 55 || carbon >= 60 || hvac >= 60) {
    return "HIGH";
  }

  return "MEDIUM";
}

function buildSustainabilityMessage(row, ruleInfo, severity) {
  const actionLabel = titleizeAction(row.aiAction) || "Sustainability response";
  return `${actionLabel} recommended for ${row.hall_name || row.hall_id}. ` +
    `${ruleInfo.metric_label} is ${Number(ruleInfo.metric_value).toFixed(2)} and AI classified this as ${severity.toLowerCase()} priority.`;
}

/* async function processSustainability(ts) {
  const result = await analyticsDb.query(
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
    sustainability_status,
    env_device_id
  FROM interval_metrics
  WHERE ts = (
      SELECT MAX(ts)
      FROM interval_metrics
      WHERE hall_id IS NOT NULL
        AND env_device_id IS NOT NULL
    )
    AND hall_id IS NOT NULL
    AND env_device_id IS NOT NULL
  ORDER BY hall_id ASC
  `
  );

  const halls = (result.rows || []).map((row) => ({
    zone_id: row.zone_id,
    hall_id: row.hall_id,
    hall_name: row.hall_name,
    dayOfWeek: row.day_of_week || "Monday",
    hourOfDay: Number(row.hour_of_day || 0),
    venueRole: row.venue_role || "default",
    occupancyRatio: toNumber(row.occupancy_ratio, 0),
    comfortIndex: toNumber(row.comfort_index, 0),
    indoorTempC: toNumber(row.indoor_temp_c, 0),
    outdoorTempC: toNumber(row.outdoor_temp_c, 0),
    humidityPct: toNumber(row.humidity_pct, 0),
    hvacEnergyKWh: toNumber(row.hvac_energy_kwh, 0),
    carbonKgCO2: toNumber(row.carbon_kg_co2, 0),
    energyEfficiencyScore: toNumber(row.energy_efficiency_score, 0),
    sustainabilityStatusRaw: row.sustainability_status || null,
    envDeviceId: row.env_device_id || null,
  }));

  if (!halls.length) {
    return { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] };
  }

  let aiRowsByHall = new Map();
  try {
    const response = await fetchFn(`${AI_BASE}/api/infer-sustainability-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        halls: halls.map((hall) => ({
          hall_id: String(hall.hall_id),
          hvacEnergyKWh: hall.hvacEnergyKWh,
          carbonKgCO2: hall.carbonKgCO2,
          energyEfficiencyScore: hall.energyEfficiencyScore,
          comfortIndex: hall.comfortIndex,
          occupancyRatio: hall.occupancyRatio,
          indoorTempC: hall.indoorTempC,
          outdoorTempC: hall.outdoorTempC,
          humidityPct: hall.humidityPct,
          hourOfDay: hall.hourOfDay,
          dayOfWeek: hall.dayOfWeek,
          venueRole: hall.venueRole,
        })),
      }),
    });

    const data = await readJsonSafe(response);

    if (response.ok && data?.status === "success") {
      for (const row of data.rows || []) {
        if (row?.hall_id) {
          aiRowsByHall.set(String(row.hall_id), row);
        }
      }
    }
  } catch (error) {
    aiRowsByHall = new Map();
  }

  let inserted = 0;
  let updated = 0;
  const alerts = [];
  const activeEntityKeys = new Set();
  const hallIds = [];

  for (const hall of halls) {
    hallIds.push(String(hall.hall_id));
    const ai = aiRowsByHall.get(String(hall.hall_id));
    const sustainabilityStatus = ai?.sustainabilityStatus || hall.sustainabilityStatusRaw || "unknown";

    const thresholdHit =
      hall.energyEfficiencyScore < 65 ||
      hall.hvacEnergyKWh > 50 ||
      hall.carbonKgCO2 > 60;

    const aiAction =
      ai?.aiAction ||
      (thresholdHit
        ? (String(sustainabilityStatus).toLowerCase() === "red"
          ? "reduceHVACLoad"
          : "optimizeHVAC")
        : "none");

    const isAnomaly =
      (typeof ai?.isAnomaly === "boolean" ? ai.isAnomaly : false) || thresholdHit;

    if (!isAnomaly || String(aiAction || "").toLowerCase() === "none") {
      continue;
    }

    const mergedHall = {
      ...hall,
      sustainabilityStatus,
      aiAction,
    };

    const ruleInfo = selectSustainabilityRule(mergedHall);
    const severity = computeSustainabilitySeverity(mergedHall);
    const payload = {
      rule_key: ruleInfo.rule_key,
      domain: "SUSTAINABILITY",
      severity,
      device_id: null,
      zone_id: hall.zone_id || null,
      hall_id: hall.hall_id || null,
      event_timestamp: ts,
      detected_at: nowIso(),
      trigger_value: ruleInfo.metric_value,
      threshold_value: ruleInfo.threshold_value,
      message: buildSustainabilityMessage(mergedHall, ruleInfo, severity),
      metadata: {
        source: "AI_ENGINE",
        worker: "SUS_AI_PRIMARY",
        ai_action: aiAction,
        sustainability_status: sustainabilityStatus,
        hvac_energy_kwh: hall.hvacEnergyKWh,
        carbon_kg_co2: hall.carbonKgCO2,
        energy_efficiency_score: hall.energyEfficiencyScore,
        comfort_index: hall.comfortIndex,
        occupancy_ratio: hall.occupancyRatio,
        env_device_id: hall.envDeviceId || null,
      },
    };

    const out = await upsertAlert(payload);

    activeEntityKeys.add(buildEntityKey(payload));
    alerts.push({
      hall_id: hall.hall_id,
      alert_id: out.alert_id,
      severity,
      rule_key: ruleInfo.rule_key,
      action: out.action
    });

    if (out.action === "inserted") inserted += 1;
    if (out.action === "updated") updated += 1;
  }

  const resolvedResult = await resolveStaleAiAlerts({
    domain: "SUSTAINABILITY",
    worker: "SUS_AI_PRIMARY",
    hallIds,
    activeEntityKeys,
  });

  return {
    halls: halls.length,
    inserted,
    updated,
    resolved: resolvedResult.resolved,
    alerts,
  };
} */

async function runOnce() {
  const lockId = 321654987;

  const lockResult = await coreDb.query(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [lockId]
  );

  const locked = Boolean(lockResult.rows[0]?.locked);

  if (!locked) {
    return {
      startedAt: nowIso(),
      finishedAt: nowIso(),
      skipped: true,
      note: "AI alert worker skipped because another run already holds the DB lock.",
      inserted: 0,
      updated: 0,
      resolved: 0,
      operations: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
      sustainability: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
    };
  }

  try {
    const startedAt = nowIso();
    const aiState = await getAiPrimaryState();

    if (!aiState.runAiPrimary) {
      return {
        startedAt,
        finishedAt: nowIso(),
        mode: aiState.mode,
        aiHealthy: aiState.healthy,
        inserted: 0,
        updated: 0,
        resolved: 0,
        note: aiState.reason,
        operations: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
        sustainability: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
      };
    }

    const ts = await getLatestTs();
    if (!ts) {
      return {
        startedAt,
        finishedAt: nowIso(),
        mode: aiState.mode,
        aiHealthy: aiState.healthy,
        inserted: 0,
        updated: 0,
        resolved: 0,
        note: "No interval_metrics rows available yet.",
        operations: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
        sustainability: { halls: 0, inserted: 0, updated: 0, resolved: 0, alerts: [] },
      };
    }

    const operations = await processOperations(ts);

    const sustainability = {
      halls: 0,
      inserted: 0,
      updated: 0,
      resolved: 0,
      alerts: [],
    };

    return {
      startedAt,
      finishedAt: nowIso(),
      ts,
      mode: aiState.mode,
      aiHealthy: aiState.healthy,
      inserted: operations.inserted + sustainability.inserted,
      updated: operations.updated + sustainability.updated,
      resolved: operations.resolved + sustainability.resolved,
      operations,
      sustainability,
    };
  } finally {
    await coreDb.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
  }
}

module.exports = {
  runOnce,
};
