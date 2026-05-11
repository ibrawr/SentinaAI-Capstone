import { AlertInsert, RuleRow } from "./types";

export interface RulesProvider {
  loadActiveRules(): Promise<RuleRow[]>;
}

export interface CapacityProvider {
  loadCapacityByZone(): Promise<Record<string, number>>;
  loadCapacityByHall?(): Promise<Record<string, number>>; 
}

export interface AlertsSink {
  writeAlerts(alerts: AlertInsert[]): Promise<void>;
}