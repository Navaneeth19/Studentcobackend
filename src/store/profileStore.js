const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.STUDENTCO_DATA_DIR || path.join(__dirname, "..", "..", "data");
const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");
const FEEDBACKS_FILE = path.join(DATA_DIR, "feedbacks.json");

function ensureFile(file, seed) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(seed, null, 2), "utf8");
}

function readJson(file, seed) {
  ensureFile(file, seed);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(seed));
    return raw && typeof raw === "object" ? raw : seed;
  } catch {
    return seed;
  }
}

function writeJson(file, value) {
  ensureFile(file, value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

// ── Profiles: { [userId]: { dept, year, bio, skills, link, updatedAt } ──
const getProfiles = () => readJson(PROFILES_FILE, {});
const saveProfiles = (p) => writeJson(PROFILES_FILE, p);
const getProfile = (userId) => getProfiles()[userId] || null;

function upsertProfile(userId, patch) {
  const all = getProfiles();
  const next = { ...(all[userId] || {}), ...patch, updatedAt: new Date().toISOString() };
  all[userId] = next;
  saveProfiles(all);
  return next;
}

// ── Feedbacks: { [userId]: { [activityId]: { stars, text, at } } } ──
const getAllFeedbacks = () => readJson(FEEDBACKS_FILE, {});
const saveAllFeedbacks = (f) => writeJson(FEEDBACKS_FILE, f);
const feedbacksFor = (userId) => getAllFeedbacks()[userId] || {};

function saveFeedback(userId, activityId, { stars, text }) {
  const all = getAllFeedbacks();
  const mine = all[userId] || {};
  mine[activityId] = {
    stars: Math.max(1, Math.min(5, Number(stars) || 5)),
    text: String(text || "").slice(0, 500),
    at: new Date().toISOString(),
  };
  all[userId] = mine;
  saveAllFeedbacks(all);
  return mine[activityId];
}

// ── XP ──
// Mirrors frontend calcXP (gamify.js) for the parts the backend can verify:
//   10 per registration · 15 per check-in (attended) · 10 per feedback.
// (Frontend additionally counts squad-led + saved-locally, which live in
// RTDB/localStorage — the backend leaderboard notes that.)
const XP_PER_JOIN = 10;
const XP_PER_ATTENDED = 15;
const XP_PER_FEEDBACK = 10;

const LEVELS = [
  { level: 1, name: "Newcomer", at: 0 },
  { level: 2, name: "Explorer", at: 50 },
  { level: 3, name: "Regular", at: 120 },
  { level: 4, name: "Champion", at: 220 },
  { level: 5, name: "Legend", at: 350 },
];

function levelForXP(xp) {
  let cur = LEVELS[0];
  let nxt = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].at) cur = LEVELS[i];
    else {
      nxt = LEVELS[i];
      break;
    }
  }
  const pct = nxt
    ? Math.min(100, Math.round(((xp - cur.at) / (nxt.at - cur.at)) * 100))
    : 100;
  return { ...cur, next: nxt, pct };
}

function statsFor(userId, { regs, checkins } = {}) {
  const { regsFor, getCheckins } = require("./activityStore");
  const joinedIds = regs || regsFor(userId);
  const allCheckins = checkins || getCheckins();
  let attended = 0;
  for (const aid of Object.keys(allCheckins)) {
    if (allCheckins[aid] && allCheckins[aid][userId]) attended += 1;
  }
  const feedbacks = Object.keys(feedbacksFor(userId)).length;
  return { joined: joinedIds.length, attended, feedbacks };
}

function xpFor(userId, precomputed) {
  const stats = precomputed || statsFor(userId);
  const xp = stats.joined * XP_PER_JOIN + stats.attended * XP_PER_ATTENDED + stats.feedbacks * XP_PER_FEEDBACK;
  return { xp, level: levelForXP(xp), stats };
}

module.exports = {
  getProfiles,
  getProfile,
  upsertProfile,
  getAllFeedbacks,
  feedbacksFor,
  saveFeedback,
  statsFor,
  xpFor,
  levelForXP,
  XP_PER_JOIN,
  XP_PER_ATTENDED,
  XP_PER_FEEDBACK,
};
