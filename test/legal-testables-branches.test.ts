import { __legalTestables } from "../src/legal";

describe("legal testable helpers", () => {
  it("mapPolicyDoc returns null for non-existing doc", () => {
    const res = __legalTestables.mapPolicyDoc({ exists: false, data: () => undefined } as any);
    expect(res).toBeNull();
  });

  it("parseCountryLocaleInput validates both fields", () => {
    expect(() => __legalTestables.parseCountryLocaleInput({ country: "DE", locale: "de-DE" })).not.toThrow();
    expect(() => __legalTestables.parseCountryLocaleInput({ country: "DE" } as any)).toThrow(/locale/i);
    expect(() => __legalTestables.parseCountryLocaleInput(undefined as any)).toThrow(/country/i);
  });

  it("parseRecordConsentInput covers string/default branches", () => {
    const full = __legalTestables.parseRecordConsentInput({
      termsVersion: "1",
      privacyVersion: "2",
      consentSource: "panel",
      appVersion: "1.2.3",
    });
    expect(full).toEqual({
      termsVersion: "1",
      privacyVersion: "2",
      consentSource: "panel",
      appVersion: "1.2.3",
    });

    const fallback = __legalTestables.parseRecordConsentInput({
      termsVersion: 1,
      privacyVersion: null,
      consentSource: "",
      appVersion: "",
    } as any);
    expect(fallback.termsVersion).toBe("");
    expect(fallback.privacyVersion).toBe("");
    expect(fallback.consentSource).toBe("master_app");
    expect(fallback.appVersion).toBe("unknown");

    const partial = __legalTestables.parseRecordConsentInput({
      termsVersion: "1",
      privacyVersion: "2",
      consentSource: "x",
      appVersion: "",
    });
    expect(partial.consentSource).toBe("x");
    expect(partial.appVersion).toBe("unknown");
  });

  it("parsePublishPolicyInput covers version/url/status/effectiveAt/isMajorChange branches", () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();

    const explicit = __legalTestables.parsePublishPolicyInput({
      policyType: "terms",
      country: "de",
      locale: "de-DE",
      version: "v1",
      contentUrl: "https://example.com",
      status: "retired",
      effectiveAt: ts,
      isMajorChange: true,
    } as any);
    expect(explicit.version).toBe("v1");
    expect(explicit.contentUrl).toBe("https://example.com");
    expect(explicit.status).toBe("retired");
    expect(explicit.isMajorChange).toBe(true);

    const fallback = __legalTestables.parsePublishPolicyInput({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: 1,
      contentUrl: null,
      status: undefined,
      effectiveAt: "not-ts",
      isMajorChange: false,
    } as any);
    expect(fallback.version).toBe("");
    expect(fallback.contentUrl).toBe("");
    expect(fallback.status).toBe("active");
    expect(fallback.isMajorChange).toBe(false);

    const statusOnly = __legalTestables.parsePublishPolicyInput({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "x",
      contentUrl: "https://example.com/x",
      status: "draft",
      isMajorChange: false,
    } as any);
    expect(statusOnly.status).toBe("draft");
  });

  it("resolve role and targetMaster fallbacks", () => {
    expect(__legalTestables.resolveAuditRole({ auth: { token: { role: "admin" } } } as any)).toBe("admin");
    expect(__legalTestables.resolveAuditRole({ auth: { token: {} } } as any)).toBe("master");
    expect(__legalTestables.resolveAuditRole({} as any)).toBe("master");
    expect(__legalTestables.resolveTargetMaster("m1")).toBe("m1");
    expect(__legalTestables.resolveTargetMaster("")).toBeNull();
    expect(__legalTestables.resolveTargetMaster(123 as any)).toBeNull();
  });
});
