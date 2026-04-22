import * as fs from "fs";
import * as path from "path";

describe("parent-panel security regressions", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "app.js"), "utf8");
  const firebaseJsonSource = fs.readFileSync(path.join(__dirname, "..", "firebase.json"), "utf8");

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
    expect(indexSource).toContain("<script src=\"./app.js\"></script>");
  });

  it("does not contain inline style blocks or style attributes in index.html", () => {
    expect(indexSource).not.toMatch(/<style[^>]*>[\s\S]*?<\/style>/g);
    expect(indexSource).not.toContain(" style=\"");
    expect(indexSource).toContain("<link rel=\"stylesheet\" href=\"./styles.css\" />");
  });

  it("sets parent/child CSP style-src without unsafe-inline", () => {
    const parentCspMatch = firebaseJsonSource.match(/"target"\s*:\s*"parent-panel"[\s\S]*?"Content-Security-Policy"[\s\S]*?"value"\s*:\s*"([^"]+)"/);
    const childCspMatch = firebaseJsonSource.match(/"target"\s*:\s*"child-panel"[\s\S]*?"Content-Security-Policy"[\s\S]*?"value"\s*:\s*"([^"]+)"/);

    expect(parentCspMatch).not.toBeNull();
    expect(childCspMatch).not.toBeNull();

    const parentCsp = parentCspMatch![1];
    const childCsp = childCspMatch![1];

    expect(parentCsp).toContain("style-src 'self'");
    expect(parentCsp).not.toContain("'unsafe-inline'");
    expect(childCsp).toContain("style-src 'self'");
    expect(childCsp).not.toContain("'unsafe-inline'");
  });
});
