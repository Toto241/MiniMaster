import { getApps, initializeApp, applicationDefault, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getStorage, Storage } from "firebase-admin/storage";

/**
 * Initializes and returns the Firebase Admin app instance, ensuring it's a singleton.
 * This function is the single point of initialization. It checks if an app is already
 * initialized before creating a new one. It supports both emulator and production environments.
 * @returns {App} The initialized Firebase Admin app instance.
 */
export function getAdminApp(): App {
  if (getApps().length === 0) {
    // In a test environment (emulator), initialize with a project ID.
    if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "test") {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-test" });
    } else {
      // In a production environment, use Application Default Credentials.
      initializeApp({ credential: applicationDefault() });
    }
  }
  return getApps()[0];
}

/**
 * A lazy-loaded getter for the Firestore database service.
 * It uses {@link getAdminApp} to ensure the app is initialized.
 * @returns {Firestore} The Firestore service instance.
 */
export const db = (): Firestore => getFirestore(getAdminApp());

/**
 * A lazy-loaded getter for the Firebase Authentication service.
 * It uses {@link getAdminApp} to ensure the app is initialized.
 * @returns {Auth} The Firebase Authentication service instance.
 */
export const auth = (): Auth => getAuth(getAdminApp());

/**
 * A lazy-loaded getter for the Firebase Cloud Storage service.
 * It uses {@link getAdminApp} to ensure the app is initialized.
 * @returns {Storage} The Firebase Cloud Storage service instance.
 */
export const storage = (): Storage => getStorage(getAdminApp());
