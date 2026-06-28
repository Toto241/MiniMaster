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

// Initialize Firebase Admin SDK
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
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
