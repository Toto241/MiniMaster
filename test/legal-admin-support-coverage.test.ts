/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests targeting low-coverage modules:
 * - legal.ts (10% → target 60%+)
 * - admin.ts uncovered paths: adminHealthCheck, testGeminiConnection, getKnowledgeBase, updateKnowledgeBase, sendTestFcmMessage, triggerScheduledJob
 * - support.ts uncovered: getTicketUserData, aiExplainProblem
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue("mock-msg-id");
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

const mockBucket = {
  name: "test-bucket",
  getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
};
jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => mockBucket),
  })),
}));

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
};

const mockMessaging = { send: mockSend };

const mockDbObj = { collection: jest.fn() };
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket", getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]) })) })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }

  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };

  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
    messaging: () => mockMessaging,
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
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", fcmToken: "master-fcm", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: { masterImei: "m1", fcmToken: "child-fcm" },
    },
    legalPolicies: {},
    masterLegalConsents: {},
    supportTickets: {
      "ticket-1": { masterImei: "m1", status: "open", accessGranted: false, problemDescription: "App stürzt ab" },
    },
    supportAccessGrants: {
      "grant-1": {
        masterImei: "m1", ticketId: "ticket-1", status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 3600, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
      },
    },
    subscriptions: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
  };
}

beforeAll(() => {
  process.env.OPENAI_API_KEY = "test-key";
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
          get: () => {
            const d = collData[docId];
            return Promise.resolve({ exists: !!d, data: () => d, id: docId, ref });
          },
          update: jest.fn((upd: any) => { if (collData[docId]) Object.assign(collData[docId], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[docId] = opts?.merge ? { ...(collData[docId] || {}), ...data } : { ...data };
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
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
                set: jest.fn((data: any) => { state[key][subId] = data; return Promise.resolve(); }),
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
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [] })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
      batch: undefined as any,
    } as any;
  });

  // batch mock
  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// LEGAL.TS
// ══════════════════════════════════════════════════════════════════════════

describe("getActiveLegalPolicies", () => {
  it("gibt Default-Policies zurück wenn keine Firestore-Policies existieren", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.country).toBe("DE");
    expect(res.locale).toBe("de-DE");
    expect(res.terms.version).toBeDefined();
    expect(res.privacy.version).toBeDefined();
    expect(res.terms.contentUrl).toContain("DE/de-DE/terms");
    expect(res.privacy.contentUrl).toContain("DE/de-DE/privacy");
  });

  it("wirft invalid-argument bei ungültigem country code", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "XYZ", locale: "de-DE" }, asMaster))
      .rejects.toThrow(/2-letter ISO/);
  });

  it("wirft invalid-argument bei ungültiger locale", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE", locale: "!!!" }, asMaster))
      .rejects.toThrow(/BCP-47/);
  });

  it("wirft invalid-argument bei nicht-string locale", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE", locale: 123 as unknown as string }, asMaster))
      .rejects.toThrow(/BCP-47/);
  });

  it("fällt auf globale Policies zurück wenn lokale Dokumente unbrauchbar sind", async () => {
    const originalCollection = (db.collection as jest.Mock).getMockImplementation();
    const legalDocs: Record<string, any> = {
      invalidLocalTerms: { exists: true, data: () => ({ policyType: "terms", country: "DE", locale: "de-DE", version: "2026.04.01-1", contentUrl: 42, status: "active" }) },
      globalTerms: { exists: true, data: () => ({ policyType: "terms", country: "GLOBAL", locale: "en-US", version: "2026.05.01-1", contentUrl: "https://example.com/global-terms", status: "active" }) },
      globalPrivacy: { exists: true, data: () => ({ policyType: "privacy", country: "GLOBAL", locale: "en-US", version: "2026.05.01-1", contentUrl: "https://example.com/global-privacy", status: "active" }) },
    };

    (db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name !== "legalPolicies") {
        return originalCollection(name);
      }

      const filters: Array<{ field: string; value: unknown }> = [];
      const query: any = {
        where: jest.fn((field: string, _op: string, value: unknown) => {
          filters.push({ field, value });
          return query;
        }),
        limit: jest.fn(() => query),
        get: jest.fn(() => {
          const docs = Object.entries(legalDocs)
            .filter(([, entry]) => {
              const data = entry.data?.();
              return filters.every((filter) => data?.[filter.field] === filter.value);
            })
            .map(([id, entry]) => ({ id, exists: entry.exists, data: entry.data }));
          return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
        }),
      };
      return query;
    });

    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);

    expect(res.terms.version).toBe("2026.05.01-1");
    expect(res.terms.contentUrl).toBe("https://example.com/global-terms");
    expect(res.privacy.version).toBe("2026.05.01-1");
    expect(res.privacy.contentUrl).toBe("https://example.com/global-privacy");
  });

  it("überspringt Policies ohne Daten und nutzt danach gültige Firestore-Policies", async () => {
    const originalCollection = (db.collection as jest.Mock).getMockImplementation();

    (db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name !== "legalPolicies") {
        return originalCollection(name);
      }

      const filters: Array<{ field: string; value: unknown }> = [];
      const query: any = {
        where: jest.fn((field: string, _op: string, value: unknown) => {
          filters.push({ field, value });
          return query;
        }),
        limit: jest.fn(() => query),
        get: jest.fn(() => {
          const policyType = filters.find((f) => f.field === "policyType")?.value;
          const country = filters.find((f) => f.field === "country")?.value;
          const locale = filters.find((f) => f.field === "locale")?.value;

          if (policyType === "terms" && country === "DE" && locale === "de-DE") {
            return Promise.resolve({
              empty: false,
              size: 1,
              docs: [{ id: "broken-terms", exists: true, data: () => undefined }],
            });
          }

          if (policyType === "terms" && country === "GLOBAL" && locale === "en-US") {
            return Promise.resolve({
              empty: false,
              size: 1,
              docs: [{ id: "global-terms", exists: true, data: () => ({ policyType: "terms", country: "GLOBAL", locale: "en-US", version: "2026.06.01-1", contentUrl: "https://example.com/fallback-terms", status: "active" }) }],
            });
          }

          if (policyType === "privacy" && country === "GLOBAL" && locale === "en-US") {
            return Promise.resolve({
              empty: false,
              size: 1,
              docs: [{ id: "global-privacy", exists: true, data: () => ({ policyType: "privacy", country: "GLOBAL", locale: "en-US", version: "2026.06.01-1", contentUrl: "https://example.com/fallback-privacy", status: "active" }) }],
            });
          }

          return Promise.resolve({ empty: true, size: 0, docs: [] });
        }),
      };
      return query;
    });

    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);

    expect(res.terms.version).toBe("2026.06.01-1");
    expect(res.privacy.version).toBe("2026.06.01-1");
  });
});

