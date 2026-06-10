/**
 * Revenue Analytics Tab for MiniMaster Admin Panel.
 * Fully automated — aggregates live data from Firestore.
 */
import { monthlyRevenueEur } from "../shared/pricing-lookup.js";

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
          <span id="revenue-last-updated" class="muted">Loading...</span>
          <button id="revenue-refresh" class="btn-secondary">↻ Refresh</button>
        </div>
      </div>

      <div class="kpi-grid kpi-large" id="revenue-kpis">
        <div class="kpi-card loading">Loading...</div>
      </div>

      <div class="charts-row">
        <div class="chart-container">
          <h4>Revenue by Platform</h4>
          <div class="chart-placeholder" id="source-chart">Loading...</div>
        </div>
        <div class="chart-container">
          <h4>MRR Trend</h4>
          <div class="chart-placeholder" id="mrr-chart">Loading...</div>
        </div>
      </div>

      <div class="table-section">
        <h4>Active Subscriptions by Platform</h4>
        <table class="data-table" id="platform-table">
          <thead><tr><th>Platform</th><th>Active</th><th>Revenue/Month</th><th>% of MRR</th></tr></thead>
          <tbody id="platform-tbody"><tr><td colspan="4" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>

      <div class="table-section">
        <h4>Active Subscriptions by Tier</h4>
        <table class="data-table" id="tier-table">
          <thead><tr><th>Tier</th><th>Platform</th><th>Active</th><th>Revenue/Month</th><th>% of MRR</th></tr></thead>
          <tbody id="tier-tbody"><tr><td colspan="5" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>

      <div class="table-section">
        <h4>B2B Revenue</h4>
        <table class="data-table" id="b2b-revenue-table">
          <thead><tr><th>Organization</th><th>Tier</th><th>Monthly Fee</th><th>Status</th><th>Started</th></tr></thead>
          <tbody id="b2b-revenue-tbody"><tr><td colspan="5" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>

      <div class="table-section">
        <h4>Affiliate Performance</h4>
        <table class="data-table" id="aff-revenue-table">
          <thead><tr><th>Code</th><th>Referrals</th><th>Commission Paid</th><th>Commission Pending</th></tr></thead>
          <tbody id="aff-revenue-tbody"><tr><td colspan="4" class="loading">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;

  loadRevenueData();
  container.querySelector("#revenue-refresh").addEventListener("click", loadRevenueData);
  container.querySelector("#revenue-period").addEventListener("change", loadRevenueData);
  container.querySelector("#revenue-platform").addEventListener("change", loadRevenueData);
}

function monthlyEquivalent(sku) {
  return monthlyRevenueEur(sku);
}

