import { getApps, initializeApp, applicationDefault, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getStorage, Storage } from "firebase-admin/storage";
import type { SecretManagerServiceClient } from "@google-cloud/secret-manager";

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
  return getApps()[0]!;
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

/**
 * A lazy-loaded, cached getter for the Google Cloud Secret Manager client.
 *
 * The client is heavy (pulls in gRPC + google-gax), so it is required and
 * instantiated only on first use — keeping cold starts and test runs that
 * never touch Secret Manager fast. It authenticates via Application Default
 * Credentials, exactly like the Firebase Admin SDK.
 *
 * @returns {SecretManagerServiceClientType} The cached Secret Manager client.
 */
let secretManagerClient: SecretManagerServiceClient | null = null;
export const secretManager = (): SecretManagerServiceClient => {
  if (!secretManagerClient) {
    // Required lazily (not a static import) so that merely importing this
    // module never pulls in the heavy gRPC stack. The client — and its gRPC
    // channel — is only loaded when a caller actually performs a Secret
    // Manager operation. This keeps cold starts and unit tests that import
    // firebase.ts but never touch Secret Manager fast and side-effect-free.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager") as typeof import("@google-cloud/secret-manager");
    secretManagerClient = new SecretManagerServiceClient() as SecretManagerServiceClient;
  }
  return secretManagerClient;
};
