/**
 * Runs the database-backed rule engine loop, refreshes rules and capacities,
 * ingests telemetry and security events, and writes triggered alerts.
 */

import { RuleEngine } from "./ruleEngine";
import { DbEventReader } from "./dbEventReader";
import {
  DbCapacityProvider,
  DbRulesProvider,
  StatefulDbAlertsSink,
  makeDbClients,
} from "./dbProviders";
import type { RuleRow } from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isUrlHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function shouldEnableNonSecurityAlerts(): Promise<boolean> {
  const mode = String(process.env.RULE_ENGINE_NON_SECURITY_MODE || "fallback_only").toLowerCase();

  if (mode === "always") return true;
  if (mode === "never") return false;

  if (process.env.AI_ENGINE_HEALTHY !== undefined) {
    return String(process.env.AI_ENGINE_HEALTHY).toLowerCase() === "false";
  }

  const healthUrl = process.env.RULE_ENGINE_AI_HEALTH_URL;
  if (!healthUrl) {
    return false;
  }

  const healthy = await isUrlHealthy(healthUrl);
  return !healthy;
}

function filterRulesForRun(rules: RuleRow[], enableNonSecurity: boolean): RuleRow[] {
  return rules.filter((rule) => {
    const domain = String(rule.domain || "").toUpperCase();
    if (domain === "SECURITY") return true;
    return enableNonSecurity;
  });
}

async function main() {
  const pollMs = Math.max(5000, Number(process.env.RULE_ENGINE_POLL_MS || 15000));
  const limitPerSource = Math.max(100, Number(process.env.RULE_ENGINE_BATCH_LIMIT || 500));

  const { core, telemetry, security } = await makeDbClients();
  const rulesProvider = new DbRulesProvider(core);
  const capacityProvider = new DbCapacityProvider(core);
  const alertsSink = new StatefulDbAlertsSink(core);
  const eventReader = new DbEventReader(telemetry, security);

  let rules: RuleRow[] = await rulesProvider.loadActiveRules();
  let capacityByZone = await capacityProvider.loadCapacityByZone();
  let engine = new RuleEngine(capacityByZone);
  let cycle = 0;

  console.log("[rule_engine] started with database-backed rules, telemetry, and security evidence feeds");

  while (true) {
    try {
      cycle += 1;

      if (cycle === 1 || cycle % 4 === 0) {
        rules = await rulesProvider.loadActiveRules();
        capacityByZone = await capacityProvider.loadCapacityByZone();
        engine.setCapacityByZone(capacityByZone);
      }

      const enableNonSecurity = await shouldEnableNonSecurityAlerts();
      const activeRules = filterRulesForRun(rules, enableNonSecurity);
      const events = await eventReader.nextBatch(limitPerSource);

      if (events.length > 0) {
        for (const event of events) {
          const alerts = engine.ingest(event, activeRules);
          if (alerts.length > 0) {
            await alertsSink.writeAlerts(alerts);
          }
        }
      }
    } catch (error: any) {
      console.error("[rule_engine] cycle failed:", error?.message || error);
    }

    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error("[rule_engine] fatal error:", error);
  process.exit(1);
});