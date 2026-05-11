/**
 * Defines proxy routes that forward navigation, room, IoT, event, and static
 * asset requests from the main dashboard backend to the navigation service.
 */

const express = require("express");
const router = express.Router();

const NAV_BASE = process.env.NAVMESH_BASE_URL || "http://127.0.0.1:5000";

async function fetchNav(path, method = "GET", body) {
  const url = `${NAV_BASE}${path}`;
  const opts = { method, headers: {} };

  if (method !== "GET" && method !== "HEAD") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body ?? {});
  }

  const r = await fetch(url, opts);
  const contentType = r.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return { ok: r.ok, status: r.status, contentType, data: await r.json(), headers: r.headers };
  }

  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: r.ok, status: r.status, contentType, data: buf, headers: r.headers };
}

async function forward(req, res, path, method = "GET") {
  try {
    const out = await fetchNav(path, method, req.body);

    res.status(out.status);

    if (!String(out.contentType || "").includes("application/json")) {
      if (out.contentType) res.setHeader("Content-Type", out.contentType);
      return res.send(out.data);
    }

    return res.json(out.data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Nav proxy failed: ${e.message}` });
  }
}

router.get("/health", (req, res) => forward(req, res, "/api/health"));
router.get("/navmesh", (req, res) => forward(req, res, "/api/navmesh"));
router.post("/pathfind", (req, res) => forward(req, res, "/api/pathfind", "POST"));

router.get("/rooms", async (req, res) => {
  try {
    const r1 = await fetchNav("/api/rooms", "GET");

    if (String(r1.contentType).includes("application/json") && r1.ok) {
      return res.status(200).json(r1.data);
    }

    const r2 = await fetchNav("/api/navmesh", "GET");
    if (!r2.ok || !String(r2.contentType).includes("application/json")) {
      return res.status(502).json({
        ok: false,
        error: "Failed to load rooms from navigation backend (rooms + navmesh fallback failed).",
      });
    }

    const nav = r2.data || {};
    let rooms =
      (Array.isArray(nav.rooms) && nav.rooms) ||
      (Array.isArray(nav.rooms_metadata) && nav.rooms_metadata) ||
      [];

    if (!rooms.length && Array.isArray(nav.nodes)) {
      rooms = nav.nodes
        .filter((n) => n && n.type === "room")
        .map((n) => ({
          id: n.id,
          name: n.name || n.id,
          position: n.position || null,
          polygon: n.polygon || null,
        }));
    }

    return res.status(200).json(rooms);
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Rooms proxy failed: ${e.message}` });
  }
});

router.post("/iot/update", (req, res) => forward(req, res, "/api/iot/update", "POST"));
router.get("/iot/data", (req, res) => forward(req, res, "/api/iot/data"));
router.get("/iot/summary", (req, res) => forward(req, res, "/api/iot/summary"));
router.post("/iot/reload", (req, res) => forward(req, res, "/api/iot/reload", "POST"));

router.get("/events", (req, res) => forward(req, res, "/api/events"));
router.post("/events/reload", (req, res) => forward(req, res, "/api/events/reload", "POST"));
router.get("/halls/:hall/events", (req, res) =>
  forward(req, res, `/api/halls/${encodeURIComponent(req.params.hall)}/events`)
);
router.get("/halls/:hall/events/:eventId/exhibitors", (req, res) =>
  forward(
    req,
    res,
    `/api/halls/${encodeURIComponent(req.params.hall)}/events/${encodeURIComponent(req.params.eventId)}/exhibitors`
  )
);

router.get("/static/*path", (req, res) => forward(req, res, req.path));

module.exports = router;