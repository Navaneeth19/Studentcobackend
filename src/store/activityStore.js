const fs = require("fs");
const path = require("path");
const seedActivities = require("../data/activities");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
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
  getRegs,
  regsFor,
  addReg,
  removeReg,
  getCheckins,
  checkinFor,
  markCheckin,
};
