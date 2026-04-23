import * as fs from "fs";
import * as path from "path";

describe("admin-panel logs security regressions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "admin-panel", "logs.js"), "utf8");

  it("does not use innerHTML for stats cards, errors, or empty-state rows", () => {
    expect(source).not.toContain("statsContainer.innerHTML");
    expect(source).not.toContain("errorContainer.innerHTML");
    expect(source).not.toContain("tbody.innerHTML = '<tr");
  });

  it("contains explicit DOM-based helper renderers for sensitive UI paths", () => {
    expect(source).toContain("function renderStatsCards");
    expect(source).toContain("function createStatusMessage");
    expect(source).toContain("function clearElement");
  });
});
