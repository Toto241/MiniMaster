/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import * as admin from "firebase-admin";

type DocData = Record<string, any>;

const state: {
  masters: Record<string, DocData>;
  children: Record<string, DocData & { tasks?: Record<string, DocData>; usageHistory?: Record<string, DocData> }>;
  pairingCodes: Record<string, DocData>;
  pairingTokens: Record<string, DocData>;
  subscriptions: Record<string, DocData>;
  supportTickets: Record<string, DocData>;
  supportAccessGrants: Record<string, DocData>;
  masterLegalConsents: Record<string, DocData>;
  audit_logs: Record<string, DocData>;
  error_logs: Record<string, DocData>;
  performance_metrics: Record<string, DocData>;
} = {
  masters: {},
  children: {},
  pairingCodes: {},
  pairingTokens: {},
  subscriptions: {},
  supportTickets: {},
  supportAccessGrants: {},
  masterLegalConsents: {},
  audit_logs: {},
  error_logs: {},
  performance_metrics: {},
};

let autoId = 0;
const nextId = (prefix: string) => `${prefix}-${++autoId}`;

function snapshotOf(id: string, data: DocData | undefined, ref: any) {
  return {
    id,
    exists: !!data,
    data: () => data,
    ref,
  };
}

function getCollectionMap(collection: string) {
  if (collection === "masters") return state.masters;
  if (collection === "children") return state.children as Record<string, DocData>;
  if (collection === "pairingCodes") return state.pairingCodes;
  if (collection === "pairingTokens") return state.pairingTokens;
  if (collection === "subscriptions") return state.subscriptions;
  if (collection === "supportTickets") return state.supportTickets;
  if (collection === "supportAccessGrants") return state.supportAccessGrants;
  if (collection === "masterLegalConsents") return state.masterLegalConsents;
  if (collection === "audit_logs") return state.audit_logs;
  if (collection === "error_logs") return state.error_logs;
  if (collection === "performance_metrics") return state.performance_metrics;
  return {} as Record<string, DocData>;
}

function childSubCollectionDoc(childId: string, sub: "tasks" | "usageHistory", docId?: string) {
  const id = docId ?? nextId(sub === "tasks" ? "task" : "usage");
  const ref = {
    id,
    async get() {
      const child = state.children[childId] || {};
      const store = sub === "tasks" ? (child.tasks || {}) : (child.usageHistory || {});
      const data = store[id];
      return snapshotOf(id, data, ref);
    },
    async set(data: DocData, opts?: { merge?: boolean }) {
      if (!state.children[childId]) state.children[childId] = { childImei: childId };
      if (!state.children[childId][sub]) state.children[childId][sub] = {} as any;
      const store = state.children[childId][sub] as Record<string, DocData>;
      store[id] = opts?.merge ? { ...(store[id] || {}), ...data } : { ...data };
    },
    async update(data: DocData) {
      if (!state.children[childId]) state.children[childId] = { childImei: childId };
      if (!state.children[childId][sub]) state.children[childId][sub] = {} as any;
      const store = state.children[childId][sub] as Record<string, DocData>;
      store[id] = { ...(store[id] || {}), ...data };
    },
    async delete() {
      const child = state.children[childId];
      if (!child) return;
      const store = child[sub] as Record<string, DocData> | undefined;
      if (store) delete store[id];
    },
  };
  return ref;
}

function docRef(collection: string, id: string) {
  const map = getCollectionMap(collection);
  const ref: any = {
    id,
    async get() {
      return snapshotOf(id, map[id], ref);
    },
    async set(data: DocData, opts?: { merge?: boolean }) {
      map[id] = opts?.merge ? { ...(map[id] || {}), ...data } : { ...data };
    },
    async update(data: DocData) {
      map[id] = { ...(map[id] || {}), ...data };
    },
    async delete() {
      delete map[id];
    },
    collection(sub: string) {
      if (collection === "children" && (sub === "tasks" || sub === "usageHistory")) {
        return {
          doc: (subId?: string) => childSubCollectionDoc(id, sub as "tasks" | "usageHistory", subId),
        };
      }
      return { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) };
    },
  };
  return ref;
}

function querySnapshot(docs: any[]) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb: (doc: any) => void) => docs.forEach(cb),
  };
}

