/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage for support.ts — OpenAI fallback branches (lines 188-196).
 * OPENAI_FALLBACK_ENABLED must be "true" BEFORE module load (module-level const).
 */

// Set env BEFORE any require
process.env.OPENAI_FALLBACK_ENABLED = "true";

import fft from "firebase-functions-test";

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

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

const mockDbObj = { collection: jest.fn() };
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
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
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

// Mock OpenAI to return a controlled response
const mockCreate = jest.fn().mockResolvedValue({
  choices: [{ message: { content: JSON.stringify({
    solution: "OpenAI fallback solution",
    confidence: 0.8,
  }) } }],
});
jest.mock("openai", () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", fcmToken: "master-fcm", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: {
        masterImei: "m1", fcmToken: "child-fcm", isLocked: false,
        appBlacklist: [], usageRules: [],
      },
    },
    supportTickets: {},
    supportAccessGrants: {},
    operatorAccessKeys: {},
  };
}

function wireFirestoreMocks() {
  const docData = (collection: string, docId: string) => {
    const coll = state[collection];
    if (!coll || !coll[docId]) return undefined;
    return coll[docId];
  };

  const makeDocRef = (collection: string, docId: string): any => ({
    id: docId,
    get: jest.fn(async () => {
      const d = docData(collection, docId);
      return { exists: !!d, data: () => d, id: docId, ref: { id: docId } };
    }),
    set: jest.fn(async (data: any) => { state[collection] = state[collection] || {}; state[collection][docId] = { ...data }; }),
    update: jest.fn(async (data: any) => { if (state[collection]?.[docId]) Object.assign(state[collection][docId], data); }),
    delete: jest.fn(async () => { if (state[collection]) delete state[collection][docId]; }),
    collection: jest.fn(() => ({
      add: jest.fn(async () => ({ id: `sub-${Date.now()}` })),
      doc: jest.fn(() => makeDocRef(`${collection}/${docId}/sub`, `sub-${Date.now()}`)),
      get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({
        get: jest.fn(async () => ({ empty: true, docs: [], size: 0 })),
      }),
    })),
  });

  const makeCollRef = (collection: string) => ({
    doc: jest.fn((id?: string) => makeDocRef(collection, id || `auto-${Date.now()}`)),
    where: jest.fn().mockReturnValue({
      get: jest.fn(async () => {
        const coll = state[collection] || {};
        const docs = Object.entries(coll).map(([id, d]) => ({
          id, data: () => d, exists: true, ref: { id },
        }));
        return { empty: docs.length === 0, docs, size: docs.length };
      }),
      limit: jest.fn().mockReturnValue({
        get: jest.fn(async () => {
          const coll = state[collection] || {};
          const docs = Object.entries(coll).slice(0, 1).map(([id, d]) => ({
            id, data: () => d, exists: true, ref: { id },
          }));
          return { empty: docs.length === 0, docs, size: docs.length };
        }),
      }),
    }),
    get: jest.fn(async () => {
      const coll = state[collection] || {};
      const docs = Object.entries(coll).map(([id, d]) => ({
        id, data: () => d, exists: true, ref: { id },
      }));
      return { empty: docs.length === 0, docs, size: docs.length };
    }),
  });

  mockDbObj.collection.mockImplementation((name: string) => makeCollRef(name));
}

beforeAll(() => {
  fns = require("../src/support");
  db = require("../firebase").db();
});
afterAll(() => testEnv.cleanup());
beforeEach(() => { resetState(); wireFirestoreMocks(); jest.clearAllMocks(); });

// ══════════════════════════════════════════════════════════════════════════
// OpenAI fallback path (lines 188-193) — OPENAI_FALLBACK_ENABLED=true
// ══════════════════════════════════════════════════════════════════════════

describe("generateAiCompletion — OpenAI fallback (lines 188-193)", () => {
  it("nutzt OpenAI-Fallback wenn kein Gemini-Key vorhanden", async () => {
    state.supportTickets["ticket-openai"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "OpenAI fallback test",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: false,
    };

    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origOpenaiKey = process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "fake-openai-key";

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({ ticketId: "ticket-openai", userMessage: "Test OpenAI" }, asMaster);
      expect(res.success).toBe(true);
      expect(mockCreate).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      if (origOpenaiKey !== undefined) process.env.OPENAI_API_KEY = origOpenaiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// No AI provider (line 196) — both GEMINI and OPENAI keys absent
// ══════════════════════════════════════════════════════════════════════════

describe("generateAiCompletion — no provider (line 196)", () => {
  it("wirft Fehler wenn kein Provider konfiguriert", async () => {
    state.supportTickets["ticket-no-ai"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "No provider test",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: false,
    };

    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origOpenaiKey = process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      await expect(wrapped({ ticketId: "ticket-no-ai", userMessage: "Test" }, asMaster))
        .rejects.toThrow(/No AI provider configured/);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      if (origOpenaiKey !== undefined) process.env.OPENAI_API_KEY = origOpenaiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});
