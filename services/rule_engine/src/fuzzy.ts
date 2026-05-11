/**
 * Fuzzy risk utility functions for occupancy, CO2, congestion, thermal comfort,
 * and HVAC efficiency scoring used by the rules engine.
 */

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function tri(x: number, a: number, b: number, c: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

export function trap(x: number, a: number, b: number, c: number, d: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

function weightedRisk(low: number, med: number, high: number, wLow = 0.10, wMed = 0.55, wHigh = 0.95): number {
  const denom = low + med + high;
  const score = low * wLow + med * wMed + high * wHigh;
  return clamp01(denom > 0 ? score / denom : 0);
}

export function overcrowdingRiskFromOccupancyRatio(occRatio01: number): number {
  const x = clamp01(occRatio01);
  const low = trap(x, -0.2, 0.0, 0.40, 0.65);
  const med = tri(x, 0.55, 0.72, 0.88);
  const high = trap(x, 0.80, 0.90, 1.05, 1.30);
  return weightedRisk(low, med, high);
}

export function co2RiskFromPpm(co2ppm: number): number {
  const low = trap(co2ppm, 300, 400, 750, 950);
  const med = tri(co2ppm, 850, 1100, 1350);
  const high = trap(co2ppm, 1250, 1450, 2000, 2600);
  return weightedRisk(low, med, high);
}

export function congestionRiskFromNetInflow(net: number): number {
  const low = trap(net, -50, -5, 3, 10);
  const med = tri(net, 6, 16, 28);
  const high = trap(net, 22, 32, 70, 140);
  return weightedRisk(low, med, high, 0.12, 0.55, 0.92);
}

export function occupancySurgeRisk(growthRate: number): number {
  const x = Math.max(0, growthRate);

  const low = trap(x, -0.05, 0.0, 0.05, 0.10);
  const med = tri(x, 0.08, 0.15, 0.22);
  const high = trap(x, 0.18, 0.25, 0.45, 0.80);
  return weightedRisk(low, med, high);
}

export function thermalDiscomfortRisk(temperatureC: number, humidityPct: number): number {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPct)) return 0;

  const tLowBad = trap(temperatureC, -50, 0, 18, 20);
  const tOk = tri(temperatureC, 20, 23.5, 26);
  const tHighBad = trap(temperatureC, 25.5, 27.5, 40, 60);
  const tDiscomfort = clamp01(tLowBad * 0.9 + tHighBad * 0.9 + (1 - tOk) * 0.2);

  const hLowBad = trap(humidityPct, -10, 0, 28, 35);
  const hOk = tri(humidityPct, 30, 45, 60);
  const hHighBad = trap(humidityPct, 58, 68, 90, 110);
  const hDiscomfort = clamp01(hLowBad * 0.9 + hHighBad * 0.9 + (1 - hOk) * 0.2);

  const discomfort = clamp01(0.6 * tDiscomfort + 0.4 * hDiscomfort);

  const low = trap(discomfort, -0.2, 0.0, 0.18, 0.35);
  const med = tri(discomfort, 0.25, 0.50, 0.72);
  const high = trap(discomfort, 0.62, 0.78, 1.05, 1.30);

  return weightedRisk(low, med, high);
}

export function hvacWasteRisk(params: {
  hvacPowerKW?: number;
  hvacEnergyKWh?: number;
  occupancyRatio?: number;
  hvacInefficient?: boolean;
}): number {
  const flagRisk = params.hvacInefficient ? 0.85 : 0;

  const occ = typeof params.occupancyRatio === "number" ? clamp01(params.occupancyRatio) : undefined;
  const lowOcc = occ === undefined ? 0.25 : trap(occ, -0.2, 0.0, 0.18, 0.30);

  let powerRisk = 0;
  if (typeof params.hvacPowerKW === "number" && Number.isFinite(params.hvacPowerKW)) {
    const p = params.hvacPowerKW;
    const pLow = trap(p, -10, 0, 40, 90);
    const pMed = tri(p, 70, 130, 190);
    const pHigh = trap(p, 170, 240, 380, 650);

    const wasteHigh = clamp01(pHigh * lowOcc);
    const wasteMed = clamp01(pMed * (lowOcc * 0.6));
    powerRisk = clamp01(wasteMed * 0.55 + wasteHigh * 0.95 + (1 - pLow) * 0.10);
  }

  let energyRisk = 0;
  if (typeof params.hvacEnergyKWh === "number" && Number.isFinite(params.hvacEnergyKWh)) {
    const e = params.hvacEnergyKWh;
    const eLow = trap(e, -1, 0, 4, 10);
    const eMed = tri(e, 8, 16, 28);
    const eHigh = trap(e, 22, 35, 60, 120);
    energyRisk = weightedRisk(eLow, eMed, eHigh);
    energyRisk = clamp01(energyRisk * (0.6 + 0.4 * lowOcc));
  }

  return clamp01(Math.max(flagRisk, powerRisk, energyRisk));
}

export function efficiencyScoreFromWasteRisk(wasteRisk01: number): number {
  const r = clamp01(wasteRisk01);
  return Math.max(0, Math.min(100, 100 - r * 100));
}