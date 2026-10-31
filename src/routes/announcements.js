const express = require("express");
const crypto = require("crypto");
const { getAnnouncements, saveAnnouncements, sorted } = require("../store/announcementStore");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/announcements — public notice board (pinned first, newest first)
router.get("/", (_req, res) => {
  const list = getAnnouncements();
  res.json({ announcements: sorted(list), count: list.length });
});

// POST /api/announcements — publish a notice (staff only)
router.post(
  "/",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const { title = "", body = "" } = req.body || {};
    if (String(title).trim().length < 3)
      return res.status(400).json({ message: "Title needs at least 3 characters." });
    if (String(body).trim().length < 10)
      return res.status(400).json({ message: "Body needs at least 10 characters." });
    const notice = {
      id: `ann-${crypto.randomBytes(4).toString("hex")}`,
      title: String(title).trim(),
      body: String(body).trim(),
      tag: String(req.body.tag || "Notice"),
      activityId: req.body.activityId || null,
      author: req.user.name,
      authorRole: req.user.role,
      pinned: !!req.body.pinned,
      createdAt: new Date().toISOString(),
    };
    const list = getAnnouncements();
    list.unshift(notice);
    saveAnnouncements(list);
    res.status(201).json({ announcement: notice });
  }
);

module.exports = router;
