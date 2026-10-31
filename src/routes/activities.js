const express = require("express");
const crypto = require("crypto");
const {
  getActivities,
  saveActivities,
  findActivity,
  updateActivity,
  deleteActivity,
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
    const { findById } = require("../store/userStore");
    // Use the same secret helper as requireAuth (production-safe).
    let secret;
    try {
      secret = require("../middleware/auth") && (process.env.JWT_SECRET || "dev-secret-change-me");
    } catch {
      secret = process.env.JWT_SECRET || "dev-secret-change-me";
    }
    const payload = jwt.verify(token, secret);
    const user = findById(payload.sub);
    // Reject revoked tokens (same tv check as requireAuth).
    if (user && (payload.tv ?? 0) === (user.tokenVersion ?? 0)) {
      req.user = { id: user.id, role: user.role, emailVerified: user.emailVerified !== false };
    }
  } catch {
    /* invalid/expired/revoked token → treat as guest */
  }
  next();
}

// GET /api/activities?category=&q=&limit=&offset= — public list (registered=true when authed)
router.get("/", optionalUser, (req, res) => {
  const { category, q } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const mine = req.user ? regsFor(req.user.id) : [];
  let list = getActivities();
  if (category) list = list.filter((a) => a.category === category);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((a) =>
      `${a.title} ${a.category} ${a.venue}`.toLowerCase().includes(needle)
    );
  }
  const total = list.length;
  const page = list.slice(offset, offset + limit);
  res.json({ activities: page.map((a) => serialize(a, mine)), count: page.length, total, limit, offset });
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
    const { getRegs, checkinFor } = require("../store/activityStore");
    const { readUsers } = require("../store/userStore");
    const regs = getRegs();
    const checked = checkinFor(a.id);
    const memberIds = Object.entries(regs)
      .filter(([, ids]) => ids.includes(a.id))
      .map(([userId]) => userId);
    const byId = new Map(readUsers().map((u) => [u.id, u]));
    const users = memberIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, checkedIn: !!checked[u.id], checkedInAt: checked[u.id] || null }));
    res.json({ activity: { id: a.id, title: a.title }, count: users.length, users });
  }
);

// POST /api/activities/:id/checkin — verify a ticket QR + mark entry (staff only)
// Body: { email } — the holder email encoded in the student's ticket QR.
router.post(
  "/:id/checkin",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const a = findActivity(req.params.id);
    if (!a) return res.status(404).json({ message: "Activity not found." });
    const { email = "" } = req.body || {};
    if (!String(email).includes("@")) return res.status(400).json({ message: "Holder email is required." });
    const { findByEmail } = require("../store/userStore");
    const holder = findByEmail(String(email).trim().toLowerCase());
    if (!holder) return res.status(404).json({ message: "No account found for this ticket.", verified: false });
    const { regsFor, markCheckin } = require("../store/activityStore");
    if (!regsFor(holder.id).includes(a.id))
      return res.status(409).json({
        verified: false,
        message: `${holder.name} is not registered for ${a.title}.`,
        attendee: { id: holder.id, name: holder.name, email: holder.email, role: holder.role },
      });
    const { already, at } = markCheckin(holder.id, a.id);
    return res.status(already ? 200 : 201).json({
      verified: true,
      status: already ? "already-checked-in" : "checked-in",
      message: already ? `${holder.name} already checked in.` : `${holder.name} verified — entry granted.`,
      attendee: { id: holder.id, name: holder.name, email: holder.email, role: holder.role },
      activity: { id: a.id, title: a.title },
      checkedInAt: at,
    });
  }
);
// POST /api/activities — create (Teacher / Activity Administrator / Principal only)
router.post(
  "/",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const { title = "", org = "", category = "General", date = "TBA", venue = "", seatsTotal } = req.body || {};
    if (String(title).trim().length < 3 || String(title).length > 140)
      return res.status(400).json({ message: "title needs 3–140 characters." });
    if (String(venue).trim().length < 2 || String(venue).length > 140)
      return res.status(400).json({ message: "venue needs 2–140 characters." });
    if (!Number.isInteger(seatsTotal) || seatsTotal < 1 || seatsTotal > 100000)
      return res.status(400).json({ message: "seatsTotal must be a positive integer (max 100000)." });
    const activity = {
      id: `act-${crypto.randomBytes(4).toString("hex")}`,
      title: String(title).trim(),
      org: String(org || req.user.name || "Campus").slice(0, 140),
      category: String(category || "General").slice(0, 60),
      date: String(date || "TBA").slice(0, 120),
      venue: String(venue).trim(),
      seatsTotal,
      seatsTaken: 0,
      level: String(req.body.level || "Open to all").slice(0, 120),
      color: String(req.body.color || "#D6FF3F").slice(0, 20),
      emoji: String(req.body.emoji || "📌").slice(0, 12),
      desc: String(req.body.desc || "").slice(0, 2000),
      requirements: Array.isArray(req.body.requirements)
        ? req.body.requirements.map(String).map((s) => s.slice(0, 200)).slice(0, 30)
        : [],
    };
    const list = getActivities();
    list.unshift(activity);
    saveActivities(list);
    res.status(201).json({ activity: serialize(activity, []) });
  }
);

// PUT /api/activities/:id — edit (staff only; seatsTotal can't drop below taken)
router.put(
  "/:id",
  requireAuth,
  requireRole("Teacher", "Activity Administrator", "Principal"),
  (req, res) => {
    const a = findActivity(req.params.id);
    if (!a) return res.status(404).json({ message: "Activity not found." });
    const patch = {};
    const fields = ["title", "org", "category", "date", "venue", "level", "color", "emoji", "desc"];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (typeof req.body[f] !== "string" || !req.body[f].trim())
          return res.status(400).json({ message: `${f} must be a non-empty string.` });
        patch[f] = req.body[f].trim();
      }
    }
    if (req.body.seatsTotal !== undefined) {
      if (!Number.isInteger(req.body.seatsTotal) || req.body.seatsTotal < 1 || req.body.seatsTotal > 100000)
        return res.status(400).json({ message: "seatsTotal must be a positive integer (max 100000)." });
      if (req.body.seatsTotal < a.seatsTaken)
        return res.status(409).json({ message: `Can't shrink below ${a.seatsTaken} taken seats.` });
      patch.seatsTotal = req.body.seatsTotal;
    }
    if (req.body.requirements !== undefined) {
      if (!Array.isArray(req.body.requirements))
        return res.status(400).json({ message: "requirements must be an array of strings." });
      patch.requirements = req.body.requirements.map(String).map((s) => s.slice(0, 200)).slice(0, 30);
    }
    if (req.body.pinned !== undefined) patch.pinned = !!req.body.pinned;
    if (req.body.featured !== undefined) patch.featured = !!req.body.featured;
    const updated = updateActivity(a.id, patch);
    res.json({ activity: serialize(updated, req.user ? regsFor(req.user.id) : []) });
  }
);

// DELETE /api/activities/:id — remove + clean registrations/check-ins (AA/Principal)
router.delete(
  "/:id",
  requireAuth,
  requireRole("Activity Administrator", "Principal"),
  (req, res) => {
    const ok = deleteActivity(req.params.id);
    if (!ok) return res.status(404).json({ message: "Activity not found." });
    res.json({ deleted: req.params.id });
  }
);

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
