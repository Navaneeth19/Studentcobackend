const jwt = require("jsonwebtoken");
const { findById } = require("../store/userStore");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production.");
  }
  return s || "dev-secret-change-me";
}

const SECRET = getSecret;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, tv: user.tokenVersion || 0 },
    getSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token. Login first." });
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
  const user = findById(payload.sub);
  if (!user) return res.status(401).json({ message: "User no longer exists." });
  // Revoke old JWTs after a password reset (tokenVersion bump).
  const tokenTv = payload.tv ?? 0;
  const currentTv = user.tokenVersion ?? 0;
  if (tokenTv !== currentTv)
    return res.status(401).json({ message: "Session expired. Login again." });
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified !== false };
  next();
}

// Role gate: requireAuth first, then requireRole("Teacher", ...) etc.
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Missing token. Login first." });
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ message: `Requires one of: ${allowed.join(", ")}` });
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
