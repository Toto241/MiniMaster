import { __supportTestables } from "../src/support";

describe("support debug flow helpers", () => {
  it("buildInitialDebugConsentQuestion contains clear consent intent", () => {
    const question = __supportTestables.buildInitialDebugConsentQuestion();
    expect(question).toMatch(/Debug-Modus/i);
    expect(question).toMatch(/analysieren/i);
  });

  it("escalates only when all attempts are exhausted", () => {
    expect(__supportTestables.shouldEscalateAfterAttempts(false, 7, 7)).toBe(true);
    expect(__supportTestables.shouldEscalateAfterAttempts(false, 6, 7)).toBe(false);
    expect(__supportTestables.shouldEscalateAfterAttempts(false, 7, 6)).toBe(false);
    expect(__supportTestables.shouldEscalateAfterAttempts(true, 7, 7)).toBe(false);
  });
});
