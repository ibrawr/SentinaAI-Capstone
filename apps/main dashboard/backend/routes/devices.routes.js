const express = require("express");
const devices = require("../controllers/devices.controller");

const router = express.Router();

router.get("/", devices.listDevices);
router.get("/filters", devices.getDeviceFilters);

module.exports = router;