/**
 * B2B Dashboard Tab for MiniMaster Admin Panel.
 * Displays all B2B organizations with KPIs, status, and management actions.
 *
 * Legal notes:
 * - B2B customer data is shown in aggregated form only
 * - Individual device data requires additional authentication
 * - All actions are audit-logged (DSGVO Art. 5(2))
 */
export function createB2BDashboard(container) {
  container.innerHTML = `
    <div class="b2b-dashboard">
      <div class="dashboard-header">
        <h2>B2B Organizations</h2>
        <div class="header-actions">
          <button id="b2b-refresh" class="btn-secondary">
            <span class="icon">↻</span> Refresh
          </button>
          <button id="b2b-create" class="btn-primary">
            <span class="icon">+</span> New Organization
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid" id="b2b-kpis">
        <div class="kpi-card loading">Loading...</div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <select id="b2b-status-filter">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Expired</option>
        </select>
        <select id="b2b-type-filter">
          <option value="">All Types</option>
          <option value="school">School</option>
          <option value="kita">Kita</option>
          <option value="youth_center">Youth Center</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <input type="search" id="b2b-search" placeholder="Search organizations..." />
      </div>

      <!-- Organizations Table -->
      <div class="table-container">
        <table class="data-table" id="b2b-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>License Tier</th>
              <th>Status</th>
              <th>Devices</th>
              <th>Contact</th>
              <th>DPA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="b2b-tbody">
            <tr><td colspan="8" class="loading-cell">Loading organizations...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination" id="b2b-pagination"></div>
    </div>
  `;

  loadB2BData();

  container.querySelector("#b2b-refresh").addEventListener("click", loadB2BData);
  container.querySelector("#b2b-create").addEventListener("click", showCreateOrgModal);
  container.querySelector("#b2b-status-filter").addEventListener("change", filterOrganizations);
  container.querySelector("#b2b-type-filter").addEventListener("change", filterOrganizations);
  container.querySelector("#b2b-search").addEventListener("input", debounce(filterOrganizations, 300));
}

let allOrganizations = [];

async function loadB2BData() {
  try {
    const result = await callFunction("listB2BOrganizations", { limit: 100 });
    allOrganizations = result.data?.organizations || [];
    renderKPIs();
    renderOrganizations(allOrganizations);
  } catch (err) {
    console.error("Failed to load B2B data:", err);
    document.getElementById("b2b-tbody").innerHTML =
      `<tr><td colspan="8" class="error-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderKPIs() {
  const total = allOrganizations.length;
  const active = allOrganizations.filter((o) => o.status === "active").length;
  const pending = allOrganizations.filter((o) => o.status === "pending").length;
  const totalDevices = allOrganizations.reduce((sum, o) => sum + (o.currentDevices || 0), 0);
  const totalCapacity = allOrganizations.reduce((sum, o) => sum + (o.maxDevices || 0), 0);
  const utilization = totalCapacity > 0 ? Math.round((totalDevices / totalCapacity) * 100) : 0;

  document.getElementById("b2b-kpis").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-value">${total}</div>
      <div class="kpi-label">Total Organizations</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-value">${active}</div>
      <div class="kpi-label">Active</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-value">${pending}</div>
      <div class="kpi-label">Pending</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${totalDevices}/${totalCapacity}</div>
      <div class="kpi-label">Device Utilization (${utilization}%)</div>
    </div>
  `;
}

function renderOrganizations(orgs) {
  const tbody = document.getElementById("b2b-tbody");
  if (orgs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No organizations found</td></tr>`;
    return;
  }

  tbody.innerHTML = orgs.map((org) => `
    <tr data-status="${org.status}" data-type="${org.type}">
      <td class="org-name">${escapeHtml(org.name)}</td>
      <td><span class="badge badge-type">${org.type}</span></td>
      <td>${org.licenseTier}</td>
      <td><span class="badge badge-${org.status}">${org.status}</span></td>
      <td>${org.currentDevices || 0}/${org.maxDevices || 0}</td>
      <td>${escapeHtml(org.primaryContactName || "")}<br><small>${escapeHtml(org.primaryContactEmail || "")}</small></td>
      <td>${org.dpaSigned ? "✅ Signed" : "⏳ Pending"}</td>
      <td class="actions">
        <button class="btn-icon" title="View Details" onclick="viewOrg('${org.id}')">👁</button>
        ${org.status === "pending" ? `<button class="btn-icon" title="Activate" onclick="activateOrg('${org.id}')">✓</button>` : ""}
        <button class="btn-icon" title="Revoke" onclick="revokeOrg('${org.id}')">✕</button>
      </td>
    </tr>
  `).join("");
}

function filterOrganizations() {
  const statusFilter = document.getElementById("b2b-status-filter").value;
  const typeFilter = document.getElementById("b2b-type-filter").value;
  const search = document.getElementById("b2b-search").value.toLowerCase();

  let filtered = allOrganizations;
  if (statusFilter) filtered = filtered.filter((o) => o.status === statusFilter);
  if (typeFilter) filtered = filtered.filter((o) => o.type === typeFilter);
  if (search) filtered = filtered.filter((o) => o.name.toLowerCase().includes(search) || (o.primaryContactEmail || "").toLowerCase().includes(search));

  renderOrganizations(filtered);
}

function showCreateOrgModal() {
  // Modal implementation for creating new organization
  alert("Create Organization modal - implement with form fields for name, type, license tier, billing email, contact info");
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
  // Assumes global firebase function caller exists in admin-panel
  if (typeof window.callFunction === "function") {
    return window.callFunction(name, data);
  }
  throw new Error("Function caller not available");
}
