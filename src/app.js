const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const activityRoutes = require("./routes/activities");

function createApp() {
  const app = express();
  app.use(cors({ origin: (process.env.FRONTEND_URL || "*").split(","), credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "studentco-backend", time: new Date().toISOString() })
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/activities", activityRoutes);

  // 404 for unknown API routes
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));
  return app;
}

module.exports = { createApp };
