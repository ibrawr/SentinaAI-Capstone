/**
 * Provides unified alert upsert and stale-alert resolution logic for backend
 * alert workflows, including rule lookup, severity normalization, entity-key
 * matching, metadata merging, alert insert/update decisions, and AI alert
 * auto-resolution. This service uses the core database and supports both
 * AI-driven and security rule-engine alert handling.
 */

const coreDb = require("../dbs/core.db");

const ruleCache = new Map();
const RULE_CACHE_TTL_MS = 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeSeverity(value, fallback = "MEDIUM") {
  const normalized = String(value || fallback).toUpperCase();
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized)
    ? normalized
    : String(fallback || "MEDIUM").toUpperCase();
}

function severityRank(value) {
  switch (normalizeSeverity(value, "LOW")) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    case "LOW":
    default:
      return 1;
  }
}

function maxSeverity(a, b) {
  return severityRank(a) >= severityRank(b) ? normalizeSeverity(a) : normalizeSeverity(b);
}

function safeJsonParse(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function entityKeyParts(payload = {}) {
  return [
    String(payload.rule_key || ""),
    String(payload.domain || ""),
    String(payload.zone_id || ""),
    String(payload.hall_id || ""),
  ];
}

function buildEntityKey(payload = {}) {
  return entityKeyParts(payload).join("|");
}

async function getRule(ruleKey) {
  const cacheEntry = ruleCache.get(ruleKey);
  if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
    return cacheEntry.value;
  }

  const result = await coreDb.query(
    `
    SELECT
      rule_key,
      domain,
      rule_name,
      description,
      threshold_value,
      base_severity,
      default_response_type,
      default_response_action,
      auto_mitigation_enabled,
      recommended_actions
    FROM rules
    WHERE rule_key = $1
    LIMIT 1
    `,
    [ruleKey]
  );

  const row = result.rows[0] || null;
  ruleCache.set(ruleKey, {
    value: row,
    expiresAt: Date.now() + RULE_CACHE_TTL_MS,
  });
  return row;
}

async function findOpenAlert(payload) {
  const result = await coreDb.query(
    `
    SELECT
      alert_id,
      rule_key,
      domain,
      severity,
      status,
      device_id,
      zone_id,
      hall_id,
      event_timestamp,
      detected_at,
      trigger_value,
      threshold_value,
      message,
      escalation_level,
      metadata,
      recommended_action,
      action_status,
      auto_response_executed,
      response_type,
      response_action
    FROM alerts
    WHERE rule_key = $1
  AND domain = $2
  AND COALESCE(zone_id, '') = COALESCE($3, '')
  AND COALESCE(hall_id, '') = COALESCE($4, '')
  AND status = 'NEW'
    ORDER BY detected_at DESC, alert_id DESC
    LIMIT 1
    `,
    [
      payload.rule_key,
      payload.domain,
      payload.zone_id || "",
      payload.hall_id || "",
    ]
  );

  return result.rows[0] || null;
}

async function findHandledAlertForSameEvent(payload) {
  const result = await coreDb.query(
    `
    SELECT
      alert_id,
      rule_key,
      domain,
      severity,
      status,
      device_id,
      zone_id,
      hall_id,
      event_timestamp,
      detected_at
    FROM alerts
    WHERE rule_key = $1
      AND domain = $2
      AND COALESCE(zone_id, '') = COALESCE($3, '')
      AND COALESCE(hall_id, '') = COALESCE($4, '')
      AND status IN ('ACKNOWLEDGED', 'RESOLVED', 'CLOSED')
      AND detected_at >= NOW() - INTERVAL '30 seconds'
    ORDER BY detected_at DESC, alert_id DESC
    LIMIT 1
    `,
    [
      payload.rule_key,
      payload.domain,
      payload.zone_id || "",
      payload.hall_id || "",
    ]
  );

  return result.rows[0] || null;
}

async function findActiveAlertByEntity(payload) {
  const isSecurity = String(payload.domain || "").toUpperCase() === "SECURITY";

  const result = await coreDb.query(
    `
    SELECT
      alert_id,
      rule_key,
      domain,
      severity,
      status,
      device_id,
      zone_id,
      hall_id,
      event_timestamp,
      detected_at,
      metadata
    FROM alerts
    WHERE rule_key = $1
      AND domain = $2
      AND ($3::boolean = false OR COALESCE(device_id, '') = COALESCE($4, ''))
      AND COALESCE(zone_id, '') = COALESCE($5, '')
      AND COALESCE(hall_id, '') = COALESCE($6, '')
      AND status IN ('NEW', 'ACKNOWLEDGED')
    ORDER BY detected_at DESC, alert_id DESC
    LIMIT 1
    `,
    [
      payload.rule_key,
      payload.domain,
      isSecurity,
      payload.device_id || "",
      payload.zone_id || "",
      payload.hall_id || "",
    ]
  );

  return result.rows[0] || null;
}

