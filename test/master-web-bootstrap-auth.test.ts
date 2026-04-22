/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

const mockValidateAppCheck = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockAudit = {
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
  log: jest.fn().mockResolvedValue(undefined),
};

const mockAuth: any = {
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) => Promise.resolve({ uid, customClaims: {} })),
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
};

let docCounter = 0;
let state: {
  masters: Map<string, any>;
  masterWebBootstrapTokens: Map<string, any>;
};

function makeDocRef(collectionName: "masters" | "masterWebBootstrapTokens", id: string): any {
  const ref: any = {
    id,
    collectionName,
    async get() {
      const record = state[collectionName].get(id);
      return {
        id,
        exists: !!record,
        ref,
        data: () => (record ? { ...record } : undefined),
      };
    },
    async set(data: any) {
      state[collectionName].set(id, { ...(data || {}) });
    },
    async update(data: any) {
      const current = state[collectionName].get(id) || {};
      state[collectionName].set(id, { ...current, ...(data || {}) });
    },
  };
  ref.ref = ref;
  return ref;
}

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === "masters") {
      return {
        doc: jest.fn((id: string) => makeDocRef("masters", id)),
      };
    }
    if (name === "masterWebBootstrapTokens") {
      return {
        doc: jest.fn((id?: string) => makeDocRef("masterWebBootstrapTokens", id || `token-${++docCounter}`)),
        where: jest.fn((field: string, _op: string, value: string) => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => {
              const match = [...state.masterWebBootstrapTokens.entries()].find(([, record]) => record?.[field] === value);
              if (!match) return { empty: true, docs: [] };
              const [id, record] = match;
              const ref = makeDocRef("masterWebBootstrapTokens", id);
              state.masterWebBootstrapTokens.set(id, record);
              return {
                empty: false,
                docs: [{ id, ref, data: () => ({ ...record }), exists: true }],
              };
            }),
          })),
        })),
      };
    }
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn(async (handler: (tx: any) => Promise<any>) => handler({
    get: async (ref: any) => ref.get(),
    update: (ref: any, data: any) => ref.update(data),
  })),
};

jest.mock("../src/shared", () => ({
  requireAdmin: jest.fn(),
  validateAppCheck: (...args: any[]) => mockValidateAppCheck(...args),
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  AuditLogger: mockAudit,
}));

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDb),
  auth: jest.fn(() => mockAuth),
}));

jest.mock("firebase-admin", () => ({
  firestore: (() => {
    class MockedTimestamp {
      constructor(private readonly ms: number) {}
      static now() { return new MockedTimestamp(Date.now()); }
      static fromMillis(ms: number) { return new MockedTimestamp(ms); }
      toMillis() { return this.ms; }
    }

    return {
      Timestamp: MockedTimestamp,
      FieldValue: {
        serverTimestamp: () => new MockedTimestamp(Date.now()),
      },
    };
  })(),
}));

const testEnv = fft();
let fns: any;

beforeAll(() => {
  fns = require("../index");
});

beforeEach(() => {
  docCounter = 0;
  state = {
    masters: new Map([["m1", { uid: "m1", role: "master" }]]),
    masterWebBootstrapTokens: new Map(),
  };
  jest.clearAllMocks();
});

describe("master web bootstrap auth", () => {
  it("creates a one-time bootstrap token for an authenticated master", async () => {
    const wrapped = testEnv.wrap(fns.createMasterWebBootstrapToken);
    const res = await wrapped({ target: "parent-panel", ttlMinutes: 12 }, { auth: { uid: "m1", token: { role: "master" } } });

    expect(res.bootstrapToken).toMatch(/^mwb_/);
    expect(res.target).toBe("parent-panel");
    expect(res.targetPath).toBe("/parent-panel/index.html");
    expect(res.queryParamName).toBe("bootstrapToken");
    expect(state.masterWebBootstrapTokens.size).toBe(1);
    const stored = [...state.masterWebBootstrapTokens.values()][0];
    expect(stored.masterId).toBe("m1");
    expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(res.bootstrapToken);
  });

  it("redeems a bootstrap token exactly once and returns a custom token", async () => {
    const createWrapped = testEnv.wrap(fns.createMasterWebBootstrapToken);
    const created = await createWrapped({}, { auth: { uid: "m1", token: { role: "master" } } });

    const redeemWrapped = testEnv.wrap(fns.redeemMasterWebBootstrapToken);
    const redeemed = await redeemWrapped({ bootstrapToken: created.bootstrapToken }, {} as any);

    expect(redeemed.masterId).toBe("m1");
    expect(redeemed.customToken).toBe("mock-custom-token");
    expect(redeemed.target).toBe("web-control");
    expect(mockAuth.createCustomToken).toHaveBeenCalledWith("m1", expect.objectContaining({
      role: "master",
      masterImei: "m1",
    }));

    const stored = [...state.masterWebBootstrapTokens.values()][0];
    expect(stored.usedAt).toBeTruthy();
  });

  it("rejects already redeemed bootstrap tokens", async () => {
    const createWrapped = testEnv.wrap(fns.createMasterWebBootstrapToken);
    const created = await createWrapped({}, { auth: { uid: "m1", token: { role: "master" } } });
    const redeemWrapped = testEnv.wrap(fns.redeemMasterWebBootstrapToken);

    await redeemWrapped({ bootstrapToken: created.bootstrapToken }, {} as any);
    await expect(redeemWrapped({ bootstrapToken: created.bootstrapToken }, {} as any))
      .rejects.toThrow(/bereits eingelöst/);
  });
});
