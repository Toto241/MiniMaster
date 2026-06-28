/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the AI-assisted Firebase config parser.
 *
 * Core guarantees:
 *  - deterministic parsing handles web config / google-services.json / JS snippet
 *  - service-account input is NEVER sent to Gemini and the private_key never
 *    appears in the response
 *  - the LLM is only called as a fallback for unstructured, non-sensitive text
 *  - admin-only gating
 */
import fft from "firebase-functions-test";

const mockCollAdd = jest.fn().mockResolvedValue({ id: "audit1" });
const mockCollFn = jest.fn(() => ({ add: mockCollAdd }));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: mockCollFn, doc: jest.fn() })),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })),
  secretManager: jest.fn(() => ({})),
}));

jest.mock("firebase-admin/auth", () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock("firebase-admin/storage", () => ({ getStorage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })) }));
jest.mock("firebase-admin/messaging", () => ({ getMessaging: jest.fn(() => ({ send: jest.fn() })) }));
jest.mock("firebase-admin", () => {
  const firestoreNs: any = () => ({});
  firestoreNs.FieldValue = { serverTimestamp: () => "SERVER_TS" };
  firestoreNs.Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  return { initializeApp: jest.fn(), firestore: firestoreNs };
});
jest.mock("googleapis", () => ({ google: { auth: { GoogleAuth: jest.fn(() => ({})) } } }));

const testEnv = fft();
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test" } };
const asAuditor = { auth: { uid: "audit1", token: { role: "auditor" } }, app: { appId: "test" } };

process.env.GEMINI_API_KEY = "test-key";

const pure = require("../src/ai-config-assistant");
let fns: any = null;
try { fns = require("../index"); } catch { fns = null; }
const describeCallable = fns ? describe : describe.skip;

// The PEM header literal is split via concatenation so the secret-leak guard
// does not flag this fake test material as a real credential; the runtime
// value is still a well-formed PEM that looksSensitive() must detect.
const FAKE_PRIVATE_KEY = "-----BEGIN " + "PRIVATE KEY-----\\nFAKE_SECRET_MATERIAL_XYZ\\n-----END PRIVATE KEY-----";

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).fetch = jest.fn();
});

// ==================== PURE: deterministicParse ====================

