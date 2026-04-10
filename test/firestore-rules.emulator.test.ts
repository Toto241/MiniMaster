import * as fs from "fs";
import * as path from "path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, doc, getDoc, updateDoc } from "firebase/firestore";

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

  it("denies direct client creation of child commands", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();
    await assertFails(
      setDoc(doc(db, "children", "child-1", "commands", "cmd-1"), {
        type: "lock-device",
        status: "pending",
        createdAt: "2026-04-10T10:00:00.000Z",
      })
    );
  });

  it("allows the owning child to acknowledge allowed command fields only", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1", "commands", "cmd-ack"), {
        status: "pending",
        ackedAt: null,
        errorCode: null,
        type: "lock-device",
      });
    });

    const db = env.authenticatedContext("child-1").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "children", "child-1", "commands", "cmd-ack"), {
        status: "acked",
        ackedAt: "2026-04-10T10:05:00.000Z",
      })
    );
  });

  it("denies child command acknowledgement when extra fields are modified", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1", "commands", "cmd-bad"), {
        status: "pending",
        ackedAt: null,
        errorCode: null,
        type: "lock-device",
      });
    });

    const db = env.authenticatedContext("child-1").firestore();
    await assertFails(
      updateDoc(doc(db, "children", "child-1", "commands", "cmd-bad"), {
        status: "acked",
        type: "unlock-device",
      })
    );
  });

  it("allows only the owning child to publish valid immutable events", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("child-1").firestore();
    await assertSucceeds(
      setDoc(doc(db, "children", "child-1", "events", "evt-1"), {
        eventId: "evt-1",
        eventType: "usage_report",
        payload: { totalUsageMillis: 1234 },
        idempotencyKey: "idem-1",
        senderPlatform: "android",
        createdAt: "2026-04-10T10:10:00.000Z",
      })
    );
  });

  it("denies event creation from non-owning users", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("master-1", { role: "master" }).firestore();
    await assertFails(
      setDoc(doc(db, "children", "child-1", "events", "evt-2"), {
        eventId: "evt-2",
        eventType: "tamper_event",
        payload: { severity: "high" },
        idempotencyKey: "idem-2",
        senderPlatform: "android",
        createdAt: "2026-04-10T10:10:00.000Z",
      })
    );
  });

  it("denies event mutation after creation", async () => {
    const env = ensureEmulator();
    if (!env) return;

    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "children", "child-1", "events", "evt-locked"), {
        eventId: "evt-locked",
        eventType: "tamper_event",
        payload: { severity: "high" },
        idempotencyKey: "idem-locked",
        senderPlatform: "android",
        createdAt: "2026-04-10T10:12:00.000Z",
      });
    });

    const db = env.authenticatedContext("child-1").firestore();
    await assertFails(
      updateDoc(doc(db, "children", "child-1", "events", "evt-locked"), {
        eventType: "usage_report",
      })
    );
  });

  it("allows the owning child to write valid usage history entries", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("child-1").firestore();
    await assertSucceeds(
      setDoc(doc(db, "children", "child-1", "usageHistory", "2026-04-10"), {
        date: "2026-04-10",
        totalUsageMillis: 12345,
      })
    );
  });

  it("denies malformed usage history writes even for the owning child", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("child-1").firestore();
    await assertFails(
      setDoc(doc(db, "children", "child-1", "usageHistory", "2026-04-11"), {
        date: "2026-04-11",
        totalUsageMillis: "a lot",
        extraField: true,
      })
    );
  });

  it("denies direct client writes to tamper events", async () => {
    const env = ensureEmulator();
    if (!env) return;

    const db = env.authenticatedContext("child-1").firestore();
    await assertFails(
      setDoc(doc(db, "children", "child-1", "tamperEvents", "tamper-1"), {
        eventType: "accessibility_disabled",
        createdAt: "2026-04-10T10:15:00.000Z",
      })
    );
  });
});
