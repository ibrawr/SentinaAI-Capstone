import { AlertInsert, RuleRow, TelemetryEvent } from "./types";
import {
  clamp01,
  congestionRiskFromNetInflow,
  co2RiskFromPpm,
  efficiencyScoreFromWasteRisk,
  hvacWasteRisk,
  overcrowdingRiskFromOccupancyRatio,
  occupancySurgeRisk,
  thermalDiscomfortRisk,
} from "./fuzzy";

type Sample = { ts: number; value: number };

type ZoneMemory = {
  // last known values
  occupancyRatio?: number;
  occupancyCount?: number;

  inflow?: number;
  outflow?: number;
  estimatedCount?: number;

  temperatureC?: number;
  humidityPct?: number;

  co2ppm?: number;

  hvacPowerKW?: number;
  hvacEnergyKWh?: number;
  hvacInefficient?: boolean;

  // for derived metrics
  lastOccRatioSample?: { ts: number; value: number };
};

function parseTsMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function severityBump(base: AlertInsert["severity"], bumpLevels: number): AlertInsert["severity"] {
  const order: AlertInsert["severity"][] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const idx = order.indexOf(base);
  if (idx < 0) return base;
  return order[Math.min(order.length - 1, idx + bumpLevels)];
}

export class RuleEngine {
  private capacityByZone: Record<string, number>;
  private zoneMem = new Map<string, ZoneMemory>();

  // Aggregation store: key -> windowed samples
  private windows: Record<string, Sample[]> = {};

  // Cooldown: key -> last fired ts
  private cooldownLastFired = new Map<string, number>();

  // Alert history for “internal” rules
  private alertHistoryByKey = new Map<string, number[]>(); // key -> timestamps (ms)

  constructor(capacityByZone: Record<string, number>) {
    this.capacityByZone = capacityByZone;
  }

  setCapacityByZone(m: Record<string, number>) {
    this.capacityByZone = m;
  }

  ingest(ev: TelemetryEvent, rules: RuleRow[]): AlertInsert[] {
    if (ev.quality && ev.quality !== "good") return [];

    const nowDetected = new Date().toISOString();
    const tsMs = parseTsMs(ev.timestamp);

    const mem = this.getZoneMem(ev.zoneId);
    this.updateMemory(mem, ev);

    const generated: AlertInsert[] = [];

    // 1) evaluate telemetry-driven rules
    for (const r of rules) {
      if (r.event_type !== ev.readingType) continue;

      const trig = this.computeTriggerValue(r, ev, mem, tsMs);
      if (trig === undefined) continue;

      if (!this.compare(trig, r.operator, r.threshold_value)) continue;

      // Cooldown key uses BOTH device + zone (#3 strategy)
      const cooldownKey = `${r.rule_key}:${ev.deviceId}:${ev.zoneId}`;
      if (!this.cooldownOk(cooldownKey, tsMs, r.cooldown_seconds)) continue;

      const { severity, escalationLevel } = this.applyEscalation(r, ev, tsMs);

      const alert = this.buildAlert({
        rule: r,
        ev,
        triggerValue: trig,
        detectedAt: nowDetected,
        severity,
        escalationLevel,
      });

      generated.push(alert);
      this.cooldownLastFired.set(cooldownKey, tsMs);

      // Track alert in history (used by internal escalation rules)
      this.trackAlertForInternalRules(alert, tsMs);
    }

    // 2) evaluate internal rules (rules whose event_type == "internal")
    // We do this after generating alerts, using our own alert history.
    const internalAlerts = this.evaluateInternalRules(rules, ev, tsMs);
    for (const a of internalAlerts) {
      generated.push(a);
      this.trackAlertForInternalRules(a, tsMs);
    }

    return generated;
  }

  private getZoneMem(zoneId: string): ZoneMemory {
    const ex = this.zoneMem.get(zoneId);
    if (ex) return ex;
    const m: ZoneMemory = {};
    this.zoneMem.set(zoneId, m);
    return m;
  }

