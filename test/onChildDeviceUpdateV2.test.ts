import fft from "firebase-functions-test";
// import * as admin from "firebase-admin";  // Unused
import { getMessaging } from "firebase-admin/messaging";

// Mock the firebase-admin module, specifically messaging and firestore
jest.mock("firebase-admin", () => {
  const originalModule = jest.requireActual("firebase-admin");
  return {
    ...originalModule,
    initializeApp: jest.fn(),
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => "mock-server-timestamp"),
      },
      Timestamp: {
        now: jest.fn(() => new originalModule.firestore.Timestamp(Date.now() / 1000, 0)),
        fromDate: jest.fn((date: Date) => new originalModule.firestore.Timestamp(date.getTime() / 1000, 0)),
      },
    },
    messaging: {
      getMessaging: jest.fn(() => ({
        send: jest.fn(),
      })),
    },
  };
});



// Mock the db module as well, if it's used in the functions
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
  let sendFCMStub: jest.Mock;

  beforeAll(() => {

    myFunctions = require("../index");
    sendFCMStub = getMessaging().send as jest.Mock;
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    sendFCMStub.mockClear();
  });

  it("should send FCM message when isLocked changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { fcmToken: "test-token", isLocked: true, appBlacklist: [], usageRules: {} };

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(before, after);

    await wrapped(change);

    expect(sendFCMStub).toHaveBeenCalledTimes(1);
    expect(sendFCMStub).toHaveBeenCalledWith({
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

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(before, after);

    await wrapped(change);

    expect(sendFCMStub).toHaveBeenCalledTimes(1);
    expect(sendFCMStub).toHaveBeenCalledWith({
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

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(before, after);

    await wrapped(change);

    expect(sendFCMStub).toHaveBeenCalledTimes(1);
    expect(sendFCMStub).toHaveBeenCalledWith({
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

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(before, after);

    await wrapped(change);

    expect(sendFCMStub).not.toHaveBeenCalled();
  });

  it("should not send FCM message if fcmToken is missing", async () => {
    const oldData = { isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { isLocked: true, appBlacklist: [], usageRules: {} };

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(before, after);

    await wrapped(change);

    expect(sendFCMStub).not.toHaveBeenCalled();
  });

  it("should not send FCM message if newData is missing (document deleted)", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const before = testEnv.firestore.makeDocumentSnapshot(oldData, "children/child123");
    const change = testEnv.makeChange(before, null);

    await wrapped(change);

    expect(sendFCMStub).not.toHaveBeenCalled();
  });

  it("should not send FCM message if oldData is missing (document created)", async () => {
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const wrapped = testEnv.wrap(myFunctions.onChildDeviceUpdateV2);
    const after = testEnv.firestore.makeDocumentSnapshot(newData, "children/child123");
    const change = testEnv.makeChange(null, after);

    await wrapped(change);

    expect(sendFCMStub).not.toHaveBeenCalled();
  });

});


