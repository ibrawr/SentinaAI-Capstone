import { AlertsSink, CapacityProvider, RulesProvider } from "./integration";
import { RuleEngine } from "./ruleEngine";
import { streamTelemetryJsonl } from "./telemetryReaderJsonl";
import { AlertInsert } from "./types";

export async function runRuleEngine(params: {
  telemetryJsonlPath: string;
  rulesProvider: RulesProvider;
  capacityProvider: CapacityProvider;
  alertsSink: AlertsSink;
}) {
  const { telemetryJsonlPath, rulesProvider, capacityProvider, alertsSink } = params;

  const [rules, capacityByZone] = await Promise.all([
    rulesProvider.loadActiveRules(),
    capacityProvider.loadCapacityByZone(),
  ]);

  const engine = new RuleEngine(capacityByZone);

  await streamTelemetryJsonl(telemetryJsonlPath, async (ev) => {
    const alerts: AlertInsert[] = engine.ingest(ev, rules);
    if (alerts.length > 0) {
      await alertsSink.writeAlerts(alerts);
    }
  });
}