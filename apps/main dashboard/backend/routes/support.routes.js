const express = require("express");
const router = express.Router();
const controller = require("../controllers/support.controller");
const auth = require("../middleware/auth.middleware");

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Admin access only." });
  }
  next();
}

// normal users
router.post("/issues", auth, controller.createIssue);

// admin only
router.get("/issues", auth, requireSuperAdmin, controller.getAllIssues);
router.patch("/issues/:id/resolve", auth, requireSuperAdmin, controller.resolveIssue);

module.exports = router;