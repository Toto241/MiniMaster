import * as fs from "fs";
import * as path from "path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, doc, getDoc } from "firebase/firestore";

describe("Firestore Security Rules - Emulator Enforcement", () => {
  let testEnv: RulesTestEnvironment | null = null;
  let emulatorAvailable = true;

  const ensureEmulator = (): RulesTestEnvironment | null => {
    if (!emulatorAvailable || !testEnv) {
      // Do not fail local/CI runs where emulator is intentionally not running.
      return null;
    }
    return testEnv;
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
      });
    } catch (error) {
      emulatorAvailable = false;
      testEnv = null;
      console.warn("Firestore emulator not reachable on 127.0.0.1:8080, skipping emulator rules tests.", error);
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

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1"), {
        masterImei: "master-1",
        isLocked: false,
      });
      await setDoc(doc(adminDb, "subscriptions", "sub-1"), {
        masterId: "master-1",
        status: "active",
      });
    });
  });

  it("allows the owning master to create a valid task", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();

    await assertSucceeds(
      setDoc(doc(db, "children", "child-1", "tasks", "task-1"), {
        description: "Zimmer aufräumen",
        status: "pending",
        masterImei: "master-1",
      })
    );
  });

  it("denies task creation for a non-owning master", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-2", { role: "master" }).firestore();

    await assertFails(
      setDoc(doc(db, "children", "child-1", "tasks", "task-2"), {
        description: "Unzulässiger Task",
        status: "pending",
        masterImei: "master-2",
      })
    );
  });

  it("denies client writes to subscriptions", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();

    await assertFails(
      setDoc(doc(db, "subscriptions", "sub-1"), {
        masterId: "master-1",
        status: "canceled",
      })
    );
  });

  it("allows an admin to read a child document for support purposes", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("operator-1", { role: "admin" }).firestore();

    await assertSucceeds(getDoc(doc(db, "children", "child-1")));
  });

  it("denies access to families/* collection (migration guard)", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-1", { role: "admin" }).firestore();

    await assertFails(
      setDoc(doc(db, "families", "family-1"), { name: "TestFamily" })
    );

    await assertFails(
      getDoc(doc(db, "families", "family-1"))
    );
  });

  it("denies unauthenticated access to children", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "children", "child-1")));
  });

  it("denies unauthenticated access to masters", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "masters", "master-1")));
  });

  it("denies child task creation with invalid fields", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();

    // Missing required 'description' field
    await assertFails(
      setDoc(doc(db, "children", "child-1", "tasks", "task-bad"), {
        status: "pending",
        masterImei: "master-1",
      })
    );
  });

  it("denies direct client creation of support tickets", async () => {
    const env = ensureEmulator();
    if (!env) return;
    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();

    await assertFails(
      setDoc(doc(db, "supportTickets", "ticket-1"), {
        masterImei: "master-1",
        problemDescription: "Direkter Schreibversuch",
        status: "open",
      })
    );
  });

  it("denies direct client updates of support access grants", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "supportAccessGrants", "grant-1"), {
        masterImei: "master-1",
        ticketId: "ticket-1",
        status: "active",
      });
    });

    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();
    await assertFails(
      setDoc(doc(db, "supportAccessGrants", "grant-1"), {
        masterImei: "master-1",
        ticketId: "ticket-1",
        status: "revoked",
      }, { merge: true })
    );
  });

  it("allows the owning child to read its own tasks", async () => {
    const env = ensureEmulator();
    if (!env) return;

    // Seed a task first
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1", "tasks", "task-read"), {
        description: "Test",
        status: "pending",
        masterImei: "master-1",
      });
    });

    const db = env.authenticatedContext("child-1").firestore();
    await assertSucceeds(getDoc(doc(db, "children", "child-1", "tasks", "task-read")));
  });

  it("denies cross-tenant task read", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1", "tasks", "task-cross"), {
        description: "Test",
        status: "pending",
        masterImei: "master-1",
      });
    });

    const db = env.authenticatedContext("master-other").firestore();
    await assertFails(getDoc(doc(db, "children", "child-1", "tasks", "task-cross")));
  });
});