  private updateMemory(m: ZoneMemory, ev: TelemetryEvent) {
    const v = ev.values;

    if (ev.readingType === "occupancy") {
      const occRate = num(v["occupancyRate"]);
      const occCount = num(v["occupancyCount"]);

      if (occCount !== undefined) m.occupancyCount = occCount;

      if (occRate !== undefined) {
        m.occupancyRatio = clamp01(occRate);
      } else if (m.occupancyCount !== undefined) {
        const cap = this.capacityByZone[ev.zoneId];
        if (cap && cap > 0) m.occupancyRatio = clamp01(m.occupancyCount / cap);
      }
    }

    if (ev.readingType === "video_analytics") {
      const inflow = num(v["inflow"]);
      const outflow = num(v["outflow"]);
      const est = num(v["estimatedCount"]);
      if (inflow !== undefined) m.inflow = inflow;
      if (outflow !== undefined) m.outflow = outflow;
      if (est !== undefined) m.estimatedCount = est;
    }

    if (ev.readingType === "temp_humidity") {
      const t = num(v["temperatureC"]);
      const h = num(v["humidityPct"]);
      if (t !== undefined) m.temperatureC = t;
      if (h !== undefined) m.humidityPct = h;
    }

    if (ev.readingType === "environment") {
      const co2 = num(v["co2ppm"]);
      if (co2 !== undefined) m.co2ppm = co2;
    }

    if (ev.readingType === "hvac_energy") {
      const p = num(v["hvacPowerKW"]);
      const e = num(v["hvacEnergyKWh"]);
      const ineff = typeof v["hvacInefficient"] === "boolean" ? (v["hvacInefficient"] as boolean) : undefined;
      if (p !== undefined) m.hvacPowerKW = p;
      if (e !== undefined) m.hvacEnergyKWh = e;
      if (ineff !== undefined) m.hvacInefficient = ineff;
    }
  }

  private computeTriggerValue(r: RuleRow, ev: TelemetryEvent, mem: ZoneMemory, tsMs: number): number | undefined {
    // Some fields come from derived logic, not raw values_json
    const derived = this.deriveFieldValue(r.field_path, ev, mem, tsMs);
    const raw = derived ?? num(ev.values[r.field_path]);

    if (raw === undefined) return undefined;

    // Apply aggregation (LATEST, COUNT, MAX, AVG, SUM)
    const aggregated = this.applyAggregation(r, ev, tsMs, raw);
    if (aggregated === undefined) return undefined;

    // Fuzzy logic rule:
    // - if threshold_value <= 1: compare fuzzy risk score 0..1
    // - else: compare raw aggregated number
    if (r.threshold_value <= 1) {
      return this.toFuzzyRisk(r.field_path, aggregated, mem);
    }

    return aggregated;
  }

  private deriveFieldValue(field: string, ev: TelemetryEvent, mem: ZoneMemory, tsMs: number): number | undefined {
    // SECURITY
    if (field === "device_message_count") {
      // COUNT aggregation handles actual counting; we feed a “1” sample.
      return 1;
    }

    if (field === "lastHeartbeat_delay") {
      // values_json includes lastHeartbeat ISO
      const lh = ev.values["lastHeartbeat"];
      if (typeof lh !== "string") return undefined;
      const lhMs = Date.parse(lh);
      if (!Number.isFinite(lhMs)) return undefined;
      return Math.max(0, (tsMs - lhMs) / 1_000); // seconds
    }

    // OPERATIONS
    if (field === "occupancyRatio") return mem.occupancyRatio;

    if (field === "occupancyGrowthRate") {
      // growth = delta occupancyRatio over rule window; aggregation AVG will smooth it.
      const cur = mem.occupancyRatio;
      if (cur === undefined) return undefined;

      const prev = mem.lastOccRatioSample;
      mem.lastOccRatioSample = { ts: tsMs, value: cur };

      if (!prev) return 0;
      // growth fraction since last sample (not perfect, but stable)
      return Math.max(0, cur - prev.value);
    }

    if (field === "congestionIndex") {
      if (mem.inflow === undefined || mem.outflow === undefined) return undefined;
      const net = mem.inflow - mem.outflow;
      return congestionRiskFromNetInflow(net); // already 0..1-ish
    }

    if (field === "inflow_outflow_imbalance") {
      if (mem.inflow === undefined || mem.outflow === undefined) return undefined;
      return Math.abs(mem.inflow - mem.outflow);
    }

    // OPERATIONS raw fields come via values_json:
    if (field === "co2ppm") return mem.co2ppm;
    if (field === "temperatureC") return mem.temperatureC;
    if (field === "humidityPct") return mem.humidityPct;

    // SUSTAINABILITY
    if (field === "energy_kwh") return mem.hvacEnergyKWh;

    if (field === "co2Level") return mem.co2ppm; // same sensor value, sustainability naming

    if (field === "efficiencyScore") {
      const waste = hvacWasteRisk({
        hvacPowerKW: mem.hvacPowerKW,
        hvacEnergyKWh: mem.hvacEnergyKWh,
        occupancyRatio: mem.occupancyRatio,
        hvacInefficient: mem.hvacInefficient,
      });
      return efficiencyScoreFromWasteRisk(waste); // 0..100
    }

    // Edge status raw fields:
    if (field === "cpuPct") return num(ev.values["cpuPct"]);
    if (field === "memPct") return num(ev.values["memPct"]);
    if (field === "queueDepth") return num(ev.values["queueDepth"]);

    // Internal fields are handled separately in evaluateInternalRules()
    return undefined;
  }

