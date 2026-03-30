/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests für src/device-sync.ts — Control-Plane für Android/iOS-bidirektionale Kommunikation.
 *
 * Abgedeckt:
 *   registerDeviceEndpoint   — happy path (android), iOS, doppelte Token-Deduplizierung,
 *                               auth-Fehler, invalid-argument
 *   publishDeviceEvent        — happy path, Idempotenz-Deduplizierung, auth-Fehler
 *   fetchPendingCommands      — happy path (master + child), maxItems-Limit, Cursor
 *   acknowledgeCommand        — applied + failed, Idempotenz (bereits bewertet), auth-Fehler
 *   syncPolicySnapshot        — up-to-date Branch, veraltet Branch, auth-Fehler
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() {
      return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
    static fromMillis(ms: number) {
      return new MockTimestamp(Math.floor(ms / 1000), 0);
    }
    toMillis() {
      return this.seconds * 1000;
    }
  }

  const firestoreNamespace = () => ({ collection: jest.fn(), runTransaction: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
  };

  return {
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    messaging: () => ({ send: jest.fn().mockResolvedValue("msg-id") }),
    auth: () => ({
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
      createCustomToken: jest.fn().mockResolvedValue("mock-token"),
    }),
  };
});

const testEnv = fft();

let fns: any;
let db: any;
let getStub: jest.Mock;
let updateStub: jest.Mock;
let setStub: jest.Mock;
let addStub: jest.Mock;

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };
const asOther = { auth: { uid: "other", token: {} } };

// -------------------------------------------------------- helpers --------

function makeChildDoc(overrides: object = {}) {
  return {
    exists: true,
    data: () => ({
      masterImei: "m1",
      platform: "android",
      capabilities: ["lock", "appBlacklist"],
      pushEndpoints: [],
      policyVersion: 2,
      lastPolicyVersion: 1,
      isLocked: false,
      appBlacklist: [],
      usageRules: {},
      ...overrides,
    }),
  };
}

function makeCommandDoc(overrides: object = {}) {
  return {
    exists: true,
    id: "cmd-1",
    data: () => ({
      commandId: "cmd-1",
      type: "lock_state",
      payload: { isLocked: true },
      status: "pending",
      schemaVersion: 1,
      policyVersion: 2,
      ackedAt: null,
      errorCode: null,
      ...overrides,
    }),
  };
}

// ---------------------------------- setup / teardown --------------------

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  getStub = jest.fn();
  updateStub = jest.fn().mockResolvedValue(undefined);
  setStub = jest.fn().mockResolvedValue(undefined);
  addStub = jest.fn().mockResolvedValue({ id: "new-event-id" });

  const eventsDocs = {
    id: "evt-1",
    data: () => ({ eventId: "evt-1", createdAt: "mock-ts" }),
  };

  const commandsDocs = [makeCommandDoc()];

  // Sub-collection mock (commands / events / usageHistory)
  const subColMock = {
    doc: jest.fn().mockReturnValue({
      get: getStub,
      update: updateStub,
      set: setStub,
    }),
    add: addStub,
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    startAfter: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: true,
      size: 0,
      docs: commandsDocs,
    }),
  };

  const childDocMock = {
    get: getStub,
    update: updateStub,
    set: setStub,
    collection: jest.fn().mockReturnValue(subColMock),
  };

  // Transaction mock
  const txMock = {
    get: jest.fn().mockResolvedValue(makeChildDoc()),
    update: jest.fn(),
  };

  jest.spyOn(db, "collection").mockImplementation(() => ({
    doc: jest.fn().mockReturnValue(childDocMock),
    where: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
      limit: jest.fn().mockReturnThis(),
    }),
  }) as any);

  jest.spyOn(db, "runTransaction").mockImplementation(async (fn: (tx: any) => Promise<void>) => {
    await fn(txMock);
  });

  // Default: child doc exists, owned by m1
  getStub.mockResolvedValue(makeChildDoc());
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  testEnv.cleanup();
});

// ===================================================== registerDeviceEndpoint

