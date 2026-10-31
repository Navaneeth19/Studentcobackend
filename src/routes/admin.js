const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getActivities, getRegs } = require("../store/activityStore");
const { readUsers, findByEmail, saveUser } = require("../store/userStore");

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
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
    });
  }
);

module.exports = router;
