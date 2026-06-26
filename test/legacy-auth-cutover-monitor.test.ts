/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("../firebase", () => ({
  db: jest.fn(),
}));

const mockDb = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockUsageCollection = jest.fn();
const mockUsageDoc = jest.fn();
const mockUsageUsersCollection = jest.fn();
const mockUsageLimit = jest.fn();
const mockUsageGet = jest.fn();
const mockConfigGet = jest.fn();
const mockConfigSet = jest.fn();
const mockConfigUpdate = jest.fn();
const mockScheduledRun = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => "mock-server-timestamp"),
    },
  },
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({
        onRun: jest.fn((handler) => {
          mockScheduledRun.mockImplementation(handler);
          return { run: handler };
        }),
      })),
    })),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("legacy auth cutover monitor", () => {
  beforeEach(() => {
    jest.resetModules();
    mockUsageCollection.mockReset();
    mockUsageDoc.mockReset();
    mockUsageUsersCollection.mockReset();
    mockUsageLimit.mockReset();
    mockUsageGet.mockReset();
    mockConfigGet.mockReset();
    mockConfigSet.mockReset();
    mockConfigUpdate.mockReset();
    mockScheduledRun.mockReset();
    mockCollection.mockReset();
    mockDoc.mockReset();
    mockDb.mockReset();
    mockDb.mockReturnValue({ collection: mockCollection });
    (require("../firebase").db as jest.Mock).mockImplementation(mockDb);
    mockCollection.mockReturnValue({ doc: mockDoc });
  });

  it("writes legacyAuthCutoverEnabled when the cutover window is clear", async () => {
    mockUsageLimit.mockReturnValue({ get: mockUsageGet });
    mockUsageUsersCollection.mockReturnValue({ limit: mockUsageLimit });
    mockUsageDoc.mockReturnValue({ collection: mockUsageUsersCollection });
    mockUsageCollection.mockReturnValue({ doc: mockUsageDoc });
    mockCollection.mockImplementation((name: string) => {
      if (name === "legacy_auth_usage") {
        return mockUsageCollection();
      }

      return { doc: mockDoc };
    });
    mockUsageGet.mockImplementation(async () => ({ empty: true, forEach: jest.fn() }));
    mockConfigGet.mockImplementation(async () => ({ exists: true, data: () => ({}) }));
    mockConfigSet.mockImplementation(async () => undefined);
    mockConfigUpdate.mockImplementation(async () => undefined);
    mockDoc.mockReturnValue({
      get: mockConfigGet,
      set: mockConfigSet,
      update: mockConfigUpdate,
    });

    const { legacyAuthCutoverMonitor } = require("../src/cutover-monitor");

    await expect(legacyAuthCutoverMonitor.run({})).resolves.toMatchObject({
      cutoverReady: true,
      cutoverExecuted: true,
    });
    expect(mockConfigSet).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyAuthCutoverReady: true,
        legacyAuthCutoverEnabled: true,
      }),
      { merge: true }
    );
    expect(mockConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyAuthCutoverEnabled: true,
        cutoverRecommended: true,
      })
    );
  });

  it("returns false when the cutover config document is missing", async () => {
    mockDoc.mockReturnValue({
      collection: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(async () => ({ empty: true })) })) })),
      get: jest.fn(async () => ({ exists: false, data: () => undefined })),
      set: jest.fn(),
      update: jest.fn(),
    });

    const { isLegacyAuthCutoverEnabled } = require("../src/cutover-monitor");

    await expect(isLegacyAuthCutoverEnabled()).resolves.toBe(false);
  });

  it("returns true when legacyAuthCutoverEnabled is set", async () => {
    mockDoc.mockReturnValue({
      collection: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(async () => ({ empty: true })) })) })),
      get: jest.fn(async () => ({ exists: true, data: () => ({ legacyAuthCutoverEnabled: true }) })),
      set: jest.fn(),
      update: jest.fn(),
    });

    const { isLegacyAuthCutoverEnabled } = require("../src/cutover-monitor");

    await expect(isLegacyAuthCutoverEnabled()).resolves.toBe(true);
  });
});
