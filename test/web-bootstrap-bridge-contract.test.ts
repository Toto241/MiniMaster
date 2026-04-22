import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("web bootstrap bridge contract", () => {
  it("exports the master web bootstrap callables from the functions barrel", async () => {
    const indexSource = await readUtf8("index.ts");
    expect(indexSource).toContain("createMasterWebBootstrapToken");
    expect(indexSource).toContain("redeemMasterWebBootstrapToken");
  });

  it("parent-panel launches web-control via server-issued bootstrap links", async () => {
    const parentPanelHtml = await readUtf8("parent-panel/index.html");
    const parentPanelApp = await readUtf8("parent-panel/app.js");
    const parentPanelSource = parentPanelHtml + "\n" + parentPanelApp;

    expect(parentPanelSource).toContain("createMasterWebBootstrapToken");
    expect(parentPanelSource).toContain("targetPath");
    expect(parentPanelSource).toContain("queryParamName");
    expect(parentPanelHtml).toContain("../web-control/index.html");
    expect(parentPanelSource).toContain("openSecureChildPanel");
    expect(parentPanelSource).not.toContain("httpsCallable(\"generateCustomToken\")");
  });

  it("web clients support bootstrapToken redemption without browser legacy login fallback", async () => {
    const webControl = await readUtf8("web-control/app.js");
    const parentPanelApp = await readUtf8("parent-panel/app.js");
    const childPanelApp = await readUtf8("child-panel/app.js");

    for (const source of [webControl, parentPanelApp, childPanelApp]) {
      expect(source).toContain("bootstrapToken");
      expect(source).toContain("redeemMasterWebBootstrapToken");
    }

    expect(webControl).not.toContain("httpsCallable(\"generateCustomToken\")");
    expect(parentPanelApp).not.toContain("httpsCallable(\"generateCustomToken\")");
    expect(childPanelApp).not.toContain("httpsCallable(\"generateCustomToken\")");
  });
});
