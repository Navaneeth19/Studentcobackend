const fs = require("fs");
const path = require("path");
const seedActivities = require("../data/activities");

const DATA_DIR = process.env.STUDENTCO_DATA_DIR ||
  path.join(__dirname, "..", "..", "data");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const REGS_FILE = path.join(DATA_DIR, "registrations.json");
const CHECKINS_FILE = path.join(DATA_DIR, "checkins.json");

function ensureFile(file, seed) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(seed, null, 2), "utf8");
}

function readJson(file, seed) {
  ensureFile(file, seed);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(seed));
  } catch {
    return seed;
  }
}

function writeJson(file, value) {
  ensureFile(file, value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

// ── Activities ──
const getActivities = () => readJson(ACTIVITIES_FILE, seedActivities);
const saveActivities = (list) => writeJson(ACTIVITIES_FILE, list);
const findActivity = (id) => getActivities().find((a) => a.id === id);

function updateActivity(id, patch) {
  const list = getActivities();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch, id: list[idx].id };
  list[idx] = updated;
  saveActivities(list);
  return updated;
}

function deleteActivity(id) {
  const list = getActivities();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return false;
  saveActivities(next);
  // Clean up dangling references.
  const regs = getRegs();
  let regsChanged = false;
  for (const uid of Object.keys(regs)) {
    if (regs[uid].includes(id)) {
      regs[uid] = regs[uid].filter((x) => x !== id);
      regsChanged = true;
    }
  }
  if (regsChanged) saveRegs(regs);
  const checkins = getCheckins();
  if (checkins[id]) {
    delete checkins[id];
    saveCheckins(checkins);
  }
  return true;
}

// ── Registrations: { [userId]: [activityId, ...] } ──
const getRegs = () => readJson(REGS_FILE, {});
const saveRegs = (regs) => writeJson(REGS_FILE, regs);

function regsFor(userId) {
  return getRegs()[userId] || [];
}

function addReg(userId, activityId) {
  const regs = getRegs();
  const mine = regs[userId] || [];
  if (!mine.includes(activityId)) mine.push(activityId);
  regs[userId] = mine;
  saveRegs(regs);
  return mine;
}

function removeReg(userId, activityId) {
  const regs = getRegs();
  regs[userId] = (regs[userId] || []).filter((id) => id !== activityId);
  saveRegs(regs);
  return regs[userId];
}

// ── Check-ins: { [activityId]: { [userId]: checkedInAtISO } } ──
const getCheckins = () => readJson(CHECKINS_FILE, {});
const saveCheckins = (c) => writeJson(CHECKINS_FILE, c);

function checkinFor(activityId) {
  return getCheckins()[activityId] || {};
}

function markCheckin(userId, activityId) {
  const all = getCheckins();
  const entry = all[activityId] || {};
  if (entry[userId]) return { already: true, at: entry[userId] };
  const at = new Date().toISOString();
  entry[userId] = at;
  all[activityId] = entry;
  saveCheckins(all);
  return { already: false, at };
}

module.exports = {
  getActivities,
  saveActivities,
  findActivity,
  updateActivity,
  deleteActivity,
  getRegs,
  regsFor,
  addReg,
  removeReg,
  getCheckins,
  checkinFor,
  markCheckin,
};
