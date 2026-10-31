const express = require("express");
const { generate } = require("../lib/llm");
const { rateLimit } = require("../lib/rateLimit");

const router = express.Router();
const limit = rateLimit({ max: Number(process.env.AI_MAX_PER_MIN || 30) });

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

// POST /api/assistant/chat — { message, events[], notices[], history[] }
// Tries Groq, falls back to Cerebras, else 502 so the client uses its brain.
router.post("/chat", limit, async (req, res) => {
  const { message = "", events = [], notices = [], history = [] } = req.body || {};
  if (!String(message).trim()) return res.status(400).json({ message: "Ask something first." });
  const system = systemPrompt(events, notices);
  const cleanHistory = Array.isArray(history)
    ? history.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];
  try {
    const { reply, provider, fallback } = await generate(system, [...cleanHistory, { role: "user", content: String(message).slice(0, 2000) }]);
    res.json({ reply, provider, fallback });
  } catch (e) {
    console.error("assistant/chat failed:", e.message);
    res.status(e.status || 502).json({ message: "AI providers unreachable — use the on-device guide." });
  }
});

module.exports = router;
