const fs = require("fs");
const path = require("path");
const seedAnnouncements = require("../data/announcements");

const DATA_DIR = process.env.STUDENTCO_DATA_DIR ||
  path.join(__dirname, "..", "..", "data");
const FILE = path.join(DATA_DIR, "announcements.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(seedAnnouncements, null, 2), "utf8");
}

function getAnnouncements() {
  ensureFile();
  try {
    const list = JSON.parse(fs.readFileSync(FILE, "utf8") || "[]");
    return Array.isArray(list) ? list : seedAnnouncements;
  } catch {
    return seedAnnouncements;
  }
}

function saveAnnouncements(list) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), "utf8");
}

// Pinned first, newest first.
function sorted(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function findAnnouncement(id) {
  return getAnnouncements().find((n) => n.id === id);
}

function updateAnnouncement(id, patch) {
  const list = getAnnouncements();
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch, id: list[idx].id };
  list[idx] = updated;
  saveAnnouncements(list);
  return updated;
}

function deleteAnnouncement(id) {
  const list = getAnnouncements();
  const next = list.filter((n) => n.id !== id);
  if (next.length === list.length) return false;
  saveAnnouncements(next);
  return true;
}

module.exports = { getAnnouncements, saveAnnouncements, sorted, findAnnouncement, updateAnnouncement, deleteAnnouncement };
