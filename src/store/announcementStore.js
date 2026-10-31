const fs = require("fs");
const path = require("path");
const seedAnnouncements = require("../data/announcements");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
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

module.exports = { getAnnouncements, saveAnnouncements, sorted };
