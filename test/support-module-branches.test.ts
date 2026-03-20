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
});
