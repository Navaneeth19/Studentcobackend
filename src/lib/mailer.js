// OTP mailer — dev-friendly, production-ready.
// If SMTP_* env vars are set AND nodemailer is installed, sends a real email.
// Otherwise logs the code to the console (dev) so the flow works without setup.
// In non-production the API also returns `debugCode` so you can test without email.
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
  });
  return _transporter;
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

async function sendOtp(email, code, purpose) {
  const subject = SUBJECTS[purpose] || "Your StudentCo code";
  const intro = INTROS[purpose] || "Your verification code:";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "StudentCo <no-reply@studentco.app>";
  const text = `${intro}\n\n${code}\n\nStudentCo campus app — never share this code.`;

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

module.exports = { sendOtp, smtpConfigured };
