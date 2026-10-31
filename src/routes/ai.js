const express = require("express");
const { generate } = require("../lib/llm");
const { rateLimit } = require("../lib/rateLimit");

const router = express.Router();
const limit = rateLimit({ max: Number(process.env.AI_MAX_PER_MIN || 30) });

// Kind-specific system prompts. The client only ever sends public board
// data + the user's question — no profiles, emails, registrations or teams.
const SYSTEM = {
  describe: (p) =>
    `Write a 2-sentence hype blurb for a campus event. Facts: ${JSON.stringify(p).slice(0, 800)}. Warm, energetic, mention venue/date if present. Plain text, no hashtags.`,
  notice: (p) =>
    `Draft a short campus notice (max 60 words) from these notes: ${JSON.stringify(p).slice(0, 600)}. Match the requested tone. Plain text, one emoji max.`,
  summarize: (p) =>
    `Summarize this campus notice in one punchy line under 140 characters, keeping the key fact (what/where/when): ${(p.text || "").slice(0, 1500)}`,
  story: (p) =>
    `Write a 2-sentence yearbook-style caption celebrating a student's semester from: ${JSON.stringify(p).slice(0, 800)}. Warm, nostalgic, no invented details.`,
  qa: (p) =>
    `Answer this campus-event question in one or two short sentences using ONLY these facts: ${JSON.stringify(p).slice(0, 1200)}. If the answer isn't in the facts, say what's known (title/date/venue/seats) and suggest asking the organizers. Never invent details.`,
  digest: (p) =>
    `Write a 3-line campus pulse briefing from these numbers: ${JSON.stringify(p).slice(0, 600)}. Line 1: events + fill. Line 2: notices + signups. Line 3: one verdict sentence.`,
  anomalies: (p) =>
    `Flag at most 6 items needing attention from this activity list (full events, under-filled big events): ${JSON.stringify(p).slice(0, 1500)}. One short line each with 🔴/🟡, or "All clear — nothing needs attention." if fine.`,
  themes: (p) =>
    `Summarize student feedback into: average vibe in one line, then top 3 themes as short phrases. Feedback: ${JSON.stringify(p).slice(0, 1500)}. If empty, say there are no reviews yet.`,
  fest: (p) =>
    `Propose exactly 3 fest events (kickoff, main event, finale) for this theme: ${JSON.stringify(p).slice(0, 300)}. Reply ONLY as JSON: [{"title":"...","desc":"...","category":"..."}] with no other text.`,
};

function cleanReply(kind, text) {
  if (kind === "fest") {
    // Accept raw JSON or JSON wrapped in code fences.
    const m = String(text).match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.slice(0, 3);
      } catch { /* fall through */ }
    }
  }
  return text;
}

// POST /api/ai/generate { kind, payload } — model text or "" (client uses its
// local engine as fallback). Public endpoint, IP rate-limited.
router.post("/generate", limit, async (req, res) => {
  const { kind = "", payload = {} } = req.body || {};
  if (!SYSTEM[kind]) return res.status(400).json({ message: `Unknown kind. Use one of: ${Object.keys(SYSTEM).join(", ")}` });
  let scrubbed = payload;
  try {
    scrubbed = JSON.parse(JSON.stringify(payload || {}).slice(0, 8000));
  } catch {
    scrubbed = {};
  }
  try {
    const { reply, provider, fallback } = await generate(SYSTEM[kind](scrubbed), [
      { role: "user", content: `kind=${kind} payload=${JSON.stringify(scrubbed).slice(0, 4000)}` },
    ], { max_tokens: kind === "fest" ? 500 : 300 });
    const text = cleanReply(kind, reply);
    if (kind === "fest" && Array.isArray(text)) return res.json({ items: text, provider, fallback });
    res.json({ text, provider, fallback });
  } catch (e) {
    console.error("ai/generate failed:", e.message);
    res.status(e.status || 502).json({ message: "AI unavailable — use the on-device fallback." });
  }
});

module.exports = router;
