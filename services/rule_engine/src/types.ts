export type ReadingType =
  | "heartbeat"
  | "edge_status"
  | "video_analytics"
  | "occupancy"
  | "temp_humidity"
  | "environment"
  | "hvac_energy"
  | "internal"
  | string;

export type TelemetryEvent = {
  readingId: string;
  deviceId: string;
  zoneId: string;
  hallId?: string | null;
  timestamp: string; // ISO string
  readingType: ReadingType;
  quality?: "good" | "bad" | string;
  dataSource?: string;
  values: Record<string, unknown>;
};

export type RuleRow = {
  rule_key: string;
  domain: "SECURITY" | "OPERATIONS" | "SUSTAINABILITY" | string;
  rule_name: string;
  description: string;

  event_type: string;
  field_path: string;

  aggregation: "LATEST" | "COUNT" | "MAX" | "AVG" | "SUM";
  window_seconds: number;

  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  threshold_value: number;

  base_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  escalation_enabled: boolean;
  escalation_window_seconds: number | null;
  escalation_threshold: number | null;

  cooldown_seconds: number;

  default_response_type: "MANUAL" | "AUTOMATED";
  default_response_action: string;

  auto_mitigation_enabled: boolean;
};

export type AlertInsert = {
  rule_key: string;
  domain: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "NEW" | "ACKNOWLEDGED" | "RESOLVED" | string;

  device_id: string;
  zone_id: string;
  hall_id: string | null;

  event_timestamp: string;
  detected_at: string;

  trigger_value: number;
  threshold_value: number;

  message: string;
  escalation_level: number;

  metadata: string; // JSON string

  recommended_action: string;
  action_status: "PENDING" | "EXECUTED" | "FAILED" | string;

  auto_response_executed: boolean;

  acknowledged_by: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;

  response_type: "MANUAL" | "AUTOMATED";
  response_action: string;
};

