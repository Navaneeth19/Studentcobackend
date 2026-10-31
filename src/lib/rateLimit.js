// Tiny per-IP rate limiter (no extra deps). Usage:
//   const limit = rateLimit({ windowMs, max });
//   router.post("/x", limit, handler);

function rateLimit({ windowMs = 60 * 1000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > max)
      return res.status(429).json({ message: "Too many requests. Wait a minute and try again." });
    next();
  };
}

module.exports = { rateLimit };