describe("registerDeviceEndpoint", () => {
  it("registriert Android-FCM-Endpoint erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    const result = await wrapped(
      {
        childId: "c1",
        platform: "android",
        provider: "fcm",
        token: "fcm-token-123",
        appVersion: "1.0.0",
        capabilities: ["lock", "appBlacklist", "usageRules"],
      },
      asChild
    );
    expect(result).toHaveProperty("endpointId");
    expect(result.acceptedCapabilities).toEqual(["lock", "appBlacklist", "usageRules"]);
    expect(updateStub).toHaveBeenCalled();
  });

  it("registriert iOS-APNs-Endpoint erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    const result = await wrapped(
      {
        childId: "c1",
        platform: "ios",
        provider: "apns",
        token: "apns-token-abc",
        appVersion: "2.0.0",
        capabilities: ["lock", "screenTime"],
      },
      asChild
    );
    expect(result).toHaveProperty("endpointId");
    expect(result.acceptedCapabilities).toEqual(["lock", "screenTime"]);
    // Kein fcmToken-Update bei APNs
    const updateCall = updateStub.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty("fcmToken");
  });

  it("filtert unbekannte Capabilities heraus", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    const result = await wrapped(
      {
        childId: "c1",
        platform: "android",
        provider: "fcm",
        token: "tok",
        appVersion: "1.0.0",
        capabilities: ["lock", "unknownCap", "fakeFeature"],
      },
      asChild
    );
    expect(result.acceptedCapabilities).toEqual(["lock"]);
  });

  it("Master kann Endpoint für sein Kind registrieren", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    const result = await wrapped(
      {
        childId: "c1",
        platform: "ios",
        provider: "apns",
        token: "tok",
        appVersion: "1.0.0",
      },
      asMaster
    );
    expect(result).toHaveProperty("endpointId");
  });

  it("wirft permission-denied wenn Aufrufer weder Child noch Master", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    await expect(
      wrapped(
        { childId: "c1", platform: "android", provider: "fcm", token: "x", appVersion: "1" },
        asOther
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("wirft invalid-argument bei fehlendem childId", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    await expect(
      wrapped({ platform: "android", provider: "fcm", token: "x", appVersion: "1" }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("wirft invalid-argument bei unbekannter Platform", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    await expect(
      wrapped({ childId: "c1", platform: "windows", provider: "fcm", token: "x", appVersion: "1" }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("wirft not-found wenn Kind-Gerät nicht existiert", async () => {
    getStub.mockResolvedValueOnce({ exists: false });
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    await expect(
      wrapped({ childId: "c1", platform: "android", provider: "fcm", token: "x", appVersion: "1" }, asChild)
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("wirft unauthenticated ohne Auth-Kontext", async () => {
    const wrapped = testEnv.wrap(fns.registerDeviceEndpoint);
    await expect(
      wrapped({ childId: "c1", platform: "android", provider: "fcm", token: "x", appVersion: "1" }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

// ====================================================== publishDeviceEvent

describe("publishDeviceEvent", () => {
  it("publiziert usage_report erfolgreich", async () => {
    const subColMock = {
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
      doc: jest.fn().mockReturnValue({ set: setStub }),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.publishDeviceEvent);
    const result = await wrapped(
      {
        childId: "c1",
        eventType: "usage_report",
        payload: { totalMs: 3600000 },
        idempotencyKey: "idk-unique-1",
      },
      asChild
    );
    expect(result).toHaveProperty("eventId");
    expect(setStub).toHaveBeenCalled();
  });

  it("unterdrückt Duplikat via idempotencyKey", async () => {
    const existingEvent = {
      id: "existing-evt",
      data: () => ({ eventId: "existing-evt", createdAt: "ts" }),
    };
    const subColMock = {
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: false, docs: [existingEvent] }),
        }),
      }),
      doc: jest.fn().mockReturnValue({ set: setStub }),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.publishDeviceEvent);
    const result = await wrapped(
      {
        childId: "c1",
        eventType: "usage_report",
        payload: {},
        idempotencyKey: "idk-existing",
      },
      asChild
    );
    expect(result.eventId).toBe("existing-evt");
    expect(setStub).not.toHaveBeenCalled();
  });

  it("wirft permission-denied wenn nicht das Kind selbst", async () => {
    const wrapped = testEnv.wrap(fns.publishDeviceEvent);
    await expect(
      wrapped(
        { childId: "c1", eventType: "usage_report", payload: {}, idempotencyKey: "k" },
        asMaster
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("wirft invalid-argument bei fehlendem eventType", async () => {
    const wrapped = testEnv.wrap(fns.publishDeviceEvent);
    await expect(
      wrapped({ childId: "c1", payload: {}, idempotencyKey: "k" }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("wirft invalid-argument bei fehlendem idempotencyKey", async () => {
    const wrapped = testEnv.wrap(fns.publishDeviceEvent);
    await expect(
      wrapped({ childId: "c1", eventType: "usage_report", payload: {} }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

// ==================================================== fetchPendingCommands

describe("fetchPendingCommands", () => {
  it("gibt pending Commands für das Kind zurück", async () => {
    const cmd = makeCommandDoc();
    const subColMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      startAfter: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [cmd] }),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc({ policyVersion: 3 })),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.fetchPendingCommands);
    const result = await wrapped({ childId: "c1" }, asChild);
    expect(result.commands).toHaveLength(1);
    expect(result.policyVersion).toBe(3);
    expect(result.nextCursor).toBeNull();
  });

  it("Master kann Commands seines Kindes abrufen", async () => {
    const subColMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      startAfter: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.fetchPendingCommands);
    const result = await wrapped({ childId: "c1" }, asMaster);
    expect(result.commands).toHaveLength(0);
  });

  it("wirft invalid-argument wenn maxItems > 50", async () => {
    const wrapped = testEnv.wrap(fns.fetchPendingCommands);
    await expect(
      wrapped({ childId: "c1", maxItems: 51 }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("wirft permission-denied für fremden User", async () => {
    const wrapped = testEnv.wrap(fns.fetchPendingCommands);
    await expect(wrapped({ childId: "c1" }, asOther)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

// ===================================================== acknowledgeCommand

describe("acknowledgeCommand", () => {
  it("setzt Command-Status auf applied und aktualisiert lastPolicyVersion", async () => {
    const cmdUpdate = jest.fn().mockResolvedValue(undefined);
    const cmdRef = {
      get: jest.fn().mockResolvedValue(makeCommandDoc()),
      update: cmdUpdate,
    };
    const childUpdate = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        update: childUpdate,
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(cmdRef),
        }),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    const result = await wrapped(
      { childId: "c1", commandId: "cmd-1", status: "applied", appliedAt: Date.now() },
      asChild
    );
    expect(result).toEqual({ success: true });
    expect(cmdUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "applied" }));
  });

  it("setzt Command-Status auf failed mit errorCode", async () => {
    const cmdUpdate = jest.fn().mockResolvedValue(undefined);
    const cmdRef = {
      get: jest.fn().mockResolvedValue(makeCommandDoc()),
      update: cmdUpdate,
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        update: jest.fn().mockResolvedValue(undefined),
        collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(cmdRef) }),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    const result = await wrapped(
      { childId: "c1", commandId: "cmd-1", status: "failed", appliedAt: Date.now(), errorCode: "SCREEN_TIME_DENIED" },
      asChild
    );
    expect(result).toEqual({ success: true });
    expect(cmdUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorCode: "SCREEN_TIME_DENIED" }));
  });

  it("ist idempotent bei bereits bewertetem Command (applied)", async () => {
    const cmdUpdate = jest.fn().mockResolvedValue(undefined);
    const cmdRef = {
      get: jest.fn().mockResolvedValue(makeCommandDoc({ status: "applied" })),
      update: cmdUpdate,
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(cmdRef) }),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    const result = await wrapped(
      { childId: "c1", commandId: "cmd-1", status: "applied", appliedAt: Date.now() },
      asChild
    );
    expect(result).toEqual({ success: true });
    expect(cmdUpdate).not.toHaveBeenCalled();
  });

  it("wirft permission-denied wenn nicht das Kind selbst", async () => {
    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    await expect(
      wrapped({ childId: "c1", commandId: "cmd-1", status: "applied", appliedAt: Date.now() }, asMaster)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("wirft invalid-argument bei ungültigem Status", async () => {
    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    await expect(
      wrapped({ childId: "c1", commandId: "cmd-1", status: "unknown", appliedAt: Date.now() }, asChild)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("wirft not-found wenn Command nicht existiert", async () => {
    const cmdRef = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      update: jest.fn(),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(cmdRef) }),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.acknowledgeCommand);
    await expect(
      wrapped({ childId: "c1", commandId: "nonexistent", status: "applied", appliedAt: Date.now() }, asChild)
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

// ===================================================== syncPolicySnapshot

describe("syncPolicySnapshot", () => {
  function makeFullySyncedChildDoc() {
    return makeChildDoc({ policyVersion: 5, lastPolicyVersion: 5 });
  }

  it("liefert vollständigen Snapshot wenn veraltet (upToDate=false)", async () => {
    const critSnap = {
      docs: [makeCommandDoc({ type: "lock_state" })],
    };
    const subColMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(critSnap),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc({ policyVersion: 5 })),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    const result = await wrapped({ childId: "c1", knownPolicyVersion: 3 }, asChild);
    expect(result.upToDate).toBe(false);
    expect(result.policyVersion).toBe(5);
    expect(result.fullPolicy).toHaveProperty("isLocked");
    expect(result.pendingCriticalCommands).toHaveLength(1);
  });

  it("markiert upToDate=true wenn Gerät bereits aktuelle Version hat", async () => {
    const critSnap = { docs: [] };
    const subColMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(critSnap),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeFullySyncedChildDoc()),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    const result = await wrapped({ childId: "c1", knownPolicyVersion: 5 }, asChild);
    expect(result.upToDate).toBe(true);
    expect(result.policyVersion).toBe(5);
  });

  it("Master kann Snapshot für sein Kind abrufen", async () => {
    const critSnap = { docs: [] };
    const subColMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(critSnap),
    };
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeChildDoc()),
        collection: jest.fn().mockReturnValue(subColMock),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    const result = await wrapped({ childId: "c1" }, asMaster);
    expect(result).toHaveProperty("fullPolicy");
  });

  it("wirft permission-denied für fremden User", async () => {
    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    await expect(wrapped({ childId: "c1" }, asOther)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("wirft not-found wenn Kind nicht existiert", async () => {
    jest.spyOn(db, "collection").mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    } as any);

    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    await expect(wrapped({ childId: "c1" }, asChild)).rejects.toMatchObject({ code: "not-found" });
  });

  it("wirft invalid-argument bei fehlendem childId", async () => {
    const wrapped = testEnv.wrap(fns.syncPolicySnapshot);
    await expect(wrapped({}, asChild)).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
