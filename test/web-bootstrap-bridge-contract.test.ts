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
    const parentPanel = await readUtf8("parent-panel/index.html");

    expect(parentPanel).toContain("createMasterWebBootstrapToken");
    expect(parentPanel).toContain("targetPath");
    expect(parentPanel).toContain("queryParamName");
    expect(parentPanel).toContain("../web-control/index.html");
    expect(parentPanel).toContain("openSecureChildPanel");
    expect(parentPanel).not.toContain('httpsCallable("generateCustomToken")');
  });

  it("web clients support bootstrapToken redemption without browser legacy login fallback", async () => {
    const webControl = await readUtf8("web-control/app.js");
    const parentPanel = await readUtf8("parent-panel/index.html");
    const childPanel = await readUtf8("child-panel/index.html");

    for (const source of [webControl, parentPanel, childPanel]) {
      expect(source).toContain("bootstrapToken");
      expect(source).toContain("redeemMasterWebBootstrapToken");
    }

    expect(webControl).not.toContain('httpsCallable("generateCustomToken")');
    expect(parentPanel).not.toContain('httpsCallable("generateCustomToken")');
    expect(childPanel).not.toContain('httpsCallable("generateCustomToken")');
  });
});
