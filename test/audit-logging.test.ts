/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() {
      const d = new Date();
      return new MockTimestamp(Math.floor(d.getTime() / 1000), 0);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
  }

  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
  };

  return {
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => ({
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
      createCustomToken: jest.fn().mockResolvedValue("mock-token"),
    }),
  };
});

// Mock functions.logger
jest.mock("firebase-functions/v1", () => ({
  ...jest.requireActual("firebase-functions/v1"),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  },
}));

const testEnv = fft();

let db: any;
let addStub: jest.Mock;
let getStub: jest.Mock;

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

beforeAll(() => {
  db = getDb();
});

beforeEach(() => {
  addStub = jest.fn().mockResolvedValue({ id: "log123" });
  getStub = jest.fn();

  jest.spyOn(db, "collection").mockImplementation(() => ({
    doc: jest.fn().mockReturnValue({
      get: getStub,
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    }),
    add: addStub,
    where: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, size: 0 }),
    }),
  }) as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  testEnv.cleanup();
});

describe("Audit Logging Infrastructure", () => {
  let fns: any;

  beforeAll(() => {
    fns = require("../index");
  });

  describe("setAdminClaim with audit logging", () => {
    it("logs successful admin claim grant", async () => {
      const wrapped = testEnv.wrap(fns.setAdminClaim);
      
      await wrapped({ uid: "user123" }, asAdmin);

      // Verify audit log was written
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.set_admin_claim",
          userId: "admin1",
          userRole: "admin",
          resource: "users/user123",
          resourceType: "user",
          status: "success",
          metadata: expect.objectContaining({
            targetUserId: "user123",
            duration: expect.any(Number),
          }),
        })
      );
    });

    it("logs failed admin claim grant due to permission", async () => {
      const wrapped = testEnv.wrap(fns.setAdminClaim);

      // Non-admin user trying to set admin claim - should throw
      try {
        await wrapped({ uid: "user123" }, asMaster);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Expected to fail
      }

      // Verify error was logged
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.set_admin_claim",
          status: "failure",
        })
      );
    });
  });

  describe("revokeSubscription with audit logging", () => {
    it("requires admin permission", async () => {
      const wrapped = testEnv.wrap(fns.revokeSubscription);

      await expect(wrapped({ subscriptionId: "sub123" }, asMaster)).rejects.toThrow();

      // Verify failure was logged due to permission
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.revoke_subscription",
          status: "failure",
        })
      );
    });
  });

  describe("setDeviceLocked with audit logging", () => {
    it("logs successful device lock", async () => {
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });

      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      
      await wrapped({ childId: "c1", isLocked: true }, asMaster);

      // Verify audit log was written with correct action
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "device.lock",
          userId: "m1",
          resource: "children/c1",
          resourceType: "device",
          status: "success",
          metadata: expect.objectContaining({
            isLocked: true,
            duration: expect.any(Number),
          }),
        })
      );
    });

    it("logs successful device unlock", async () => {
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });

      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      
      await wrapped({ childId: "c1", isLocked: false }, asMaster);

      // Verify audit log was written with unlock action
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "device.unlock",
          status: "success",
        })
      );
    });

    it("logs denied access when master doesn't own device", async () => {
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
      getStub.mockResolvedValueOnce({ 
        exists: true, 
        data: () => ({ masterImei: "differentMaster" }) 
      });

      const wrapped = testEnv.wrap(fns.setDeviceLocked);

      await expect(wrapped({ childId: "c1", isLocked: true }, asMaster)).rejects.toThrow();

      // Verify denied access was logged (check the actual reason format)
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "device.lock",
          status: "denied",
          metadata: expect.objectContaining({
            reason: expect.any(String),
          }),
        })
      );
    });
  });

  describe("createTask with audit logging", () => {
    it("logs denied access when master doesn't own child", async () => {
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
      getStub.mockResolvedValueOnce({ 
        exists: true, 
        data: () => ({ masterImei: "differentMaster" }) 
      });

      const wrapped = testEnv.wrap(fns.createTask);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await expect(wrapped({
        childId: "c1",
        description: "Test Description",
        deadlineISO: tomorrow.toISOString()
      }, asMaster)).rejects.toThrow();

      // Verify denied access was logged
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "task.create",
          userId: "m1",
          resourceType: "task",
          status: "denied",
        })
      );
    });
  });

  describe("grantSupportAccess with audit logging", () => {
    it("logs successful support access grant", async () => {
      // Mock support ticket exists and is open
      getStub.mockResolvedValueOnce({
        exists: true,
        data: () => ({ 
          masterImei: "m1", 
          status: "open",
          problemDescription: "Help needed"
        }),
      });

      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      
      await wrapped({ ticketId: "ticket123" }, asMaster);

      // Verify audit log was written (second call is the audit log)
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.grant_support_access",
          userId: "m1",
          resourceType: "system",
          status: "success",
        })
      );
    });
  });

  describe("AuditLogger error handling", () => {
    it("doesn't crash main function if logging fails", async () => {
      // Make audit log write fail
      addStub.mockRejectedValueOnce(new Error("Firestore error"));

      getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
      getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });

      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      
      // Function should still succeed even if logging fails
      const result = await wrapped({ childId: "c1", isLocked: true }, asMaster);
      
      expect(result).toEqual({ success: true, isLocked: true });
    });
  });

  describe("Daily Error Report", () => {
    it("generates report for errors in last 24 hours", async () => {
      const mockErrors = [
        { functionName: "setDeviceLocked", message: "Error 1", timestamp: new Date().toISOString() },
        { functionName: "setDeviceLocked", message: "Error 2", timestamp: new Date().toISOString() },
        { functionName: "createTask", message: "Error 3", timestamp: new Date().toISOString() },
      ];

      const mockSnapshot = {
        empty: false,
        size: 3,
        docs: mockErrors.map(data => ({
          data: () => data,
        })),
      };

      jest.spyOn(db, "collection").mockImplementation((collectionName: string) => {
        if (collectionName === "error_logs") {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue(mockSnapshot),
          } as any;
        }
        if (collectionName === "error_summaries") {
          return {
            add: addStub,
          } as any;
        }
        return {
          doc: jest.fn(),
          where: jest.fn(),
        } as any;
      });

      const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
      await wrapped();

      // Verify summary was stored
      expect(addStub).toHaveBeenCalledWith(
        expect.objectContaining({
          totalErrors: 3,
          errorsByFunction: expect.objectContaining({
            setDeviceLocked: 2,
            createTask: 1,
          }),
        })
      );
    });

    it("logs success message when no errors", async () => {
      const mockSnapshot = { empty: true, size: 0, docs: [] };

      jest.spyOn(db, "collection").mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockSnapshot),
      }) as any);

      const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
      const result = await wrapped();

      expect(result).toBeNull();
    });
  });
});
