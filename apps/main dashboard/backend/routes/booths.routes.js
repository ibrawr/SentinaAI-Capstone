const express = require("express");
const booths = require("../controllers/booths.controller");

const router = express.Router();

router.get("/filters", booths.getBoothFilters);
router.get("/", booths.listBooths);
router.post("/assign", booths.assignBooth);
router.post("/unassign", booths.unassignBooth);

module.exports = router;