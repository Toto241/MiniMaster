import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("deploy workflow legacy auth default", () => {
  it("deploy.yml defaults DISABLE_LEGACY_SECRETKEY_AUTH to false", async () => {
    const workflow = await readUtf8(".github/workflows/deploy.yml");
    expect(workflow).toContain("echo \"DISABLE_LEGACY_SECRETKEY_AUTH=${DISABLE_LEGACY_SECRETKEY_AUTH:-false}\"");
    expect(workflow).not.toContain("echo \"DISABLE_LEGACY_SECRETKEY_AUTH=${DISABLE_LEGACY_SECRETKEY_AUTH:-true}\"");
  });

  it(".env.example documents the same safe default", async () => {
    const envExample = await readUtf8(".env.example");
    expect(envExample).toContain("DISABLE_LEGACY_SECRETKEY_AUTH=false");
  });
});
