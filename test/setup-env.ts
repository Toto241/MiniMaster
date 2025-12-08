process.env.NODE_ENV = "test";
process.env.GCLOUD_PROJECT = "demo-test";
process.env.FUNCTIONS_EMULATOR = "true";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-test" });

// If you use emulators (recommended), set the ports:
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST || "http://127.0.0.1:9199";

// Set a dummy OpenAI API key for tests (prevents initialization errors)
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-api-key-not-used";