const mockFirestore: any = {
  collection: (name: string) => ({
    doc: (id: string) => docRef(name, id),
    add: async (data: DocData) => {
      const id = nextId(name);
      getCollectionMap(name)[id] = { ...data };
      return { id, get: async () => snapshotOf(id, getCollectionMap(name)[id], docRef(name, id)) };
    },
    where: (field: string, _op: string, value: any) => {
      const getMatchingDocs = () => {
        const docs = Object.entries(getCollectionMap(name))
          .filter(([, data]) => data && data[field] === value)
          .map(([id, data]) => snapshotOf(id, data, docRef(name, id)));
        return docs;
      };

      return {
        get: async () => querySnapshot(getMatchingDocs()),
        orderBy: (_orderField: string, _direction?: string) => ({
          limit: (_limit: number) => ({
            get: async () => querySnapshot(getMatchingDocs()),
          }),
        }),
      };
    },
  }),
  collectionGroup: (name: string) => ({
    where: (field: string, _op: string, value: any) => ({
      get: async () => {
        if (name !== "tasks") return querySnapshot([]);
        const docs: any[] = [];
        Object.entries(state.children).forEach(([childId, child]) => {
          const tasks = child.tasks || {};
          Object.entries(tasks).forEach(([taskId, data]) => {
            if (data[field] === value) {
              docs.push(
                snapshotOf(taskId, data, {
                  delete: async () => {
                    const tasks = state.children[childId].tasks;
                    if (tasks) {
                      delete tasks[taskId];
                    }
                  },
                })
              );
            }
          });
        });
        return querySnapshot(docs);
      },
    }),
  }),
  batch: () => {
    const updates: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: DocData) => {
        updates.push(async () => ref.update(data));
      },
      commit: async () => {
        await Promise.all(updates.map((u) => u()));
      },
    };
  },
};

const authMock = {
  setCustomUserClaims: jest.fn(async () => undefined),
  deleteUser: jest.fn(async () => undefined),
  getUser: jest.fn(async (uid: string) => ({ uid, customClaims: { role: "master" } })),
  createCustomToken: jest.fn(async () => "custom-token"),
};

const mockSubscriptionGet = jest.fn();

jest.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({})),
    },
    androidpublisher: jest.fn(() => ({
      purchases: {
        subscriptions: {
          get: mockSubscriptionGet,
        },
      },
    })),
  },
}));

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockFirestore),
}));

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn(async () => "msg-id") })),
}));

jest.mock("firebase-admin", () => {
  class LocalTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() {
      const now = Date.now();
      return new LocalTimestamp(Math.floor(now / 1000), (now % 1000) * 1_000_000);
    }
    static fromDate(date: Date) {
      const ms = date.getTime();
      return new LocalTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
    }
    static fromMillis(ms: number) {
      return new LocalTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
    }
    toMillis() {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
    }
  }

  const firestoreNamespace = () => mockFirestore;
  (firestoreNamespace as any).Timestamp = LocalTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "server-ts",
  };

  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => authMock,
  };
});

const testEnv = fft();
let fns: any;