function mergeMetadata(existingMetadata, incomingMetadata) {
  const existing = safeJsonParse(existingMetadata);
  const incoming = safeJsonParse(incomingMetadata);
  const occurrences = Number(existing.occurrences || 1) + 1;

  return {
    ...existing,
    ...incoming,
    occurrences,
    first_detected_at: existing.first_detected_at || incoming.first_detected_at || nowIso(),
    last_detected_at: incoming.last_detected_at || nowIso(),
  };
}

async function insertAlert(rule, payload) {
  const metadata = {
    source: "AI_ENGINE",
    ...safeJsonParse(payload.metadata),
    first_detected_at: payload.detected_at || nowIso(),
    last_detected_at: payload.detected_at || nowIso(),
    occurrences: 1,
  };

  const meta = safeJsonParse(payload.metadata);

  const finalDeviceId =
    payload.device_id ||
    meta.camera_device_id ||
    meta.env_device_id ||
    null;

  const result = await coreDb.query(
    `
    INSERT INTO alerts (
      rule_key,
      domain,
      severity,
      status,
      device_id,
      zone_id,
      hall_id,
      event_timestamp,
      detected_at,
      trigger_value,
      threshold_value,
      message,
      escalation_level,
      metadata,
      recommended_action,
      action_status,
      auto_response_executed,
      response_type,
      response_action
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14::jsonb, $15, $16,
      $17, $18, $19
    )
    RETURNING alert_id, status, severity
    `,
    [
      payload.rule_key,
      payload.domain,
      payload.severity,
      payload.status,
      finalDeviceId,
      payload.zone_id,
      payload.hall_id,
      payload.event_timestamp,
      payload.detected_at,
      payload.trigger_value,
      payload.threshold_value,
      payload.message,
      payload.escalation_level,
      JSON.stringify(metadata),
      payload.recommended_action,
      payload.action_status,
      payload.auto_response_executed,
      payload.response_type,
      payload.response_action,
    ]
  );

  return {
    action: "inserted",
    alert_id: result.rows[0]?.alert_id || null,
    status: result.rows[0]?.status || payload.status,
    severity: result.rows[0]?.severity || payload.severity,
    entity_key: buildEntityKey(payload),
  };
}

async function updateAlert(existingAlert, payload) {
  const mergedMetadata = mergeMetadata(existingAlert.metadata, payload.metadata);
  const nextSeverity = maxSeverity(existingAlert.severity, payload.severity);
  const nextEscalationLevel = Math.max(
    Number(existingAlert.escalation_level || 0),
    Number(payload.escalation_level || 0)
  );

  const meta = safeJsonParse(payload.metadata);

  const finalDeviceId =
    payload.device_id ||
    meta.camera_device_id ||
    meta.env_device_id ||
    existingAlert.device_id ||
    null;

  const result = await coreDb.query(
    `
    UPDATE alerts
    SET
  severity = $2,
  device_id = COALESCE(alerts.device_id, $3),
  event_timestamp = $4,
  detected_at = $5,
  trigger_value = $6,
  threshold_value = $7,
  message = $8,
  escalation_level = $9,
  metadata = $10::jsonb,
  recommended_action = $11,
  action_status = COALESCE($12, action_status),
  response_type = COALESCE($13, response_type),
  response_action = COALESCE($14, response_action)
    WHERE alert_id = $1
    RETURNING alert_id, status, severity
    `,
    [
      existingAlert.alert_id,
      nextSeverity,
      finalDeviceId,
      payload.event_timestamp,
      payload.detected_at,
      payload.trigger_value,
      payload.threshold_value,
      payload.message,
      nextEscalationLevel,
      JSON.stringify(mergedMetadata),
      payload.recommended_action,
      payload.action_status,
      payload.response_type,
      payload.response_action,
    ]
  );

  return {
    action: "updated",
    alert_id: result.rows[0]?.alert_id || existingAlert.alert_id,
    status: result.rows[0]?.status || existingAlert.status,
    severity: result.rows[0]?.severity || nextSeverity,
    entity_key: buildEntityKey(payload),
  };
}

