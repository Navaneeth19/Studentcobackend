// Creates/updates the Firebase Auth users that mirror the backend seeds,
// so one email+password works for Firebase login AND the backend link
// hands them their real backend role.
// Needs Studentcobackend/.firebase-service-account.json in place.
//
// Usage: npm run seed-firebase

const { getAuth } = require("../lib/firebaseAdmin");

const USERS = [
  { name: "Aarav Mehta", email: "aarav.mehta@gmail.com", password: "aarav123" },
  { name: "Kiran Patel", email: "kiran@teacher.school", password: "kiran123" },
  { name: "Anita Desai", email: "anita@teacher.school", password: "anita123" },
  { name: "Meera Krishnan", email: "meera@school.edu", password: "meera123" },
  { name: "Ravi Shankar", email: "ravi@school.edu", password: "ravi123" },
];

async function main() {
  const auth = await getAuth();
  for (const u of USERS) {
    try {
      const existing = await auth.getUserByEmail(u.email).catch(() => null);
      if (existing) {
        await auth.updateUser(existing.uid, {
          password: u.password,
          displayName: u.name,
          emailVerified: true,
        });
        console.log(`Updated Firebase user: ${u.email}`);
      } else {
        await auth.createUser({
          email: u.email,
          password: u.password,
          displayName: u.name,
          emailVerified: true,
        });
        console.log(`Created Firebase user: ${u.email}`);
      }
    } catch (err) {
      console.error(`FAILED ${u.email}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
