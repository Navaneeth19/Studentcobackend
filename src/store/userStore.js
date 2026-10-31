const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

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
