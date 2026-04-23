/**
 * Pricing Management Tab for MiniMaster Admin Panel.
 * Fully automated — loads live pricing from the backend.
 */
export function createPricingManagement(container) {
  container.innerHTML = `
    <div class="pricing-management">
      <div class="dashboard-header">
        <h2>Pricing Management</h2>
        <span id="pricing-last-updated" class="muted">Loading...</span>
        <button id="pricing-refresh" class="btn-secondary">↻ Refresh</button>
      </div>

      <section class="pricing-section">
        <h3>B2C Subscriptions</h3>
        <div class="pricing-cards" id="b2c-pricing"><div class="loading">Loading...</div></div>
      </section>

      <section class="pricing-section">
        <h3>B2B Licenses</h3>
        <div class="pricing-cards" id="b2b-pricing"><div class="loading">Loading...</div></div>
      </section>

      <section class="pricing-section">
        <h3>Affiliate Configuration</h3>
        <div class="config-card" id="affiliate-config"><div class="loading">Loading...</div></div>
      </section>
    </div>
  `;

  loadPricing();
  container.querySelector("#pricing-refresh").addEventListener("click", loadPricing);
}

function formatPrice(cents, currency) {
  const symbol = currency === "EUR" ? "€" : currency;
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " " + symbol;
}

function platformBadge(platform) {
  if (platform === "android") return '<span class="badge badge-android" title="Google Play">🤖 Android</span>';
  if (platform === "ios") return '<span class="badge badge-ios" title="Apple App Store">🍎 iOS</span>';
  return "";
}

async function loadPricing() {
  try {
    const data = await callFunction("getPricingConfig", {});
    document.getElementById("pricing-last-updated").textContent = "Updated " + new Date().toLocaleTimeString();

    // B2C
    const b2cTiers = data.b2c || [];
    document.getElementById("b2c-pricing").innerHTML = b2cTiers.map((tier) => `
      <div class="pricing-card ${tier.isPremium ? "premium" : ""}">
        <div class="pricing-name">${escapeHtml(tier.name)}</div>
        <div class="pricing-price">${formatPrice(tier.priceCents, tier.currency)}<span class="pricing-period">/${tier.billingPeriod}</span></div>
        <div class="pricing-limits">${tier.childLimit} children · ${tier.parentAppLimit} parent apps</div>
        <div class="pricing-platforms">${(tier.platforms || []).map(platformBadge).join(" ")}</div>
        <div class="pricing-sku"><code>${tier.sku}</code></div>
      </div>
    `).join("");

    // B2B
    const b2bTiers = data.b2b || [];
    document.getElementById("b2b-pricing").innerHTML = b2bTiers.map((tier) => `
      <div class="pricing-card b2b">
        <div class="pricing-name">${escapeHtml(tier.name)}</div>
        <div class="pricing-price">${formatPrice(tier.priceCents, tier.currency)}<span class="pricing-period">/${tier.billingPeriod}</span></div>
        <div class="pricing-limits">${tier.maxDevices === -1 ? "∞" : tier.maxDevices} devices · ${tier.maxAdmins === -1 ? "∞" : tier.maxAdmins} admins</div>
        <div class="pricing-sku"><code>${tier.sku}</code></div>
      </div>
    `).join("");

    // Affiliate
    const aff = data.affiliate || {};
    document.getElementById("affiliate-config").innerHTML = `
      <div class="config-row"><span>Commission Rate:</span><strong>${(aff.commissionRate * 100).toFixed(0)}%</strong></div>
      <div class="config-row"><span>Commission Duration:</span><strong>${aff.commissionDurationMonths} months</strong></div>
      <div class="config-row"><span>Minimum Payout:</span><strong>${formatPrice(aff.minimumPayoutCents || 0, "EUR")}</strong></div>
      <div class="config-row"><span>Cookie Duration:</span><strong>${aff.cookieDurationDays} days</strong></div>
      <div class="config-row"><span>Payout Method:</span><strong>${escapeHtml(aff.payoutMethod || "—")}</strong></div>
    `;
  } catch (err) {
    console.error("Failed to load pricing:", err);
    document.getElementById("b2c-pricing").innerHTML = `<div class="error">Error: ${escapeHtml(err.message)}</div>`;
    document.getElementById("b2b-pricing").innerHTML = `<div class="error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function callFunction(name, data) {
  if (typeof window.callFunction === "function") {
    return window.callFunction(name, data);
  }
  throw new Error("Function caller not available");
}