  private toFuzzyRisk(field: string, value: number, mem: ZoneMemory): number {
    if (field === "occupancyRatio") return overcrowdingRiskFromOccupancyRatio(clamp01(value));
    if (field === "congestionIndex") return clamp01(value); // already a risk
    if (field === "occupancyGrowthRate") return occupancySurgeRisk(value);
    if (field === "co2ppm") return co2RiskFromPpm(value);
    if (field === "temperatureC" || field === "humidityPct") {
      // For comfort thresholds represented as fuzzy (if you ever set threshold <= 1 for these)
      const t = mem.temperatureC;
      const h = mem.humidityPct;
      if (t === undefined || h === undefined) return 0;
      return thermalDiscomfortRisk(t, h);
    }

    // default
    return clamp01(value);
  }

  private applyAggregation(r: RuleRow, ev: TelemetryEvent, tsMs: number, value: number): number | undefined {
    const win = Math.max(1, r.window_seconds ?? 60) * 1000;

    // Key includes rule + event scope (#3)
    const key = `${r.rule_key}:${ev.deviceId}:${ev.zoneId}:${r.field_path}:${r.aggregation}:${r.window_seconds}`;

    if (r.aggregation === "LATEST") return value;

    const arr = this.windows[key] ?? (this.windows[key] = []);
    arr.push({ ts: tsMs, value });

    const cutoff = tsMs - win;
    while (arr.length && arr[0].ts < cutoff) arr.shift();

    if (r.aggregation === "COUNT") return arr.length;
    if (r.aggregation === "MAX") return Math.max(...arr.map((x) => x.value));
    if (r.aggregation === "SUM") return arr.reduce((acc, x) => acc + x.value, 0);
    if (r.aggregation === "AVG") return arr.reduce((acc, x) => acc + x.value, 0) / Math.max(1, arr.length);

    return undefined;
  }

  private cooldownOk(cooldownKey: string, tsMs: number, cooldownSeconds: number): boolean {
    const cdMs = Math.max(0, cooldownSeconds ?? 0) * 1000;
    if (cdMs === 0) return true;
    const last = this.cooldownLastFired.get(cooldownKey);
    if (!last) return true;
    return (tsMs - last) >= cdMs;
  }

  private applyEscalation(r: RuleRow, ev: TelemetryEvent, tsMs: number): { severity: AlertInsert["severity"]; escalationLevel: number } {
    let escalationLevel = 0;
    let severity: AlertInsert["severity"] = r.base_severity;

    if (!r.escalation_enabled || !r.escalation_window_seconds || !r.escalation_threshold) {
      return { severity, escalationLevel };
    }

    const key = `ESC:${r.rule_key}:${ev.deviceId}:${ev.zoneId}`;
    const win = r.escalation_window_seconds * 1000;

    const list = this.alertHistoryByKey.get(key) ?? [];
    const filtered = list.filter((t) => tsMs - t <= win);
    filtered.push(tsMs);
    this.alertHistoryByKey.set(key, filtered);

    if (filtered.length >= r.escalation_threshold) {
      escalationLevel = Math.min(3, Math.floor(filtered.length / r.escalation_threshold));
      severity = severityBump(severity, escalationLevel);
    }

    return { severity, escalationLevel };
  }

