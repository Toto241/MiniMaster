import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
// Ensure this is done only once, typically at the top level of your index.ts
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Creates a new pairing code for a given childId.
 */
export const createPairingCode = functions.https.onCall(async (data, context) => {
  // Optional: Authentifizierung prüfen
  // if (!context.auth) {
  //   throw new functions.https.HttpsError(
  //     "unauthenticated",
  //     "The function must be called while authenticated."
  //   );
  // }
  // Optional: Berechtigungsprüfung für die childId
  // const userId = context.auth.uid;
  // const canCreateForChild = await checkUserPermissionForChild(userId, data.childId);
  // if (!canCreateForChild) {
  //   throw new functions.https.HttpsError(
  //     "permission-denied",
  //     "You do not have permission to create a pairing code for this child."
  //   );
  // }

  const childId = data.childId;
  if (!childId || typeof childId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid 'childId' string."
    );
  }

  // Code-Generierung (6-stellige Zahl als String)
  const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();

  // Ablaufdatum (24 Stunden in der Zukunft)
  const now = admin.firestore.Timestamp.now();
  const expiresAtSeconds = now.seconds + 24 * 60 * 60; // 24 hours in seconds
  const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

  try {
    // Speichern in Firestore
    const pairingCodeRef = db.collection("pairingCodes").doc(pairingCode);
    await pairingCodeRef.set({
      childId: childId,
      createdAt: now, // Optional: Store creation time for auditing or other purposes
      expiresAt: expiresAt,
    });

    functions.logger.info(`Pairing code ${pairingCode} created for childId ${childId}`);
    return { pairingCode: pairingCode };
  } catch (error), {
    functions.logger.error("Error creating pairing code:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while creating the pairing code.",
      error
    );
  }
});

/**
 * Validates a given pairingCode, and if valid, returns the associated childId
 * and deletes the pairing code.
 */
export const validatePairingCode = functions.https.onCall(async (data, context) => {
  const pairingCode = data.pairingCode;

  if (!pairingCode || typeof pairingCode !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'pairingCode' string."
    );
  }

  const pairingCodeRef = db.collection("pairingCodes").doc(pairingCode);

  try {
    const doc = await pairingCodeRef.get();

    if (!doc.exists) {
      functions.logger.warn(`Pairing code ${pairingCode} not found.`);
      throw new functions.https.HttpsError(
        "not-found",
        "Invalid pairing code."
      );
    }

    const codeData = doc.data();
    if (!codeData) {
      // Should not happen if doc.exists is true, but good for type safety
      functions.logger.error(`Pairing code ${pairingCode} exists but data is undefined.`);
      throw new functions.https.HttpsError(
        "internal",
        "Pairing code data is missing."
      );
    }

    const expiresAt = codeData.expiresAt as admin.firestore.Timestamp;
    const childId = codeData.childId as string;

    if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
        functions.logger.error(`Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
        // Attempt to delete the malformed document
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure."
        );
    }

    if (!childId || typeof childId !== 'string') {
        functions.logger.error(`Pairing code ${pairingCode} has invalid 'childId' field.`);
        // Attempt to delete the malformed document
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure (childId)."
        );
    }

    const now = admin.firestore.Timestamp.now();

    if (now.seconds > expiresAt.seconds) {
      functions.logger.info(`Pairing code ${pairingCode} has expired.`);
      // Code abgelaufen, Dokument löschen
      await pairingCodeRef.delete();
      functions.logger.info(`Expired pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Pairing code has expired."
      );
    }

    // Code ist gültig und nicht abgelaufen
    // Dokument löschen, um Wiederverwendung zu verhindern
    await pairingCodeRef.delete();
    functions.logger.info(`Valid pairing code ${pairingCode} used and deleted for childId ${childId}.`);

    return { childId: childId };

  } catch (error) {
    // Log all other errors, including HttpsError re-throws
    if (error instanceof functions.https.HttpsError) {
        // This will be an HttpsError thrown by our own logic above
        // or a generic one if something else failed in a way that produces HttpsError.
        // Logging it can be useful, but it will be sent to the client as is.
        functions.logger.warn(`Validation failed for code ${pairingCode}:`, error.message, error.code, error.details);
        throw error; // Re-throw HttpsError to be sent to client
    }
    
    // Handle unexpected errors (e.g., Firestore client issues not caught above)
    functions.logger.error(`Unexpected error validating code ${pairingCode}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while validating the pairing code.",
      error // Include original error for server-side logging if needed
    );
  }
});

// Beispiel Firestore-Struktur für `pairingCodes/{generatedCode}`:
// {
//   "childId": "some_child_id_string",
//   "createdAt": "Timestamp(seconds=..., nanoseconds=...)", // Optional
//   "expiresAt": "Timestamp(seconds=..., nanoseconds=...)"
// }

// Helper function for permission check (example, not implemented)
// async function checkUserPermissionForChild(userId: string, childId: string): Promise<boolean> {
//   // Implement logic to check if userId is authorized for childId
//   // e.g., by looking up user roles or child-parent relationships in another collection
//   return true; // Placeholder
// }
