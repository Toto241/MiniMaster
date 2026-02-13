// Audit Logs Viewer JavaScript
// Handles loading, filtering, and displaying audit logs from Firestore

let currentPage = 1;
const pageSize = 50;
let lastDoc = null;
let firstDoc = null;
let isInitialized = false;

/**
 * Initialize Firebase and load logs when authentication is ready
 */
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user has admin role
        const tokenResult = await user.getIdTokenResult();
        if (tokenResult.claims.role !== 'admin') {
            showError('Access denied. Admin privileges required.');
            return;
        }
        
        if (!isInitialized) {
            isInitialized = true;
            await loadStats();
            await loadLogs();
        }
    } else {
        window.location.href = 'index.html';
    }
});

/**
 * Load statistics summary
 */
async function loadStats() {
    try {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Get logs from last 24 hours
        const snapshot = await firebase.firestore()
            .collection('audit_logs')
            .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(last24h))
            .get();
        
        const total = snapshot.size;
        let successCount = 0;
        let failureCount = 0;
        let deniedCount = 0;
        
        snapshot.docs.forEach(doc => {
            const status = doc.data().status;
            if (status === 'success') successCount++;
            else if (status === 'failure') failureCount++;
            else if (status === 'denied') deniedCount++;
        });
        
        const statsContainer = document.getElementById('statsContainer');
        statsContainer.innerHTML = `
            <div class="stat-card">
                <h3>Total Events (24h)</h3>
                <div class="value">${total}</div>
            </div>
            <div class="stat-card">
                <h3>Successful</h3>
                <div class="value" style="color: #4CAF50;">${successCount}</div>
            </div>
            <div class="stat-card">
                <h3>Failed</h3>
                <div class="value" style="color: #f44336;">${failureCount}</div>
            </div>
            <div class="stat-card">
                <h3>Denied</h3>
                <div class="value" style="color: #ff9800;">${deniedCount}</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Load audit logs from Firestore with filters
 */
async function loadLogs() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const actionFilter = document.getElementById('actionFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const userFilter = document.getElementById('userFilter').value.trim();
    
    showLoading(true);
    clearError();
    
    try {
        let query = firebase.firestore()
            .collection('audit_logs')
            .orderBy('timestamp', 'desc');
        
        // Apply date filters
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start));
        }
        
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
        
        // Apply action filter (requires index)
        if (actionFilter) {
            query = query.where('action', '==', actionFilter);
        }
        
        // Apply status filter (requires index)
        if (statusFilter) {
            query = query.where('status', '==', statusFilter);
        }
        
        // Apply user filter (requires index)
        if (userFilter) {
            query = query.where('userId', '==', userFilter);
        }
        
        // Apply pagination
        query = query.limit(pageSize);
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            showNoResults();
            return;
        }
        
        // Store pagination references
        firstDoc = snapshot.docs[0];
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        // Populate table
        const tbody = document.getElementById('logsBody');
        tbody.innerHTML = '';
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const row = tbody.insertRow();
            
            // Timestamp
            const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            row.insertCell(0).textContent = timestamp.toLocaleString();
            
            // User ID (truncated for display)
            const userId = data.userId || 'N/A';
            row.insertCell(1).textContent = userId.length > 20 ? userId.substring(0, 20) + '...' : userId;
            
            // Role
            row.insertCell(2).textContent = data.userRole || 'unknown';
            
            // Action
            row.insertCell(3).textContent = data.action || 'N/A';
            
            // Resource (truncated for display)
            const resource = data.resource || 'N/A';
            row.insertCell(4).textContent = resource.length > 40 ? resource.substring(0, 40) + '...' : resource;
            
            // Status with color
            const statusCell = row.insertCell(5);
            statusCell.textContent = data.status || 'N/A';
            statusCell.className = `status-${data.status}`;
            
            // Details button
            const detailsCell = row.insertCell(6);
            const detailsBtn = document.createElement('button');
            detailsBtn.textContent = 'View';
            detailsBtn.className = 'details-button';
            detailsBtn.onclick = () => showDetails(data);
            detailsCell.appendChild(detailsBtn);
        });
        
        // Update pagination controls
        updatePaginationControls(snapshot.size);
        
    } catch (error) {
        console.error('Error loading logs:', error);
        showError('Failed to load logs: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Show log details in modal
 */
function showDetails(logData) {
    const modal = document.getElementById('detailsModal');
    const detailsElement = document.getElementById('logDetails');
    
    // Format the log data for display
    const formattedData = {
        timestamp: logData.timestamp?.toDate ? logData.timestamp.toDate().toISOString() : logData.timestamp,
        userId: logData.userId,
        userRole: logData.userRole,
        action: logData.action,
        resource: logData.resource,
        resourceType: logData.resourceType,
        status: logData.status,
        metadata: logData.metadata || {},
        errorMessage: logData.errorMessage || null,
        duration: logData.duration ? `${logData.duration}ms` : null,
        ipAddress: logData.ipAddress || null,
        userAgent: logData.userAgent || null
    };
    
    detailsElement.textContent = JSON.stringify(formattedData, null, 2);
    modal.style.display = 'block';
}

/**
 * Close the details modal
 */
function closeModal() {
    const modal = document.getElementById('detailsModal');
    modal.style.display = 'none';
}

/**
 * Navigate to next page (if available)
 */
async function nextPage() {
    if (!lastDoc) return;
    
    currentPage++;
    
    try {
        showLoading(true);
        
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const actionFilter = document.getElementById('actionFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const userFilter = document.getElementById('userFilter').value.trim();
        
        let query = firebase.firestore()
            .collection('audit_logs')
            .orderBy('timestamp', 'desc')
            .startAfter(lastDoc);
        
        // Re-apply filters
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start));
        }
        
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
        
        if (actionFilter) {
            query = query.where('action', '==', actionFilter);
        }
        
        if (statusFilter) {
            query = query.where('status', '==', statusFilter);
        }
        
        if (userFilter) {
            query = query.where('userId', '==', userFilter);
        }
        
        query = query.limit(pageSize);
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            currentPage--;
            showError('No more logs available');
            return;
        }
        
        // Update refs and display
        firstDoc = snapshot.docs[0];
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        displayLogs(snapshot);
        updatePaginationControls(snapshot.size);
        
    } catch (error) {
        currentPage--;
        console.error('Error loading next page:', error);
        showError('Failed to load next page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Navigate to previous page (if available)
 */
async function previousPage() {
    if (currentPage <= 1) return;
    
    currentPage--;
    
    try {
        showLoading(true);
        
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const actionFilter = document.getElementById('actionFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const userFilter = document.getElementById('userFilter').value.trim();
        
        let query = firebase.firestore()
            .collection('audit_logs')
            .orderBy('timestamp', 'desc')
            .endBefore(firstDoc);
        
        // Re-apply filters
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start));
        }
        
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
        
        if (actionFilter) {
            query = query.where('action', '==', actionFilter);
        }
        
        if (statusFilter) {
            query = query.where('status', '==', statusFilter);
        }
        
        if (userFilter) {
            query = query.where('userId', '==', userFilter);
        }
        
        query = query.limitToLast(pageSize);
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            currentPage++;
            showError('No previous logs available');
            return;
        }
        
        // Update refs and display
        firstDoc = snapshot.docs[0];
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        displayLogs(snapshot);
        updatePaginationControls(snapshot.size);
        
    } catch (error) {
        currentPage++;
        console.error('Error loading previous page:', error);
        showError('Failed to load previous page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Display logs from snapshot
 */
function displayLogs(snapshot) {
    const tbody = document.getElementById('logsBody');
    tbody.innerHTML = '';
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const row = tbody.insertRow();
        
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        row.insertCell(0).textContent = timestamp.toLocaleString();
        
        const userId = data.userId || 'N/A';
        row.insertCell(1).textContent = userId.length > 20 ? userId.substring(0, 20) + '...' : userId;
        
        row.insertCell(2).textContent = data.userRole || 'unknown';
        row.insertCell(3).textContent = data.action || 'N/A';
        
        const resource = data.resource || 'N/A';
        row.insertCell(4).textContent = resource.length > 40 ? resource.substring(0, 40) + '...' : resource;
        
        const statusCell = row.insertCell(5);
        statusCell.textContent = data.status || 'N/A';
        statusCell.className = `status-${data.status}`;
        
        const detailsCell = row.insertCell(6);
        const detailsBtn = document.createElement('button');
        detailsBtn.textContent = 'View';
        detailsBtn.className = 'details-button';
        detailsBtn.onclick = () => showDetails(data);
        detailsCell.appendChild(detailsBtn);
    });
}

/**
 * Update pagination controls
 */
function updatePaginationControls(resultCount) {
    document.getElementById('pageInfo').textContent = `Page ${currentPage}`;
    document.getElementById('prevButton').disabled = currentPage <= 1;
    document.getElementById('nextButton').disabled = resultCount < pageSize;
}

/**
 * Show loading indicator
 */
function showLoading(show) {
    const loadingContainer = document.getElementById('loadingContainer');
    const logsTable = document.getElementById('logsTable');
    
    if (show) {
        loadingContainer.style.display = 'block';
        logsTable.style.opacity = '0.5';
    } else {
        loadingContainer.style.display = 'none';
        logsTable.style.opacity = '1';
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 5000);
}

/**
 * Clear error messages
 */
function clearError() {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.innerHTML = '';
}

/**
 * Show no results message
 */
function showNoResults() {
    const tbody = document.getElementById('logsBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #666;">No logs found matching the current filters.</td></tr>';
    updatePaginationControls(0);
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('detailsModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}
