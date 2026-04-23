/**
 * Pricing Management Tab for MiniMaster Admin Panel.
 * Displays and manages all product tiers, SKUs, and pricing.
 * Supports promo code creation and price adjustments.
 */
export function createPricingManagement(container) {
  container.innerHTML = `
    <div class="pricing-management">
      <div class="dashboard-header">
        <h2>Pricing Management</h2>
        <button id="pricing-refresh" class="btn-secondary">↻ Refresh</button>
      </div>

      <!-- B2C Tiers -->
      <section class="pricing-section">
        <h3>B2C Subscriptions</h3>
        <div class="pricing-cards" id="b2c-pricing"></div>
      </section>

      <!-- B2B Tiers -->
      <section class="pricing-section">
        <h3>B2B Licenses</h3>
        <div class="pricing-cards" id="b2b-pricing"></div>
      </section>

      <!-- Affiliate Config -->
      <section class="pricing-section">
        <h3>Affiliate Configuration</h3>
        <div class="config-card" id="affiliate-config"></div>
      </section>

      <!-- Promo Codes -->
      <section class="pricing-section">
        <h3>Promo Codes</h3>
        <div class="promo-form">
          <input type="text" id="promo-code" placeholder="Code (e.g. SUMMER24)" maxlength="20" />
          <input type="number" id="promo-discount" placeholder="Discount %" min="1" max="100" />
          <input type="number" id="promo-max" placeholder="Max redemptions" min="1" />
          <input type="date" id="promo-valid-until" />
          <button id="promo-create" class="btn-primary">Create Code</button>
        </div>
        <table class="data-table" id="promo-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Max</th><th>Valid Until</th><th>Status</th></tr></thead>
          <tbody id="promo-tbody"></tbody>
        </table>
      </section>
    </div>
  `;

  renderPricing();
  container.querySelector("#pricing-refresh").addEventListener("click", renderPricing);
  container.querySelector("#promo-create").addEventListener("click", createPromoCode);
}

function renderPricing() {
  // B2C tiers (hardcoded from pricing-config.ts)
  const b2cTiers = [
    { sku: "single_child_monthly", name: "Single Child (Monthly)", price: "4,99 €", period: "monthly", childLimit: 1, parentLimit: 2, platforms: ["android", "ios"] },
    { sku: "family_monthly", name: "Family (Monthly)", price: "9,99 €", period: "monthly", childLimit: 4, parentLimit: 2, platforms: ["android", "ios"] },
    { sku: "single_child_yearly", name: "Single Child (Yearly)", price: "39,99 €", period: "yearly", childLimit: 1, parentLimit: 2, platforms: ["android", "ios"] },
    { sku: "family_yearly", name: "Family (Yearly)", price: "79,99 €", period: "yearly", childLimit: 4, parentLimit: 2, platforms: ["android", "ios"] },
    { sku: "family_yearly_premium", name: "Family Premium (Yearly)", price: "99,99 €", period: "yearly", childLimit: 6, parentLimit: 3, isPremium: true, platforms: ["android", "ios"] },
  ];

  function platformBadge(platform) {
    if (platform === "android") return '<span class="badge badge-android" title="Google Play">🤖 Android</span>';
    if (platform === "ios") return '<span class="badge badge-ios" title="Apple App Store">🍎 iOS</span>';
    return '';
  }

  document.getElementById("b2c-pricing").innerHTML = b2cTiers.map((tier) => `
    <div class="pricing-card ${tier.isPremium ? "premium" : ""}">
      <div class="pricing-name">${escapeHtml(tier.name)}</div>
      <div class="pricing-price">${tier.price}<span class="pricing-period">/${tier.period}</span></div>
      <div class="pricing-limits">${tier.childLimit} children · ${tier.parentLimit} parent apps</div>
      <div class="pricing-platforms">${tier.platforms.map(platformBadge).join(" ")}</div>
      <div class="pricing-sku"><code>${tier.sku}</code></div>
    </div>
  `).join("");

  // B2B tiers
  const b2bTiers = [
    { sku: "b2b_school_50", name: "School Basic", price: "199,00 €", period: "monthly", devices: 50, admins: 5 },
    { sku: "b2b_school_200", name: "School Professional", price: "499,00 €", period: "monthly", devices: 200, admins: 15 },
    { sku: "b2b_school_unlimited", name: "School Enterprise", price: "999,00 €", period: "monthly", devices: "∞", admins: "∞" },
    { sku: "b2b_kita_basic", name: "Kita Basic", price: "99,00 €", period: "monthly", devices: 25, admins: 3 },
  ];

  document.getElementById("b2b-pricing").innerHTML = b2bTiers.map((tier) => `
    <div class="pricing-card b2b">
      <div class="pricing-name">${escapeHtml(tier.name)}</div>
      <div class="pricing-price">${tier.price}<span class="pricing-period">/${tier.period}</span></div>
      <div class="pricing-limits">${tier.devices} devices · ${tier.admins} admins</div>
      <div class="pricing-sku"><code>${tier.sku}</code></div>
    </div>
  `).join("");

  // Affiliate config
  document.getElementById("affiliate-config").innerHTML = `
    <div class="config-row"><span>Commission Rate:</span><strong>30%</strong></div>
    <div class="config-row"><span>Commission Duration:</span><strong>12 months</strong></div>
    <div class="config-row"><span>Minimum Payout:</span><strong>50,00 €</strong></div>
    <div class="config-row"><span>Cookie Duration:</span><strong>30 days</strong></div>
    <div class="config-row"><span>Payout Method:</span><strong>PayPal</strong></div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function createPromoCode() {
  const code = document.getElementById("promo-code").value.trim().toUpperCase();
  const discount = parseInt(document.getElementById("promo-discount").value, 10);
  const max = parseInt(document.getElementById("promo-max").value, 10);
  const validUntil = document.getElementById("promo-valid-until").value;

  if (!code || !discount || !max || !validUntil) {
    alert("All fields are required");
    return;
  }

  try {
    await callFunction("createPromoCode", { code, discountPercent: discount / 100, maxRedemptions: max, validUntil });
    alert("Promo code created successfully");
    document.getElementById("promo-code").value = "";
    document.getElementById("promo-discount").value = "";
    document.getElementById("promo-max").value = "";
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function callFunction(name, data) {
  if (typeof window.callFunction === "function") {
    return window.callFunction(name, data);
  }
  throw new Error("Function caller not available");
}