describe("needsLegalReconsent", () => {
  it("erkennt fehlende Zustimmung als reconsent-pflichtig", async () => {
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
    expect(res.reason).toBe("missing_consent");
  });

  it("erkennt aktuelle Zustimmung als up_to_date", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", country: "DE", locale: "de-DE",
      acceptedTermsVersion: "2026.03.18-1", acceptedPrivacyVersion: "2026.03.18-1",
      requiresReconsent: false,
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(false);
    expect(res.reason).toBe("up_to_date");
  });

  it("erkennt veraltete Version als reconsent-pflichtig", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", country: "DE", locale: "de-DE",
      acceptedTermsVersion: "2025.01.01-1", acceptedPrivacyVersion: "2026.03.18-1",
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
    expect(res.reason).toBe("version_or_policy_change");
  });
});

describe("recordLegalConsent", () => {
  it("speichert gültige Zustimmung", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.termsVersion).toBe("2026.03.18-1");
    expect(state.masterLegalConsents["m1_DE_de-DE"]).toBeDefined();
  });

  it("wirft invalid-argument bei fehlender Version", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "", privacyVersion: "2026.03.18-1",
    }, asMaster)).rejects.toThrow(/termsVersion and privacyVersion are required/);
  });

  it("wirft failed-precondition bei Versionskonflikt", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "9999.01.01-1", privacyVersion: "2026.03.18-1",
    }, asMaster)).rejects.toThrow(/do not match/);
  });
});

describe("publishLegalPolicy", () => {
  it("veröffentlicht Policy als Admin", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "2026.04.01-1", contentUrl: "https://example.com/terms",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.policyId).toContain("terms_DE_de-DE");
    expect(state.legalPolicies[res.policyId]).toBeDefined();
  });

  it("wirft invalid-argument bei fehlendem Typ", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "invalid", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: "https://example.com",
    }, asAdmin)).rejects.toThrow(/policyType/);
  });

  it("wirft invalid-argument bei fehlender Version", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "", contentUrl: "https://example.com",
    }, asAdmin)).rejects.toThrow(/version is required/);
  });

  it("wirft invalid-argument bei fehlender contentUrl", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "2026.04.01-1", contentUrl: "",
    }, asAdmin)).rejects.toThrow(/contentUrl is required/);
  });
});

