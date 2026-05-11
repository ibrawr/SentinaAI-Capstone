const express = require("express");
const ctrl = require("../controllers/alerts.controller");

const router = express.Router();

router.get("/filters", ctrl.getAlertFilters);
router.get("/live", ctrl.getLiveAlerts);
router.get("/", ctrl.listAlerts);
router.get("/:id", ctrl.getAlertDetails);

router.patch("/:id/ack", ctrl.acknowledgeAlert);
router.patch("/:id/resolve", ctrl.resolveAlert);

router.post("/run-engine", ctrl.runEngineOnce);
router.post("/:id/execute", ctrl.executeActions);

module.exports = router;