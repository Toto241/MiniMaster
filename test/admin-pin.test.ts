import {
  hashAdminPin,
  verifyAdminPinHash,
  validateAdminPinFormat,
  isAdminVerificationFresh,
  ADMIN_PIN_VERIFICATION_MINUTES,
} from "../src/admin-pin";

describe("admin-pin helpers", () => {
  it("validates PIN format", () => {
    expect(() => validateAdminPinFormat("12345")).toThrow(/6–8 Ziffern/);
    expect(() => validateAdminPinFormat("123456789")).toThrow(/6–8 Ziffern/);
    expect(() => validateAdminPinFormat("12ab56")).toThrow(/6–8 Ziffern/);
    expect(() => validateAdminPinFormat("123456")).not.toThrow();
  });

  it("hashes and verifies PIN with scrypt", async () => {
    const pin = "654321";
    const pinHash = await hashAdminPin(pin);
    expect(pinHash.startsWith("scrypt$")).toBe(true);
    await expect(verifyAdminPinHash(pin, pinHash)).resolves.toBe(true);
    await expect(verifyAdminPinHash("000000", pinHash)).resolves.toBe(false);
  });

  it("detects fresh admin verification claim", () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 5 * 60;
    const context = { auth: { uid: "op-1", token: { admin_verified_at: verifiedAt } } };
    expect(isAdminVerificationFresh(context)).toBe(true);
    expect(ADMIN_PIN_VERIFICATION_MINUTES).toBe(30);
  });

  it("rejects stale admin verification claim", () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 45 * 60;
    const context = { auth: { uid: "op-1", token: { admin_verified_at: verifiedAt } } };
    expect(isAdminVerificationFresh(context)).toBe(false);
  });
});
