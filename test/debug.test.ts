import fft from "firebase-functions-test";
import * as admin from "firebase-admin";
import { db as getDbInstance } from "../firebase";

// Mock the entire firebase-admin module
jest.mock("firebase-admin", () => {
  // We need a class that can be used with `instanceof`
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    toDate() {
      return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
    }
    static fromDate(date: Date) {
      const seconds = Math.floor(date.getTime() / 1000);
      const nanoseconds = date.getMilliseconds() * 1000000;
      return new MockTimestamp(seconds, nanoseconds);
    }
    static now() {
      const now = new Date();
      const seconds = Math.floor(now.getTime() / 1000);
      const nanoseconds = now.getMilliseconds() * 1000000;
      return new MockTimestamp(seconds, nanoseconds);
    }
  }

  const firestoreNamespace = () => ({
    collection: jest.fn(),
  });

  // Assign the class to the Timestamp property
  (firestoreNamespace as any).Timestamp = MockTimestamp;

  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
  };

  return {
    ...jest.requireActual("firebase-admin"),
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
  };
});

const testEnv = fft();

describe("Debug Test", () => {
  let myFunctions: any;
  let db: admin.firestore.Firestore;
  let collectionStub: jest.SpyInstance;
  let docStub: jest.Mock;
  let getStub: jest.Mock;
  let setStub: jest.Mock;

  beforeAll(() => {
    console.log("=== Loading functions ===");
    myFunctions = require("../index");
    console.log("Functions loaded:", Object.keys(myFunctions).slice(0, 5));
    db = getDbInstance();
    console.log("DB instance:", typeof db);
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    setStub = jest.fn();
    getStub = jest.fn();
    docStub = jest.fn().mockReturnValue({
      get: getStub,
      set: setStub,
    });
    collectionStub = jest.spyOn(db, "collection").mockReturnValue({
      doc: docStub,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should test function wrapping", async () => {
    console.log("=== Starting test ===");
    console.log("myFunctions.createPairingCode type:", typeof myFunctions.createPairingCode);
    
    getStub.mockResolvedValue({ exists: false });
    setStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(myFunctions.createPairingCode);
    console.log("Wrapped function type:", typeof wrapped);
    
    try {
      const result = await wrapped({ childId: "test-child-123" });
      console.log("Result:", JSON.stringify(result, null, 2));
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty("pairingCode");
    } catch (error: any) {
      console.error("Error caught:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      throw error;
    }
  });
});
