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
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-minimaster",
      firestore: {
        rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
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
    const db = testEnv.authenticatedContext("master-1", { role: "master" }).firestore();

    await assertSucceeds(
      setDoc(doc(db, "children", "child-1", "tasks", "task-1"), {
        description: "Zimmer aufräumen",
        status: "pending",
        masterImei: "master-1",
      })
    );
  });

  it("denies task creation for a non-owning master", async () => {
    const db = testEnv.authenticatedContext("master-2", { role: "master" }).firestore();

    await assertFails(
      setDoc(doc(db, "children", "child-1", "tasks", "task-2"), {
        description: "Unzulässiger Task",
        status: "pending",
        masterImei: "master-2",
      })
    );
  });

  it("denies client writes to subscriptions", async () => {
    const db = testEnv.authenticatedContext("master-1", { role: "master" }).firestore();

    await assertFails(
      setDoc(doc(db, "subscriptions", "sub-1"), {
        masterId: "master-1",
        status: "canceled",
      })
    );
  });

  it("allows an admin to read a child document for support purposes", async () => {
    const db = testEnv.authenticatedContext("operator-1", { role: "admin" }).firestore();

    await assertSucceeds(getDoc(doc(db, "children", "child-1")));
  });
});
