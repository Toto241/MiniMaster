import fs from "fs";
import path from "path";
import { B2C_TIERS } from "../src/pricing-config";

const PRICING_LOOKUP_PATH = path.join(
  __dirname,
  "../admin-panel/modules/shared/pricing-lookup.js"
);

describe("pricing-config ↔ admin pricing-lookup sync", () => {
  const lookupSource = fs.readFileSync(PRICING_LOOKUP_PATH, "utf8");

  it("B2C SKU net cents in admin pricing-lookup match pricing-config.ts", () => {
    for (const [sku, tier] of Object.entries(B2C_TIERS)) {
      expect(lookupSource).toMatch(new RegExp(`${sku}:\\s*${tier.priceCents}`));
    }
  });

  it("documents sync source in pricing-lookup header", () => {
    expect(lookupSource).toContain("pricing-config.ts");
  });
});
