// Quick SMTP check: verifies connection, then sends a test OTP email.
// Usage:
//   npm run test-mail -- you@mail.com
require("dotenv").config();

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run test-mail -- you@mail.com");
    process.exit(1);
  }
  const { verifySmtp, sendOtp } = require("../lib/mailer");
  try {
    await verifySmtp();
    console.log("Sender check OK. Sending test code…");
  } catch (err) {
    console.error("SMTP check failed:", err.message);
    process.exit(1);
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const res = await sendOtp(to, code, "verify-email");
  console.log(`Sent via ${res.via}. Code: ${code} (also in your inbox if via smtp).`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