async function upsertAlert(inputPayload) {
  if (!inputPayload?.rule_key) {
    throw new Error("rule_key is required");
  }

  const rule = await getRule(inputPayload.rule_key);
  if (!rule) {
    throw new Error(`Rule ${inputPayload.rule_key} does not exist in sentina_core.rules`);
  }

  const payload = {
    rule_key: String(inputPayload.rule_key),
    domain: String(inputPayload.domain || rule.domain || "OPERATIONS").toUpperCase(),
    severity: normalizeSeverity(inputPayload.severity || rule.base_severity || "MEDIUM"),
    status: String(inputPayload.status || "NEW").toUpperCase(),
    device_id:
      inputPayload.device_id ||
      safeJsonParse(inputPayload.metadata).camera_device_id ||
      safeJsonParse(inputPayload.metadata).env_device_id ||
      null,
    zone_id: inputPayload.zone_id || null,
    hall_id: inputPayload.hall_id || null,
    event_timestamp: inputPayload.event_timestamp || nowIso(),
    detected_at: inputPayload.detected_at || nowIso(),
    trigger_value:
      inputPayload.trigger_value === undefined || inputPayload.trigger_value === null
        ? null
        : toNumberOrNull(inputPayload.trigger_value),
    threshold_value:
      inputPayload.threshold_value === undefined || inputPayload.threshold_value === null
        ? toNumberOrNull(rule.threshold_value)
        : toNumberOrNull(inputPayload.threshold_value),
    message:
      inputPayload.message ||
      rule.description ||
      `${rule.rule_name || rule.rule_key} triggered.`,
    escalation_level: Number(inputPayload.escalation_level || 0),
    metadata: {
      source: "AI_ENGINE",
      rule_source: "AI_PRIMARY",
      rule_name: rule.rule_name || inputPayload.rule_key,
      ...safeJsonParse(inputPayload.metadata),
    },
    recommended_action:
      inputPayload.recommended_action ||
      rule.default_response_action ||
      null,
    action_status:
      inputPayload.action_status ||
      (rule.auto_mitigation_enabled ? "PENDING" : null),
    auto_response_executed: Boolean(inputPayload.auto_response_executed || false),
    response_type: String(
      inputPayload.response_type || rule.default_response_type || "MANUAL"
    ).toUpperCase(),
    response_action:
      inputPayload.response_action ||
      rule.default_response_action ||
      null,
  };

  if (String(rule.domain || "").toUpperCase() !== payload.domain) {
    throw new Error(
      `Rule ${payload.rule_key} belongs to ${rule.domain}, but payload requested ${payload.domain}`
    );
  }

  const metadata = safeJsonParse(payload.metadata);
  const isSecurityRuleEngineAlert =
    payload.domain === "SECURITY" &&
    String(metadata.worker || "") === "SECURITY_RULE_ENGINE";

  if (isSecurityRuleEngineAlert) {
    return insertAlert(rule, payload);
  }

  const existingResult = await coreDb.query(
    `
  SELECT alert_id, status, severity, metadata
  FROM alerts
  WHERE rule_key = $1
    AND domain = $2
    AND zone_id = $3
    AND hall_id = $4
    AND status IN ('NEW', 'ACKNOWLEDGED')
  LIMIT 1
  `,
    [
      payload.rule_key,
      payload.domain,
      payload.zone_id,
      payload.hall_id,
    ]
  );

  const existing = existingResult.rows[0];

  if (existing) {
    if (existing.status === "NEW") {
      return updateAlert(existing, payload);
    }

    if (existing.status === "ACKNOWLEDGED") {
      return {
        action: "skipped_acknowledged_active",
        alert_id: existing.alert_id,
        status: existing.status,
        severity: existing.severity,
        entity_key: buildEntityKey(payload),
      };
    }
  }

  const existingHandledSameEvent = await findHandledAlertForSameEvent(payload);
  if (existingHandledSameEvent) {
    return {
      action: "skipped_handled",
      alert_id: existingHandledSameEvent.alert_id,
      status: existingHandledSameEvent.status,
      severity: existingHandledSameEvent.severity,
      entity_key: buildEntityKey(payload),
    };
  }

  return insertAlert(rule, payload);
}

async function resolveStaleAiAlerts({ domain, worker, hallIds = [], activeEntityKeys = new Set() }) {
  const uniqueHallIds = Array.from(new Set(hallIds.filter(Boolean)));
  if (!uniqueHallIds.length) {
    return { resolved: 0 };
  }

  const result = await coreDb.query(
    `
    SELECT alert_id, rule_key, domain, device_id, zone_id, hall_id
    FROM alerts
    WHERE domain = $1
      AND hall_id = ANY($2::text[])
      AND status IN ('NEW', 'ACKNOWLEDGED')
      AND COALESCE(metadata->>'source', '') = 'AI_ENGINE'
      AND COALESCE(metadata->>'worker', '') = $3
    `,
    [domain, uniqueHallIds, worker]
  );

  let resolved = 0;

  for (const row of result.rows || []) {
    const key = buildEntityKey(row);
    if (activeEntityKeys.has(key)) {
      continue;
    }

    await coreDb.query(
      `
      UPDATE alerts
      SET
        status = 'RESOLVED',
        resolved_at = NOW(),
        action_status = COALESCE(action_status, 'COMPLETED'),
        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
      WHERE alert_id = $1
      `,
      [
        row.alert_id,
        JSON.stringify({
          resolved_by: 'AI_ENGINE',
          resolved_reason: 'Condition returned to normal in latest analytics snapshot.',
          resolved_worker: worker,
          resolved_at: nowIso(),
        }),
      ]
    );

    resolved += 1;
  }

  return { resolved };
}

module.exports = {
  buildEntityKey,
  normalizeSeverity,
  upsertAlert,
  resolveStaleAiAlerts,
};
