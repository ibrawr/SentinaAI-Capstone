/**
 * Handles SOC overview, SOC audit log retrieval, and security analytics data
 * by combining alert records and raw security event evidence for the main dashboard.
 */

const coreDb = require('../dbs/core.db');
const securityDb = require('../dbs/security.db');

function labelExpr(column, hours) {
  return hours <= 24
    ? `TO_CHAR(date_trunc('hour', ${column}), 'HH24:00')`
    : `TO_CHAR(date_trunc('day', ${column}), 'Mon DD')`;
}

function truncExpr(column, hours) {
  return `date_trunc(${hours <= 24 ? "'hour'" : "'day'"}, ${column})`;
}

async function safeQuery(db, sql, params = [], fallbackRows = []) {
  try {
    const result = await db.query(sql, params);
    return result?.rows || fallbackRows;
  } catch (error) {
    return fallbackRows;
  }
}

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(rows = []) {
  return rows.map((row) => ({
    label: row?.label == null ? 'UNKNOWN' : String(row.label),
    count: toInt(row?.count),
  }));
}

function mergeLabelRows(...groups) {
  const map = new Map();

  groups.flat().forEach((row) => {
    const label = String(row?.label || 'UNKNOWN');
    map.set(label, (map.get(label) || 0) + toInt(row?.count));
  });

  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const aDate = Date.parse(a.label);
      const bDate = Date.parse(b.label);
      if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) return aDate - bDate;
      return a.label.localeCompare(b.label);
    });
}

async function getSocAnchorTs() {
  const [securityLatestRows, alertsLatestRows] = await Promise.all([
    safeQuery(
      securityDb,
      `
      SELECT MAX(ts) AS latest_ts
      FROM (
        SELECT MAX(ts) AS ts FROM auth_events
        UNION ALL
        SELECT MAX(ts) AS ts FROM mqtt_security_events
        UNION ALL
        SELECT MAX(ts) AS ts FROM identity_events
        UNION ALL
        SELECT MAX(ts) AS ts FROM integrity_events
      ) s
      `,
      [],
      [{}]
    ),
    safeQuery(
      coreDb,
      `SELECT MAX(detected_at) AS latest_ts FROM alerts WHERE domain = 'SECURITY'`,
      [],
      [{}]
    ),
  ]);

  const securityLatest = securityLatestRows?.[0]?.latest_ts ? new Date(securityLatestRows[0].latest_ts) : null;
  const alertsLatest = alertsLatestRows?.[0]?.latest_ts ? new Date(alertsLatestRows[0].latest_ts) : null;

  return securityLatest || alertsLatest || new Date();
}

