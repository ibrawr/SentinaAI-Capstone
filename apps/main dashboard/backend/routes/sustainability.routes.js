const router = require("express").Router();
const controller = require("../controllers/sustainability.controller");

router.get("/hall/:id", controller.getHallDetails);

module.exports = router;