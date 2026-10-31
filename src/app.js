const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const activityRoutes = require("./routes/activities");
const adminRoutes = require("./routes/admin");
const announcementRoutes = require("./routes/announcements");

function createApp() {
  const app = express();
  // Open CORS: auth uses Bearer tokens (no cookies), so any frontend origin
  // (localhost ports, Firebase hosting, previews) can call the API.
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "studentco-backend", time: new Date().toISOString() })
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/announcements", announcementRoutes);

  // 404 for unknown API routes
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));
  return app;
}

module.exports = { createApp };
