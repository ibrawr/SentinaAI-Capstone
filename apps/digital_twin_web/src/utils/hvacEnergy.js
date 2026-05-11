// HVAC energy cost simulation based on CO2 levels.
// Each 100 ppm above the 400 ppm baseline costs ~0.5 kWh to remediate.

const CO2_THRESHOLD = 800;

export function calculateHVACEnergy(co2) {
  if (co2 <= CO2_THRESHOLD) return 0;
  const delta = co2 - 400;
  return (delta / 100 * 0.5).toFixed(1);
}

export function getHVACStatus(co2) {
  if (co2 <= CO2_THRESHOLD) return 'idle';
  if (co2 <= 1000) return 'active';
  return 'max';
}

export function isHVACActive(co2) {
  return co2 > CO2_THRESHOLD;
}
