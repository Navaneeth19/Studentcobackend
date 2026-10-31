// Firebase Admin — verifies Firebase ID tokens so a Firebase login can be
// exchanged for a backend session (with the backend role).
// Needs the service-account key file (NEVER commit it):
//   Studentcobackend/.firebase-service-account.json
//   { "project_id": "...", "client_email": "...", "private_key": "..." }

let app = null;

function serviceAccount() {
  // Railway/production: paste the JSON into a FIREBASE_SERVICE_ACCOUNT_JSON variable.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      return null;
    }
  }
  // Local dev: Studentcobackend/.firebase-service-account.json (gitignored).
  const fs = require("fs");
  const path = require("path");
  const file = path.join(__dirname, "..", "..", ".firebase-service-account.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function admin() {
  if (app) return app;
  const creds = serviceAccount();
  if (!creds || !creds.private_key || !creds.client_email) {
    throw new Error(
      "Firebase Admin not configured. Save the service-account JSON to Studentcobackend/.firebase-service-account.json (see README)."
    );
  }
  const adminSdk = require("firebase-admin");
  app = adminSdk.initializeApp({
    credential: adminSdk.credential.cert(creds),
  });
  return adminSdk;
}

async function verifyIdToken(idToken) {
  return admin().auth().verifyIdToken(idToken);
}

async function getAuth() {
  return admin().auth();
}

module.exports = { verifyIdToken, getAuth, serviceAccount };