  private buildAlert(args: {
    rule: RuleRow;
    ev: TelemetryEvent;
    triggerValue: number;
    detectedAt: string;
    severity: AlertInsert["severity"];
    escalationLevel: number;
  }): AlertInsert {
    const { rule: r, ev, triggerValue, detectedAt, severity, escalationLevel } = args;

    const msg = `${r.rule_key} triggered: ${r.field_path}=${Number(triggerValue.toFixed(3))} ${r.operator} ${r.threshold_value}.`;

    return {
      rule_key: r.rule_key,
      domain: r.domain,
      severity,
      status: "NEW",

      device_id: ev.deviceId,
      zone_id: ev.zoneId,
      hall_id: ev.hallId ?? null,

      event_timestamp: ev.timestamp,
      detected_at: detectedAt,

      trigger_value: Number(triggerValue.toFixed(3)),
      threshold_value: r.threshold_value,

      message: msg,
      escalation_level: escalationLevel,

      metadata: JSON.stringify({
        readingId: ev.readingId,
        readingType: ev.readingType,
        dataSource: ev.dataSource ?? null,
      }),

      recommended_action: r.default_response_action,
      action_status: "PENDING",
      auto_response_executed: false,

      acknowledged_by: null,
      acknowledged_at: null,
      resolved_at: null,

      response_type: r.default_response_type,
      response_action: r.default_response_action,
    };
  }

  private compare(x: number, op: RuleRow["operator"], t: number): boolean {
    if (op === ">") return x > t;
    if (op === ">=") return x >= t;
    if (op === "<") return x < t;
    if (op === "<=") return x <= t;
    if (op === "==") return x === t;
    if (op === "!=") return x !== t;
    return false;
  }

  private trackAlertForInternalRules(alert: AlertInsert, tsMs: number) {
    // Domain-level counts (for ops_alert_count / sus_alert_count)
    const domKey = `INT:domain:${alert.domain}:${alert.zone_id}`;
    this.pushTime(domKey, tsMs);

    // Security per-device counts (alert_count_per_device)
    const devKey = `INT:device:${alert.device_id}`;
    this.pushTime(devKey, tsMs);
  }

  private pushTime(key: string, tsMs: number) {
    const arr = this.alertHistoryByKey.get(key) ?? [];
    arr.push(tsMs);
    this.alertHistoryByKey.set(key, arr);
  }

  private evaluateInternalRules(rules: RuleRow[], ev: TelemetryEvent, tsMs: number): AlertInsert[] {
    const out: AlertInsert[] = [];
    const detectedAt = new Date().toISOString();

    for (const r of rules) {
      if (r.event_type !== "internal") continue;

      let trigger: number | undefined;

      if (r.field_path === "alert_count_per_device") {
        trigger = this.countInternal(`INT:device:${ev.deviceId}`, tsMs, r.window_seconds);
      } else if (r.field_path === "ops_alert_count") {
        trigger = this.countInternal(`INT:domain:OPERATIONS:${ev.zoneId}`, tsMs, r.window_seconds);
      } else if (r.field_path === "sus_alert_count") {
        trigger = this.countInternal(`INT:domain:SUSTAINABILITY:${ev.zoneId}`, tsMs, r.window_seconds);
      } else {
        continue;
      }

      if (!this.compare(trigger, r.operator, r.threshold_value)) continue;

      const cooldownKey = `${r.rule_key}:${ev.deviceId}:${ev.zoneId}:internal`;
      if (!this.cooldownOk(cooldownKey, tsMs, r.cooldown_seconds)) continue;

      const alert = this.buildAlert({
        rule: r,
        ev,
        triggerValue: trigger,
        detectedAt,
        severity: r.base_severity,
        escalationLevel: 0,
      });

      out.push(alert);
      this.cooldownLastFired.set(cooldownKey, tsMs);
    }

    return out;
  }

  private countInternal(key: string, tsMs: number, windowSeconds: number): number {
    const win = Math.max(1, windowSeconds ?? 60) * 1000;
    const arr = this.alertHistoryByKey.get(key) ?? [];
    const filtered = arr.filter((t) => tsMs - t <= win);
    this.alertHistoryByKey.set(key, filtered);
    return filtered.length;
  }
}