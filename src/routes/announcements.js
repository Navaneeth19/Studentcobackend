const express = require("express");
const crypto = require("crypto");
const { getAnnouncements, saveAnnouncements, sorted, findAnnouncement, updateAnnouncement, deleteAnnouncement } = require("../store/announcementStore");
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
    if (String(title).trim().length < 3 || String(title).length > 140)
      return res.status(400).json({ message: "Title needs 3–140 characters." });
    if (String(body).trim().length < 10 || String(body).length > 5000)
      return res.status(400).json({ message: "Body needs 10–5000 characters." });
    const notice = {
      id: `ann-${crypto.randomBytes(4).toString("hex")}`,
      title: String(title).trim(),
      body: String(body).trim(),
      tag: String(req.body.tag || "Notice").slice(0, 40),
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

// PUT /api/announcements/:id — edit (staff only)
router.put(
  "/:id",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const existing = findAnnouncement(req.params.id);
    if (!existing) return res.status(404).json({ message: "Notice not found." });
    const patch = {};
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== "string" || req.body.title.trim().length < 3 || req.body.title.length > 140)
        return res.status(400).json({ message: "Title needs 3–140 characters." });
      patch.title = req.body.title.trim();
    }
    if (req.body.body !== undefined) {
      if (typeof req.body.body !== "string" || req.body.body.trim().length < 10 || req.body.body.length > 5000)
        return res.status(400).json({ message: "Body needs 10–5000 characters." });
      patch.body = req.body.body.trim();
    }
    if (req.body.tag !== undefined) patch.tag = String(req.body.tag).slice(0, 40) || "Notice";
    if (req.body.activityId !== undefined) patch.activityId = req.body.activityId || null;
    if (req.body.pinned !== undefined) patch.pinned = !!req.body.pinned;
    const updated = updateAnnouncement(existing.id, patch);
    res.json({ announcement: updated });
  }
);

// DELETE /api/announcements/:id — remove (AA/Principal)
router.delete(
  "/:id",
  requireAuth,
  requireRole("Activity Administrator", "Principal"),
  (req, res) => {
    const ok = deleteAnnouncement(req.params.id);
    if (!ok) return res.status(404).json({ message: "Notice not found." });
    res.json({ deleted: req.params.id });
  }
);

module.exports = router;
