/**
 * Handles retrieval of the latest hall metrics and enriches the result with
 * sustainability status, AI action, and anomaly data for the main dashboard hall view.
 */

const analyticsDb = require("../dbs/analytics.db");

const AI_BASE = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

async function readJsonSafe(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

exports.getHallDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const q = `
      SELECT
        ts,
        zone_id,
        hall_id,
        hall_name,
        day_of_week,
        hour_of_day,
        venue_role,
        hall_capacity,
        current_occupancy,
        occupancy_ratio,
        comfort_index,
        indoor_temp_c,
        outdoor_temp_c,
        humidity_pct,
        hvac_energy_kwh,
        carbon_kg_co2,
        energy_efficiency_score,
        sustainability_status
      FROM interval_metrics
      WHERE hall_id = $1
      ORDER BY ts DESC
      LIMIT 1
    `;

    const r = await analyticsDb.query(q, [id]);

    if (!r.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Hall not found"
      });
    }

    const row = r.rows[0];

    const baseHall = {
      ts: row.ts,
      zone_id: row.zone_id,
      hall_id: row.hall_id,
      hall_name: row.hall_name,
      dayOfWeek: row.day_of_week || "Monday",
      hourOfDay: Number(row.hour_of_day || 0),
      venueRole: row.venue_role || "default",
      hall_capacity: Number(row.hall_capacity || 0),
      current_occupancy: Number(row.current_occupancy || 0),
      occupancy_ratio: Number(row.occupancy_ratio || 0),
      comfort_index: Number(row.comfort_index || 0),
      indoor_temp_c: Number(row.indoor_temp_c || 0),
      outdoor_temp_c: Number(row.outdoor_temp_c || 0),
      humidity_pct: Number(row.humidity_pct || 0),
      hvac_energy_kwh: Number(row.hvac_energy_kwh || 0),
      carbon_kg_co2: Number(row.carbon_kg_co2 || 0),
      energy_efficiency_score: Number(row.energy_efficiency_score || 0),
      sustainability_status_raw: row.sustainability_status || null,
    };

    let aiAction = "none";
    let isAnomaly = false;
    let sustainabilityStatus = baseHall.sustainability_status_raw || "unknown";

    try {
      const resp = await fetch(`${AI_BASE}/api/infer-sustainability-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          halls: [
            {
              hall_id: String(baseHall.hall_id),
              hvacEnergyKWh: baseHall.hvac_energy_kwh,
              carbonKgCO2: baseHall.carbon_kg_co2,
              energyEfficiencyScore: baseHall.energy_efficiency_score,
              comfortIndex: baseHall.comfort_index,
              occupancyRatio: baseHall.occupancy_ratio,
              indoorTempC: baseHall.indoor_temp_c,
              outdoorTempC: baseHall.outdoor_temp_c,
              humidityPct: baseHall.humidity_pct,
              hourOfDay: baseHall.hourOfDay,
              dayOfWeek: baseHall.dayOfWeek,
              venueRole: baseHall.venueRole,
            }
          ]
        }),
      });

      const data = await readJsonSafe(resp);

      if (resp.ok && data?.status === "success" && Array.isArray(data.rows) && data.rows.length) {
        const ai = data.rows[0];
        sustainabilityStatus = ai?.sustainabilityStatus || sustainabilityStatus;
        aiAction = ai?.aiAction || "none";
        isAnomaly = !!ai?.isAnomaly;
      } else {
        aiAction =
          String(sustainabilityStatus).toLowerCase() === "red" ? "scheduleMaintenance" :
          String(sustainabilityStatus).toLowerCase() === "amber" ? "optimizeHVAC" :
          "none";

        isAnomaly = String(sustainabilityStatus).toLowerCase() !== "green";
      }
    } catch {
      aiAction =
        String(sustainabilityStatus).toLowerCase() === "red" ? "scheduleMaintenance" :
        String(sustainabilityStatus).toLowerCase() === "amber" ? "optimizeHVAC" :
        "none";

      isAnomaly = String(sustainabilityStatus).toLowerCase() !== "green";
    }

    return res.json({
      ok: true,
      hall: {
        ...baseHall,
        sustainability_status: sustainabilityStatus,
        ai_action: aiAction,
        is_anomaly: isAnomaly,
      }
    });

  } catch (err) {
    console.error("getHallDetails error", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch hall details"
    });
  }
};