const jwt = require("jsonwebtoken");
const { findById } = require("../store/userStore");

const SECRET = () => process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    SECRET(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token. Login first." });
  try {
    const payload = jwt.verify(token, SECRET());
    const user = findById(payload.sub);
    if (!user) return res.status(401).json({ message: "User no longer exists." });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = { signToken, requireAuth };
