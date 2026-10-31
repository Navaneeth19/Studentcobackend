const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { findByEmail, saveUser } = require("../store/userStore");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();
const VALID_ROLES = ["Student", "Staff", "Organizer"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

// POST /api/auth/register — create account + return JWT
router.post("/register", async (req, res) => {
  const { name = "", email = "", password = "", role = "Student" } = req.body || {};

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
    return res.status(409).json({ message: "An account with this email already exists. Try logging in." });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: cleanEmail,
    role,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  saveUser(user);

  const token = signToken(user);
  return res.status(201).json({ user: publicUser(user), token });
});

// POST /api/auth/login — verify credentials + return JWT
router.post("/login", async (req, res) => {
  const { email = "", password = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email).trim()) || !String(password))
    return res.status(400).json({ message: "Email and password are required." });

  const user = findByEmail(String(email).trim().toLowerCase());
  if (!user) return res.status(401).json({ message: "No account found for this email." });

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Incorrect password." });

  const token = signToken(user);
  return res.json({ user: publicUser(user), token });
});

// GET /api/auth/me — current session (Bearer token required)
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
