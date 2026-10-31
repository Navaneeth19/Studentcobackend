const express = require("express");

const router = express.Router();

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);

// ── Tiny per-IP rate limit (public endpoint guards paid API keys) ──
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.AI_MAX_PER_MIN || 30);
const hits = new Map(); // ip -> [timestamps]
function rateLimited(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const window = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (window.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ message: "Too many questions — wait a minute and ask again." });
  }
  window.push(now);
  hits.set(ip, window);
  next();
}

// PRIVACY: the prompt only ever contains the public board snapshot
// (event + notice titles/dates/venues) sent by the client. No profiles,
// emails, registrations, teams, or check-ins are accepted or forwarded.
function systemPrompt(events, notices) {
  const evLines = (Array.isArray(events) ? events : [])
    .slice(0, 60)
    .map((a) => `- ${a.title || "?"} | ${a.category || "General"} | ${a.date || "TBA"} | ${a.venue || "TBA"} | ${(a.seatsTotal || 0) - (a.seatsTaken || 0)} spots left${a.mode === "team" ? " | TEAM event" : ""}`)
    .join("\n");
  const nLines = (Array.isArray(notices) ? notices : [])
    .slice(0, 30)
    .map((n) => `- ${n.title || "?"} [${n.tag || "Notice"}]${n.pinned ? " (pinned)" : ""}`)
    .join("\n");
  return [
    "You are the StudentCo campus guide, a friendly chatbot for students.",
    "Answer ONLY from the campus board below. If something isn't on the board, say so and suggest the closest match.",
    "PRIVACY RULE (absolute): you have zero access to personal data — no names, emails, registrations, tickets, teams, or attendance. Never ask for personal details, never invent them. If asked about personal stuff (my tickets, my teams, my profile), explain you can't see it and point to the app section instead.",
    "Keep answers short (under 120 words), warm, and specific. Mention dates, venues, and spots left when relevant.",
    "EVENTS BOARD:",
    evLines || "(no events right now)",
    "NOTICES BOARD:",
    nLines || "(no notices right now)",
  ].join("\n");
}

async function chatOnce(url, key, model, system, history, message) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          ...history.slice(-8),
          { role: "user", content: String(message || "").slice(0, 2000) },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }),
    });
    if (!r.ok) {
      const err = new Error(`LLM ${r.status}`);
      err.status = r.status;
      err.body = await r.text().catch(() => "");
      throw err;
    }
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty LLM reply");
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/assistant/chat — { message, events[], notices[], history[] }
// Tries Groq, falls back to Cerebras, else 502 so the client uses its brain.
router.post("/chat", rateLimited, async (req, res) => {
  const { message = "", events = [], notices = [], history = [] } = req.body || {};
  if (!String(message).trim()) return res.status(400).json({ message: "Ask something first." });
  const system = systemPrompt(events, notices);
  const cleanHistory = Array.isArray(history)
    ? history.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  if (process.env.GROQ_API_KEY) {
    try {
      const reply = await chatOnce(GROQ_URL, process.env.GROQ_API_KEY, GROQ_MODEL, system, cleanHistory, message);
      return res.json({ reply, provider: "groq", fallback: false });
    } catch (e) {
      console.error("Groq failed, trying Cerebras:", e.message);
    }
  }
  if (process.env.CEREBRAS_API_KEY) {
    try {
      const reply = await chatOnce(CEREBRAS_URL, process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, system, cleanHistory, message);
      return res.json({ reply, provider: "cerebras", fallback: true });
    } catch (e) {
      console.error("Cerebras failed:", e.message, e.body || "");
    }
  }
  return res.status(502).json({ message: "AI providers unreachable — use the on-device guide." });
});

module.exports = router;
