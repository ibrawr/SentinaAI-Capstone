/**
 * Runs the backend security rule engine by loading enabled security rules,
 * evaluating security event tables against rule thresholds, applying cooldown
 * checks, and writing triggered alerts through the unified alert writer.
 * This service uses core and security database connections and supports
 * auth, integrity, identity, edge status, and heartbeat security rules.
 */

const coreDb = require("../dbs/core.db");
const securityDb = require("../dbs/security.db");
const { upsertAlert } = require("./unifiedAlertWriter");

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSeverity(value, fallback = "HIGH") {
  const normalized = String(value || fallback).toUpperCase();
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized)
    ? normalized
    : fallback;
}

function secondsAgo(seconds) {
  return new Date(Date.now() - Number(seconds || 0) * 1000).toISOString();
}

async function recentlyAlerted(rule, row) {
  const result = await coreDb.query(
    `
    SELECT 1
    FROM alerts
    WHERE rule_key = $1
      AND COALESCE(device_id,'') = COALESCE($2,'')
      AND COALESCE(zone_id,'') = COALESCE($3,'')
      AND COALESCE(hall_id,'') = COALESCE($4,'')
      AND detected_at >= NOW() - INTERVAL '${rule.cooldown_seconds || 120} seconds'
    LIMIT 1
    `,
    [
      rule.rule_key,
      row.device_id || "",
      row.zone_id || "",
      row.hall_id || ""
    ]
  );

  return result.rows.length > 0;
}

