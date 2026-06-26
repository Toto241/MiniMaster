/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("../firebase", () => ({
  db: jest.fn(),
}));

const mockDb = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();

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
        onRun: jest.fn((handler) => ({ run: handler })),
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
    mockCollection.mockReset();
    mockDoc.mockReset();
    mockDb.mockReset();
    mockDb.mockReturnValue({ collection: mockCollection });
    (require("../firebase").db as jest.Mock).mockImplementation(mockDb);
    mockCollection.mockReturnValue({ doc: mockDoc });
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
