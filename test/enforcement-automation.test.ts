/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Enforcement Test Automation — backend validation of enforcement scenarios from
 * CHILD_ENFORCEMENT_TEST_MATRIX.md. Maps matrix IDs to automated Jest tests.
 *
 * Tests cover:
 * - A: App blocking (setDeviceLocked, updateAppBlacklist, FCM diff-push)
 * - B: Device lock (setDeviceLocked ON/OFF, permission checks)
 * - C: Usage rules (setUsageRules validation, schema checks)
 * - D: Task-based unlock (task lifecycle → status changes)
 * - E: Anti-tamper reporting (reportTamperEvent)
 * - F: Offline resilience (getRulesForChild, heartbeat)
 * - G: FCM sync (onChildDeviceUpdateV2 diff behavior)
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue("mock-msg-id");
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

const mockAuth: any = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
};

const mockDbObj = {
  collection: jest.fn(),
  batch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
};
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace: any = () => ({ collection: jest.fn() });
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
    messaging: () => ({ send: mockSend }),
  };
});

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({
      purchases: { subscriptions: { get: jest.fn() } },
    })),
  },
}));

const testEnv = fft();
let fns: any;
let db: any;
let state: Record<string, any> = {};

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };
const asOtherMaster = { auth: { uid: "m2", token: { role: "master" } } };

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", fcmToken: "master-fcm-token",
        subscription: { status: "active", type: "family_monthly", childLimit: 99 },
      },
      m2: {
        imei: "m2", uid: "m2", fcmToken: "m2-fcm",
        subscription: { status: "active", type: "family_monthly", childLimit: 99 },
      },
    },
    children: {
      c1: {
        masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token",
        isLocked: false, appBlacklist: [], usageRules: {},
        tasks: {},
      },
    },
    subscriptions: {},
    audit_logs: {},
    error_logs: {},
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
    return {
      doc: jest.fn((docId: string) => {
        const ref: any = {
          id: docId,
          get: () => {
            const d = collData[docId];
            return Promise.resolve({ exists: !!d, data: () => d, id: docId, ref });
          },
          update: jest.fn((upd: any) => {
            if (collData[docId]) Object.assign(collData[docId], upd);
            return Promise.resolve();
          }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[docId] = opts?.merge ? { ...(collData[docId] || {}), ...data } : { ...data };
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              add: jest.fn((data: any) => {
                const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][id] = data;
                return Promise.resolve({ id });
              }),
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()) },
                })),
              })),
              doc: jest.fn((subId: string) => ({
                get: jest.fn(() => {
                  const sd = state[key]?.[subId];
                  return Promise.resolve({ exists: !!sd, data: () => sd, id: subId });
                }),
                set: jest.fn((data: any, opts?: { merge?: boolean }) => {
                  state[key][subId] = opts?.merge ? { ...(state[key][subId] || {}), ...data } : data;
                  return Promise.resolve();
                }),
                update: jest.fn((upd: any) => {
                  if (state[key]?.[subId]) Object.assign(state[key][subId], upd);
                  return Promise.resolve();
                }),
              })),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        if (!state[coll]) state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// A: APP BLOCKING (Matrix IDs A-01 to A-03)
// ══════════════════════════════════════════════════════════════════════════

