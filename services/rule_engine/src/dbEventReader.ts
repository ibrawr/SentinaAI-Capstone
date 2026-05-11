/**
 * Reads telemetry and security events from the database, normalizes them into
 * a shared TelemetryEvent shape, and tracks per-source cursors for batching.
 */

import type { DbClient } from "./dbProviders";
import type { TelemetryEvent } from "./types";

type Cursor = { ts: string; id: number };

type SourceKey = "device_readings" | "auth_events" | "identity_events" | "mqtt_security_events" | "integrity_events";

type NormalizedEvent = {
  source: SourceKey;
  ts: string;
  id: number;
  event: TelemetryEvent;
};

function iso(ts: Date | string | null | undefined): string {
  if (!ts) return new Date(0).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function extractNumericId(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class DbEventReader {
  private cursors: Record<SourceKey, Cursor> = {
    device_readings: { ts: new Date(0).toISOString(), id: 0 },
    auth_events: { ts: new Date(0).toISOString(), id: 0 },
    identity_events: { ts: new Date(0).toISOString(), id: 0 },
    mqtt_security_events: { ts: new Date(0).toISOString(), id: 0 },
    integrity_events: { ts: new Date(0).toISOString(), id: 0 },
  };

  constructor(
    private telemetryDb: DbClient,
    private securityDb: DbClient,
  ) {}

  private async fetchTelemetry(limitPerSource: number): Promise<NormalizedEvent[]> {
    const cursor = this.cursors.device_readings;
    const sql = `
      SELECT reading_id, device_id, zone_id, hall_id, ts, reading_type, quality, data_source, values_json
      FROM device_readings
      WHERE ts > $1::timestamptz
         OR (ts = $1::timestamptz AND reading_id > $2)
      ORDER BY ts ASC, reading_id ASC
      LIMIT $3
    `;

    const { rows } = await this.telemetryDb.query<any>(sql, [cursor.ts, cursor.id, limitPerSource]);
    return rows.map((row) => ({
      source: "device_readings" as const,
      ts: iso(row.ts),
      id: extractNumericId(row.reading_id),
      event: {
        readingId: String(row.reading_id),
        deviceId: String(row.device_id),
        zoneId: String(row.zone_id),
        hallId: row.hall_id ? String(row.hall_id) : null,
        timestamp: iso(row.ts),
        readingType: String(row.reading_type),
        quality: row.quality ? String(row.quality) : "good",
        dataSource: row.data_source ? String(row.data_source) : "database",
        values: row.values_json && typeof row.values_json === "object" ? row.values_json : {},
      },
    }));
  }

  private async fetchAuth(limitPerSource: number): Promise<NormalizedEvent[]> {
    const cursor = this.cursors.auth_events;
    const sql = `
      SELECT auth_event_id, event_id, ts, device_id, zone_id, hall_id, source_ip, username_attempted, result, failure_reason
      FROM auth_events
      WHERE ts > $1::timestamptz
         OR (ts = $1::timestamptz AND auth_event_id > $2)
      ORDER BY ts ASC, auth_event_id ASC
      LIMIT $3
    `;
    const { rows } = await this.securityDb.query<any>(sql, [cursor.ts, cursor.id, limitPerSource]);
    return rows
      .filter((row) => String(row.result || "").toUpperCase() === "FAILED")
      .map((row) => ({
        source: "auth_events" as const,
        ts: iso(row.ts),
        id: extractNumericId(row.auth_event_id),
        event: {
          readingId: String(row.event_id || row.auth_event_id),
          deviceId: String(row.device_id || row.source_ip || "UNKNOWN_DEVICE"),
          zoneId: String(row.zone_id || "UNKNOWN_ZONE"),
          hallId: row.hall_id ? String(row.hall_id) : null,
          timestamp: iso(row.ts),
          readingType: "auth_event",
          quality: "good",
          dataSource: "security_db",
          values: {
            result: 1,
            sourceIp: row.source_ip ? String(row.source_ip) : null,
            usernameAttempted: row.username_attempted ? String(row.username_attempted) : null,
            failureReason: row.failure_reason ? String(row.failure_reason) : null,
            rawResult: row.result ? String(row.result) : null,
          },
        },
      }));
  }

  private async fetchIdentity(limitPerSource: number): Promise<NormalizedEvent[]> {
    const cursor = this.cursors.identity_events;
    const sql = `
      SELECT identity_event_id, event_id, ts, device_id, zone_id, hall_id, observed_mac_address, expected_mac_address, match_flag
      FROM identity_events
      WHERE ts > $1::timestamptz
         OR (ts = $1::timestamptz AND identity_event_id > $2)
      ORDER BY ts ASC, identity_event_id ASC
      LIMIT $3
    `;
    const { rows } = await this.securityDb.query<any>(sql, [cursor.ts, cursor.id, limitPerSource]);
    return rows
      .filter((row) => row.match_flag === false)
      .map((row) => ({
        source: "identity_events" as const,
        ts: iso(row.ts),
        id: extractNumericId(row.identity_event_id),
        event: {
          readingId: String(row.event_id || row.identity_event_id),
          deviceId: String(row.device_id),
          zoneId: String(row.zone_id || "UNKNOWN_ZONE"),
          hallId: row.hall_id ? String(row.hall_id) : null,
          timestamp: iso(row.ts),
          readingType: "identity_event",
          quality: "good",
          dataSource: "security_db",
          values: {
            matchFlag: 1,
            observedMacAddress: row.observed_mac_address ? String(row.observed_mac_address) : null,
            expectedMacAddress: row.expected_mac_address ? String(row.expected_mac_address) : null,
          },
        },
      }));
  }

  private async fetchMqtt(limitPerSource: number): Promise<NormalizedEvent[]> {
    const cursor = this.cursors.mqtt_security_events;
    const sql = `
      SELECT mqtt_sec_event_id, event_id, ts, device_id, zone_id, hall_id, client_id, topic_name, action_type, allowed_flag, reason
      FROM mqtt_security_events
      WHERE ts > $1::timestamptz
         OR (ts = $1::timestamptz AND mqtt_sec_event_id > $2)
      ORDER BY ts ASC, mqtt_sec_event_id ASC
      LIMIT $3
    `;
    const { rows } = await this.securityDb.query<any>(sql, [cursor.ts, cursor.id, limitPerSource]);
    return rows
      .filter((row) => row.allowed_flag === false)
      .map((row) => ({
        source: "mqtt_security_events" as const,
        ts: iso(row.ts),
        id: extractNumericId(row.mqtt_sec_event_id),
        event: {
          readingId: String(row.event_id || row.mqtt_sec_event_id),
          deviceId: String(row.device_id || row.client_id || "UNKNOWN_DEVICE"),
          zoneId: String(row.zone_id || "UNKNOWN_ZONE"),
          hallId: row.hall_id ? String(row.hall_id) : null,
          timestamp: iso(row.ts),
          readingType: "mqtt_security_event",
          quality: "good",
          dataSource: "security_db",
          values: {
            allowedFlag: 1,
            clientId: row.client_id ? String(row.client_id) : null,
            topicName: row.topic_name ? String(row.topic_name) : null,
            actionType: row.action_type ? String(row.action_type) : null,
            reason: row.reason ? String(row.reason) : null,
          },
        },
      }));
  }

  private async fetchIntegrity(limitPerSource: number): Promise<NormalizedEvent[]> {
    const cursor = this.cursors.integrity_events;
    const sql = `
      SELECT integrity_event_id, event_id, ts, device_id, zone_id, hall_id, reading_type, field_name, observed_value, issue_type
      FROM integrity_events
      WHERE ts > $1::timestamptz
         OR (ts = $1::timestamptz AND integrity_event_id > $2)
      ORDER BY ts ASC, integrity_event_id ASC
      LIMIT $3
    `;
    const { rows } = await this.securityDb.query<any>(sql, [cursor.ts, cursor.id, limitPerSource]);
    return rows.map((row) => ({
      source: "integrity_events" as const,
      ts: iso(row.ts),
      id: extractNumericId(row.integrity_event_id),
      event: {
        readingId: String(row.event_id || row.integrity_event_id),
        deviceId: String(row.device_id || "UNKNOWN_DEVICE"),
        zoneId: String(row.zone_id || "UNKNOWN_ZONE"),
        hallId: row.hall_id ? String(row.hall_id) : null,
        timestamp: iso(row.ts),
        readingType: "integrity_event",
        quality: "good",
        dataSource: "security_db",
        values: {
          issueType: 1,
          issueTypeLabel: row.issue_type ? String(row.issue_type) : null,
          readingTypeLabel: row.reading_type ? String(row.reading_type) : null,
          fieldName: row.field_name ? String(row.field_name) : null,
          observedValue: row.observed_value === null || row.observed_value === undefined ? null : Number(row.observed_value),
        },
      },
    }));
  }

  private advanceCursor(item: NormalizedEvent) {
    this.cursors[item.source] = { ts: item.ts, id: item.id };
  }

  async nextBatch(limitPerSource = 500): Promise<TelemetryEvent[]> {
    const batches = await Promise.all([
      this.fetchTelemetry(limitPerSource),
      this.fetchAuth(limitPerSource),
      this.fetchIdentity(limitPerSource),
      this.fetchMqtt(limitPerSource),
      this.fetchIntegrity(limitPerSource),
    ]);

    const merged = batches.flat().sort((a, b) => {
      if (a.ts !== b.ts) return a.ts.localeCompare(b.ts);
      return a.id - b.id;
    });

    for (const item of merged) {
      this.advanceCursor(item);
    }

    return merged.map((item) => item.event);
  }
}