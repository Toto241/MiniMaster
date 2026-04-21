import * as fs from "fs";
import * as path from "path";

describe("child-panel security regressions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "child-panel", "index.html"), "utf8");

  it("does not concatenate raw error.message into HTML status markup", () => {
    expect(source).not.toContain("Tickets konnten nicht geladen werden: \" + (error.message || \"Unbekannter Fehler\")");
  });

  it("does not render ticket cards via joined HTML strings", () => {
    expect(source).not.toContain("listEl.innerHTML = html.join(\"\")");
    expect(source).toContain("function createTicketItem(doc)");
    expect(source).toContain("listEl.appendChild(createTicketItem(doc));");
  });
});