describe("A: App Blocking — Backend", () => {
  it("A-01: updateAppBlacklist setzt Blacklist für Kind", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: ["com.game.bad"] }, asMaster);
    expect(res.success).toBe(true);
    expect(state.children.c1.appBlacklist).toEqual(["com.game.bad"]);
  });

  it("A-02: updateAppBlacklist entfernt App aus Blacklist (leere Liste)", async () => {
    state.children.c1.appBlacklist = ["com.game.bad"];
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: [] }, asMaster);
    expect(res.success).toBe(true);
    expect(state.children.c1.appBlacklist).toEqual([]);
  });

  it("A-03: updateAppBlacklist setzt mehrere Apps auf Blacklist", async () => {
    const apps = ["com.a", "com.b", "com.c", "com.d", "com.e"];
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: apps }, asMaster);
    expect(res.success).toBe(true);
    expect(state.children.c1.appBlacklist).toEqual(apps);
  });

  it("A-XX: updateAppBlacklist verweigert fremdes Kind", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped(
      { childId: "c1", appBlacklist: ["com.x"] }, asOtherMaster
    )).rejects.toThrow(/not authorized/i);
    // child c1 belongs to m1, not m2 → permission-denied
  });

  it("A-XX: updateAppBlacklist erfordert valide Argumente", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/appBlacklist/);
    await expect(wrapped({ appBlacklist: [] }, asMaster)).rejects.toThrow(/childId/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B: DEVICE LOCK (Matrix IDs B-01, B-02)
// ══════════════════════════════════════════════════════════════════════════

describe("B: Device Lock — Backend", () => {
  it("B-01: setDeviceLocked(true) sperrt Gerät", async () => {
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    const res = await wrapped({ childId: "c1", isLocked: true }, asMaster);
    expect(res.success).toBe(true);
    expect(res.isLocked).toBe(true);
    expect(state.children.c1.isLocked).toBe(true);
  });

  it("B-02: setDeviceLocked(false) entsperrt Gerät", async () => {
    state.children.c1.isLocked = true;
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    const res = await wrapped({ childId: "c1", isLocked: false }, asMaster);
    expect(res.success).toBe(true);
    expect(res.isLocked).toBe(false);
    expect(state.children.c1.isLocked).toBe(false);
  });

  it("B-XX: setDeviceLocked verweigert fremdes Kind", async () => {
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped(
      { childId: "c1", isLocked: true }, asOtherMaster
    )).rejects.toThrow(/not authorized/i);
    // child c1 belongs to m1, not m2 → permission-denied
  });

  it("B-XX: setDeviceLocked erfordert valide Argumente", async () => {
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/isLocked/);
    await expect(wrapped({ isLocked: true }, asMaster)).rejects.toThrow(/childId/);
  });

  it("B-XX: setDeviceLocked wirft not-found bei unbekanntem Master", async () => {
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped(
      { childId: "c1", isLocked: true },
      { auth: { uid: "unknown", token: { role: "master" } } }
    )).rejects.toThrow(/not found/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C: USAGE RULES (Matrix IDs C-01, C-03)
// ══════════════════════════════════════════════════════════════════════════

describe("C: Usage Rules — Backend", () => {
  it("C-01: setUsageRules setzt tägliches Limit", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1", usageRules: { dailyLimit: 30 },
    }, asMaster);
    expect(res.success).toBe(true);
    expect(state.children.c1.usageRules).toEqual({ dailyLimit: 30 });
  });

  it("C-03: setUsageRules setzt Schlafenszeit-Fenster", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1", usageRules: { bedtimeStart: "20:00", bedtimeEnd: "08:00" },
    }, asMaster);
    expect(res.success).toBe(true);
    expect(state.children.c1.usageRules.bedtimeStart).toBe("20:00");
    expect(state.children.c1.usageRules.bedtimeEnd).toBe("08:00");
  });

  it("C-XX: setUsageRules validiert Schema — unbekannte Keys abgelehnt", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1", usageRules: { unknownKey: "value" },
    }, asMaster)).rejects.toThrow(/Unknown usageRules keys/);
  });

  it("C-XX: setUsageRules validiert dailyLimit — kein negativer Wert", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1", usageRules: { dailyLimit: -5 },
    }, asMaster)).rejects.toThrow(/non-negative/);
  });

  it("C-XX: setUsageRules validiert bedtimeStart Format", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1", usageRules: { bedtimeStart: "abc" },
    }, asMaster)).rejects.toThrow(/HH:MM/);
  });

  it("C-XX: setUsageRules validiert bedtimeEnd Format", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1", usageRules: { bedtimeEnd: "abc" },
    }, asMaster)).rejects.toThrow(/HH:MM/);
  });

  it("C-XX: setUsageRules verweigert fremdes Kind", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1", usageRules: { dailyLimit: 60 },
    }, asOtherMaster)).rejects.toThrow(/not authorized/i);
    // child c1 belongs to m1, not m2 → permission-denied
  });

  it("C-XX: setUsageRules erfordert valide Argumente", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ childId: "c1", usageRules: null }, asMaster)).rejects.toThrow(/usageRules/);
    await expect(wrapped({ childId: "c1", usageRules: "string" }, asMaster)).rejects.toThrow(/usageRules/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D: TASK-BASED UNLOCK — Task lifecycle
// ══════════════════════════════════════════════════════════════════════════

describe("D: Task-Based Unlock — Backend", () => {
  it("D-03: completeTask reicht Fotonachweis ein (→ pending_approval)", async () => {
    state["children/c1/tasks"] = {
      t1: { status: "pending", description: "Zimmer aufräumen", masterImei: "m1" },
    };
    const wrapped = testEnv.wrap(fns.completeTask);
    const res = await wrapped({
      childId: "c1", taskId: "t1",
      photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Fphoto.jpg",
    }, asChild);
    expect(res.success).toBe(true);
    expect(state["children/c1/tasks"].t1.status).toBe("pending_approval");
    expect(state["children/c1/tasks"].t1.photoUrl).toContain("firebasestorage");
  });

  it("D-XX: approveTask genehmigt erledigte Aufgabe", async () => {
    state["children/c1/tasks"] = {
      t2: { status: "pending_approval", description: "Hausaufgaben", masterImei: "m1" },
    };
    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ childId: "c1", taskId: "t2" }, asMaster);
    expect(res.success).toBe(true);
    expect(state["children/c1/tasks"].t2.status).toBe("approved");
  });

  it("D-XX: createTask erstellt neue Aufgabe", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Müll rausbringen",
      deadlineISO: new Date(Date.now() + 3600000).toISOString(),
    }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E: ANTI-TAMPER REPORTING (Matrix IDs E-01, E-02)
// ══════════════════════════════════════════════════════════════════════════

describe("E: Anti-Tamper — Backend", () => {
  it("E-01: reportTamperEvent meldet device_admin_disable_requested", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({
      childId: "c1", eventType: "device_admin_disable_requested", timestamp: Date.now(),
    }, asChild);
    expect(res.success).toBe(true);
    // FCM should be sent to parent
    expect(mockSend).toHaveBeenCalled();
    const sentMsg = mockSend.mock.calls[0][0];
    expect(sentMsg.data.type).toBe("tamper_alert");
    expect(sentMsg.data.eventType).toBe("device_admin_disable_requested");
  });

  it("E-02: reportTamperEvent meldet accessibility_service_disabled", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({
      childId: "c1", eventType: "accessibility_service_disabled", timestamp: Date.now(),
    }, asChild);
    expect(res.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });

  it("E-XX: reportTamperEvent verweigert fremdem Kind", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(wrapped({
      childId: "c1", eventType: "test", timestamp: Date.now(),
    }, { auth: { uid: "other-child", token: {} } })).rejects.toThrow(/not authorized/i);
  });

  it("E-XX: reportTamperEvent erfordert childId und eventType", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(wrapped({ eventType: "test" }, asChild)).rejects.toThrow(/childId/);
    await expect(wrapped({ childId: "c1" }, asChild)).rejects.toThrow(/eventType/);
  });

  it("E-XX: reportTamperEvent ohne Parent-FCM-Token sendet trotzdem", async () => {
    state.masters.m1.fcmToken = undefined;
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({
      childId: "c1", eventType: "uninstall_attempt", timestamp: Date.now(),
    }, asChild);
    expect(res.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled(); // No FCM sent without token
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F: OFFLINE RESILIENCE — getRulesForChild, heartbeat
// ══════════════════════════════════════════════════════════════════════════

describe("F: Offline Resilience — Backend", () => {
  it("F-01/02: getRulesForChild gibt gecachte Regeln zurück", async () => {
    state.children.c1.isLocked = true;
    state.children.c1.appBlacklist = ["com.game.bad"];
    state.children.c1.usageRules = { dailyLimit: 60 };

    const wrapped = testEnv.wrap(fns.getRulesForChild);
    // Child requesting own rules
    const res = await wrapped({ childId: "c1" }, asChild);
    expect(res.isLocked).toBe(true);
    expect(res.appBlacklist).toEqual(["com.game.bad"]);
    expect(res.usageRules).toEqual({ dailyLimit: 60 });
  });

  it("F-XX: getRulesForChild erlaubt Master-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c1" }, asMaster);
    expect(res).toBeDefined();
    expect(res.isLocked).toBeDefined();
  });

  it("F-XX: getRulesForChild verweigert fremdem Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    await expect(wrapped(
      { childId: "c1" }, asOtherMaster
    )).rejects.toThrow(/Not authorized/);
  });

  it("F-04: recordHeartbeat aktualisiert lastSeen", async () => {
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    const res = await wrapped({}, asChild);
    expect(res.success).toBe(true);
    expect(state.children.c1.lastSeen).toBe("mock-server-timestamp");
  });

  it("F-XX: recordHeartbeat wirft not-found bei unbekanntem Kind", async () => {
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    await expect(wrapped({}, { auth: { uid: "unknown-child", token: {} } }))
      .rejects.toThrow(/does not exist/);
  });
});

