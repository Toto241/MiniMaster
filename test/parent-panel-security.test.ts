import * as fs from "fs";
import * as path from "path";

describe("parent-panel security regressions", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "app.js"), "utf8");

  it("does not concatenate raw error.message into HTML status markup", () => {
    expect(appSource).not.toContain("Tickets konnten nicht geladen werden: \" + (error.message || \"Unbekannter Fehler\")");
  });

  it("does not render ticket cards via joined HTML strings", () => {
    expect(appSource).not.toContain("listEl.innerHTML = html.join(\"\")");
    expect(appSource).toContain("function createTicketItem(doc)");
    expect(appSource).toContain("listEl.appendChild(createTicketItem(doc));");
  });

  it("does not contain inline script blocks in index.html", () => {
    expect(indexSource).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g);
    expect(indexSource).toContain('<script src="./app.js"></script>');
  });
});
