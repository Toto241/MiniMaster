import { __supportTestables } from "../src/support";

describe("support testable helpers", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it("parseAiTicketResponse handles valid and invalid payloads", () => {
    const ok = __supportTestables.parseAiTicketResponse('{"solution":"ok","confidence":0.9}');
    expect(ok.solution).toBe("ok");
    expect(ok.confidence).toBe(0.9);

    const fallback = __supportTestables.parseAiTicketResponse("not-json");
    expect(fallback.solution).toMatch(/invalid response/i);
    expect(fallback.confidence).toBe(0);
  });

  it("parseAiTicketResponse covers defaults for missing fields", () => {
    const noSolution = __supportTestables.parseAiTicketResponse('{"confidence":0.5}');
    expect(noSolution.solution).toMatch(/unable to generate/i);

    const nonNumericConfidence = __supportTestables.parseAiTicketResponse('{"solution":"x","confidence":"bad"}');
    expect(nonNumericConfidence.confidence).toBe(0);
  });

  it("resolve role helpers cover fallback sides", () => {
    expect(__supportTestables.resolveImpersonationRole({ auth: { token: { role: "support" } } } as any)).toBe("support");
    expect(__supportTestables.resolveImpersonationRole({ auth: { token: {} } } as any)).toBe("support");

    expect(__supportTestables.resolveExplainRole("admin")).toBe("admin");
    expect(__supportTestables.resolveExplainRole(undefined)).toBe("unknown");
  });

  it("generateWithGemini throws when key is missing", async () => {
    process.env.GEMINI_API_KEY = "";
    await expect(__supportTestables.generateWithGemini("hello")).rejects.toThrow(/not set/i);
  });

  it("generateWithGemini returns concatenated response text", async () => {
    process.env.GEMINI_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "A" }, { text: "" }, {}] } }],
      }),
    } as any);

    const res = await __supportTestables.generateWithGemini("hello");
    expect(res.provider).toBe("gemini");
    expect(res.rawResponse).toBe("A");
  });
});
