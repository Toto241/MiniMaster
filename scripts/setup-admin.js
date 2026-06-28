#!/usr/bin/env node

/**
 * Setup Admin User Script — BREAK-GLASS ONLY.
 *
 * ⚠️  Der NORMALE Weg, den ersten Admin anzulegen, ist IN-APP:
 *     im Operator-Dashboard registrieren und dann "Als ersten Admin
 *     aktivieren" (Cloud Function `bootstrapFirstAdmin`). Dieser Pfad ist
 *     gegen Doppel-Bootstrap abgesichert (Firestore-Sentinel) und braucht
 *     keinen Service-Account-Key.
 *
 * Dieses CLI-Skript ist nur der NOTFALL-Pfad (z. B. wenn die App nicht
 * erreichbar ist) und benötigt einen lokal abgelegten serviceAccountKey.json.
 *
 * It creates a user in Firebase Auth and sets the admin custom claim.
 *
 * Usage:
 *   node scripts/setup-admin.js <email> <password>
 *
 * Example:
 *   node scripts/setup-admin.js admin@example.com SecurePassword123
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Key id of the service-account key that leaked into public git history
// (see docs/SECURITY_INCIDENT_2026-06-27_PUBLIC_HISTORY_LEAK.md). It has been
// revoked in GCP; this guard makes sure a stale copy can never be reused here.
const REVOKED_KEY_ID_PREFIX = "7e76f1c1d4";
const EXPECTED_PROJECT_ID = "minimaster-28fbd";

/**
 * Loads and validates the Firebase Admin service-account credential.
 *
 * Resolution order:
 *   1. GOOGLE_APPLICATION_CREDENTIALS — absolute/relative path to a key JSON
 *      (the GCP-standard env var; keeps the key out of the repo entirely).
 *   2. serviceAccountKey.json in the repository root (git-ignored).
 *
 * Refuses to run on the unfilled template, on the revoked/leaked key, or on a
 * key for a different project, so a misconfiguration fails loudly instead of
 * authenticating with the wrong (or compromised) identity.
 *
 * @returns {object} Parsed, validated service-account credential.
 */
function loadServiceAccount() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const keyPath = envPath
    ? path.resolve(envPath)
    : path.resolve(__dirname, "..", "serviceAccountKey.json");
  const source = envPath ? "GOOGLE_APPLICATION_CREDENTIALS" : "serviceAccountKey.json";

  if (!fs.existsSync(keyPath)) {
    fail(
      `Kein Service-Account-Key gefunden (${source}: ${keyPath}).`,
      "Lege den neuen Key mit  npm run key:install -- -KeyPath <pfad>  ab,",
      "oder setze GOOGLE_APPLICATION_CREDENTIALS auf den Pfad der Key-JSON."
    );
  }

  let key;
  try {
    key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch (error) {
    fail(`Key-Datei ist kein gültiges JSON (${keyPath}): ${error.message}`);
  }

  if (key.private_key_id === "REPLACE_ME" || key.project_id === "REPLACE_WITH_YOUR_PROJECT_ID") {
    fail(
      `Die Key-Datei (${keyPath}) ist noch die unausgefüllte Vorlage.`,
      "Lade in der GCP-Konsole einen NEUEN privaten Schlüssel herunter und",
      "installiere ihn mit  npm run key:install -- -KeyPath <pfad>."
    );
  }
  if (key.type !== "service_account" || !key.private_key || !key.client_email) {
    fail(`Die Key-Datei (${keyPath}) ist kein vollständiger Service-Account-Key.`);
  }
  if (typeof key.private_key_id === "string" && key.private_key_id.startsWith(REVOKED_KEY_ID_PREFIX)) {
    fail(
      `Diese Key-Datei (${keyPath}) ist der WIDERRUFENE, geleakte Schlüssel`,
      `(Key-ID ${REVOKED_KEY_ID_PREFIX}…). Er wurde in GCP gelöscht und darf nicht`,
      "mehr verwendet werden. Lade einen frischen Schlüssel herunter."
    );
  }
  if (key.project_id !== EXPECTED_PROJECT_ID) {
    fail(
      `Die Key-Datei (${keyPath}) gehört zu Projekt "${key.project_id}",`,
      `erwartet wird "${EXPECTED_PROJECT_ID}". Falschen Key verhindert.`
    );
  }

  console.log(`🔑 Service-Account geladen aus ${source} (Key-ID ${String(key.private_key_id).slice(0, 10)}…).`);
  return key;
}

/** Prints the given lines to stderr and exits with status 1. */
function fail(...lines) {
  console.error("❌ " + lines.join("\n   "));
  process.exit(1);
}

// Initialize Firebase Admin SDK with the validated credential.
admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount())
});

const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error("❌ Usage: node scripts/setup-admin.js <email> <password>");
  process.exit(1);
}

const [email, password] = args;

async function setupAdmin() {
  try {
    console.log("Creating admin user...");
    
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true,
    });

    console.log(`✅ User created with UID: ${userRecord.uid}`);

    // Set admin custom claim
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: "admin"
    });

    console.log("✅ Admin custom claim set");
    console.log("");
    console.log("========================================");
    console.log("🎉 Admin user setup complete!");
    console.log("========================================");
    console.log("");
    console.log("You can now log in to the Admin Panel with:");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log("");
    console.log("⚠️  Please change the password after first login!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting up admin user:", error.message);
    process.exit(1);
  }
}

setupAdmin();
