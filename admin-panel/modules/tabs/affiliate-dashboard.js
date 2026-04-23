/**
 * Affiliate Dashboard Tab for MiniMaster Admin Panel.
 * Manages affiliate partners, tracks conversions, and processes payouts.
 *
 * Legal notes:
 * - Affiliate data is subject to DSGVO (affiliates are data subjects)
 * - Payout data must be retained for 10 years (German tax law § 147 AO)
 * - Commission structures must be clearly documented (UWG compliance)
 */
export function createAffiliateDashboard(container) {
  container.innerHTML = `
    <div class="affiliate-dashboard">
      <div class="dashboard-header">
        <h2>Affiliate Program</h2>
        <div class="header-actions">
          <button id="aff-refresh" class="btn-secondary">↻ Refresh</button>
          <button id="aff-payout" class="btn-primary">Process Payouts</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid" id="aff-kpis">
        <div class="kpi-card loading">Loading...</div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <select id="aff-status-filter">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <input type="search" id="aff-search" placeholder="Search affiliates..." />
      </div>

      <!-- Affiliates Table -->
      <div class="table-container">
        <table class="data-table" id="aff-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th>Referrals</th>
              <th>Total Earnings</th>
              <th>Pending</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="aff-tbody">
            <tr><td colspan="7" class="loading-cell">Loading affiliates...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadAffiliateData();
  container.querySelector("#aff-refresh").addEventListener("click", loadAffiliateData);
  container.querySelector("#aff-payout").addEventListener("click", processPayouts);
  container.querySelector("#aff-status-filter").addEventListener("change", filterAffiliates);
  container.querySelector("#aff-search").addEventListener("input", debounce(filterAffiliates, 300));
}

let allAffiliates = [];

async function loadAffiliateData() {
  try {
    const result = await callFunction("listAffiliates", { limit: 100 });
    allAffiliates = result.data?.affiliates || [];
    renderAffiliateKPIs();
    renderAffiliates(allAffiliates);
  } catch (err) {
    console.error("Failed to load affiliate data:", err);
    document.getElementById("aff-tbody").innerHTML =
      `<tr><td colspan="7" class="error-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderAffiliateKPIs() {
  const total = allAffiliates.length;
  const active = allAffiliates.filter((a) => a.status === "active").length;
  const pending = allAffiliates.filter((a) => a.status === "pending").length;
  const totalReferrals = allAffiliates.reduce((sum, a) => sum + (a.totalReferrals || 0), 0);
  const totalEarnings = allAffiliates.reduce((sum, a) => sum + (a.totalEarningsCents || 0), 0);

  document.getElementById("aff-kpis").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-value">${total}</div>
      <div class="kpi-label">Total Affiliates</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-value">${active}</div>
      <div class="kpi-label">Active</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-value">${pending}</div>
      <div class="kpi-label">Pending Review</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${totalReferrals}</div>
      <div class="kpi-label">Total Referrals</div>
    </div>
    <div class="kpi-card info">
      <div class="kpi-value">${(totalEarnings / 100).toFixed(2)} €</div>
      <div class="kpi-label">Total Commission</div>
    </div>
  `;
}

function renderAffiliates(affiliates) {
  const tbody = document.getElementById("aff-tbody");
  if (affiliates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No affiliates found</td></tr>`;
    return;
  }

  tbody.innerHTML = affiliates.map((aff) => `
    <tr data-status="${aff.status}">
      <td><code>${escapeHtml(aff.code)}</code></td>
      <td>${escapeHtml(aff.name)}<br><small>${escapeHtml(aff.email)}</small></td>
      <td><span class="badge badge-${aff.status}">${aff.status}</span></td>
      <td>${aff.totalReferrals || 0}</td>
      <td>${((aff.totalEarningsCents || 0) / 100).toFixed(2)} €</td>
      <td>${((aff.pendingEarningsCents || 0) / 100).toFixed(2)} €</td>
      <td class="actions">
        ${aff.status === "pending" ? `
          <button class="btn-icon" title="Approve" onclick="reviewAffiliate('${aff.id}', 'approve')">✓</button>
          <button class="btn-icon" title="Reject" onclick="reviewAffiliate('${aff.id}', 'reject')">✕</button>
        ` : ""}
        ${aff.status === "active" ? `<button class="btn-icon" title="Suspend" onclick="reviewAffiliate('${aff.id}', 'suspend')">⏸</button>` : ""}
      </td>
    </tr>
  `).join("");
}

function filterAffiliates() {
  const statusFilter = document.getElementById("aff-status-filter").value;
  const search = document.getElementById("aff-search").value.toLowerCase();

  let filtered = allAffiliates;
  if (statusFilter) filtered = filtered.filter((a) => a.status === statusFilter);
  if (search) filtered = filtered.filter((a) =>
    a.name.toLowerCase().includes(search) ||
    a.email.toLowerCase().includes(search) ||
    a.code.toLowerCase().includes(search)
  );

  renderAffiliates(filtered);
}

async function processPayouts() {
  if (!confirm("Process monthly payouts for all eligible affiliates?\n\nAffiliates with pending earnings ≥ 50,00 € will be marked for payout.")) {
    return;
  }

  try {
    const result = await callFunction("processAffiliatePayouts", {});
    alert(result.data?.message || "Payouts processed");
    loadAffiliateData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function callFunction(name, data) {
  if (typeof window.callFunction === "function") {
    return window.callFunction(name, data);
  }
  throw new Error("Function caller not available");
}
