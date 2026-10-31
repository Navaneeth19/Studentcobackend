const express = require("express");
const crypto = require("crypto");
const {
  getActivities,
  saveActivities,
  findActivity,
  regsFor,
  addReg,
  removeReg,
} = require("../store/activityStore");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function serialize(a, registeredIds = []) {
  return {
    ...a,
    spotsLeft: Math.max(a.seatsTotal - a.seatsTaken, 0),
    registered: registeredIds.includes(a.id),
  };
}

function optionalUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const jwt = require("jsonwebtoken");
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    const { findById } = require("../store/userStore");
    const user = findById(payload.sub);
    if (user) req.user = { id: user.id, role: user.role };
  } catch {
    /* invalid token → treat as guest */
  }
  next();
}

// GET /api/activities?category=&q= — public list (registered=true when authed)
router.get("/", optionalUser, (req, res) => {
  const { category, q } = req.query;
  const mine = req.user ? regsFor(req.user.id) : [];
  let list = getActivities();
  if (category) list = list.filter((a) => a.category === category);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((a) =>
      `${a.title} ${a.category} ${a.venue}`.toLowerCase().includes(needle)
    );
  }
  res.json({ activities: list.map((a) => serialize(a, mine)), count: list.length });
});

// GET /api/activities/:id — public detail
router.get("/:id", optionalUser, (req, res) => {
  const a = findActivity(req.params.id);
  if (!a) return res.status(404).json({ message: "Activity not found." });
  const mine = req.user ? regsFor(req.user.id) : [];
  res.json({ activity: serialize(a, mine) });
});

// GET /api/activities/:id/registrations — attendee list (staff only)
router.get(
  "/:id/registrations",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const a = findActivity(req.params.id);
    if (!a) return res.status(404).json({ message: "Activity not found." });
    const { getRegs } = require("../store/activityStore");
    const { readUsers } = require("../store/userStore");
    const regs = getRegs();
    const memberIds = Object.entries(regs)
      .filter(([, ids]) => ids.includes(a.id))
      .map(([userId]) => userId);
    const byId = new Map(readUsers().map((u) => [u.id, u]));
    const users = memberIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    res.json({ activity: { id: a.id, title: a.title }, count: users.length, users });
  }
);

// POST /api/activities — create (Teacher / Activity Administrator / Principal only)
router.post("/", requireAuth, (req, res) => {
  if (!["Teacher", "Activity Administrator", "Principal"].includes(req.user.role))
    return res.status(403).json({ message: "Only Teachers, Activity Administrators or the Principal can publish activities." });
  const { title, org, category, date, venue, seatsTotal } = req.body || {};
  if (!title || !venue || !Number.isInteger(seatsTotal) || seatsTotal < 1)
    return res
      .status(400)
      .json({ message: "title, venue and a positive integer seatsTotal are required." });
  const activity = {
    id: `act-${crypto.randomBytes(4).toString("hex")}`,
    title: String(title),
    org: String(org || req.user.name || "Campus"),
    category: String(category || "General"),
    date: String(date || "TBA"),
    venue: String(venue),
    seatsTotal,
    seatsTaken: 0,
    level: String(req.body.level || "Open to all"),
    color: String(req.body.color || "#D6FF3F"),
    emoji: String(req.body.emoji || "📌"),
    desc: String(req.body.desc || ""),
    requirements: Array.isArray(req.body.requirements) ? req.body.requirements : [],
  };
  const list = getActivities();
  list.unshift(activity);
  saveActivities(list);
  res.status(201).json({ activity: serialize(activity, []) });
});

// POST /api/activities/:id/register — join (auth required)
router.post("/:id/register", requireAuth, (req, res) => {
  const a = findActivity(req.params.id);
  if (!a) return res.status(404).json({ message: "Activity not found." });
  const mine = regsFor(req.user.id);
  if (mine.includes(a.id)) return res.status(409).json({ message: "Already registered." });
  if (a.seatsTaken >= a.seatsTotal)
    return res.status(409).json({ message: "Activity is full." });

  const list = getActivities().map((x) =>
    x.id === a.id ? { ...x, seatsTaken: x.seatsTaken + 1 } : x
  );
  saveActivities(list);
  const updated = addReg(req.user.id, a.id);
  res.status(201).json({
    activity: serialize({ ...a, seatsTaken: a.seatsTaken + 1 }, updated),
    registered: updated,
  });
});

// DELETE /api/activities/:id/register — leave (auth required)
router.delete("/:id/register", requireAuth, (req, res) => {
  const a = findActivity(req.params.id);
  if (!a) return res.status(404).json({ message: "Activity not found." });
  const mine = regsFor(req.user.id);
  if (!mine.includes(a.id)) return res.status(404).json({ message: "Not registered." });

  const list = getActivities().map((x) =>
    x.id === a.id ? { ...x, seatsTaken: Math.max(x.seatsTaken - 1, 0) } : x
  );
  saveActivities(list);
  const updated = removeReg(req.user.id, a.id);
  res.json({
    activity: serialize({ ...a, seatsTaken: Math.max(a.seatsTaken - 1, 0) }, updated),
    registered: updated,
  });
});

module.exports = router;
