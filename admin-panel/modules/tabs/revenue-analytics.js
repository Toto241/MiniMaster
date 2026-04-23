/**
 * Revenue Analytics Tab for MiniMaster Admin Panel.
 * Displays MRR, ARR, revenue breakdown by source/platform, and growth trends.
 *
 * Note: Revenue data is aggregated from Firestore subscription documents.
 * No individual user data is exposed - only anonymized, aggregated metrics.
 */
export function createRevenueAnalytics(container) {
  container.innerHTML = `
    <div class="revenue-analytics">
      <div class="dashboard-header">
        <h2>Revenue Analytics</h2>
        <div class="header-actions">
          <select id="revenue-period">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <select id="revenue-platform">
            <option value="all">All Platforms</option>
            <option value="android">Google Play</option>
            <option value="ios">Apple App Store</option>
          </select>
          <button id="revenue-refresh" class="btn-secondary">↻ Refresh</button>
        </div>
      </div>

      <!-- Primary KPIs -->
      <div class="kpi-grid kpi-large" id="revenue-kpis">
        <div class="kpi-card loading">Loading...</div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <div class="chart-container">
          <h4>Revenue by Platform</h4>
          <div class="chart-placeholder" id="source-chart">Loading chart...</div>
        </div>
        <div class="chart-container">
          <h4>MRR Trend</h4>
          <div class="chart-placeholder" id="mrr-chart">Loading chart...</div>
        </div>
      </div>

      <!-- Platform Breakdown -->
      <div class="table-section">
        <h4>Active Subscriptions by Platform</h4>
        <table class="data-table" id="platform-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Active</th>
              <th>Revenue/Month</th>
              <th>% of MRR</th>
            </tr>
          </thead>
          <tbody id="platform-tbody"></tbody>
        </table>
      </div>

      <!-- Subscription Breakdown -->
      <div class="table-section">
        <h4>Active Subscriptions by Tier</h4>
        <table class="data-table" id="tier-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Platform</th>
              <th>Active</th>
              <th>Revenue/Month</th>
              <th>% of MRR</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody id="tier-tbody"></tbody>
        </table>
      </div>

      <!-- B2B Revenue -->
      <div class="table-section">
        <h4>B2B Revenue</h4>
        <table class="data-table" id="b2b-revenue-table">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Tier</th>
              <th>Monthly Fee</th>
              <th>Status</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody id="b2b-revenue-tbody"></tbody>
        </table>
      </div>

      <!-- Affiliate Revenue -->
      <div class="table-section">
        <h4>Affiliate Performance</h4>
        <table class="data-table" id="aff-revenue-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Referrals</th>
              <th>Commission Paid</th>
              <th>Commission Pending</th>
            </tr>
          </thead>
          <tbody id="aff-revenue-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  loadRevenueData();
  container.querySelector("#revenue-refresh").addEventListener("click", loadRevenueData);
  container.querySelector("#revenue-period").addEventListener("change", loadRevenueData);
  container.querySelector("#revenue-platform").addEventListener("change", loadRevenueData);
}

async function loadRevenueData() {
  try {
    const platformFilter = document.getElementById("revenue-platform")?.value || "all";

    // In production, these would be actual Cloud Function calls
    // For now, showing the structure with sample calculations
    // Platform-filtered sample data
    const allKpis = { mrr: 8750, arr: 105000, activeSubscriptions: 520, b2bMrr: 2990, affiliateCost: 1250, netMrr: 10490 };
    const androidKpis = { mrr: 6125, arr: 73500, activeSubscriptions: 364, b2bMrr: 2990, affiliateCost: 875, netMrr: 8240 };
    const iosKpis = { mrr: 2625, arr: 31500, activeSubscriptions: 156, b2bMrr: 0, affiliateCost: 375, netMrr: 2250 };

    const kpis = platformFilter === "android" ? androidKpis : platformFilter === "ios" ? iosKpis : allKpis;
    renderRevenueKPIs(kpis);

    const platformBreakdown = [
      { platform: "Google Play", active: 364, revenue: 6125, pct: 70.0 },
      { platform: "Apple App Store", active: 156, revenue: 2625, pct: 30.0 },
    ];
    renderPlatformBreakdown(platformBreakdown);

    const tierBreakdown = [
      { tier: "Single Child Monthly", platform: "Google Play", active: 126, revenue: 628, pct: 10.3 },
      { tier: "Single Child Monthly", platform: "Apple App Store", active: 54, revenue: 270, pct: 4.4 },
      { tier: "Family Monthly", platform: "Google Play", active: 84, revenue: 839, pct: 13.7 },
      { tier: "Family Monthly", platform: "Apple App Store", active: 36, revenue: 360, pct: 5.9 },
      { tier: "Single Child Yearly", platform: "Google Play", active: 56, revenue: 187, pct: 3.1 },
      { tier: "Single Child Yearly", platform: "Apple App Store", active: 24, revenue: 80, pct: 1.3 },
      { tier: "Family Yearly", platform: "Google Play", active: 70, revenue: 466, pct: 7.6 },
      { tier: "Family Yearly", platform: "Apple App Store", active: 30, revenue: 200, pct: 3.3 },
      { tier: "Family Premium Yearly", platform: "Google Play", active: 28, revenue: 233, pct: 3.8 },
      { tier: "Family Premium Yearly", platform: "Apple App Store", active: 12, revenue: 100, pct: 1.6 },
    ];
    const filteredTiers = platformFilter === "all"
      ? tierBreakdown
      : tierBreakdown.filter(t => t.platform.toLowerCase().includes(platformFilter === "ios" ? "apple" : "google"));
    renderTierBreakdown(filteredTiers);

    renderB2BRevenue([
      { name: "Gymnasium München-Ost", tier: "School Basic", fee: "199,00 €", status: "active", started: "2026-01-15" },
      { name: "Kita Sonnenschein", tier: "Kita Basic", fee: "99,00 €", status: "active", started: "2026-02-01" },
      { name: "Jugendzentrum Nord", tier: "School Professional", fee: "499,00 €", status: "active", started: "2026-03-10" },
    ]);

    renderAffiliateRevenue([
      { code: "MM1001", referrals: 12, paid: "125,40 €", pending: "43,80 €" },
      { code: "MM1002", referrals: 8, paid: "76,00 €", pending: "28,50 €" },
      { code: "MM1003", referrals: 15, paid: "187,50 €", pending: "62,25 €" },
    ]);

    // Placeholder for charts (would use Chart.js in production)
    const sourceChart = document.getElementById("source-chart");
    const androidPct = platformFilter === "ios" ? 0 : 65;
    const iosPct = platformFilter === "android" ? 0 : 30;
    const b2bPct = platformFilter === "all" ? 25 : 0;
    const affPct = platformFilter === "all" ? 10 : 0;
    sourceChart.innerHTML = `
      <div class="source-breakdown">
        ${platformFilter !== "ios" ? `<div class="source-bar"><span>Google Play</span><div class="bar" style="width:${androidPct}%"></div><span>${androidPct}%</span></div>` : ""}
        ${platformFilter !== "android" ? `<div class="source-bar"><span>Apple App Store</span><div class="bar" style="width:${iosPct}%"></div><span>${iosPct}%</span></div>` : ""}
        ${platformFilter === "all" ? `<div class="source-bar"><span>B2B Licenses</span><div class="bar" style="width:${b2bPct}%"></div><span>${b2bPct}%</span></div>` : ""}
        ${platformFilter === "all" ? `<div class="source-bar"><span>Affiliate (net)</span><div class="bar" style="width:${affPct}%"></div><span>${affPct}%</span></div>` : ""}
      </div>
    `;

    document.getElementById("mrr-chart").innerHTML = `
      <div class="mrr-trend">
        <div class="trend-line">MRR Trend (sample data)</div>
        <div class="trend-values">
          <span>Jan: 4,200 €</span> → <span>Feb: 5,100 €</span> → <span>Mar: 6,300 €</span> → 
          <span>Apr: 7,800 €</span> → <span>May: 8,200 €</span> → <span>Jun: 8,750 €</span>
        </div>
      </div>
    `;

  } catch (err) {
    console.error("Failed to load revenue data:", err);
  }
}

function renderRevenueKPIs(data) {
  document.getElementById("revenue-kpis").innerHTML = `
    <div class="kpi-card primary">
      <div class="kpi-value">${data.mrr.toLocaleString("de-DE")} €</div>
      <div class="kpi-label">MRR (Monthly Recurring Revenue)</div>
    </div>
    <div class="kpi-card primary">
      <div class="kpi-value">${data.arr.toLocaleString("de-DE")} €</div>
      <div class="kpi-label">ARR (Annual Run Rate)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${data.activeSubscriptions}</div>
      <div class="kpi-label">Active Subscriptions</div>
    </div>
    <div class="kpi-card b2b">
      <div class="kpi-value">${data.b2bMrr.toLocaleString("de-DE")} €</div>
      <div class="kpi-label">B2B MRR</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${data.netMrr.toLocaleString("de-DE")} €</div>
      <div class="kpi-label">Net MRR (after affiliate costs)</div>
    </div>
  `;
}

function renderPlatformBreakdown(platforms) {
  const tbody = document.getElementById("platform-tbody");
  tbody.innerHTML = platforms.map((p) => `
    <tr>
      <td>${escapeHtml(p.platform)}</td>
      <td>${p.active}</td>
      <td>${p.revenue.toLocaleString("de-DE")} €</td>
      <td>${p.pct}%</td>
    </tr>
  `).join("");
}

function renderTierBreakdown(tiers) {
  const tbody = document.getElementById("tier-tbody");
  tbody.innerHTML = tiers.map((t) => `
    <tr>
      <td>${escapeHtml(t.tier)}</td>
      <td>${escapeHtml(t.platform)}</td>
      <td>${t.active}</td>
      <td>${t.revenue.toLocaleString("de-DE")} €</td>
      <td>${t.pct}%</td>
      <td><span class="trend-up">↑ Growing</span></td>
    </tr>
  `).join("");
}

function renderB2BRevenue(orgs) {
  const tbody = document.getElementById("b2b-revenue-tbody");
  tbody.innerHTML = orgs.map((o) => `
    <tr>
      <td>${escapeHtml(o.name)}</td>
      <td>${o.tier}</td>
      <td>${o.fee}</td>
      <td><span class="badge badge-active">${o.status}</span></td>
      <td>${o.started}</td>
    </tr>
  `).join("");
}

function renderAffiliateRevenue(affiliates) {
  const tbody = document.getElementById("aff-revenue-tbody");
  tbody.innerHTML = affiliates.map((a) => `
    <tr>
      <td><code>${escapeHtml(a.code)}</code></td>
      <td>${a.referrals}</td>
      <td>${a.paid}</td>
      <td>${a.pending}</td>
    </tr>
  `).join("");
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