exports.getSocOverview = async (req, res) => {
  try {
    const domain = 'SECURITY';

    const [
      openRows,
      criticalOpenRows,
      totalTodayRows,
      resolvedTodayRows,
      quarantinedRows,
      severityRows,
      statusRows,
      recentRows,
      hotZonesRows,
    ] = await Promise.all([
      safeQuery(coreDb, `SELECT COUNT(*)::int AS total FROM alerts WHERE domain = $1 AND status IN ('NEW', 'ACKNOWLEDGED')`, [domain]),
      safeQuery(coreDb, `SELECT COUNT(*)::int AS total FROM alerts WHERE domain = $1 AND status IN ('NEW', 'ACKNOWLEDGED') AND severity = 'CRITICAL'`, [domain]),
      safeQuery(coreDb, `SELECT COUNT(*)::int AS total FROM alerts WHERE domain = $1 AND detected_at >= date_trunc('day', NOW())`, [domain]),
      safeQuery(coreDb, `SELECT COUNT(*)::int AS total FROM alerts WHERE domain = $1 AND status IN ('RESOLVED', 'CLOSED') AND resolved_at >= date_trunc('day', NOW())`, [domain]),
      safeQuery(coreDb, `SELECT COUNT(*)::int AS total FROM devices WHERE LOWER(COALESCE(status, '')) LIKE '%quarantin%' OR LOWER(COALESCE(status, '')) LIKE '%isolat%'`, []),
      safeQuery(coreDb, `SELECT severity, COUNT(*)::int AS count FROM alerts WHERE domain = $1 GROUP BY severity`, [domain]),
      safeQuery(coreDb, `SELECT status, COUNT(*)::int AS count FROM alerts WHERE domain = $1 GROUP BY status`, [domain]),
      safeQuery(
        coreDb,
        `SELECT a.alert_id, a.rule_key, COALESCE(r.rule_name, a.rule_key) AS rule_name, a.severity, a.status, a.zone_id, a.hall_id, a.device_id, a.message, a.detected_at
         FROM alerts a
         LEFT JOIN rules r ON r.rule_key = a.rule_key
         WHERE a.domain = $1 AND a.status IN ('NEW', 'ACKNOWLEDGED') AND a.severity IN ('CRITICAL', 'HIGH')
         ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END DESC, a.detected_at DESC
         LIMIT 5`,
        [domain]
      ),
      safeQuery(coreDb, `SELECT zone_id, COUNT(*)::int AS open_count FROM alerts WHERE domain = $1 AND status IN ('NEW', 'ACKNOWLEDGED') AND zone_id IS NOT NULL GROUP BY zone_id ORDER BY open_count DESC, zone_id ASC LIMIT 5`, [domain]),
    ]);

    const totalToday = Number(openRows?.[0]?.total || totalTodayRows?.[0]?.total || 0);
    const resolvedToday = Number(resolvedTodayRows?.[0]?.total || 0);

    const severityBreakdown = {};
    for (const row of severityRows || []) severityBreakdown[String(row.severity || '').toUpperCase()] = Number(row.count || 0);

    const statusBreakdown = {};
    for (const row of statusRows || []) statusBreakdown[String(row.status || '').toUpperCase()] = Number(row.count || 0);

    res.json({
      ok: true,
      domain,
      kpis: {
        open_alerts: Number(openRows?.[0]?.total || 0),
        critical_open_alerts: Number(criticalOpenRows?.[0]?.total || 0),
        quarantined_devices: Number(quarantinedRows?.[0]?.total || 0),
        containment_rate_pct: totalToday > 0 ? Math.round((resolvedToday / totalToday) * 100) : 0,
      },
      breakdowns: { severity: severityBreakdown, status: statusBreakdown },
      recent_alerts: recentRows || [],
      hot_zones: hotZonesRows || [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getSocLogs = async (req, res) => {
  try {
    const rows = await safeQuery(
      coreDb,
      `SELECT l.log_id, l.event_type, l.outcome, l.user_id, u.full_name, l.email, l.ip_address, l.user_agent, l.request_path, l.http_method, l.http_status, l.reason, l.created_at
       FROM auth_access_audit_log l
       LEFT JOIN users u ON u.user_id = l.user_id
       ORDER BY l.created_at DESC
       LIMIT 100`,
      []
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.getSocAnalytics = async (req, res) => {
  try {
    const hours = Math.max(6, Math.min(168, Number(req.query.hours || 24)));
    const anchorTs = await getSocAnchorTs();
    const anchorIso = anchorTs.toISOString();
    const alertLabel = labelExpr('detected_at', hours);
    const alertTrunc = truncExpr('detected_at', hours);
    const tsLabel = labelExpr('ts', hours);
    const tsTrunc = truncExpr('ts', hours);

    const [
      alertKpisRows,

      alertsTrendRowsRaw,
      authTrendRowsRaw,
      mqttTrendRowsRaw,
      identityTrendRowsRaw,
      integrityTrendRowsRaw,

      authKpiRows,
      mqttKpiRows,
      identityKpiRows,
      integrityKpiRows,

      affectedDevicesRows,

      severityRowsRaw,
      authOutcomeRowsRaw,
      mqttReasonRowsRaw,
      integrityIssueTypeRowsRaw,
      identityHallRowsRaw,
      hallHotspotRowsRaw,
    ] = await Promise.all([
      safeQuery(
        coreDb,
        `SELECT
          COUNT(*) FILTER (WHERE status IN ('NEW','ACKNOWLEDGED'))::int AS open_alerts,
          COUNT(*) FILTER (WHERE status IN ('NEW','ACKNOWLEDGED') AND severity = 'CRITICAL')::int AS critical_open_alerts,
          COUNT(*) FILTER (WHERE detected_at BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz)::int AS alerts_in_window
         FROM alerts
         WHERE domain = 'SECURITY'`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        coreDb,
        `SELECT ${alertLabel} AS label, COUNT(*)::int AS count
         FROM alerts
         WHERE domain = 'SECURITY'
           AND detected_at BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY ${alertTrunc}, 1
         ORDER BY ${alertTrunc} ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT ${tsLabel} AS label, COUNT(*)::int AS count
         FROM auth_events
         WHERE UPPER(COALESCE(result, '')) IN ('FAIL', 'FAILED', 'FAILURE')
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY ${tsTrunc}, 1
         ORDER BY ${tsTrunc} ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT ${tsLabel} AS label, COUNT(*)::int AS count
         FROM mqtt_security_events
         WHERE allowed_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY ${tsTrunc}, 1
         ORDER BY ${tsTrunc} ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT ${tsLabel} AS label, COUNT(*)::int AS count
         FROM identity_events
         WHERE match_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY ${tsTrunc}, 1
         ORDER BY ${tsTrunc} ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT ${tsLabel} AS label, COUNT(*)::int AS count
         FROM integrity_events
         WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY ${tsTrunc}, 1
         ORDER BY ${tsTrunc} ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT COUNT(*)::int AS failed_auth_events
         FROM auth_events
         WHERE UPPER(COALESCE(result, '')) IN ('FAIL', 'FAILED', 'FAILURE')
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        securityDb,
        `SELECT COUNT(*)::int AS mqtt_violations
         FROM mqtt_security_events
         WHERE allowed_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        securityDb,
        `SELECT COUNT(*)::int AS identity_mismatches
         FROM identity_events
         WHERE match_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        securityDb,
        `SELECT COUNT(*)::int AS integrity_events
         FROM integrity_events
         WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        securityDb,
        `SELECT COUNT(DISTINCT device_id)::int AS affected_devices
         FROM (
           SELECT device_id
           FROM auth_events
           WHERE UPPER(COALESCE(result, '')) IN ('FAIL', 'FAILED', 'FAILURE')
             AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

           UNION

           SELECT device_id
           FROM mqtt_security_events
           WHERE allowed_flag = FALSE
             AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

           UNION

           SELECT device_id
           FROM identity_events
           WHERE match_flag = FALSE
             AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

           UNION

           SELECT device_id
           FROM integrity_events
           WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         ) s
         WHERE device_id IS NOT NULL`,
        [hours, anchorIso],
        [{}]
      ),

      safeQuery(
        coreDb,
        `SELECT severity AS label, COUNT(*)::int AS count
         FROM alerts
         WHERE domain = 'SECURITY'
           AND detected_at BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY severity
         ORDER BY count DESC, severity ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT COALESCE(result, 'UNKNOWN') AS label, COUNT(*)::int AS count
         FROM auth_events
         WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY 1
         ORDER BY count DESC, label ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT COALESCE(reason, 'UNKNOWN') AS label, COUNT(*)::int AS count
         FROM mqtt_security_events
         WHERE allowed_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY 1
         ORDER BY count DESC, label ASC
         LIMIT 8`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT COALESCE(issue_type, 'UNKNOWN') AS label, COUNT(*)::int AS count
         FROM integrity_events
         WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY 1
         ORDER BY count DESC, label ASC`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `SELECT COALESCE(hall_id, 'UNKNOWN') AS label, COUNT(*)::int AS count
         FROM identity_events
         WHERE match_flag = FALSE
           AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
         GROUP BY 1
         ORDER BY count DESC, label ASC
         LIMIT 8`,
        [hours, anchorIso]
      ),

      safeQuery(
        securityDb,
        `
        SELECT hall_id AS label, COUNT(*)::int AS count
        FROM (
          SELECT hall_id
          FROM auth_events
          WHERE UPPER(COALESCE(result, '')) IN ('FAIL', 'FAILED', 'FAILURE')
            AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

          UNION ALL

          SELECT hall_id
          FROM mqtt_security_events
          WHERE allowed_flag = FALSE
            AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

          UNION ALL

          SELECT hall_id
          FROM identity_events
          WHERE match_flag = FALSE
            AND ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz

          UNION ALL

          SELECT hall_id
          FROM integrity_events
          WHERE ts BETWEEN ($2::timestamptz - ($1::int || ' hours')::interval) AND $2::timestamptz
        ) h
        WHERE hall_id IS NOT NULL
        GROUP BY hall_id
        ORDER BY count DESC, hall_id ASC
        LIMIT 8
        `,
        [hours, anchorIso]
      ),
    ]);

    const alertKpis = alertKpisRows?.[0] || {};
    const authKpis = authKpiRows?.[0] || {};
    const mqttKpis = mqttKpiRows?.[0] || {};
    const identityKpis = identityKpiRows?.[0] || {};
    const integrityKpis = integrityKpiRows?.[0] || {};
    const affectedDevices = affectedDevicesRows?.[0] || {};

    const kpis = {
      open_alerts: toInt(alertKpis.open_alerts),
      critical_open_alerts: toInt(alertKpis.critical_open_alerts),
      failed_auth_events: toInt(authKpis.failed_auth_events),
      mqtt_violations: toInt(mqttKpis.mqtt_violations),
      identity_mismatches: toInt(identityKpis.identity_mismatches),
      integrity_events: toInt(integrityKpis.integrity_events),
      affected_devices: toInt(affectedDevices.affected_devices),
    };

    const rawSecurityEvents =
      kpis.failed_auth_events +
      kpis.mqtt_violations +
      kpis.identity_mismatches +
      kpis.integrity_events;

    const signalMix = [
      { label: 'Failed Auth', count: kpis.failed_auth_events },
      { label: 'MQTT Violations', count: kpis.mqtt_violations },
      { label: 'MAC Mismatches', count: kpis.identity_mismatches },
      { label: 'Integrity Events', count: kpis.integrity_events },
    ].filter((row) => row.count > 0);

    const realAlertSeverity = normalizeRows(severityRowsRaw);
    const derivedAlertSeverity = [
      { label: 'HIGH', count: kpis.integrity_events },
      { label: 'MEDIUM', count: kpis.mqtt_violations + kpis.identity_mismatches },
      { label: 'LOW', count: kpis.failed_auth_events },
    ].filter((row) => row.count > 0);

    const activityTimeline = mergeLabelRows(
      normalizeRows(alertsTrendRowsRaw),
      normalizeRows(authTrendRowsRaw),
      normalizeRows(mqttTrendRowsRaw),
      normalizeRows(identityTrendRowsRaw),
      normalizeRows(integrityTrendRowsRaw)
    );

    res.json({
      ok: true,
      hours,
      anchor_timestamp: anchorIso,
      kpis: {
        ...kpis,
        raw_security_events: rawSecurityEvents,
        most_active_signal: signalMix.length
          ? [...signalMix].sort((a, b) => b.count - a.count)[0]
          : { label: 'No dominant signal', count: 0 },
      },
      charts: {
        security_activity_timeline: activityTimeline,
        signal_mix: signalMix,
        alert_severity: realAlertSeverity.length ? realAlertSeverity : derivedAlertSeverity,
        auth_outcomes: normalizeRows(authOutcomeRowsRaw),
        mqtt_reason_breakdown: normalizeRows(mqttReasonRowsRaw),
        integrity_issue_types: normalizeRows(integrityIssueTypeRowsRaw),
        identity_mismatches_by_hall: normalizeRows(identityHallRowsRaw),
        security_hotspots_by_hall: normalizeRows(hallHotspotRowsRaw),
      },
      fallbacks: {
        alert_severity_derived: !realAlertSeverity.length && derivedAlertSeverity.length > 0,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};