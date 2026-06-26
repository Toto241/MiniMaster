/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the getOperatorSetupStatus callable (previously uncovered).
 * Exercises readiness aggregation (ready / near-ready / not-ready), the
 * projectId env IIFE (FIREBASE_CONFIG parse + catch), storage/firestore
 * reachability error paths, and readManualChecklistState field-type branches.
 */
import fft from "firebase-functions-test";
import { db as getDb, storage as getStorage } from "../firebase";
import { MANUAL_CHECKLIST_ITEMS } from "../src/operator-setup";

jest.mock("../firebase", () => ({
  db: jest.fn(),
  auth: jest.fn(() => ({})),
  storage: jest.fn(),
}));

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "SERVER_TS" };
  return { ...original, initializeApp: jest.fn(), firestore: firestoreNamespace };
});

const testEnv = fft();
let fns: any;
const mockDb = getDb as unknown as jest.Mock;
const mockStorage = getStorage as unknown as jest.Mock;

const asAdmin = { auth: { uid: "a1", token: { role: "admin" } }, app: { appId: "t" } };

function makeDb(opts: { checklistItems?: Record<string, unknown>; checklistThrows?: boolean; firestoreThrows?: boolean }) {
  return {
    doc: jest.fn(() => ({
      get: jest.fn(async () => {
        if (opts.checklistThrows) throw new Error("checklist read failed");
        return { exists: opts.checklistItems !== undefined, data: () => ({ items: opts.checklistItems }) };
      }),
    })),
    collection: jest.fn(() => ({
      limit: jest.fn(() => ({
        get: jest.fn(async () => {
          if (opts.firestoreThrows) throw new Error("firestore unreachable");
          return { docs: [] };
        }),
      })),
    })),
  };
}

function makeStorage(opts: { throws?: boolean }) {
  const bucket = () => ({
    name: "test-bucket",
    getMetadata: jest.fn(async () => {
      if (opts.throws) throw new Error("storage unreachable");
      return [{ name: "test-bucket" }];
    }),
  });
  return { bucket: jest.fn(bucket) };
}

const ENV_KEYS = [
  "GEMINI_API_KEY", "ADMIN_RECOVERY_TOKEN", "ADMIN_RECOVERY_TOKEN_ROTATED_AT",
  "ALLOWED_RESET_PROJECTS", "PLAY_BILLING_PUBSUB_TOPIC", "GOOGLE_APPLICATION_CREDENTIALS",
  "GCLOUD_PROJECT", "GCP_PROJECT", "FIREBASE_CONFIG",
];
let savedEnv: Record<string, string | undefined>;

beforeAll(() => { fns = require("../index"); });
beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  mockDb.mockReset();
  mockStorage.mockReset();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});
afterAll(() => testEnv.cleanup());

describe("getOperatorSetupStatus", () => {
  it("rejects non-admin callers", async () => {
    mockDb.mockReturnValue(makeDb({}));
    mockStorage.mockReturnValue(makeStorage({}));
    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    await expect(wrapped({}, { auth: { uid: "u", token: {} }, app: { appId: "t" } })).rejects.toThrow();
  });

  it("reports ready when everything is configured and required items are done", async () => {
    process.env.GEMINI_API_KEY = "key";
    process.env.ADMIN_RECOVERY_TOKEN = "tok";
    process.env.GCLOUD_PROJECT = "proj-a"; // first projectId branch
    // Mark every required manual item done, varying doneAt types to hit those branches.
    const items: Record<string, unknown> = {};
    const required = MANUAL_CHECKLIST_ITEMS.filter((i: any) => i.required);
    required.forEach((item: any, idx: number) => {
      const doneAt = idx === 0
        ? { toDate: () => new Date("2026-01-01T00:00:00Z") } // Timestamp-like branch
        : (idx === 1 ? "2026-02-02" : 12345); // string branch / non-string -> null branch
      items[item.id] = { done: true, doneAt, doneBy: idx === 2 ? 99 : "operator", note: idx === 3 ? null : "ok" };
    });
    mockDb.mockReturnValue(makeDb({ checklistItems: items, firestoreThrows: false }));
    mockStorage.mockReturnValue(makeStorage({ throws: false }));

    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res.projectId).toBe("proj-a");
    expect(res.readiness).toBe("ready");
    expect(res.blockers).toEqual([]);
  });

  it("reports not-ready and collects blockers when nothing is configured", async () => {
    // No env secrets; storage + firestore unreachable; checklist read throws.
    mockDb.mockReturnValue(makeDb({ checklistThrows: true, firestoreThrows: true }));
    mockStorage.mockReturnValue(makeStorage({ throws: true }));
    // Malformed FIREBASE_CONFIG -> projectId IIFE JSON.parse throws -> catch -> null.
    process.env.FIREBASE_CONFIG = "{not json";

    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res.projectId).toBeNull();
    expect(res.readiness).toBe("not-ready");
    expect(res.blockers.length).toBeGreaterThan(2);
    expect(res.blockers.some((b: string) => /GEMINI_API_KEY/.test(b))).toBe(true);
    expect(res.blockers.some((b: string) => /Storage bucket/.test(b))).toBe(true);
  });

  it("derives projectId from FIREBASE_CONFIG when no GCLOUD/GCP project is set", async () => {
    process.env.GEMINI_API_KEY = "key";
    process.env.ADMIN_RECOVERY_TOKEN = "tok";
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "fb-proj" });
    // Empty checklist (doc exists with no items) -> required items pending -> some blockers.
    mockDb.mockReturnValue(makeDb({ checklistItems: {} }));
    mockStorage.mockReturnValue(makeStorage({ throws: false }));

    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res.projectId).toBe("fb-proj");
    expect(["near-ready", "not-ready"]).toContain(res.readiness);
  });
});
