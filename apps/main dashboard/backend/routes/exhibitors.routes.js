const express = require("express");
const exhibitors = require("../controllers/exhibitors.controller");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/filters", exhibitors.getExhibitorFilters);
router.get("/", exhibitors.listExhibitors);
router.get("/:exhibitor_id", exhibitors.getExhibitorById);
router.get("/:exhibitor_id/events", exhibitors.getExhibitorEvents);

module.exports = router;