/*
 * Firebase configuration for the Admin Panel.
 *
 * DO NOT hardcode secrets or site keys here. Instead, inject them at build
 * time via environment variables or use remote configuration. For local
 * development, you can create a `.env` file and load values using a bundler
 * plugin (e.g. Vite or Webpack DefinePlugin).
 */

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  appCheck: {
    provider: 'reCaptchaV3',
    siteKey: process.env.FIREBASE_APP_CHECK_SITE_KEY,
  },
};