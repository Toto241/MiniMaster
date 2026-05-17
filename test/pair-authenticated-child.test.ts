/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for pairAuthenticatedChild (modern auth flow).
 */
import fft from "firebase-functions-test";

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
};

const docs: Record<string, any> = {};
const colDocs: Record<string, Record<string, any>> = {};

const mockDbObj = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: jest.fn().mockImplementation((id: string) => ({
      get: jest.fn().mockImplementation(() => {
        const data = docs[`${name}/${id}`];
        return Promise.resolve({
          exists: !!data,
          data: () => data || null,
          id,
        });
      }),
      set: jest.fn().mockImplementation((data: any, opts?: any) => {
        const key = `${name}/${id}`;
        docs[key] = opts?.merge ? { ...docs[key], ...data } : { ...data };
        if (!colDocs[name]) colDocs[name] = {};
        colDocs[name][id] = docs[key];
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((data: any) => {
        const key = `${name}/${id}`;
        docs[key] = { ...docs[key], ...data };
        if (!colDocs[name]) colDocs[name] = {};
        colDocs[name][id] = docs[key];
        return Promise.resolve();
      }),
      delete: jest.fn().mockImplementation(() => {
        delete docs[`${name}/${id}`];
        if (colDocs[name]) delete colDocs[name][id];
        return Promise.resolve();
      }),
    })),
    where: jest.fn().mockImplementation((field: string, _op: string, val: any) => ({
      get: jest.fn().mockImplementation(() => {
        const collData = colDocs[name] || {};
        const matches = Object.entries(collData)
          .filter(([_, doc]) => doc[field] === val)
          .map(([id, data]) => ({ id, data: () => data }));
        return Promise.resolve({
          empty: matches.length === 0,
          size: matches.length,
          docs: matches,
        });
      }),
      limit: jest.fn().mockReturnThis(),
    })),
    add: jest.fn().mockImplementation((data: any) => {
      if (!colDocs[name]) colDocs[name] = {};
      const id = `auto_${Date.now()}`;
      colDocs[name][id] = data;
      docs[`${name}/${id}`] = data;
      return Promise.resolve({ id });
    }),
  })),
  runTransaction: jest.fn().mockImplementation(async (fn: any) => {
    const tx = {
      get: jest.fn().mockImplementation((refOrQuery: any) => {
        if (refOrQuery.get) {
          return refOrQuery.get();
        }
        // DocumentReference path
        return refOrQuery.get();
      }),
      set: jest.fn().mockImplementation((ref: any, data: any, opts?: any) => {
        if (ref.set) {
          return ref.set(data, opts);
        }
        // Fallback
        const { name, id } = ref;
        if (!colDocs[name]) colDocs[name] = {};
        colDocs[name][id] = opts?.merge ? { ...colDocs[name][id], ...data } : { ...data };
        docs[`${name}/${id}`] = colDocs[name][id];
      }),
      update: jest.fn().mockImplementation((ref: any, data: any) => {
        if (ref.update) return ref.update(data);
        const { name, id } = ref;
        if (colDocs[name]) {
          colDocs[name][id] = { ...colDocs[name][id], ...data };
          docs[`${name}/${id}`] = colDocs[name][id];
        }
      }),
      delete: jest.fn().mockImplementation((ref: any) => {
        if (ref.delete) return ref.delete();
        const { name, id } = ref;
        delete docs[`${name}/${id}`];
        if (colDocs[name]) delete colDocs[name][id];
      }),
    };
    return await fn(tx);
  }),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace: any = () => mockDbObj;
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
  };
});

const testEnv = fft();
let fns: any;

function makeTimestamp(offsetSeconds: number) {
  const adminMod = require("firebase-admin");
  return new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + offsetSeconds, 0);
}

beforeAll(() => {
  fns = require("../src/pairing");
});

afterAll(() => testEnv.cleanup());

beforeEach(() => {
  Object.keys(docs).forEach((k) => delete docs[k]);
  Object.keys(colDocs).forEach((k) => delete colDocs[k]);
  jest.clearAllMocks();
});

describe("pairAuthenticatedChild", () => {
  it("pairs successfully with a valid pairingCode", async () => {
    docs["pairingCodes/123456"] = {
      masterId: "master1",
      expiresAt: makeTimestamp(3600),
    };
    docs["masters/master1"] = {
      subscription: { status: "active", childLimit: 4 },
    };

    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    const result = await wrapped(
      { pairingCode: "123456" },
      { auth: { uid: "c1", token: {} } }
    );
    expect(result).toEqual({ childId: "c1", masterId: "master1" });
    expect(docs["pairingCodes/123456"]).toBeUndefined();
  });

  it("pairs successfully with a valid pairingToken", async () => {
    const token = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    docs[`pairingTokens/${token}`] = {
      masterId: "master1",
      expiresAt: makeTimestamp(3600),
    };
    const adminMod = require("firebase-admin");
    docs["masters/master1"] = {
      subscription: {
        status: "trial",
        childLimit: 4,
        trialEndsAt: new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0),
      },
    };

    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    const result = await wrapped(
      { pairingToken: token },
      { auth: { uid: "c2", token: {} } }
    );
    expect(result).toEqual({ childId: "c2", masterId: "master1" });
    expect(docs[`pairingTokens/${token}`]).toBeUndefined();
  });

  it("throws not-found for invalid pairingCode", async () => {
    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(
      wrapped({ pairingCode: "999999" }, { auth: { uid: "c1", token: {} } })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws deadline-exceeded for expired pairingCode and deletes it", async () => {
    docs["pairingCodes/123456"] = {
      masterId: "master1",
      expiresAt: makeTimestamp(-3600),
    };

    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(
      wrapped({ pairingCode: "123456" }, { auth: { uid: "c1", token: {} } })
    ).rejects.toMatchObject({ code: "deadline-exceeded" });
    expect(docs["pairingCodes/123456"]).toBeUndefined();
  });

  it("throws resource-exhausted when master has no active access", async () => {
    docs["pairingCodes/123456"] = {
      masterId: "master1",
      expiresAt: makeTimestamp(3600),
    };
    docs["masters/master1"] = {
      subscription: { status: "expired", childLimit: 4 },
    };

    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(
      wrapped({ pairingCode: "123456" }, { auth: { uid: "c1", token: {} } })
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("throws resource-exhausted when child limit reached", async () => {
    docs["pairingCodes/123456"] = {
      masterId: "master1",
      expiresAt: makeTimestamp(3600),
    };
    docs["masters/master1"] = {
      subscription: { status: "active", childLimit: 1 },
    };
    // Seed one existing child
    docs["children/child1"] = { masterImei: "master1", pairedAt: new Date() };
    if (!colDocs["children"]) colDocs["children"] = {};
    colDocs["children"]["child1"] = docs["children/child1"];

    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(
      wrapped({ pairingCode: "123456" }, { auth: { uid: "c1", token: {} } })
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("throws unauthenticated when no auth context", async () => {
    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(wrapped({ pairingCode: "123456" }, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument when neither code nor token provided", async () => {
    const wrapped = testEnv.wrap(fns.pairAuthenticatedChild);
    await expect(wrapped({}, { auth: { uid: "c1", token: {} } })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
