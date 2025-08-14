import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

// Single point of init – will only be called when truly needed
export function getAdminApp() {
  if (getApps().length === 0) {
    // In tests: control via ENV to prevent ADC lookup
    if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "test") {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-test" });
    } else {
      // Production: normal ADC or explicit credentials
      initializeApp({ credential: applicationDefault() });
    }
  }
  return getApps()[0];
}

// Convenient getters - themselves are "lazy"
export const db = () => getFirestore(getAdminApp());
export const auth = () => getAuth(getAdminApp());
export const storage = () => getStorage(getAdminApp());
