/**
 * Defines AI-related API routes for live operations data, occupancy forecasts,
 * simulation endpoints, and sustainability dashboard data.
 */

const router = require("express").Router();
const ai = require("../controllers/ai.controller");

// Telemetry-driven AI status (Option A)
router.get("/ops-live", ai.getOpsLive);
router.get("/occupancy-forecast", ai.getOccupancyForecast);
// Keep these if you're still using simulator/proxy
router.get("/venue-status", ai.getVenueStatusProxy);
router.post("/simulate-prediction", ai.simulatePredictionProxy);
router.get("/sust-kpis", ai.getSustKpis);
router.get("/sust-live", ai.getSustLive);

module.exports = router;