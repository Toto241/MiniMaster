import fft from "firebase-functions-test";

// Mock getMessaging before importing anything that uses it
const mockSend = jest.fn();
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({
    send: mockSend,
  })),
}));

// For firebase-functions-test to work with makeDocumentSnapshot, 
// we need the actual firebase-admin firestore functions available
// Since we're mocking heavily, these trigger tests need to skip
// the makeDocumentSnapshot approach and use a different strategy

// Mock the firebase-admin module with firestore support
jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Date.now() / 1000, 0); }
    static fromDate(date: Date) { return new MockTimestamp(date.getTime() / 1000, 0); }
  }
  
  const firestoreNamespace = () => ({
    collection: jest.fn(),
  });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: jest.fn(() => "mock-server-timestamp"),
  };

  return {
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    app: jest.fn(),
  };
});

// Mock the db module
jest.mock("../firebase", () => ({
  db: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => ({
          exists: true,
          data: jest.fn(() => ({})),
        })),
        update: jest.fn(),
      })),
    })),
  })),
}));

const testEnv = fft();

describe("onChildDeviceUpdateV2", () => {
  let myFunctions: any;

  beforeAll(() => {
    myFunctions = require("../index");
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    mockSend.mockClear();
  });

  // Helper to create mock change event for Firestore v2 triggers
  // The event structure must match onDocumentUpdated's event format:
  // event.data?.after.data() and event.data?.before.data()
  const createMockEvent = (
    beforeData: Record<string, any> | null,
    afterData: Record<string, any> | null,
    childId: string
  ) => ({
    data: afterData || beforeData ? {
      before: { data: () => beforeData, exists: !!beforeData },
      after: { data: () => afterData, exists: !!afterData },
    } : undefined,
    params: { childId },
  });

  it("should send FCM message when isLocked changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { fcmToken: "test-token", isLocked: true, appBlacklist: [], usageRules: {} };

    const event = createMockEvent(oldData, newData, "child123");
    
    // Call the raw handler directly (v2 firestore triggers)
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      token: "test-token",
      data: { isLocked: "true" },
      notification: {
        title: "Device Settings Updated",
        body: "Your device settings have been updated by your parent.",
      },
    });
  });

  it("should send FCM message when appBlacklist changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: ["app1"], usageRules: {} };
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: ["app1", "app2"], usageRules: {} };

    const event = createMockEvent(oldData, newData, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      token: "test-token",
      data: { appBlacklist: JSON.stringify(["app1", "app2"]) },
      notification: {
        title: "Device Settings Updated",
        body: "Your device settings have been updated by your parent.",
      },
    });
  });

  it("should send FCM message when usageRules changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: { time: "2h" } };
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: { time: "3h" } };

    const event = createMockEvent(oldData, newData, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      token: "test-token",
      data: { usageRules: JSON.stringify({ time: "3h" }) },
      notification: {
        title: "Device Settings Updated",
        body: "Your device settings have been updated by your parent.",
      },
    });
  });

  it("should not send FCM message if no relevant data changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const event = createMockEvent(oldData, newData, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should not send FCM message if fcmToken is missing", async () => {
    const oldData = { isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { isLocked: true, appBlacklist: [], usageRules: {} };

    const event = createMockEvent(oldData, newData, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should not send FCM message if newData is missing (document deleted)", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const event = createMockEvent(oldData, null, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should not send FCM message if oldData is missing (document created)", async () => {
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const event = createMockEvent(null, newData, "child123");
    await myFunctions.onChildDeviceUpdateV2.run(event);

    expect(mockSend).not.toHaveBeenCalled();
  });
});


