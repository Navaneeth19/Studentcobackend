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

  // Tiny request logger (method, path, status, ms).
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "studentco-backend", time: new Date().toISOString() })
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/announcements", announcementRoutes);

  // 404 for unknown API routes
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  // Central error handler: JSON shape is always { message }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Something went wrong." });
  });
  return app;
}

module.exports = { createApp };
