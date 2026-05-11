const router = require("express").Router();
const c = require("../controllers/environment.controller");

router.get("/filters", c.getEnvironmentFilters);
router.get("/overview", c.getEnvironmentOverview);
router.get("/by-zone", c.getEnvironmentByZone);
router.get("/trends", c.getEnvironmentTrends);
router.get("/anomalies", c.getEnvironmentAnomalies);

module.exports = router;