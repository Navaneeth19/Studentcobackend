const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.STUDENTCO_DATA_DIR || path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "otps.json");

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 10 * 60 * 1000); // 10 min
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 30 * 1000); // 30s
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_MAX_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR || 5);

const VALID_PURPOSES = ["verify-email", "reset-password", "passwordless"];

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readOtps() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8") || "[]";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeOtps(rows) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function key(email, purpose) {
  return `${String(email).trim().toLowerCase()}::${purpose}`;
}

function prune(rows, now = Date.now()) {
  return rows.filter((r) => r.expiresAt > now);
}

// Rate-limit check before issuing a new OTP.
function canIssue(email, purpose, now = Date.now()) {
  const rows = readOtps();
  const k = key(email, purpose);
  const recent = rows.filter((r) => r.key === k);
  const last = recent.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (last && now - last.createdAt < OTP_RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - last.createdAt)) / 1000),
      reason: "cooldown",
    };
  }
  const hourAgo = now - 60 * 60 * 1000;
  const countHour = rows.filter((r) => r.key === k && r.createdAt > hourAgo).length;
  if (countHour >= OTP_MAX_PER_HOUR) {
    return { ok: false, reason: "rate-limited" };
  }
  return { ok: true };
}

function createOtp(email, purpose) {
  if (!VALID_PURPOSES.includes(purpose)) throw new Error("Invalid purpose.");
  const cleanEmail = String(email).trim().toLowerCase();
  const now = Date.now();
  const gate = canIssue(cleanEmail, purpose, now);
  if (!gate.ok) {
    const err = new Error(
      gate.reason === "cooldown"
        ? `Wait ${gate.retryAfterSec}s before requesting a new code.`
        : "Too many codes requested. Try again in an hour."
    );
    err.status = 429;
    if (gate.retryAfterSec) err.retryAfterSec = gate.retryAfterSec;
    throw err;
  }
  // 6-digit numeric OTP — no ambiguous leading-zero issue (100000-999999).
  const code = String(crypto.randomInt(100000, 1000000));
  const rows = prune(readOtps(), now).filter((r) => r.key !== key(cleanEmail, purpose));
  const record = {
    key: key(cleanEmail, purpose),
    email: cleanEmail,
    purpose,
    codeHash: hashCode(code),
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
  };
  rows.push(record);
  writeOtps(rows);
  return { code, expiresAt: record.expiresAt };
}

function verifyOtp(email, purpose, code, { consume = true } = {}) {
  const cleanEmail = String(email).trim().toLowerCase();
  const now = Date.now();
  const rows = readOtps();
  const k = key(cleanEmail, purpose);
  const idx = rows.findIndex((r) => r.key === k);
  if (idx === -1) {
    const err = new Error("No code found. Request a new one first.");
    err.status = 400;
    throw err;
  }
  const rec = rows[idx];
  if (rec.expiresAt <= now) {
    writeOtps(rows.filter((_, i) => i !== idx));
    const err = new Error("Code expired. Request a new one.");
    err.status = 400;
    throw err;
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    writeOtps(rows.filter((_, i) => i !== idx));
    const err = new Error("Too many wrong attempts. Request a new code.");
    err.status = 429;
    throw err;
  }
  const ok = rec.codeHash === hashCode(String(code).trim());
  if (!ok) {
    rec.attempts += 1;
    // Lock out after max attempts — drop the record.
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      writeOtps(rows.filter((_, i) => i !== idx));
      const err = new Error("Too many wrong attempts. Request a new code.");
      err.status = 429;
      throw err;
    }
    writeOtps(rows);
    const left = OTP_MAX_ATTEMPTS - rec.attempts;
    const err = new Error(`Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`);
    err.status = 400;
    throw err;
  }
  if (consume) {
    writeOtps(rows.filter((_, i) => i !== idx));
  }
  return { email: cleanEmail, purpose };
}

function peekValid(email, purpose) {
  const rows = readOtps();
  const rec = rows.find((r) => r.key === key(email, purpose));
  if (!rec || rec.expiresAt <= Date.now()) return null;
  return rec;
}

module.exports = {
  VALID_PURPOSES,
  OTP_TTL_MS,
  createOtp,
  verifyOtp,
  peekValid,
  hashCode,
};
