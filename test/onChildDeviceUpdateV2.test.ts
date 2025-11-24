import fft from "firebase-functions-test";
import { wrapV2 } from "firebase-functions-test/lib/v2";
// import * as admin from "firebase-admin";  // Unused
// import { getMessaging } from "firebase-admin/messaging";  // Unused - using mockSend directly

// Mock firebase-admin/messaging module only
const mockSend = jest.fn();
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({
    send: mockSend,
  })),
}));



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

  beforeAll(() => {

    myFunctions = require("../index");
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    mockSend.mockClear();
  });

  it("should send FCM message when isLocked changes", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { fcmToken: "test-token", isLocked: true, appBlacklist: [], usageRules: {} };

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    
    // For v2 firestore triggers, provide data before/after with data() methods
    await wrapped({
      data: {
        before: oldData,
        after: newData,
      },
      params: { childId: "child123" },
    });

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

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: oldData,
        after: newData,
      },
      params: { childId: "child123" },
    });

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

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: oldData,
        after: newData,
      },
      params: { childId: "child123" },
    });

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

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: oldData,
        after: newData,
      },
      params: { childId: "child123" },
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should not send FCM message if fcmToken is missing", async () => {
    const oldData = { isLocked: false, appBlacklist: [], usageRules: {} };
    const newData = { isLocked: true, appBlacklist: [], usageRules: {} };

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: oldData,
        after: newData,
      },
      params: { childId: "child123" },
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should not send FCM message if newData is missing (document deleted)", async () => {
    const oldData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: oldData,
        after: null,
      },
      params: { childId: "child123" },
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  // Note: onDocumentUpdated typically doesn't fire on initial document creation
  // (that's what onDocumentCreated is for). However, we test the edge case where
  // oldData might be empty/undefined due to race conditions or manual triggers.
  it("should not send FCM message if oldData is missing (document created)", async () => {
    const newData = { fcmToken: "test-token", isLocked: false, appBlacklist: [], usageRules: {} };

    const wrapped = wrapV2(myFunctions.onChildDeviceUpdateV2);
    await wrapped({
      data: {
        before: {},  // Empty document (simulates creation-like scenario)
        after: newData,
      },
      params: { childId: "child123" },
    });

    // Function correctly detects document creation (empty oldData) and skips notification
    expect(mockSend).not.toHaveBeenCalled();
  });

});


