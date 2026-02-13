// Audit Logs Viewer for MiniMaster Admin Panel

let currentPage = 1;
let lastVisible = null;
let filters = {};
let allLogs = [];
const PAGE_SIZE = 50;

/**
 * Loads audit logs from Firestore with applied filters
 */
async function loadLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    
    try {
        let query = firebase.firestore()
            .collection('audit_logs')
            .orderBy('timestamp', 'desc')
            .limit(PAGE_SIZE);
        
        // Apply filters
        if (filters.userId) {
            query = query.where('userId', '==', filters.userId);
        }
        if (filters.action) {
            query = query.where('action', '==', filters.action);
        }
        if (filters.result) {
            query = query.where('result', '==', filters.result);
        }
        
        // Pagination
        if (lastVisible) {
            query = query.startAfter(lastVisible);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7">No logs found</td></tr>';
            document.getElementById('next-btn').disabled = true;
            return;
        }
        
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Update stats
        updateStats(allLogs);
        
        // Render table
        tbody.innerHTML = '';
        allLogs.forEach(log => {
            const row = tbody.insertRow();
            
            row.insertCell(0).textContent = formatTimestamp(log.timestamp);
            row.insertCell(1).textContent = truncate(log.userId, 20);
            row.insertCell(2).textContent = log.userRole;
            row.insertCell(3).textContent = log.action;
            row.insertCell(4).textContent = `${log.resource}/${truncate(log.resourceId, 15)}`;
            
            const resultCell = row.insertCell(5);
            resultCell.textContent = log.result;
            resultCell.className = log.result === 'success' ? 'badge-success' : 'badge-failure';
            
            const detailsBtn = document.createElement('button');
            detailsBtn.textContent = 'View';
            detailsBtn.className = 'btn btn-small';
            detailsBtn.onclick = () => showDetails(log);
            row.insertCell(6).appendChild(detailsBtn);
        });
        
        // Update pagination
        document.getElementById('page-info').textContent = `Page ${currentPage}`;
        document.getElementById('prev-btn').disabled = currentPage === 1;
        document.getElementById('next-btn').disabled = snapshot.docs.length < PAGE_SIZE;
        
    } catch (error) {
        console.error('Error loading logs:', error);
        tbody.innerHTML = '<tr><td colspan="7">Error loading logs: ' + error.message + '</td></tr>';
    }
}

/**
 * Updates statistics based on loaded logs
 */
function updateStats(logs) {
    const total = logs.length;
    const successes = logs.filter(log => log.result === 'success').length;
    const failures = logs.filter(log => log.result === 'failure').length;
    const successRate = total > 0 ? ((successes / total) * 100).toFixed(1) : 0;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-success-rate').textContent = `${successRate}%`;
    document.getElementById('stat-failures').textContent = failures;
}

/**
 * Applies filters and reloads logs
 */
function applyFilters() {
    filters = {
        userId: document.getElementById('user-filter').value.trim(),
        action: document.getElementById('action-filter').value,
        result: document.getElementById('result-filter').value,
        dateFrom: document.getElementById('date-from').value,
        dateTo: document.getElementById('date-to').value,
    };
    
    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });
    
    lastVisible = null;
    currentPage = 1;
    loadLogs();
}

/**
 * Clears all filters
 */
function clearFilters() {
    document.getElementById('user-filter').value = '';
    document.getElementById('action-filter').value = '';
    document.getElementById('result-filter').value = '';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    
    filters = {};
    lastVisible = null;
    currentPage = 1;
    loadLogs();
}

/**
 * Loads next page of logs
 */
function loadNextPage() {
    currentPage++;
    loadLogs();
}

/**
 * Loads previous page of logs
 */
function loadPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        lastVisible = null;
        loadLogs();
    }
}

/**
 * Exports logs to CSV
 */
function exportLogs() {
    if (allLogs.length === 0) {
        alert('No logs to export');
        return;
    }
    
    const headers = ['Timestamp', 'User ID', 'Role', 'Action', 'Resource', 'Resource ID', 'Result', 'Error Message', 'Metadata'];
    const rows = allLogs.map(log => [
        formatTimestamp(log.timestamp),
        log.userId,
        log.userRole,
        log.action,
        log.resource,
        log.resourceId,
        log.result,
        log.errorMessage || '',
        JSON.stringify(log.metadata || {}),
    ]);
    
    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
}

/**
 * Shows detailed information about a log entry
 */
function showDetails(log) {
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('details-content');
    
    // Format log data for display
    const displayData = {
        id: log.id,
        timestamp: formatTimestamp(log.timestamp),
        userId: log.userId,
        userRole: log.userRole,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        result: log.result,
        errorMessage: log.errorMessage || 'N/A',
        metadata: log.metadata || {},
        ipAddress: log.ipAddress || 'N/A',
        userAgent: log.userAgent || 'N/A',
    };
    
    content.textContent = JSON.stringify(displayData, null, 2);
    modal.style.display = 'block';
}

/**
 * Closes the details modal
 */
function closeModal() {
    document.getElementById('details-modal').style.display = 'none';
}

/**
 * Formats a Firestore timestamp for display
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
        if (timestamp.toDate) {
            return timestamp.toDate().toLocaleString();
        } else if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000).toLocaleString();
        }
        return String(timestamp);
    } catch (error) {
        return 'Invalid Date';
    }
}

/**
 * Truncates a string to a maximum length
 */
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

/**
 * Logout function
 */
function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = 'index.html';
    }).catch(error => {
        console.error('Logout error:', error);
        alert('Error logging out: ' + error.message);
    });
}

// Initialize when auth state changes
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const tokenResult = await user.getIdTokenResult();
        if (tokenResult.claims.role !== 'admin') {
            alert('Admin privileges required');
            window.location.href = 'index.html';
            return;
        }
        
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('logout-btn').style.display = 'inline-block';
        
        // Load logs
        loadLogs();
    } else {
        window.location.href = 'index.html';
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('details-modal');
    if (event.target === modal) {
        closeModal();
    }
};
