const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getActivities, getRegs } = require("../store/activityStore");
const { readUsers } = require("../store/userStore");

const router = express.Router();

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

module.exports = router;
