const express = require("express");
const controller = require("../controllers/reports.controller");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/options", controller.getOptions);
router.get("/", controller.listReports);
router.get("/:reportId", controller.getReport);
router.post("/draft", controller.createDraft);
router.put("/:reportId/draft", controller.updateDraft);
router.post("/generate", controller.generateReport);
router.post("/:reportId/generate", controller.finalizeDraft);
router.delete("/:reportId", controller.deleteReport);
router.get("/:reportId/view", controller.viewReport);
router.get("/:reportId/download", controller.downloadReport);

module.exports = router;
