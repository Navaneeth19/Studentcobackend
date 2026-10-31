const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getActivities, getRegs } = require("../store/activityStore");
const { readUsers, findByEmail, findById, saveUser, updateUser, deleteUser } = require("../store/userStore");

const router = express.Router();
const VALID_ROLES = ["Student", "Teacher", "Activity Administrator", "Principal"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/overview — campus-wide stats
// (Activity Administrator / Principal only)
router.get(
  "/overview",
  requireAuth,
  requireRole("Activity Administrator", "Principal"),
  (_req, res) => {
    const list = getActivities();
    const regs = getRegs();
    const users = readUsers();

    const seatsTotal = list.reduce((n, a) => n + (a.seatsTotal || 0), 0);
    const seatsTaken = list.reduce((n, a) => n + (a.seatsTaken || 0), 0);
    const totalRegs = Object.values(regs).reduce((n, ids) => n + ids.length, 0);

    const byCategory = {};
    for (const a of list) {
      const c = byCategory[a.category || "General"] || {
        category: a.category || "General",
        activities: 0,
        seatsTotal: 0,
        seatsTaken: 0,
      };
      c.activities += 1;
      c.seatsTotal += a.seatsTotal || 0;
      c.seatsTaken += a.seatsTaken || 0;
      byCategory[a.category || "General"] = c;
    }

    const registeredIds = new Set(Object.values(regs).flat());
    const byRole = {};
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
    }

    res.json({
      totals: {
        activities: list.length,
        seatsTotal,
        seatsTaken,
        registrations: totalRegs,
        fillPct: seatsTotal ? Math.round((seatsTaken / seatsTotal) * 100) : 0,
        accounts: users.length,
        activeParticipants: registeredIds.size,
        accountsByRole: byRole,
      },
      byCategory: Object.values(byCategory).map((c) => ({
        ...c,
        fillPct: c.seatsTotal ? Math.round((c.seatsTaken / c.seatsTotal) * 100) : 0,
      })),
      activities: list.map((a) => {
        const count = Object.values(regs).filter((ids) => ids.includes(a.id)).length;
        return {
          id: a.id,
          title: a.title,
          category: a.category,
          venue: a.venue,
          date: a.date,
          seatsTotal: a.seatsTotal,
          seatsTaken: a.seatsTaken,
          registeredCount: count,
          fillPct: a.seatsTotal ? Math.round((a.seatsTaken / a.seatsTotal) * 100) : 0,
        };
      }),
    });
  }
);

// POST /api/admin/users — Principal creates an account of any role.
router.post(
  "/users",
  requireAuth,
  requireRole("Principal"),
  async (req, res) => {
    const { name = "", email = "", password = "", role = "" } = req.body || {};
    if (String(name).trim().length < 2)
      return res.status(400).json({ message: "Name needs at least 2 characters." });
    if (!EMAIL_RE.test(String(email).trim()))
      return res.status(400).json({ message: "Enter a valid email address." });
    if (String(password).length < 6)
      return res.status(400).json({ message: "Password needs at least 6 characters." });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ message: `Role must be one of: ${VALID_ROLES.join(", ")}` });

    const cleanEmail = String(email).trim().toLowerCase();
    if (findByEmail(cleanEmail))
      return res.status(409).json({ message: "An account with this email already exists." });

    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: cleanEmail,
      role,
      passwordHash: await bcrypt.hash(String(password), 10),
      emailVerified: true,
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: true, createdAt: user.createdAt },
    });
  }
);

function sanitize(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: u.emailVerified !== false, createdAt: u.createdAt };
}

// GET /api/admin/users — account directory (?role=&q=&limit=&offset=)
router.get(
  "/users",
  requireAuth,
  requireRole("Activity Administrator", "Principal"),
  (req, res) => {
    const { role, q } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    let list = readUsers();
    if (role) list = list.filter((u) => u.role === role);
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(needle));
    }
    const total = list.length;
    res.json({ users: list.slice(offset, offset + limit).map(sanitize), total, limit, offset });
  }
);

// PATCH /api/admin/users/:id — rename / change role (Principal only)
router.patch(
  "/users/:id",
  requireAuth,
  requireRole("Principal"),
  (req, res) => {
    const target = findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });
    const patch = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || req.body.name.trim().length < 2 || req.body.name.length > 120)
        return res.status(400).json({ message: "Name needs 2–120 characters." });
      patch.name = req.body.name.trim();
    }
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role))
        return res.status(400).json({ message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
      if (target.id === req.user.id && req.body.role !== "Principal")
        return res.status(409).json({ message: "You can't demote yourself." });
      if (target.role === "Principal" && req.body.role !== "Principal") {
        const principals = readUsers().filter((u) => u.role === "Principal");
        if (principals.length <= 1)
          return res.status(409).json({ message: "Can't demote the last Principal." });
      }
      patch.role = req.body.role;
    }
    if (Object.keys(patch).length === 0)
      return res.status(400).json({ message: "Nothing to update (name, role)." });
    res.json({ user: sanitize(updateUser(target.id, patch)) });
  }
);

// DELETE /api/admin/users/:id — remove account + regs/check-ins (Principal)
router.delete(
  "/users/:id",
  requireAuth,
  requireRole("Principal"),
  (req, res) => {
    const target = findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });
    if (target.id === req.user.id)
      return res.status(409).json({ message: "You can't delete yourself." });
    if (target.role === "Principal" && readUsers().filter((u) => u.role === "Principal").length <= 1)
      return res.status(409).json({ message: "Can't delete the last Principal." });
    deleteUser(target.id);
    const { getRegs, getCheckins } = require("../store/activityStore");
    const fs = require("fs");
    const path = require("path");
    const dataDir = process.env.STUDENTCO_DATA_DIR || path.join(__dirname, "..", "..", "data");
    const regs = getRegs();
    if (regs[target.id]) {
      delete regs[target.id];
      fs.writeFileSync(path.join(dataDir, "registrations.json"), JSON.stringify(regs, null, 2), "utf8");
    }
    const checkins = getCheckins();
    let touched = false;
    for (const aid of Object.keys(checkins)) {
      if (checkins[aid][target.id]) {
        delete checkins[aid][target.id];
        touched = true;
      }
    }
    if (touched) fs.writeFileSync(path.join(dataDir, "checkins.json"), JSON.stringify(checkins, null, 2), "utf8");
    res.json({ deleted: target.id });
  }
);

// POST /api/admin/users/:id/reset-password — set a new password (Principal)
router.post(
  "/users/:id/reset-password",
  requireAuth,
  requireRole("Principal"),
  async (req, res) => {
    const target = findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });
    const { password = "" } = req.body || {};
    if (String(password).length < 6 || String(password).length > 200)
      return res.status(400).json({ message: "Password needs 6–200 characters." });
    updateUser(target.id, {
      passwordHash: await bcrypt.hash(String(password), 10),
      tokenVersion: (target.tokenVersion || 0) + 1,
    });
    res.json({ reset: target.id });
  }
);

module.exports = router;
