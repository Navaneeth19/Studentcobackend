const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

// ── Hardcoded super admin (always available for dev/CSS debugging) ──
const ADMIN_EMAIL = "admin@studentco.com";
const ADMIN_PASSWORD = "admin123";

function seedAdmin() {
  const users = readUsers();
  if (!users.find((u) => u.email === ADMIN_EMAIL)) {
    const adminUser = {
      id: "admin-00000000-0000-0000-0000-000000000001",
      name: "Super Admin",
      email: ADMIN_EMAIL,
      role: "Principal",
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
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
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

function findByEmail(email) {
  return readUsers().find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );
}

function findById(id) {
  return readUsers().find((u) => u.id === id);
}

function saveUser(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

module.exports = { readUsers, findByEmail, findById, saveUser };
