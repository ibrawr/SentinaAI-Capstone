const express = require("express");
const events = require("../controllers/events.controller");

const router = express.Router();

router.get("/filters", events.getEventFilters);
router.get("/", events.listEvents);
router.get("/:id", events.getEventById);
router.get("/:id/exhibitors", events.getEventExhibitors);
router.get("/:id/booths", events.getEventBooths);

module.exports = router;