const asAdmin = { auth: { uid: "admin-1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };

beforeAll(() => {
  process.env.OPENAI_API_KEY = "test-key";
  fns = require("../index");
});

afterAll(() => {
  testEnv.cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  autoId = 0;
  state.masters = { m1: { secretKey: "sec", subscription: { status: "active", type: "premium" } } };
  state.children = {
    c1: {
      childImei: "c1",
      masterImei: "m1",
      fcmToken: "child-fcm",
      tasks: {
        t1: { status: "pending", masterImei: "m1" },
      },
    },
  };
  state.pairingCodes = {};
  state.pairingTokens = {};
  state.subscriptions = { sub1: { masterId: "m1", status: "active" } };
  state.supportTickets = {
    "ticket-1": { masterImei: "m1", status: "open", accessGranted: false },
  };
  state.supportAccessGrants = {
    "grant-1": { masterImei: "m1", ticketId: "ticket-1", status: "active" },
  };
  state.masterLegalConsents = {
    "m1_DE_de-DE": { masterImei: "m1", country: "DE", locale: "de-DE" },
  };
  state.audit_logs = {
    "audit-1": { userId: "m1", action: "auth.login" },
  };
  state.error_logs = {
    "error-1": { userId: "m1", functionName: "deleteUserAccount" },
  };
  state.performance_metrics = {
    "metric-1": { userId: "m1", functionName: "deleteUserAccount" },
  };

  const expiresMs = Date.now() + 24 * 60 * 60 * 1000;
  const validUntil = admin.firestore.Timestamp.fromMillis(expiresMs);
  state.pairingTokens["tok-valid"] = { masterImei: "m1", expiresAt: validUntil };

  mockSubscriptionGet.mockResolvedValue({
    data: {
      purchaseState: 0,
      expiryTimeMillis: Date.now() + 60_000,
    },
  });
});

describe("coverage high impact callable suite", () => {
  it("setzt Admin Claim und widerruft Subscription", async () => {
    const setAdminClaim = testEnv.wrap(fns.setAdminClaim);
    const revokeSubscription = testEnv.wrap(fns.revokeSubscription);

    const claimRes = await setAdminClaim({ uid: "user-2" }, asAdmin);
    expect(claimRes.message).toMatch(/Success/);

    const revokeRes = await revokeSubscription({ subscriptionId: "sub1" }, asAdmin);
    expect(revokeRes.message).toMatch(/successfully revoked/);
    expect(state.subscriptions.sub1.status).toBe("revoked");
    expect(state.masters.m1.isPremium).toBe(false);
  });

  it("deckt createPairingCode und validatePairingCode ab", async () => {
    const createPairingCode = testEnv.wrap(fns.createPairingCode);
    const validatePairingCode = testEnv.wrap(fns.validatePairingCode);

    const codeRes = await createPairingCode({}, asMaster);
    expect(codeRes.pairingCode).toHaveLength(6);

    const validateRes = await validatePairingCode({ pairingCode: codeRes.pairingCode }, asChild);
    expect(validateRes).toEqual({ childId: "c1" });
    expect(state.children.c1.masterImei).toBe("m1");
  });

  it("deckt registerMasterDevice, generatePairingLink, validatePairingToken ab", async () => {
    const registerMasterDevice = testEnv.wrap(fns.registerMasterDevice);
    const generatePairingLink = testEnv.wrap(fns.generatePairingLink);
    const validatePairingToken = testEnv.wrap(fns.validatePairingToken);

    state.masters = {};
    state.children = {};

    const regRes = await registerMasterDevice({ imei: "m1" }, asMaster);
    expect(regRes).toEqual(expect.objectContaining({ masterId: "m1", customToken: "custom-token" }));

    const tokenRes = await generatePairingLink({}, asMaster);
    expect(typeof tokenRes.pairingToken).toBe("string");

    const valRes = await validatePairingToken({ pairingToken: "tok-valid" }, asChild);
    expect(valRes).toHaveProperty("masterId", "m1");
    expect(valRes).toHaveProperty("childId", "c1");
  });

  it("deckt verifyPurchase und updateFCMToken ab", async () => {
    const verifyPurchase = testEnv.wrap(fns.verifyPurchase);
    const updateFCMToken = testEnv.wrap(fns.updateFCMToken);

    const verifyRes = await verifyPurchase({ purchaseToken: "pt", sku: "single_child_monthly" }, asMaster);
    expect(verifyRes).toEqual({ success: true, subscriptionStatus: "active" });

    const fcmRes = await updateFCMToken({ fcmToken: "master-fcm" }, asMaster);
    expect(fcmRes).toEqual({ success: true });
    expect(state.masters.m1.fcmToken).toBe("master-fcm");
  });

  it("deckt deleteUserAccount ab", async () => {
    const deleteUserAccount = testEnv.wrap(fns.deleteUserAccount);

    state.children.c2 = {
      childImei: "c2",
      masterImei: "m1",
      tasks: {
        t99: { status: "pending", masterImei: "m1" },
      },
    };
    state.subscriptions.sub2 = { masterId: "m1", status: "active" };

    const res = await deleteUserAccount({}, asMaster);
    expect(res).toEqual({ success: true });
    expect(state.masters.m1).toBeUndefined();
    expect(state.masterLegalConsents["m1_DE_de-DE"]).toBeUndefined();
    expect(state.supportAccessGrants["grant-1"]).toBeUndefined();
    expect(state.audit_logs["audit-1"]).toBeUndefined();
    expect(state.error_logs["error-1"]).toBeUndefined();
    expect(state.performance_metrics["metric-1"]).toBeUndefined();
    expect(authMock.deleteUser).toHaveBeenCalledWith("m1");
  });

  it("deckt Support-Ticket-Flow inkl. Feedback ab", async () => {
    const createSupportTicket = testEnv.wrap(fns.createSupportTicket);
    const grantSupportAccess = testEnv.wrap(fns.grantSupportAccess);
    const revokeSupportAccess = testEnv.wrap(fns.revokeSupportAccess);
    const provideSolutionFeedback = testEnv.wrap(fns.provideSolutionFeedback);

    const createRes = await createSupportTicket({
      problemDescription: "App blockiert nicht",
      allowSupportAccess: false,
      consentSource: "test",
    }, asMaster);
    expect(createRes.success).toBe(true);

    const ticketId = createRes.ticketId as string;
    const grantRes = await grantSupportAccess({ ticketId }, asMaster);
    expect(grantRes.success).toBe(true);

    const grantId = grantRes.grantId as string;
    const revokeRes = await revokeSupportAccess({ grantId }, asMaster);
    expect(revokeRes).toEqual({ success: true });

    state.supportTickets[ticketId].masterImei = "m1";
    const feedbackRes = await provideSolutionFeedback({ ticketId, feedback: "accepted" }, asMaster);
    expect(feedbackRes.success).toBe(true);
    expect(state.supportTickets[ticketId].status).toBe("closed_by_ai");
  });

  it("deckt ausgewählte Fehlerpfade für Coverage ab", async () => {
    const validatePairingToken = testEnv.wrap(fns.validatePairingToken);
    const provideSolutionFeedback = testEnv.wrap(fns.provideSolutionFeedback);

    await expect(validatePairingToken({ pairingToken: "does-not-exist" }, asChild)).rejects.toThrow(/invalid/);

    await expect(
      provideSolutionFeedback({ ticketId: "ticket-1", feedback: "invalid" }, asMaster)
    ).rejects.toThrow(/accepted/);

    await expect(
      provideSolutionFeedback({ ticketId: "ticket-1", feedback: "rejected" }, asMaster)
    ).rejects.toThrow(/Comment is required/);
  });

  it("deckt abgelaufenen Pairing-Token und ungültiges FCM-Update ab", async () => {
    const validatePairingToken = testEnv.wrap(fns.validatePairingToken);
    const updateFCMToken = testEnv.wrap(fns.updateFCMToken);

    const expiredMs = Date.now() - 60_000;
    state.pairingTokens["tok-expired"] = {
      masterImei: "m1",
      expiresAt: admin.firestore.Timestamp.fromMillis(expiredMs),
    };

    await expect(validatePairingToken({ pairingToken: "tok-expired" }, asChild)).rejects.toThrow(/expired/);
    await expect(updateFCMToken({ fcmToken: "" }, asMaster)).rejects.toThrow(/fcmToken/);
  });

  it("bereinigt beschädigte Pairing-Token mit ungültigem expiresAt", async () => {
    const validatePairingToken = testEnv.wrap(fns.validatePairingToken);
    state.pairingTokens["tok-corrupt"] = {
      masterImei: "m1",
      expiresAt: { seconds: 123, nanoseconds: 0 },
    };

    await expect(validatePairingToken({ pairingToken: "tok-corrupt" }, asChild))
      .rejects.toThrow(/Invalid pairing token data structure/);
    expect(state.pairingTokens["tok-corrupt"]).toBeUndefined();
  });

  it("deckt negative Purchase-Verifikation ab", async () => {
    const verifyPurchase = testEnv.wrap(fns.verifyPurchase);
    mockSubscriptionGet.mockResolvedValueOnce({
      data: {
        purchaseState: 1,
        expiryTimeMillis: Date.now() - 1,
      },
    });

    await expect(verifyPurchase({ purchaseToken: "pt-invalid", sku: "single_child_monthly" }, asMaster)).rejects.toThrow(/verification failed/i);
  });

  it("deckt Support-Feedback-Permission-Fehlerpfad ab", async () => {
    const provideSolutionFeedback = testEnv.wrap(fns.provideSolutionFeedback);
    state.supportTickets["ticket-foreign"] = { masterImei: "other-master", status: "open" };

    await expect(
      provideSolutionFeedback({ ticketId: "ticket-foreign", feedback: "accepted" }, asMaster)
    ).rejects.toThrow(/do not have permission/i);
  });
});
