describe("support module load branches", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.KNOWLEDGE_BASE_PATH;
    process.env.NODE_ENV = "test";
  });

  it("loads module without local KB file and keeps exports available", () => {
    jest.doMock("fs", () => ({
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(() => {
        throw new Error("should not read");
      }),
    }));

    jest.isolateModules(() => {
      const mod = require("../src/support");
      expect(mod.createSupportTicket).toBeDefined();
      expect(mod.aiExplainProblem).toBeDefined();
    });
  });

  it("loads module when KB file read throws and still exports functions", () => {
    jest.doMock("fs", () => ({
      existsSync: jest.fn(() => true),
      readFileSync: jest.fn(() => {
        throw new Error("read-failed");
      }),
    }));

    jest.isolateModules(() => {
      const mod = require("../src/support");
      expect(mod.onTicketCreated).toBeDefined();
      expect(mod.getTicketUserData).toBeDefined();
    });
  });

  it("runs aiExplainProblem with empty KB path (prompt branch without WISSENSBASIS)", async () => {
    jest.doMock("fs", () => ({
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(() => {
        throw new Error("should not read");
      }),
    }));

    jest.doMock("../firebase", () => ({
      db: jest.fn(() => ({
        collection: jest.fn(() => ({
          add: jest.fn().mockResolvedValue({ id: "audit-1" }),
        })),
      })),
    }));

    jest.doMock("../src/shared", () => ({
      AuditLogger: {
        log: jest.fn().mockResolvedValue(undefined),
      },
      requireSupportOrAdmin: jest.fn(),
    }));

    let wrapped: any;
    jest.isolateModules(() => {
      const fft = require("firebase-functions-test")();
      const mod = require("../src/support");
      wrapped = fft.wrap(mod.aiExplainProblem);
    });

    const res = await wrapped(
      { problemContext: "Das Setup bricht nach dem Pairing mit einer Fehlermeldung ab.", consentGiven: true },
      { auth: { uid: "admin1", token: { role: "admin" } } }
    );

    expect(res).toBeDefined();
    expect(typeof res.explanation).toBe("string");
  });
});
