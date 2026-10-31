// Shared LLM plumbing: Groq primary, Cerebras fallback.
// Keys live in env vars only — never log them, never send them to clients.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);

function providers() {
  const list = [];
  if (process.env.GROQ_API_KEY)
    list.push({ name: "groq", url: GROQ_URL, key: process.env.GROQ_API_KEY, model: GROQ_MODEL });
  if (process.env.CEREBRAS_API_KEY)
    list.push({ name: "cerebras", url: CEREBRAS_URL, key: process.env.CEREBRAS_API_KEY, model: CEREBRAS_MODEL });
  return list;
}

async function chatOnce(url, key, model, system, messages, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: opts.max_tokens || 400,
        temperature: opts.temperature ?? 0.7,
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

// Try each configured provider in order. Returns { reply, provider, fallback }.
async function generate(system, messages, opts) {
  const ps = providers();
  let firstErr = null;
  for (let i = 0; i < ps.length; i++) {
    try {
      const reply = await chatOnce(ps[i].url, ps[i].key, ps[i].model, system, messages, opts);
      return { reply, provider: ps[i].name, fallback: i > 0 };
    } catch (e) {
      console.error(`${ps[i].name} failed:`, e.message, e.body || "");
      if (!firstErr) firstErr = e;
    }
  }
  const err = new Error(firstErr ? "AI providers unreachable" : "No AI provider configured");
  err.status = 502;
  throw err;
}

module.exports = { generate };
