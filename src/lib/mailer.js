// OTP mailer — dev-friendly, production-ready.
// Priority: EmailJS (if EMAILJS_* set) → SMTP (if SMTP_* set) → console log.
// Otherwise logs the code to the console (dev) so the flow works without setup.
// In non-production the API also returns `debugCode` so you can test without email.
function emailJsConfigured() {
  return Boolean(
    process.env.EMAILJS_SERVICE_ID &&
      process.env.EMAILJS_TEMPLATE_ID &&
      process.env.EMAILJS_PUBLIC_KEY
  );
}

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  if (!smtpConfigured()) return null;
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    return null; // nodemailer not installed — fall back to console log
  }
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
  return _transporter;
}

/** Check EmailJS/SMTP connectivity (used by `npm run test-mail`). Throws with a friendly message. */
async function verifySmtp() {
  if (emailJsConfigured()) return true; // verified per-send via the EmailJS API response
  if (!smtpConfigured()) {
    throw new Error(
      "No sender configured. Fill EMAILJS_* (EmailJS) or SMTP_HOST/SMTP_USER/SMTP_PASS in Studentcobackend/.env (see .env.example)."
    );
  }
  const t = transporter();
  if (!t) {
    throw new Error("nodemailer is not installed. Run `npm install` in Studentcobackend.");
  }
  await t.verify();
  return true;
}

const SUBJECTS = {
  "verify-email": "Verify your StudentCo email",
  "reset-password": "Reset your StudentCo password",
  passwordless: "Your StudentCo sign-in code",
};

const INTROS = {
  "verify-email": "Use this code to verify your email address. It expires in 10 minutes.",
  "reset-password":
    "Use this code to reset your password. It expires in 10 minutes. If you didn't ask for this, ignore this email.",
  passwordless:
    "Use this code to sign in without a password. It expires in 10 minutes. If you didn't ask for this, ignore this email.",
};

/**
 * Send via EmailJS REST API (server-side).
 * Needs a template whose "To Email" field is set to {{to_email}} and which
 * uses {{code}}, {{subject}} and {{message}} somewhere in subject/body.
 * Docs: https://www.emailjs.com/docs/rest-api/send/
 */
async function sendViaEmailJs(email, code, subject, text) {
  const toField = process.env.EMAILJS_TO_FIELD || "to_email";
  const codeField = process.env.EMAILJS_CODE_FIELD || "code";
  // Expiry stamp for templates using {{time}} ("valid till …").
  let timeStr = "";
  try {
    const { OTP_TTL_MS } = require("../store/otpStore");
    timeStr = new Date(Date.now() + (OTP_TTL_MS || 600000)).toLocaleString();
  } catch {
    timeStr = new Date(Date.now() + 10 * 60 * 1000).toLocaleString();
  }
  const body = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      [toField]: email,
      // Recipient aliases — covers templates whose To Email uses another name.
      to_email: email,
      email,
      recipient: email,
      to: email,
      [codeField]: code,
      // Code aliases — covers templates using {{code}} or {{passcode}}.
      code,
      passcode: code,
      time: timeStr,
      subject,
      message: text,
      reply_to: process.env.SMTP_FROM || process.env.EMAILJS_REPLY_TO || "",
    },
  };
  // Private key is required for non-browser (server-side) sends.
  if (process.env.EMAILJS_PRIVATE_KEY) body.accessToken = process.env.EMAILJS_PRIVATE_KEY;
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`EmailJS rejected the send (${res.status}): ${errText.slice(0, 200)}`);
  }
}

async function sendOtp(email, code, purpose) {
  const subject = SUBJECTS[purpose] || "Your StudentCo code";
  const intro = INTROS[purpose] || "Your verification code:";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "StudentCo <no-reply@studentco.app>";
  const text = `${intro}\n\n${code}\n\nStudentCo campus app — never share this code.`;

  // 1) EmailJS (your service) — preferred when configured.
  if (emailJsConfigured()) {
    try {
      await sendViaEmailJs(email, code, subject, text);
      return { sent: true, via: "emailjs" };
    } catch (err) {
      console.error(`[otp] EmailJS send failed for ${email}:`, err.message);
      // Fall through to SMTP/console so dev never gets stuck.
    }
  }

  // 2) SMTP (Lark etc.)
  const t = transporter();
  if (t) {
    try {
      await t.sendMail({ from, to: email, subject, text });
      return { sent: true, via: "smtp" };
    } catch (err) {
      console.error(`[otp] SMTP send failed for ${email}:`, err.message);
      // Fall through to console so dev never gets stuck.
    }
  }
  console.log(`[otp:${purpose}] code for ${email}: ${code} (expires in 10 min)`);
  return { sent: false, via: "console" };
}

module.exports = { sendOtp, smtpConfigured, emailJsConfigured, verifySmtp };