async function loadRevenueData() {
  const platformFilter = document.getElementById("revenue-platform")?.value || "all";
  const periodDays = parseInt(document.getElementById("revenue-period")?.value || "30", 10);
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  try {
    const db = window.db;
    if (!db) throw new Error("Firestore not available");

    // --- Aggregate from masters collection ---
    const mastersSnap = await db.collection("masters").get();
    let totalMrr = 0;
    let totalArr = 0;
    let activeSubs = 0;
    const platformStats = { android: { active: 0, revenue: 0 }, ios: { active: 0, revenue: 0 }, web: { active: 0, revenue: 0 }, unknown: { active: 0, revenue: 0 } };
    const tierStats = {};

    mastersSnap.forEach(doc => {
      const data = doc.data();
      const sub = data.subscription;
      if (!sub) return;

      const platform = sub.platform || "unknown";
      const isActive = sub.status === "active" || (sub.status === "trial" && sub.trialEndsAt?.toMillis() > Date.now());
      if (!isActive) return;

      activeSubs++;
      const sku = sub.type || "unknown";
      const monthly = monthlyEquivalent(sku);
      totalMrr += monthly;
      totalArr += monthly * 12;

      // Platform stats
      const p = platformStats[platform] || platformStats.unknown;
      p.active++;
      p.revenue += monthly;

      // Tier stats
      const key = `${sku}__${platform}`;
      if (!tierStats[key]) tierStats[key] = { tier: sku, platform, active: 0, revenue: 0 };
      tierStats[key].active++;
      tierStats[key].revenue += monthly;
    });

    // --- B2B ---
    const b2bSnap = await db.collection("b2b_organizations").where("status", "==", "active").get();
    let b2bMrr = 0;
    const b2bRows = [];
    b2bSnap.forEach(doc => {
      const d = doc.data();
      const fee = d.monthlyFee || 0;
      b2bMrr += fee;
      totalMrr += fee;
      totalArr += fee * 12;
      b2bRows.push({ name: d.name || doc.id, tier: d.licenseTier || "—", fee: fee.toLocaleString("de-DE") + " €", status: "active", started: d.createdAt ? new Date(d.createdAt.toDate()).toISOString().split("T")[0] : "N/A" });
    });

    // --- Affiliates ---
    const affSnap = await db.collection("affiliates").get();
    let affiliateCost = 0;
    const affRows = [];
    affSnap.forEach(doc => {
      const d = doc.data();
      const paid = d.totalPaidCents || 0;
      const pending = d.pendingEarningsCents || 0;
      affiliateCost += paid / 100;
      affRows.push({ code: d.code || doc.id, referrals: d.totalReferrals || 0, paid: (paid / 100).toLocaleString("de-DE") + " €", pending: (pending / 100).toLocaleString("de-DE") + " €" });
    });

    // Apply platform filter
    const filterMrr = platformFilter === "all" ? totalMrr : (platformStats[platformFilter]?.revenue || 0);
    const filterArr = filterMrr * 12;
    const filterActive = platformFilter === "all" ? activeSubs : (platformStats[platformFilter]?.active || 0);
    const filterB2b = platformFilter === "all" ? b2bMrr : 0;
    const filterAff = platformFilter === "all" ? affiliateCost : 0;
    const filterNet = filterMrr + filterB2b - filterAff;

    renderRevenueKPIs({ mrr: Math.round(filterMrr), arr: Math.round(filterArr), activeSubscriptions: filterActive, b2bMrr: Math.round(filterB2b), affiliateCost: Math.round(filterAff), netMrr: Math.round(filterNet) });

    // Platform breakdown
    const platformRows = [
      { platform: "Google Play", active: platformStats.android.active, revenue: Math.round(platformStats.android.revenue), pct: totalMrr > 0 ? Math.round((platformStats.android.revenue / totalMrr) * 100) : 0 },
      { platform: "Apple App Store", active: platformStats.ios.active, revenue: Math.round(platformStats.ios.revenue), pct: totalMrr > 0 ? Math.round((platformStats.ios.revenue / totalMrr) * 100) : 0 },
    ];
    renderPlatformBreakdown(platformRows);

    // Tier breakdown
    let tierRows = Object.values(tierStats).map(t => ({
      tier: t.tier,
      platform: t.platform === "android" ? "Google Play" : t.platform === "ios" ? "Apple App Store" : "Web",
      active: t.active,
      revenue: Math.round(t.revenue),
      pct: totalMrr > 0 ? Math.round((t.revenue / totalMrr) * 100) : 0,
    }));
    if (platformFilter !== "all") {
      tierRows = tierRows.filter(t => t.platform.toLowerCase().includes(platformFilter === "ios" ? "apple" : "google"));
    }
    renderTierBreakdown(tierRows);

    renderB2BRevenue(b2bRows);
    renderAffiliateRevenue(affRows);

    // Charts
    const androidPct = platformFilter === "ios" ? 0 : (totalMrr > 0 ? Math.round((platformStats.android.revenue / totalMrr) * 100) : 0);
    const iosPct = platformFilter === "android" ? 0 : (totalMrr > 0 ? Math.round((platformStats.ios.revenue / totalMrr) * 100) : 0);
    const b2bPct = platformFilter === "all" && totalMrr > 0 ? Math.round((b2bMrr / totalMrr) * 100) : 0;
    const affPct = platformFilter === "all" && totalMrr > 0 ? Math.round((affiliateCost / totalMrr) * 100) : 0;

    document.getElementById("source-chart").innerHTML = `
      <div class="source-breakdown">
        ${platformFilter !== "ios" ? `<div class="source-bar"><span>Google Play</span><div class="bar" style="width:${androidPct}%"></div><span>${androidPct}%</span></div>` : ""}
        ${platformFilter !== "android" ? `<div class="source-bar"><span>Apple App Store</span><div class="bar" style="width:${iosPct}%"></div><span>${iosPct}%</span></div>` : ""}
        ${platformFilter === "all" ? `<div class="source-bar"><span>B2B Licenses</span><div class="bar" style="width:${b2bPct}%"></div><span>${b2bPct}%</span></div>` : ""}
        ${platformFilter === "all" ? `<div class="source-bar"><span>Affiliate (net)</span><div class="bar" style="width:${affPct}%"></div><span>${affPct}%</span></div>` : ""}
      </div>
    `;

    document.getElementById("mrr-chart").innerHTML = `
      <div class="mrr-trend">
        <div class="trend-line">MRR Trend (aggregated live)</div>
        <div class="trend-values">
          <span>Current MRR: ${Math.round(totalMrr).toLocaleString("de-DE")} €</span>
          <span>Active Subs: ${activeSubs}</span>
          <span>B2B: ${b2bMrr.toLocaleString("de-DE")} €</span>
        </div>
      </div>
    `;

    document.getElementById("revenue-last-updated").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (err) {
    console.error("Failed to load revenue data:", err);
    document.getElementById("revenue-kpis").innerHTML = `<div class="kpi-card error">Error loading data: ${escapeHtml(err.message)}</div>`;
  }
}

function renderRevenueKPIs(data) {
  document.getElementById("revenue-kpis").innerHTML = `
    <div class="kpi-card primary"><div class="kpi-value">${data.mrr.toLocaleString("de-DE")} €</div><div class="kpi-label">MRR</div></div>
    <div class="kpi-card primary"><div class="kpi-value">${data.arr.toLocaleString("de-DE")} €</div><div class="kpi-label">ARR</div></div>
    <div class="kpi-card"><div class="kpi-value">${data.activeSubscriptions}</div><div class="kpi-label">Active Subscriptions</div></div>
    <div class="kpi-card b2b"><div class="kpi-value">${data.b2bMrr.toLocaleString("de-DE")} €</div><div class="kpi-label">B2B MRR</div></div>
    <div class="kpi-card"><div class="kpi-value">${data.netMrr.toLocaleString("de-DE")} €</div><div class="kpi-label">Net MRR (after affiliate)</div></div>
  `;
}

function renderPlatformBreakdown(platforms) {
  const tbody = document.getElementById("platform-tbody");
  if (!platforms.length) { tbody.innerHTML = `<tr><td colspan="4" class="info">No data</td></tr>`; return; }
  tbody.innerHTML = platforms.map((p) => `
    <tr><td>${escapeHtml(p.platform)}</td><td>${p.active}</td><td>${p.revenue.toLocaleString("de-DE")} €</td><td>${p.pct}%</td></tr>
  `).join("");
}

function renderTierBreakdown(tiers) {
  const tbody = document.getElementById("tier-tbody");
  if (!tiers.length) { tbody.innerHTML = `<tr><td colspan="5" class="info">No data</td></tr>`; return; }
  tbody.innerHTML = tiers.map((t) => `
    <tr><td>${escapeHtml(t.tier)}</td><td>${escapeHtml(t.platform)}</td><td>${t.active}</td><td>${t.revenue.toLocaleString("de-DE")} €</td><td>${t.pct}%</td></tr>
  `).join("");
}

function renderB2BRevenue(orgs) {
  const tbody = document.getElementById("b2b-revenue-tbody");
  if (!orgs.length) { tbody.innerHTML = `<tr><td colspan="5" class="info">No B2B organizations</td></tr>`; return; }
  tbody.innerHTML = orgs.map((o) => `
    <tr><td>${escapeHtml(o.name)}</td><td>${o.tier}</td><td>${o.fee}</td><td><span class="badge badge-active">${o.status}</span></td><td>${o.started}</td></tr>
  `).join("");
}

function renderAffiliateRevenue(affiliates) {
  const tbody = document.getElementById("aff-revenue-tbody");
  if (!affiliates.length) { tbody.innerHTML = `<tr><td colspan="4" class="info">No affiliates</td></tr>`; return; }
  tbody.innerHTML = affiliates.map((a) => `
    <tr><td><code>${escapeHtml(a.code)}</code></td><td>${a.referrals}</td><td>${a.paid}</td><td>${a.pending}</td></tr>
  `).join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