async function getEnabledSecurityRules() {
  const enabledColumnCheck = await coreDb.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rules'
      AND column_name = 'enabled'
    LIMIT 1
    `
  );

  const hasEnabled = (enabledColumnCheck.rows || []).length > 0;

  const sql = hasEnabled
    ? `
      SELECT
        rule_key,
        domain,
        rule_name,
        description,
        event_type,
        field_path,
        aggregation,
        window_seconds,
        operator,
        threshold_value,
        base_severity,
        escalation_enabled,
        escalation_window_seconds,
        escalation_threshold,
        cooldown_seconds,
        default_response_type,
        default_response_action,
        auto_mitigation_enabled,
        recommended_actions
      FROM rules
      WHERE enabled = TRUE
        AND domain = 'SECURITY'
      ORDER BY rule_key ASC
      `
    : `
      SELECT
        rule_key,
        domain,
        rule_name,
        description,
        event_type,
        field_path,
        aggregation,
        window_seconds,
        operator,
        threshold_value,
        base_severity,
        escalation_enabled,
        escalation_window_seconds,
        escalation_threshold,
        cooldown_seconds,
        default_response_type,
        default_response_action,
        auto_mitigation_enabled,
        recommended_actions
      FROM rules
      WHERE domain = 'SECURITY'
      ORDER BY rule_key ASC
      `;

  const result = await coreDb.query(sql);
  return result.rows || [];
}

async function processAuthRule(rule) {
  const since = secondsAgo(rule.window_seconds || 300);

  const result = await securityDb.query(
    `
    SELECT
      zone_id,
      hall_id,
      device_id,
      COUNT(*)::int AS hit_count,
      MAX(ts) AS latest_ts
    FROM auth_events
    WHERE ts >= $1
      AND UPPER(COALESCE(result, '')) IN ('FAILED', 'FAIL', 'DENIED')
    GROUP BY zone_id, hall_id, device_id
    HAVING COUNT(*) >= $2
    ORDER BY latest_ts DESC
    `,
    [since, toNumber(rule.threshold_value, 5)]
  );

  let inserted = 0;

  for (const row of result.rows || []) {

    if (await recentlyAlerted(rule, row)) continue;
    const payload = {
      rule_key: rule.rule_key,
      domain: "SECURITY",
      severity: normalizeSeverity(rule.base_severity, "HIGH"),
      zone_id: row.zone_id || null,
      hall_id: row.hall_id || null,
      device_id: row.device_id || null,
      event_timestamp: row.latest_ts || nowIso(),
      detected_at: nowIso(),
      trigger_value: toNumber(row.hit_count, 0),
      threshold_value: toNumber(rule.threshold_value, 0),
      message: `${rule.rule_name} detected for ${row.hall_id || row.device_id || row.zone_id}. Failed auth attempts reached ${row.hit_count}.`,
      metadata: {
        source: "RULE_ENGINE",
        worker: "SECURITY_RULE_ENGINE",
        event_type: "auth_event",
        hit_count: toNumber(row.hit_count, 0),
      },
    };

    const out = await upsertAlert(payload);
    if (out.action === "inserted") inserted += 1;
  }

  return inserted;
}

async function processIntegrityRule(rule) {
  const since = secondsAgo(rule.window_seconds || 300);

  const result = await securityDb.query(
    `
    SELECT
      zone_id,
      hall_id,
      device_id,
      COUNT(*)::int AS hit_count,
      MAX(ts) AS latest_ts
    FROM integrity_events
    WHERE ts >= $1
      AND COALESCE(issue_type, '') <> ''
    GROUP BY zone_id, hall_id, device_id
    HAVING COUNT(*) >= $2
    ORDER BY latest_ts DESC
    `,
    [since, toNumber(rule.threshold_value, 1)]
  );

  let inserted = 0;

  for (const row of result.rows || []) {

    if (await recentlyAlerted(rule, row)) continue;
    const payload = {
      rule_key: rule.rule_key,
      domain: "SECURITY",
      severity: normalizeSeverity(rule.base_severity, "CRITICAL"),
      zone_id: row.zone_id || null,
      hall_id: row.hall_id || null,
      device_id: row.device_id || null,
      event_timestamp: row.latest_ts || nowIso(),
      detected_at: nowIso(),
      trigger_value: toNumber(row.hit_count, 0),
      threshold_value: toNumber(rule.threshold_value, 0),
      message: `${rule.rule_name} detected for ${row.hall_id || row.device_id || row.zone_id}. Integrity issues reached ${row.hit_count}.`,
      metadata: {
        source: "RULE_ENGINE",
        worker: "SECURITY_RULE_ENGINE",
        event_type: "integrity_event",
        hit_count: toNumber(row.hit_count, 0),
      },
    };

    const out = await upsertAlert(payload);
    if (out.action === "inserted") inserted += 1;
  }

  return inserted;
}

async function processIdentityRule(rule) {
  const cols = await securityDb.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'identity_events'
    `
  );

  const names = new Set((cols.rows || []).map((r) => String(r.column_name)));
  const matchExpr = names.has("matchFlag")
    ? `"matchFlag"`
    : names.has("match_flag")
      ? "match_flag"
      : "1";

  const since = secondsAgo(rule.window_seconds || 300);

  const result = await securityDb.query(
    `
    SELECT
      zone_id,
      hall_id,
      device_id,
      COUNT(*)::int AS hit_count,
      MAX(ts) AS latest_ts
    FROM identity_events
    WHERE ts >= $1
      AND COALESCE(${matchExpr}, 0) >= $2
    GROUP BY zone_id, hall_id, device_id
    ORDER BY latest_ts DESC
    `,
    [since, toNumber(rule.threshold_value, 1)]
  );

  let inserted = 0;

  for (const row of result.rows || []) {

    if (await recentlyAlerted(rule, row)) continue;
    const payload = {
      rule_key: rule.rule_key,
      domain: "SECURITY",
      severity: normalizeSeverity(rule.base_severity, "HIGH"),
      zone_id: row.zone_id || null,
      hall_id: row.hall_id || null,
      device_id: row.device_id || null,
      event_timestamp: row.latest_ts || nowIso(),
      detected_at: nowIso(),
      trigger_value: toNumber(row.hit_count, 0),
      threshold_value: toNumber(rule.threshold_value, 0),
      message: `${rule.rule_name} detected for ${row.hall_id || row.device_id || row.zone_id}.`,
      metadata: {
        source: "RULE_ENGINE",
        worker: "SECURITY_RULE_ENGINE",
        event_type: "identity_event",
        hit_count: toNumber(row.hit_count, 0),
      },
    };

    const out = await upsertAlert(payload);
    if (out.action === "inserted") inserted += 1;
  }

  return inserted;
}

