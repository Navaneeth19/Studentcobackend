const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { findByEmail, findById, saveUser, updateUser } = require("../store/userStore");
const { signToken, requireAuth } = require("../middleware/auth");
const { createOtp, verifyOtp, VALID_PURPOSES } = require("../store/otpStore");
const { sendOtp } = require("../lib/mailer");

const router = express.Router();
// Four roles: Student, Teacher, Activity Administrator, Principal.
// Only Student accounts can be created via this public endpoint —
// staff accounts are created by the school administrator
// (see `npm run create-user`).
const VALID_ROLES = ["Student", "Teacher", "Activity Administrator", "Principal"];
const PUBLIC_SIGNUP_ROLES = ["Student"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerified !== false,
    createdAt: u.createdAt,
  };
}

function devCodePayload() {
  // Return the OTP in the response only outside production so the flow can be
  // tested without configuring SMTP. Production returns message-only.
  if (process.env.NODE_ENV === "production") return {};
  if (String(process.env.OTP_DEBUG_RETURN || "true") !== "true") return {};
  return { _debug: "dev-only" };
}

// POST /api/auth/register — create account + return JWT + send verify OTP
router.post("/register", async (req, res) => {
  const { name = "", email = "", password = "", role = "Student" } = req.body || {};

  if (String(name).trim().length < 2 || String(name).trim().length > 120)
    return res.status(400).json({ message: "Name needs 2–120 characters." });
  if (!EMAIL_RE.test(String(email).trim()) || String(email).length > 254)
    return res.status(400).json({ message: "Enter a valid email address." });
  if (String(password).length < 6 || String(password).length > 200)
    return res.status(400).json({ message: "Password needs 6–200 characters." });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
  if (!PUBLIC_SIGNUP_ROLES.includes(role))
    return res.status(403).json({
      message: "Only Student accounts can be created here. Staff accounts are issued by the school administrator.",
    });

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
    emailVerified: false,
    tokenVersion: 0,
    createdAt: new Date().toISOString(),
  };
  saveUser(user);

  // Best-effort verify-email OTP — never fail registration if mail fails.
  let debugCode;
  try {
    const { code } = createOtp(cleanEmail, "verify-email");
    debugCode = code;
    sendOtp(cleanEmail, code, "verify-email").catch(() => {});
  } catch {
    /* rate-limit etc — user can resend from /verify-email page */
  }

  const token = signToken(user);
  const body = { user: publicUser(user), token, needsVerification: true };
  if (debugCode && process.env.NODE_ENV !== "production") body.debugCode = debugCode;
  return res.status(201).json(body);
});

// POST /api/auth/login — verify credentials + return JWT
router.post("/login", async (req, res) => {
  const { email = "", password = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email).trim()) || !String(password))
    return res.status(400).json({ message: "Email and password are required." });

  const user = findByEmail(String(email).trim().toLowerCase());
  // Generic message to reduce enumeration (still 401 either way).
  if (!user) return res.status(401).json({ message: "Incorrect email or password." });

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Incorrect email or password." });

  const token = signToken(user);
  const u = publicUser(user);
  const body = { user: u, token };
  if (u.emailVerified === false) body.needsVerification = true;
  return res.json(body);
});

// ── OTP: email verification / forgot password / passwordless ──

// POST /api/auth/request-code { email, purpose }
// purpose: verify-email | reset-password | passwordless
router.post("/request-code", async (req, res) => {
  const { email = "", purpose = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email).trim()))
    return res.status(400).json({ message: "Enter a valid email address." });
  if (!VALID_PURPOSES.includes(purpose))
    return res.status(400).json({ message: `Purpose must be one of: ${VALID_PURPOSES.join(", ")}` });

  const cleanEmail = String(email).trim().toLowerCase();

  // For verify-email + reset-password the account must exist (passwordless
  // auto-provisions below, so it can send to new emails too).
  if ((purpose === "verify-email" || purpose === "reset-password") && !findByEmail(cleanEmail)) {
    // Return generic success to avoid enumeration, but don't create/send.
    return res.json({ message: "If an account exists for this email, a code was sent." });
  }

  try {
    const { code } = createOtp(cleanEmail, purpose);
    await sendOtp(cleanEmail, code, purpose);
    const body = { message: "If an account exists for this email, a code was sent. It expires in 10 minutes." };
    if (process.env.NODE_ENV !== "production") body.debugCode = code;
    return res.json(body);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || "Could not send code." });
  }
});

