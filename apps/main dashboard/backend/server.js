/**
 * Configures the main backend Express server, shared middleware, route mounting,
 * service proxy endpoints, and background workers for alerts and AI processing.
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

if (typeof global.fetch !== "function") {
  try {
    global.fetch = require("node-fetch");
  } catch (e) {
    console.warn(
      "fetch() is not available. Install node-fetch@2 or upgrade Node to 18+."
    );
  }
}

const app = express();

app.use(cors({ origin: true, credentials: true }));

const cookieParser = require("cookie-parser");
app.use(cookieParser());

app.use(express.json());

const idleTimeout = require("./middleware/idleTimeout.middleware");
app.use(idleTimeout);

const accessAudit = require("./middleware/accessAudit.middleware");
app.use(accessAudit);

const environmentRoutes = require("./routes/environment.routes");
const authenticate = require("./middleware/auth.middleware");
const { assertExhibitorOwnership } = require("./utils/exhibitorAccess");
const supportRoutes = require("./routes/support.routes");

app.get("/health", (req, res) =>
  res.json({ ok: true, service: "backend", time: new Date().toISOString() })
);

function extractExhibitorIdFromProxyPath(rawPath = "") {
  const match = String(rawPath).match(/\/api\/exhibitor\/([^/]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function enforceExhibitorProxyOwnership(req, rawPath) {
  if (req.user?.role !== "exhibitor") return;
  const targetExhibitorId = extractExhibitorIdFromProxyPath(rawPath);
  if (!targetExhibitorId) return;
  await assertExhibitorOwnership(req, targetExhibitorId);
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const EXHIBITOR_AI_SERVICE_URL =
  process.env.EXHIBITOR_AI_SERVICE_URL || "http://127.0.0.1:8001";

app.get("/api/exhibitor-ai/health", async (req, res) => {
  try {
    const r = await fetch(`${EXHIBITOR_AI_SERVICE_URL}/health`);
    res.status(r.status).send(await r.text());
  } catch (e) {
    res.status(502).json({
      error: "Exhibitor AI service unreachable",
      detail: String(e),
    });
  }
});

app.get("/api/exhibitor-ai/*path", authenticate, async (req, res) => {
  try {
    const path = req.originalUrl.replace("/api/exhibitor-ai", "");
    await enforceExhibitorProxyOwnership(req, path);
    const r = await fetch(`${EXHIBITOR_AI_SERVICE_URL}${path}`);
    const contentType = r.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      res.status(r.status).json(await r.json());
    } else {
      res.status(r.status).send(await r.text());
    }
  } catch (e) {
    res.status(e?.statusCode || 502).json({
      error: e?.statusCode ? "Forbidden" : "Exhibitor AI proxy failed",
      detail: e?.message || String(e),
    });
  }
});

app.get("/api/exhibitor-ai-download/*path", authenticate, async (req, res) => {
  try {
    const path = req.originalUrl.replace("/api/exhibitor-ai-download", "");
    await enforceExhibitorProxyOwnership(req, path);
    const r = await fetch(`${EXHIBITOR_AI_SERVICE_URL}${path}`);

    const disp = r.headers.get("content-disposition");
    const type = r.headers.get("content-type");
    if (disp) res.setHeader("Content-Disposition", disp);
    if (type) res.setHeader("Content-Type", type);

    res.status(r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(e?.statusCode || 502).json({
      error: e?.statusCode ? "Forbidden" : "Exhibitor AI download proxy failed",
      detail: e?.message || String(e),
    });
  }
});

app.use("/energy", require("./routes/energy.routes.js"));
app.use("/devices", require("./routes/devices.routes.js"));
app.use("/events", require("./routes/events.routes.js"));
app.use("/exhibitors", require("./routes/exhibitors.routes.js"));
app.use("/booths", require("./routes/booths.routes.js"));
app.use("/dashboard", require("./routes/dashboard.routes.js"));
app.use("/nav", require("./routes/nav.routes.js"));
app.use("/api", require("./routes/nav.routes.js"));
app.use("/ai", require("./routes/ai.routes.js"));
app.use("/alerts", require("./routes/alerts.routes.js"));
app.use("/environment", environmentRoutes);
app.use("/sustainability", require("./routes/sustainability.routes.js"));
app.use("/reports", require("./routes/reports.routes.js"));
app.use("/support", supportRoutes);

app.use("/auth", require("./routes/auth"));
app.use("/users", require("./routes/users.routes.js"));
app.use("/compliance", require("./routes/compliance.routes.js"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

try {
  const enabled =
    String(process.env.ALERT_ENGINE_ENABLED ?? "true").toLowerCase() !== "false";

  if (enabled) {
    const { runOnce: runRuleEngine } = require("./utils/alertEngine");

    runRuleEngine().catch((e) =>
      console.warn("[alertEngine] first run failed:", e.message)
    );

    setInterval(() => {
      runRuleEngine().catch((e) =>
        console.warn("[alertEngine] run failed:", e.message)
      );
    }, 15000);
  }
} catch (e) {
  console.warn("[alertEngine] disabled or not available:", e.message);
}

try {
  const aiEnabled =
    String(process.env.AI_ALERT_WORKER_ENABLED ?? "true").toLowerCase() !== "false";

  if (aiEnabled) {
    const { runOnce: runAiAlerts } = require("./utils/aiAlertWorker");

    (async () => {
      try {
        await runAiAlerts();
      } catch (e) {
        console.warn("[aiAlertWorker] first run failed:", e.message);
      }
    })();

    setInterval(async () => {
      try {
        await runAiAlerts();
      } catch (e) {
        console.warn("[aiAlertWorker] run failed:", e.message);
      }
    }, 15000);
  }
} catch (e) {
  console.warn("[aiAlertWorker] disabled or not available:", e.message);
}