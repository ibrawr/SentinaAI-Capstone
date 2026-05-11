/**
 * Database providers and alert sink implementations for loading rules,
 * capacities, and persisting deduplicated rule-engine alerts.
 */

import { Pool } from "pg";
import type { AlertsSink, CapacityProvider, RulesProvider } from "./integration";
import type { AlertInsert, RuleRow } from "./types";

export type DbClient = {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  end?(): Promise<void>;
};

function toSsl(flag: string | undefined) {
  return String(flag).toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false;
}

function makePgClient(
  connectionString: string | undefined,
  sslFlag: string | undefined
): DbClient {
  if (!connectionString) {
    throw new Error("Missing database connection string.");
  }

  const pool = new Pool({
    connectionString,
    ssl: toSsl(sslFlag),
  });

  return {
    async query<T = any>(sql: string, params: any[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async end() {
      await pool.end();
    },
  };
}

export async function makeDbClients() {
  const core = makePgClient(
    process.env.CORE_DATABASE_URL,
    process.env.CORE_PGSSL
  );
  const telemetry = makePgClient(
    process.env.TELEMETRY_DATABASE_URL,
    process.env.TELEMETRY_PGSSL
  );
  const security = makePgClient(
    process.env.SECURITY_DATABASE_URL,
    process.env.SECURITY_PGSSL
  );

  return { core, telemetry, security };
}

function normalizeOperator(op: string): RuleRow["operator"] {
  if (op === "=") return "==";
  if (op === "<>") return "!=";
  if (op === "!=") return "!=";
  if (op === "<=" || op === ">=" || op === ">" || op === "<") return op;
  return ">=";
}

async function columnExists(
  coreDb: DbClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const sql = `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
  `;
  const { rows } = await coreDb.query(sql, [tableName, columnName]);
  return rows.length > 0;
}

export class DbRulesProvider implements RulesProvider {
  constructor(private coreDb: DbClient) {}

  async loadActiveRules(): Promise<RuleRow[]> {
    const hasEnabled = await columnExists(this.coreDb, "rules", "enabled");

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
          auto_mitigation_enabled
        FROM rules
        WHERE enabled = TRUE
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
          auto_mitigation_enabled
        FROM rules
        ORDER BY rule_key ASC
      `;

    const { rows } = await this.coreDb.query<any>(sql);

    return rows.map((r) => ({
      rule_key: String(r.rule_key),
      domain: String(r.domain).toUpperCase() as RuleRow["domain"],
      rule_name: String(r.rule_name),
      description: String(r.description ?? ""),
      event_type: String(r.event_type),
      field_path: String(r.field_path),
      aggregation: String(r.aggregation).toUpperCase() as RuleRow["aggregation"],
      window_seconds: Number(r.window_seconds || 0),
      operator: normalizeOperator(String(r.operator || ">=")),
      threshold_value: Number(r.threshold_value || 0),
      base_severity: String(r.base_severity || "MEDIUM").toUpperCase() as RuleRow["base_severity"],
      escalation_enabled: Boolean(r.escalation_enabled),
      escalation_window_seconds:
        r.escalation_window_seconds === null ||
        r.escalation_window_seconds === undefined
          ? null
          : Number(r.escalation_window_seconds),
      escalation_threshold:
        r.escalation_threshold === null ||
        r.escalation_threshold === undefined
          ? null
          : Number(r.escalation_threshold),
      cooldown_seconds: Number(r.cooldown_seconds || 0),
      default_response_type: String(
        r.default_response_type || "MANUAL"
      ).toUpperCase() as RuleRow["default_response_type"],
      default_response_action: String(
        r.default_response_action || "Review alert"
      ),
      auto_mitigation_enabled: Boolean(r.auto_mitigation_enabled),
    }));
  }
}

export class DbCapacityProvider implements CapacityProvider {
  constructor(private coreDb: DbClient) {}

  async loadCapacityByZone(): Promise<Record<string, number>> {
    const { rows } = await this.coreDb.query<any>(
      `SELECT zone_id, zone_capacity FROM zones`
    );

    const out: Record<string, number> = {};
    for (const row of rows) {
      const key = String(row.zone_id || "");
      const value = Number(row.zone_capacity || 0);
      if (key) out[key] = value;
    }

    return out;
  }
}

export class StatefulDbAlertsSink implements AlertsSink {
  constructor(private coreDb: DbClient) {}

  private async hasOpenAlert(alert: AlertInsert): Promise<boolean> {
    const sql = `
      SELECT alert_id
      FROM alerts
      WHERE rule_key = $1
        AND COALESCE(device_id, '') = COALESCE($2, '')
        AND COALESCE(zone_id, '') = COALESCE($3, '')
        AND COALESCE(hall_id, '') = COALESCE($4, '')
        AND status IN ('NEW', 'ACKNOWLEDGED')
      ORDER BY detected_at DESC
      LIMIT 1
    `;

    const { rows } = await this.coreDb.query(sql, [
      alert.rule_key,
      alert.device_id,
      alert.zone_id,
      alert.hall_id,
    ]);

    return rows.length > 0;
  }

  async writeAlerts(alerts: AlertInsert[]): Promise<void> {
    for (const alert of alerts) {
      const duplicateOpen = await this.hasOpenAlert(alert);
      if (duplicateOpen) continue;

      const sql = `
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
          acknowledged_by,
          acknowledged_at,
          resolved_at,
          response_type,
          response_action
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14::jsonb, $15, $16,
          $17, $18, $19, $20,
          $21, $22
        )
      `;

      await this.coreDb.query(sql, [
        alert.rule_key,
        alert.domain,
        alert.severity,
        alert.status,
        alert.device_id,
        alert.zone_id,
        alert.hall_id,
        alert.event_timestamp,
        alert.detected_at,
        alert.trigger_value,
        alert.threshold_value,
        alert.message,
        alert.escalation_level,
        alert.metadata,
        alert.recommended_action,
        alert.action_status,
        alert.auto_response_executed,
        alert.acknowledged_by,
        alert.acknowledged_at,
        alert.resolved_at,
        alert.response_type,
        alert.response_action,
      ]);
    }
  }
}