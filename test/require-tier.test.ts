import * as shared from "../src/shared";

function authContext(authTimeSecondsAgo: number, extras: Record<string, unknown> = {}) {
  const authTime = Math.floor(Date.now() / 1000) - authTimeSecondsAgo;
  return {
    auth: {
      uid: "operator-1",
      token: {
        role: "admin",
        auth_time: authTime,
        ...extras,
      },
    },
  };
}

describe("requireTier (AP-N3 Phase 2)", () => {
  it("allows privileged actions within T3 session window", () => {
    expect(() => shared.requireTier(authContext(30 * 60), "T3", "revokeUserTokens")).not.toThrow();
  });

  it("rejects T3 actions when session exceeds 2 hours", () => {
    expect(() => shared.requireTier(authContext(3 * 60 * 60), "T3", "updateKnowledgeBase"))
      .toThrow(/Session tier T3 required/);
  });

  it("rejects T4 actions when session exceeds 30 minutes", () => {
    expect(() => shared.requireTier(authContext(45 * 60), "T4", "resetAllAuthUsers"))
      .toThrow(/Session tier T4 required/);
  });

  it("rejects T4 when admin_verified_at claim is stale", () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 45 * 60;
    expect(() =>
      shared.requireTier(authContext(5 * 60, { admin_verified_at: verifiedAt }), "T4", "deleteUserAccount")
    ).toThrow(/Admin verification expired/);
  });

  it("allows T4 when admin_verified_at is fresh", () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 5 * 60;
    expect(() =>
      shared.requireTier(authContext(5 * 60, { admin_verified_at: verifiedAt }), "T4", "deleteUserAccount")
    ).not.toThrow();
  });

  it("computes session age from auth_time claim", () => {
    expect(shared.getSessionAgeMinutes(authContext(10 * 60))).toBeGreaterThanOrEqual(9.9);
    expect(shared.getSessionAgeMinutes(authContext(10 * 60))).toBeLessThan(11);
  });
});