async function processEdgeStatusRule(rule) {
  const since = secondsAgo(rule.window_seconds || 300);
  const fieldMap = {
    cpuPct: "cpuPct",
    memPct: "memPct",
    queueDepth: "queueDepth",
    cpu_pct: "cpuPct",
    mem_pct: "memPct",
    queue_depth: "queueDepth",
  };

  const field = fieldMap[rule.field_path];
  if (!field) return 0;

  const result = await securityDb.query(
    `
    SELECT
      zone_id,
      device_id,
      MAX(ts) AS latest_ts,
      MAX("${field}") AS trigger_value
    FROM edge_status
    WHERE ts >= $1
    GROUP BY zone_id, device_id
    HAVING MAX("${field}") > $2
    ORDER BY latest_ts DESC
    `,
    [since, toNumber(rule.threshold_value, 0)]
  );

  let inserted = 0;

  for (const row of result.rows || []) {

    if (await recentlyAlerted(rule, row)) continue;
    const payload = {
      rule_key: rule.rule_key,
      domain: "SECURITY",
      severity: normalizeSeverity(rule.base_severity, "HIGH"),
      zone_id: row.zone_id || null,
      hall_id: null,
      device_id: row.device_id || null,
      event_timestamp: row.latest_ts || nowIso(),
      detected_at: nowIso(),
      trigger_value: toNumber(row.trigger_value, 0),
      threshold_value: toNumber(rule.threshold_value, 0),
      message: `${rule.rule_name} detected for ${row.device_id || row.zone_id}.`,
      metadata: {
        source: "RULE_ENGINE",
        worker: "SECURITY_RULE_ENGINE",
        event_type: "edge_status",
        field_path: rule.field_path,
      },
    };

    const out = await upsertAlert(payload);
    if (out.action === "inserted") inserted += 1;
  }

  return inserted;
}

async function processHeartbeatRule(rule) {
  const since = secondsAgo(rule.window_seconds || 300);

  const result = await securityDb.query(
    `
    SELECT
      zone_id,
      hall_id,
      device_id,
      MAX(ts) AS latest_ts,
      EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int AS delay_seconds
    FROM heartbeat_events
    GROUP BY zone_id, hall_id, device_id
    HAVING EXTRACT(EPOCH FROM (NOW() - MAX(ts))) > $1
    ORDER BY latest_ts ASC
    `,
    [toNumber(rule.threshold_value, 60)]
  );

  let inserted = 0;

  for (const row of result.rows || []) {

    if (await recentlyAlerted(rule, row)) continue;
    const payload = {
      rule_key: rule.rule_key,
      domain: "SECURITY",
      severity: normalizeSeverity(rule.base_severity, "HIGH"),
      zone_id: row.zone_id || null,
      hall_id: row.hall_id || null,
      device_id: row.device_id || null,
      event_timestamp: row.latest_ts || nowIso(),
      detected_at: nowIso(),
      trigger_value: toNumber(row.delay_seconds, 0),
      threshold_value: toNumber(rule.threshold_value, 0),
      message: `${rule.rule_name} detected for ${row.device_id || row.hall_id || row.zone_id}.`,
      metadata: {
        source: "RULE_ENGINE",
        worker: "SECURITY_RULE_ENGINE",
        event_type: "heartbeat",
        delay_seconds: toNumber(row.delay_seconds, 0),
      },
    };

    const out = await upsertAlert(payload);
    if (out.action === "inserted") inserted += 1;
  }

  return inserted;
}

async function processRule(rule) {
  const eventType = String(rule.event_type || "").toLowerCase();

  if (eventType === "auth_event") return processAuthRule(rule);
  if (eventType === "integrity_event") return processIntegrityRule(rule);
  if (eventType === "identity_event") return processIdentityRule(rule);
  if (eventType === "edge_status") return processEdgeStatusRule(rule);
  if (eventType === "heartbeat") return processHeartbeatRule(rule);

  return 0;
}

async function runOnce() {
  const rules = await getEnabledSecurityRules();
  let inserted = 0;

  for (const rule of rules) {
    try {
      inserted += await processRule(rule);
    } catch (error) {
    }
  }

  return {
    ok: true,
    inserted,
    rules_processed: rules.length,
    finishedAt: nowIso(),
  };
}

module.exports = {
  runOnce,
  getEnabledSecurityRules,
};