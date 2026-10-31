const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { findById, readUsers } = require("../store/userStore");
const {
  getProfile,
  upsertProfile,
  feedbacksFor,
  saveFeedback,
  statsFor,
  xpFor,
} = require("../store/profileStore");

const router = express.Router();

function publicProfile(user) {
  const profile = getProfile(user.id) || {};
  const { xp, level, stats } = xpFor(user.id);
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    profile: {
      dept: profile.dept || "",
      year: profile.year || "",
      bio: profile.bio || "",
      skills: profile.skills || "",
      link: profile.link || "",
      updatedAt: profile.updatedAt || null,
    },
    xp,
    level,
    stats,
  };
}

// GET /api/profile/me — own profile + XP (auth required)
router.get("/me", requireAuth, (req, res) => {
  const user = findById(req.user.id);
  if (!user) return res.status(404).json({ message: "Account not found." });
  const full = publicProfile(user);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified !== false, createdAt: user.createdAt },
    profile: full.profile,
    xp: full.xp,
    level: full.level,
    stats: full.stats,
  });
});

// PUT /api/profile/me — update own profile (auth required)
// Body: { dept, year, bio, skills, link } — all optional strings.
router.put("/me", requireAuth, (req, res) => {
  const user = findById(req.user.id);
  if (!user) return res.status(404).json({ message: "Account not found." });
  const patch = {};
  if (req.body.dept !== undefined) {
    if (typeof req.body.dept !== "string") return res.status(400).json({ message: "dept must be a string." });
    patch.dept = req.body.dept.slice(0, 80);
  }
  if (req.body.year !== undefined) {
    if (typeof req.body.year !== "string") return res.status(400).json({ message: "year must be a string." });
    patch.year = req.body.year.slice(0, 40);
  }
  if (req.body.bio !== undefined) {
    if (typeof req.body.bio !== "string") return res.status(400).json({ message: "bio must be a string." });
    patch.bio = req.body.bio.slice(0, 1000);
  }
  if (req.body.skills !== undefined) {
    if (typeof req.body.skills !== "string") return res.status(400).json({ message: "skills must be a string." });
    patch.skills = req.body.skills.slice(0, 300);
  }
  if (req.body.link !== undefined) {
    if (typeof req.body.link !== "string") return res.status(400).json({ message: "link must be a string." });
    patch.link = req.body.link.slice(0, 300);
  }
  if (Object.keys(patch).length === 0)
    return res.status(400).json({ message: "Nothing to update (dept, year, bio, skills, link)." });
  const profile = upsertProfile(user.id, patch);
  const { xp, level, stats } = xpFor(user.id);
  res.json({ profile, xp, level, stats });
});

// GET /api/profile/leaderboard?limit=&offset= — top users by XP (public, no emails)
router.get("/leaderboard", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = readUsers().map((u) => publicProfile(u));
  rows.sort((a, b) => b.xp - a.xp || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const total = rows.length;
  const page = rows.slice(offset, offset + limit).map((r, i) => ({ rank: offset + i + 1, ...r }));
  res.json({ users: page, total, limit, offset });
});

// GET /api/profile/feedback/mine — my feedback map (auth required)
router.get("/feedback/mine", requireAuth, (req, res) => {
  res.json({ feedbacks: feedbacksFor(req.user.id) });
});

// POST /api/profile/feedback — save feedback { activityId, stars 1-5, text<=500 } (auth, +10 XP each)
router.post("/feedback", requireAuth, (req, res) => {
  const { activityId = "", stars, text = "" } = req.body || {};
  if (!String(activityId).trim()) return res.status(400).json({ message: "activityId is required." });
  const s = Number(stars);
  if (!Number.isFinite(s) || s < 1 || s > 5)
    return res.status(400).json({ message: "stars must be 1–5." });
  if (typeof text !== "string" || text.length > 500)
    return res.status(400).json({ message: "text must be a string up to 500 characters." });
  const saved = saveFeedback(req.user.id, String(activityId), { stars: s, text });
  const { xp, level, stats } = xpFor(req.user.id);
  res.status(201).json({ feedback: saved, xp, level, stats });
});

// GET /api/profile/:id — public profile + XP (auth required to protect PII)
router.get("/:id", requireAuth, (req, res) => {
  const target = findById(req.params.id);
  if (!target) return res.status(404).json({ message: "User not found." });
  res.json({ user: publicProfile(target) });
});

module.exports = router;
