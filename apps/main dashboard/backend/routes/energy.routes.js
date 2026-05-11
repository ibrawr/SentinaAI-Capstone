const express = require("express");
const energy = require("../controllers/energy.controller");

const router = express.Router();

router.get("/consumption", energy.getEnergyConsumption);
router.get("/top-halls-latest-day", energy.getTopHallsLatestDay);
router.get("/zones-latest-day", energy.getZonesLatestDay);
router.get("/sources-latest-day", energy.getSourcesLatestDay);
router.get("/kpis-latest", energy.getEnergyKpisLatest);
router.get("/anomalies-summary", energy.getSustAnomaliesSummary);
router.get("/kpis-24h", energy.getEnergyKpis24h);

module.exports = router;