describe("markLegalReconsentRequired", () => {
  it("markiert einzelnen Master als reconsent-pflichtig", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", requiresReconsent: false,
    };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "m1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("single_master");
    expect(res.updatedCount).toBe(1);
  });

  it("markiert alle Master eines Locale als reconsent-pflichtig", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", country: "DE", locale: "de-DE" };
    state.masterLegalConsents["m2_DE_de-DE"] = { masterImei: "m2", country: "DE", locale: "de-DE" };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("country_locale");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – Uncovered Functions
// ══════════════════════════════════════════════════════════════════════════

describe("adminHealthCheck", () => {
  it("gibt vollständigen Health-Status zurück", async () => {
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdmin);
    expect(res.ok).toBe(true);
    expect(res.timestamp).toBeDefined();
    expect(res.checks).toBeDefined();
    expect(res.prerequisites).toBeDefined();
    expect(res.prerequisites.storage).toBe("ok");
    expect(res.prerequisites.ai).toBeDefined();
  });

  it("benötigt Admin-Berechtigung", async () => {
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Admin/);
  });

  it("meldet Firestore- und Storage-Prüffehler im Ergebnis", async () => {
    const originalCollection = (db.collection as jest.Mock).getMockImplementation();
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      const base = originalCollection(name);
      if (name === "children") {
        return {
          ...base,
          limit: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("children probe failed")),
          })),
        };
      }
      return base;
    });

    const firebaseModule = require("../firebase");
    const originalStorage = firebaseModule.storage.getMockImplementation();
    firebaseModule.storage.mockImplementation(() => ({
      bucket: jest.fn(() => ({
        name: "broken-bucket",
        getMetadata: jest.fn().mockRejectedValue(new Error("storage probe failed")),
      })),
    }));

    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdmin);

    expect(res.checks.children).toContain("children probe failed");
    expect(res.prerequisites.storage).toContain("storage probe failed");

    firebaseModule.storage.mockImplementation(originalStorage);
  });
});

describe("exportUserData", () => {
  it("exportiert Master-, Child-, Task- und Audit-Daten für DSAR", async () => {
    state.children.c1 = { masterImei: "m1", name: "Child One" };
    state.subscriptions.sub1 = { masterId: "m1", status: "active" };
    state.supportTickets.ticket1 = { masterImei: "m1", status: "open" };
    state.supportAccessGrants.grant1 = { masterImei: "m1", status: "active" };
    state.masterLegalConsents.consent1 = { masterImei: "m1", locale: "de-DE" };
    state.audit_logs.log1 = { userId: "m1", action: "device.delete" };

    const originalCollection = (db.collection as jest.Mock).getMockImplementation();
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      const base = originalCollection(name);
      if (name !== "children") return base;

      return {
        ...base,
        where: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            empty: false,
            size: 1,
            docs: [{
              id: "c1",
              data: () => state.children.c1,
              ref: {
                collection: jest.fn((sub: string) => ({
                  get: jest.fn().mockResolvedValue({
                    docs: sub === "tasks"
                      ? [{ id: "t1", data: () => ({ title: "Mathe", status: "open" }) }]
                      : [{ id: "day1", data: () => ({ minutesUsed: 45 }) }],
                  }),
                })),
              },
            }],
          }),
        })),
      };
    });

    const wrapped = testEnv.wrap(fns.exportUserData);
    const res = await wrapped({ masterId: "m1" }, asAdmin);

    expect(res.success).toBe(true);
    expect(res.data.masterId).toBe("m1");
    expect(res.data.masterProfile.imei).toBe("m1");
    expect(res.data.children).toHaveLength(1);
    expect(res.data.children[0].tasks).toEqual([
      expect.objectContaining({ id: "t1", title: "Mathe" }),
    ]);
    expect(res.data.children[0].usageHistory).toEqual([
      expect.objectContaining({ id: "day1", minutesUsed: 45 }),
    ]);
    expect(res.data.subscriptions).toEqual([
      expect.objectContaining({ id: "sub1", status: "active" }),
    ]);
    expect(res.data.auditLogs).toEqual([
      expect.objectContaining({ id: "log1", action: "device.delete" }),
    ]);
  });

  it("benötigt eine vorhandene masterId", async () => {
    const wrapped = testEnv.wrap(fns.exportUserData);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/masterId is required/);
  });
});

