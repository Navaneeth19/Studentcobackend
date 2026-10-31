const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.STUDENTCO_DATA_DIR ||
  path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

// ── Hardcoded super admin (always available for dev/CSS debugging) ──
const ADMIN_EMAIL = "admin@studentco.com";
const ADMIN_PASSWORD = "admin123";

function normalizeUser(u) {
  if (!u) return u;
  // Backward-compat: legacy accounts without flags count as verified, version 0.
  if (u.emailVerified === undefined) u.emailVerified = true;
  if (u.tokenVersion === undefined) u.tokenVersion = 0;
  return u;
}

function seedAdmin() {
  const users = readUsers();
  if (!users.find((u) => u.email === ADMIN_EMAIL)) {
    const adminUser = {
      id: "admin-00000000-0000-0000-0000-000000000001",
      name: "Super Admin",
      email: ADMIN_EMAIL,
      role: "Principal",
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      emailVerified: true,
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    };
    users.push(adminUser);
    writeUsers(users);
  }
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

// Seed the hardcoded admin on module load (ensureFile no longer calls seedAdmin,
// which avoids readUsers → ensureFile → seedAdmin → readUsers recursion).
ensureFile();
seedAdmin();

function readUsers() {
  ensureFile();
  try {
    const arr = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
    return (Array.isArray(arr) ? arr : []).map(normalizeUser);
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

function findByEmail(email) {
  const found = readUsers().find(
    (u) => String(u.email || "").toLowerCase() === String(email).toLowerCase()
  );
  return found ? normalizeUser(found) : found;
}

function findById(id) {
  const found = readUsers().find((u) => u.id === id);
  return found ? normalizeUser(found) : found;
}

function saveUser(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

function updateUser(id, patch) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const updated = { ...users[idx], ...patch, id: users[idx].id };
  users[idx] = updated;
  writeUsers(users);
  return updated;
}

function deleteUser(id) {
  const users = readUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  writeUsers(next);
  return true;
}

module.exports = { readUsers, findByEmail, findById, saveUser, updateUser, deleteUser, normalizeUser };
