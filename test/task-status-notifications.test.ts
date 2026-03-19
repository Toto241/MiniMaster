/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

const mockSend = jest.fn();
const mockGet = jest.fn();

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
      })),
    })),
  })),
}));

const testEnv = fft();

describe("onTaskStatusChange", () => {
  let fns: any;

  beforeAll(() => {
    fns = require("../index");
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("sends master notification when task moves to pending_approval", async () => {
    mockGet.mockResolvedValueOnce({
      data: () => ({ fcmToken: "master-token" }),
    });

    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(
      {
        before: { data: () => ({ status: "pending", masterImei: "m1", description: "Zimmer aufräumen" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Zimmer aufräumen" }) },
      },
      { params: { childId: "c1", taskId: "t1" } }
    );

    expect(mockSend).toHaveBeenCalledWith({
      token: "master-token",
      notification: {
        title: "Task Submitted for Review",
        body: "Your child has submitted the task \"Zimmer aufräumen\" for your review.",
      },
      data: {
        taskId: "t1",
        childId: "c1",
      },
    });
  });

  it("sends child notification when task is approved", async () => {
    mockGet.mockResolvedValueOnce({
      data: () => ({ fcmToken: "child-token" }),
    });

    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(
      {
        before: { data: () => ({ status: "pending_approval", description: "Hausaufgaben" }) },
        after: { data: () => ({ status: "approved", description: "Hausaufgaben" }) },
      },
      { params: { childId: "c9", taskId: "t9" } }
    );

    expect(mockSend).toHaveBeenCalledWith({
      token: "child-token",
      notification: {
        title: "Task Approved",
        body: "Great job! Your task \"Hausaufgaben\" was approved.",
      },
      data: {
        taskId: "t9",
        childId: "c9",
        status: "approved",
      },
    });
  });

  it("sends child notification when task is rejected", async () => {
    mockGet.mockResolvedValueOnce({
      data: () => ({ fcmToken: "child-token" }),
    });

    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(
      {
        before: { data: () => ({ status: "pending_approval", description: "Müll rausbringen" }) },
        after: { data: () => ({ status: "rejected", description: "Müll rausbringen" }) },
      },
      { params: { childId: "c2", taskId: "t2" } }
    );

    expect(mockSend).toHaveBeenCalledWith({
      token: "child-token",
      notification: {
        title: "Task Rejected",
        body: "Your task \"Müll rausbringen\" was rejected. Please review and try again.",
      },
      data: {
        taskId: "t2",
        childId: "c2",
        status: "rejected",
      },
    });
  });

  it("does not send any notification if status does not change", async () => {
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(
      {
        before: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
      },
      { params: { childId: "c1", taskId: "t1" } }
    );

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("retries transient FCM errors before succeeding", async () => {
    jest.useFakeTimers();
    mockGet.mockResolvedValueOnce({
      data: () => ({ fcmToken: "master-token" }),
    });
    mockSend
      .mockRejectedValueOnce({ code: "messaging/server-unavailable" })
      .mockResolvedValueOnce("ok-after-retry");

    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const pending = wrapped(
      {
        before: { data: () => ({ status: "pending", masterImei: "m1", description: "Retry Test" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Retry Test" }) },
      },
      { params: { childId: "c1", taskId: "retry-1" } }
    );

    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("gives up after max retry attempts on transient FCM errors", async () => {
    jest.useFakeTimers();
    mockGet.mockResolvedValueOnce({
      data: () => ({ fcmToken: "master-token" }),
    });
    mockSend.mockRejectedValue({ code: "messaging/server-unavailable" });

    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const pending = wrapped(
      {
        before: { data: () => ({ status: "pending", masterImei: "m1", description: "Retry Exhaust" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Retry Exhaust" }) },
      },
      { params: { childId: "c1", taskId: "retry-2" } }
    );

    await jest.advanceTimersByTimeAsync(3000);
    await pending;

    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