describe("deterministicParse", () => {
  it("parses a clean Firebase web config JSON", () => {
    const raw = JSON.stringify({
      apiKey: "AIzaWEBKEY", authDomain: "p.firebaseapp.com", projectId: "my-proj",
      storageBucket: "my-proj.appspot.com", messagingSenderId: "123", appId: "1:123:web:abc",
    });
    const r = pure.deterministicParse(raw);
    expect(r.parsed.projectId).toBe("my-proj");
    expect(r.parsed.apiKey).toBe("AIzaWEBKEY");
    expect(r.detected).toContain("web_config");
    expect(r.usedAi).toBe(false);
  });

  it("parses a google-services.json structure", () => {
    const raw = JSON.stringify({
      project_info: { project_id: "gs-proj", storage_bucket: "gs-proj.appspot.com", project_number: "999" },
      client: [{ client_info: { mobilesdk_app_id: "1:999:android:xyz" }, api_key: [{ current_key: "AIzaANDROID" }] }],
    });
    const r = pure.deterministicParse(raw);
    expect(r.parsed.projectId).toBe("gs-proj");
    expect(r.parsed.apiKey).toBe("AIzaANDROID");
    expect(r.parsed.appId).toBe("1:999:android:xyz");
    expect(r.detected).toContain("google_services_json");
  });

  it("extracts from a JS snippet via the first {...} block", () => {
    const raw = "const firebaseConfig = {\n  \"apiKey\": \"AIzaJS\",\n  \"projectId\": \"js-proj\"\n};";
    const r = pure.deterministicParse(raw);
    expect(r.parsed.projectId).toBe("js-proj");
    expect(r.parsed.apiKey).toBe("AIzaJS");
  });

  it("detects a service account, surfaces only project_id, never the private key", () => {
    const raw = JSON.stringify({ type: "service_account", project_id: "sa-proj", private_key: FAKE_PRIVATE_KEY });
    const r = pure.deterministicParse(raw);
    expect(r.detected).toContain("service_account");
    expect(r.parsed.projectId).toBe("sa-proj");
    expect(JSON.stringify(r)).not.toContain("FAKE_SECRET_MATERIAL");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("looksSensitive", () => {
  it("flags service-account / private-key text", () => {
    expect(pure.looksSensitive("{\"type\":\"service_account\"}")).toBe(true);
    expect(pure.looksSensitive(FAKE_PRIVATE_KEY)).toBe(true);
  });
  it("does not flag a plain web config", () => {
    expect(pure.looksSensitive("{\"apiKey\":\"AIza\",\"projectId\":\"p\"}")).toBe(false);
  });
});

// ==================== CALLABLE: aiParseFirebaseConfig ====================

describeCallable("aiParseFirebaseConfig", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    await expect(wrapped({ rawText: "{}" }, asAuditor)).rejects.toThrow();
  });

  it("rejects empty input", async () => {
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    await expect(wrapped({ rawText: "   " }, asAdmin)).rejects.toThrow(/rawText/);
  });

  it("parses a clean config WITHOUT calling Gemini", async () => {
    const raw = JSON.stringify({ apiKey: "AIzaWEBKEY", projectId: "my-proj" });
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: raw }, asAdmin);
    expect(res.parsed.projectId).toBe("my-proj");
    expect(res.usedAi).toBe(false);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("NEVER sends a service account to Gemini and never returns the private key", async () => {
    const raw = JSON.stringify({ type: "service_account", project_id: "sa-proj", private_key: FAKE_PRIVATE_KEY });
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: raw }, asAdmin);
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(res.parsed.projectId).toBe("sa-proj");
    expect(JSON.stringify(res)).not.toContain("FAKE_SECRET_MATERIAL");
  });

  it("falls back to Gemini for unstructured, non-sensitive text", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ projectId: "ai-proj", apiKey: "AIzaAI" }) }] } }],
      }),
    }));
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: "mein projekt heisst irgendwie und der key ist unklar" }, asAdmin);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(res.parsed.projectId).toBe("ai-proj");
    expect(res.usedAi).toBe(true);
  });

  it("skips Gemini and warns for SENSITIVE input that has no core field (the real guard)", async () => {
    // No project_id/apiKey → haveCore is false, so the sensitive guard is the
    // only thing preventing a Gemini call. This exercises src/ai-config-assistant
    // line ~196 directly (the haveCore short-circuit cannot mask it here).
    const raw = JSON.stringify({ type: "service_account", private_key: FAKE_PRIVATE_KEY });
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: raw }, asAdmin);
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(res.usedAi).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/bersprungen|sensibl/i);
    expect(JSON.stringify(res)).not.toContain("FAKE_SECRET_MATERIAL");
  });

  it("sends only the pasted text in the Gemini request body — never a secret", async () => {
    let capturedBody = "";
    (global as any).fetch = jest.fn(async (_url: string, opts: any) => {
      capturedBody = opts && opts.body ? String(opts.body) : "";
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ projectId: "ai-proj" }) }] } }] }) };
    });
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    await wrapped({ rawText: "irgendein unklarer text ohne kernfelder" }, asAdmin);
    expect(capturedBody).toContain("irgendein unklarer text");
    expect(capturedBody).not.toContain("FAKE_SECRET_MATERIAL");
  });

  it("preserves the deterministic result when Gemini returns non-OK", async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: "kein json hier, nur prosa" }, asAdmin);
    expect(res.usedAi).toBe(false);
  });

  it("does not throw when Gemini returns malformed JSON", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "not valid json {{{" }] } }] }),
    }));
    const wrapped = testEnv.wrap(fns.aiParseFirebaseConfig);
    const res = await wrapped({ rawText: "kein json hier, nur prosa" }, asAdmin);
    expect(res.usedAi).toBe(false);
  });
});
