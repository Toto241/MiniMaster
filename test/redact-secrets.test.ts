/**
 * Unit test for redactSecrets (shared.ts) — the credential projection used by
 * getTicketUserData (support) and exportUserData (DSAR) to avoid leaking
 * secretKey / fcmToken / other auth secrets to non-owners.
 */
jest.mock("../firebase", () => ({
  db: jest.fn(),
  auth: jest.fn(),
  storage: jest.fn(),
  secretManager: jest.fn(),
}));

import { redactSecrets } from "../src/shared";

describe("redactSecrets", () => {
  it("drops known credentials and secret-named keys, preserves PII/data", () => {
    const out = redactSecrets({
      id: "m1",
      imei: "m1",
      secretKey: "s3cr3t",
      fcmToken: "fcm-xyz",
      apiToken: "tok",
      passwordHash: "ph",
      recoveryToken: "rt",
      deviceName: "Pixel 8",
      subscription: { status: "active", childLimit: 2 },
    });
    // Credentials removed
    expect(out.secretKey).toBeUndefined();
    expect(out.fcmToken).toBeUndefined();
    expect(out.apiToken).toBeUndefined();
    expect(out.passwordHash).toBeUndefined();
    expect(out.recoveryToken).toBeUndefined();
    // Non-secret personal data preserved
    expect(out.id).toBe("m1");
    expect(out.imei).toBe("m1");
    expect(out.deviceName).toBe("Pixel 8");
    expect(out.subscription).toEqual({ status: "active", childLimit: 2 });
  });

  it("returns a new object (does not mutate the input)", () => {
    const input = { secretKey: "s", keep: 1 };
    const out = redactSecrets(input);
    expect(input.secretKey).toBe("s"); // original untouched
    expect(out.keep).toBe(1);
    expect(out).not.toBe(input);
  });
});
