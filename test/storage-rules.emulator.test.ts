import * as fs from "fs";
import * as path from "path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

describe("Storage Security Rules - Emulator Enforcement", () => {
  let testEnv: RulesTestEnvironment | null = null;
  let emulatorAvailable = true;

  const ensureEmulator = (): RulesTestEnvironment | null => {
    if (!emulatorAvailable || !testEnv) {
      return null;
    }
    return testEnv;
  };

  const getStorage = (uid: string, claims?: Record<string, unknown>) => {
    const env = ensureEmulator();
    if (!env) return null;
    return env.authenticatedContext(uid, claims).storage();
  };

  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: "demo-minimaster",
        firestore: {
          rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8"),
          host: "127.0.0.1",
          port: 8080,
        },
        storage: {
          rules: fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8"),
          host: "127.0.0.1",
          port: 9199,
        },
      });
    } catch (error) {
      emulatorAvailable = false;
      testEnv = null;
      console.warn("Firestore/Storage emulator not reachable on 127.0.0.1:8080/9199, skipping storage rules tests.", error);
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    const env = ensureEmulator();
    if (!env) {
      return;
    }

    await env.clearFirestore();
    await env.clearStorage();

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1"), {
        masterImei: "master-1",
        isLocked: false,
      });
    });
  });

  it("allows the owning child to upload an image proof", async () => {
    const storage = getStorage("child-1");
    if (!storage) return;

    await assertSucceeds(
      storage.ref("children/child-1/photos/proof.jpg").putString("image-bytes", "raw", {
        contentType: "image/jpeg",
      })
    );
  });

  it("allows the owning master to read a child proof", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminStorage = context.storage();
      await adminStorage.ref("children/child-1/photos/proof.jpg").putString("seed-image", "raw", {
        contentType: "image/jpeg",
      });
    });

    const storage = getStorage("master-1", { role: "master" });
    if (!storage) return;

    await assertSucceeds(storage.ref("children/child-1/photos/proof.jpg").getDownloadURL());
  });

  it("denies proof reads to unrelated users", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminStorage = context.storage();
      await adminStorage.ref("children/child-1/photos/proof.jpg").putString("seed-image", "raw", {
        contentType: "image/jpeg",
      });
    });

    const storage = getStorage("master-2", { role: "master" });
    if (!storage) return;

    await assertFails(storage.ref("children/child-1/photos/proof.jpg").getDownloadURL());
  });

  it("denies uploads with non-image MIME types", async () => {
    const storage = getStorage("child-1");
    if (!storage) return;

    await assertFails(
      storage.ref("proofs/child-1/task-1/proof.txt").putString("plain-text", "raw", {
        contentType: "text/plain",
      })
    );
  });

  it("denies uploads at or above the 5 MB limit", async () => {
    const storage = getStorage("child-1");
    if (!storage) return;

    const oversizedPayload = "a".repeat(5 * 1024 * 1024);
    await assertFails(
      storage.ref("proofs/child-1/task-1/oversized.jpg").putString(oversizedPayload, "raw", {
        contentType: "image/jpeg",
      })
    );
  });

  it("denies access to legacy families storage paths", async () => {
    const storage = getStorage("master-1", { role: "master" });
    if (!storage) return;

    await assertFails(
      storage.ref("families/family-1/children/child-1/photos/proof.jpg").putString("legacy", "raw", {
        contentType: "image/jpeg",
      })
    );
  });
});
