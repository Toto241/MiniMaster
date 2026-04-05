/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
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
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
  };
});

const testEnv = fft();
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

describe("App Check enforcement regression", () => {
  let fns: any;
  let previousNodeEnv: string | undefined;

  beforeAll(() => {
    fns = require("../index");
  });

  beforeEach(() => {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  afterAll(() => testEnv.cleanup());

  it("blocks createPairingCode without App Check", async () => {
    await expect(testEnv.wrap(fns.createPairingCode)({}, asMaster)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks validatePairingToken without App Check", async () => {
    await expect(testEnv.wrap(fns.validatePairingToken)({ pairingToken: "tok-1" }, asChild)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks getActiveLegalPolicies without App Check", async () => {
    await expect(testEnv.wrap(fns.getActiveLegalPolicies)({ country: "DE", locale: "de-DE" }, asMaster)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks publishLegalPolicy without App Check", async () => {
    await expect(testEnv.wrap(fns.publishLegalPolicy)({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "2026.04.05-1",
      contentUrl: "https://example.invalid/legal/terms",
    }, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks getRulesForChild without App Check", async () => {
    await expect(testEnv.wrap(fns.getRulesForChild)({ childId: "c1" }, asMaster)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks setAdminClaim without App Check", async () => {
    await expect(testEnv.wrap(fns.setAdminClaim)({ uid: "u1" }, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks createOperatorAccessKey without App Check", async () => {
    await expect(testEnv.wrap(fns.createOperatorAccessKey)({ keyHash: "a".repeat(64) }, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks redeemOperatorAccessKey without App Check", async () => {
    await expect(testEnv.wrap(fns.redeemOperatorAccessKey)({ key: "x".repeat(50) }, asMaster)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks bootstrapFirstAdmin without App Check", async () => {
    const plainUser = { auth: { uid: "u1", token: {} } };
    await expect(testEnv.wrap(fns.bootstrapFirstAdmin)({}, plainUser)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks resetAllAuthUsersHealth without App Check", async () => {
    await expect(testEnv.wrap(fns.resetAllAuthUsersHealth)({}, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks revokeUserTokens without App Check", async () => {
    await expect(testEnv.wrap(fns.revokeUserTokens)({ uid: "u1" }, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks generateCustomToken for authenticated callers without App Check", async () => {
    await expect(testEnv.wrap(fns.generateCustomToken)({}, asAdmin)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks registerMasterDevice for authenticated callers without App Check", async () => {
    const authenticatedMaster = { auth: { uid: "m1", token: { role: "master" } } };
    await expect(testEnv.wrap(fns.registerMasterDevice)({ imei: "m1" }, authenticatedMaster)).rejects.toMatchObject({ code: "permission-denied" });
  });
});