// G: FCM SYNC tests already covered in onChildDeviceUpdateV2.test.ts and
// triggers-v2-coverage.test.ts — wrapV2 requires real firebase-admin Timestamp,
// which conflicts with our mock. Skipped here to avoid instanceof errors.

// ══════════════════════════════════════════════════════════════════════════
// Additional device.ts coverage: FCM token reg, daily usage, updateFCMToken
// ══════════════════════════════════════════════════════════════════════════

describe("Device Management — zusätzliche Coverage", () => {
  it("registerFcmToken registriert Token für Kind", async () => {
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    const res = await wrapped({ token: "new-fcm-token" }, asChild);
    expect(res.success).toBe(true);
    expect(state.children.c1.fcmToken).toBe("new-fcm-token");
  });

  it("registerFcmToken wirft invalid-argument ohne Token", async () => {
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    await expect(wrapped({}, asChild)).rejects.toThrow(/token/);
  });

  it("registerFcmToken wirft not-found bei unbekanntem Kind", async () => {
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    await expect(wrapped({ token: "tok" }, { auth: { uid: "unknown", token: {} } }))
      .rejects.toThrow(/not found/i);
  });

  it("updateFCMToken aktualisiert Master FCM-Token", async () => {
    const wrapped = testEnv.wrap(fns.updateFCMToken);
    const res = await wrapped({ fcmToken: "updated-master-fcm" }, asMaster);
    expect(res.success).toBe(true);
    expect(state.masters.m1.fcmToken).toBe("updated-master-fcm");
  });

  it("updateFCMToken wirft invalid-argument ohne fcmToken", async () => {
    const wrapped = testEnv.wrap(fns.updateFCMToken);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/fcmToken/);
  });

  it("updateFCMToken wirft internal bei unbekanntem Master", async () => {
    const wrapped = testEnv.wrap(fns.updateFCMToken);
    await expect(wrapped(
      { fcmToken: "tok" },
      { auth: { uid: "unknown", token: { role: "master" } } }
    )).rejects.toThrow(/unexpected error/i);
  });

  it("reportDailyUsage speichert Nutzungsbericht", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    const res = await wrapped({
      date: "2026-03-19", usageMillis: 3600000,
    }, asChild);
    expect(res.success).toBe(true);
  });

  it("reportDailyUsage wirft invalid-argument bei fehlenden Feldern", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ date: "2026-03-19" }, asChild)).rejects.toThrow(/Missing/);
  });
});