describe("getKnowledgeBase", () => {

  it("gibt Firestore-Inhalt zurück wenn vorhanden", async () => {
    state.operatorConfig = { knowledgeBase: { content: "Test KB content" } };
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    expect(res.content).toBe("Test KB content");
    expect(res.source).toBe("firestore");
  });

  it("fällt auf Datei zurück wenn Firestore leer", async () => {
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    // Falls knowledge_base.txt existiert: source=file, sonst source=empty
    expect(["file", "empty"]).toContain(res.source);
  });
});

describe("updateKnowledgeBase", () => {
  it("aktualisiert Knowledge Base", async () => {
    const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
    const res = await wrapped({ content: "Neuer Inhalt" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.length).toBe(12);
    expect(state.operatorConfig.knowledgeBase.content).toBe("Neuer Inhalt");
  });

  it("wirft invalid-argument ohne content", async () => {
    const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/content.*required/);
  });
});

describe("testGeminiConnection", () => {
  it("meldet fehlenden API-Key", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(false);
    expect(res.error).toContain("GEMINI_API_KEY");
    process.env.GEMINI_API_KEY = original;
  });
});

describe("sendTestFcmMessage", () => {
  it("sendet Test-Nachricht an Token", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ token: "test-fcm-token" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.messageId).toBe("mock-msg-id");
    expect(mockSend).toHaveBeenCalled();
  });

  it("sendet Test-Nachricht an childId", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "c1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });

  it("meldet fehlendes FCM-Token für Kind", async () => {
    state.children.c2 = { masterImei: "m1" }; // no fcmToken
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "c2" }, asAdmin);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Kein FCM-Token");
  });

  it("wirft invalid-argument ohne token und childId", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/token oder childId/);
  });

  it("liefert FCM-Fehler zurück wenn Senden fehlschlägt", async () => {
    mockSend.mockRejectedValueOnce(new Error("push failed"));
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ token: "broken-token" }, asAdmin);
    expect(res.success).toBe(false);
    expect(res.error).toContain("push failed");
  });
});

describe("triggerScheduledJob", () => {
  it("checkExpiredSubscriptions markiert abgelaufene Subs", async () => {
    state.subscriptions.sub1 = {
      status: "active",
      expiresAt: { seconds: 1000, nanoseconds: 0, toMillis() { return 1000000; } },
    };
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "checkExpiredSubscriptions" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result.checked).toBeGreaterThanOrEqual(0);
  });

  it("cleanupExpiredGrants bereinigt abgelaufene Grants", async () => {
    state.supportTickets["ticket-exp"] = {
      accessGranted: true,
      accessExpiresAt: { seconds: 1000, nanoseconds: 0, toMillis() { return 1000000; } },
    };
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "cleanupExpiredGrants" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result).toBeDefined();
  });

  it("sendDailyErrorReport zählt Fehler", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "sendDailyErrorReport" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result.errorsLast24h).toBeDefined();
  });

  it("wirft invalid-argument bei unbekanntem Job", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped({ jobName: "unknownJob" }, asAdmin)).rejects.toThrow(/Unbekannter Job/);
  });

  it("wirft invalid-argument ohne jobName", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/jobName/);
  });

  it("wrappt unerwartete Job-Fehler als internal", async () => {
    const originalCollection = (db.collection as jest.Mock).getMockImplementation();
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      const base = originalCollection(name);
      if (name === "subscriptions") {
        return {
          ...base,
          where: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("subscriptions query failed")),
          })),
        };
      }
      return base;
    });

    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped({ jobName: "checkExpiredSubscriptions" }, asAdmin))
      .rejects.toThrow(/Job-Ausführung fehlgeschlagen: subscriptions query failed/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – Uncovered Functions
// ══════════════════════════════════════════════════════════════════════════

describe("getTicketUserData", () => {
  it("verweigert Zugriff ohne accessGrantId im Ticket", async () => {
    // ticket-1 has no accessGrantId
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "ticket-1" }, asSupport))
      .rejects.toThrow(/access/i);
  });

  it("wirft not-found bei unbekanntem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "nonexistent" }, asSupport))
      .rejects.toThrow(/not found/i);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({}, asSupport))
      .rejects.toThrow(/Ticket ID/i);
  });
});

describe("aiExplainProblem", () => {
  it("wirft failed-precondition ohne Zustimmung", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      context: "App stürzt ab beim Starten der Kindersicherung",
      consentGiven: false,
    }, asAdmin)).rejects.toThrow(/Zustimmung/i);
  });

  it("wirft invalid-argument bei zu kurzem Kontext", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      context: "kurz",
      consentGiven: true,
    }, asAdmin)).rejects.toThrow(/10|Zeichen/i);
  });
});