// POST /api/auth/verify-email { email, code } — mark email verified
router.post("/verify-email", (req, res) => {
  const { email = "", code = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email).trim()) || !String(code).trim())
    return res.status(400).json({ message: "Email and 6-digit code are required." });
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    verifyOtp(cleanEmail, "verify-email", String(code).trim());
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
  const user = findByEmail(cleanEmail);
  if (!user) return res.status(404).json({ message: "Account not found." });
  const updated = updateUser(user.id, { emailVerified: true });
  return res.json({ user: publicUser(updated), verified: true });
});

// POST /api/auth/reset-password { email, code, newPassword }
router.post("/reset-password", async (req, res) => {
  const { email = "", code = "", newPassword = "", password = "" } = req.body || {};
  const next = String(newPassword || password);
  if (!EMAIL_RE.test(String(email).trim()) || !String(code).trim())
    return res.status(400).json({ message: "Email and 6-digit code are required." });
  if (next.length < 6 || next.length > 200)
    return res.status(400).json({ message: "New password needs 6–200 characters." });
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    verifyOtp(cleanEmail, "reset-password", String(code).trim());
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
  const user = findByEmail(cleanEmail);
  if (!user) return res.status(404).json({ message: "Account not found." });
  const passwordHash = await bcrypt.hash(next, 10);
  // Bump tokenVersion → all old JWTs are revoked.
  const updated = updateUser(user.id, {
    passwordHash,
    tokenVersion: (user.tokenVersion || 0) + 1,
  });
  const token = signToken(updated);
  return res.json({ user: publicUser(updated), token });
});

// POST /api/auth/passwordless/verify { email, code } — sign in without password
// Auto-provisions a Student account for new emails (matches /firebase behaviour).
router.post("/passwordless/verify", async (req, res) => {
  const { email = "", code = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email).trim()) || !String(code).trim())
    return res.status(400).json({ message: "Email and 6-digit code are required." });
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    verifyOtp(cleanEmail, "passwordless", String(code).trim());
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
  let user = findByEmail(cleanEmail);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: cleanEmail.split("@")[0],
      email: cleanEmail,
      role: "Student",
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
      emailVerified: true, // proved ownership via OTP
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
  } else if (user.emailVerified === false) {
    user = updateUser(user.id, { emailVerified: true });
  }
  const token = signToken(user);
  return res.json({ user: publicUser(user), token });
});

// POST /api/auth/firebase — exchange a Firebase ID token for a backend session.
// Finds the backend user by verified email (keeping their backend role —
// Student, Teacher, Activity Administrator, Principal). First-timers get a
// Student account automatically.
router.post("/firebase", async (req, res) => {
  const { idToken = "" } = req.body || {};
  if (!String(idToken)) return res.status(400).json({ message: "idToken is required." });
  let decoded;
  try {
    const { verifyIdToken } = require("../lib/firebaseAdmin");
    decoded = await verifyIdToken(String(idToken));
  } catch (err) {
    const status = /not configured/i.test(err.message) ? 503 : 401;
    return res.status(status).json({ message: err.message || "Invalid Firebase token." });
  }
  const email = String(decoded.email || "").trim().toLowerCase();
  if (!email) return res.status(401).json({ message: "Firebase token has no email." });

  let user = findByEmail(email);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: String(decoded.name || email.split("@")[0]),
      email,
      role: "Student",
      // Unusable password — this account signs in via Firebase only.
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
      emailVerified: decoded.email_verified !== false,
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
  } else if (decoded.email_verified && user.emailVerified === false) {
    user = updateUser(user.id, { emailVerified: true });
  }
  const token = signToken(user);
  return res.json({ user: publicUser(user), token });
});

// GET /api/auth/me — current session (Bearer token required)
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
