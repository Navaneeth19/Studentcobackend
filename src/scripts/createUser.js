// Create any-role user directly (school administrator tool).
// Public signup (POST /api/auth/register) is Student-only, so staff
// accounts — Teacher, Activity Administrator, Principal — are made here.
//
// Usage:
//   npm run create-user -- "Kiran Patel" kiran@teacher.school secret123 Teacher
//   npm run create-user -- "Meera Krishnan" meera@school.edu secret123 "Activity Administrator"
//   npm run create-user -- "S. Rajan" principal@school.edu secret123 Principal

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { findByEmail, saveUser } = require("../store/userStore");

const VALID_ROLES = ["Student", "Teacher", "Activity Administrator", "Principal"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const [, , name = "", email = "", password = "", role = ""] = process.argv;

  if (String(name).trim().length < 2) {
    console.error('Usage: npm run create-user -- "Full Name" email password "Role"');
    process.exit(1);
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    console.error("Enter a valid email address.");
    process.exit(1);
  }
  if (String(password).length < 6) {
    console.error("Password needs at least 6 characters.");
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Role must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (findByEmail(cleanEmail)) {
    console.error("An account with this email already exists.");
    process.exit(1);
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: cleanEmail,
    role,
    passwordHash: await bcrypt.hash(String(password), 10),
    emailVerified: true,
    tokenVersion: 0,
    createdAt: new Date().toISOString(),
  };
  saveUser(user);
  console.log(`Created ${role}: ${user.name} <${user.email}>`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
