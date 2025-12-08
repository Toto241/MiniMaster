// Mini-Master Web Control Panel JavaScript

// Firebase configuration (you'll need to replace this with your actual config)
const firebaseConfig = {
    // This should be replaced with actual Firebase config
    // You can get this from your Firebase console
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};

// --- Global Variables ---
let app, db, functions;
let currentMasterImei = null;
let currentSecretKey = null;
let devicesListener = null; // Firestore listener for real-time updates
let usageChartInstance = null;

/**
 * Initializes the Firebase app, services, and attempts to restore the user's
 * session from localStorage when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Ensure firebase is available
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase script not loaded. Please check your internet connection and script tags.');
        }

        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        functions = firebase.functions();
        
        // Restore session if credentials are saved in localStorage
        const savedCredentials = localStorage.getItem('minimaster-credentials');
        if (savedCredentials) {
            const credentials = JSON.parse(savedCredentials);
            currentMasterImei = credentials.masterImei;
            currentSecretKey = credentials.secretKey;
            showMainContent();
            loadDevices();
        }
        
        console.log('Firebase initialized successfully.');
    } catch (error) {
        console.error('Firebase initialization error:', error);
        showNotification('Firebase configuration error. Please check your setup.', 'error');
    }
});

// --- Authentication Functions ---

/**
 * Handles the login process. It takes credentials from the input fields,
 * validates them against the Firestore 'masters' collection, and if successful,
 * saves the session and loads the main dashboard.
 */
function login() {
    const masterImei = document.getElementById('master-imei').value.trim();
    const secretKey = document.getElementById('secret-key').value.trim();
    
    if (!masterImei || !secretKey) {
        showNotification('Please enter both Master IMEI and Secret Key.', 'error');
        return;
    }
    
    // Validate credentials by trying to access master device data
    db.collection('masters').doc(masterImei).get()
        .then(doc => {
            if (doc.exists && doc.data().secretKey === secretKey) {
                currentMasterImei = masterImei;
                currentSecretKey = secretKey;
                
                // Save credentials for next session
                localStorage.setItem('minimaster-credentials', JSON.stringify({
                    masterImei: masterImei,
                    secretKey: secretKey
                }));
                
                showMainContent();
                loadDevices();
                showNotification('Login successful!', 'success');
            } else {
                showNotification('Invalid credentials', 'error');
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            showNotification('Login failed: ' + error.message, 'error');
        });
}

/**
 * Logs the user out by clearing credentials, detaching Firestore listeners,
 * and resetting the UI to the login screen.
 */
function logout() {
    currentMasterImei = null;
    currentSecretKey = null;
    localStorage.removeItem('minimaster-credentials');
    
    // Detach the real-time listener to prevent memory leaks and unnecessary reads.
    if (devicesListener) {
        devicesListener();
        devicesListener = null;
    }
    
    // Reset the login form fields.
    document.getElementById('master-imei').value = '';
    document.getElementById('secret-key').value = '';
    
    // Switch the view from the dashboard back to the login form.
    document.getElementById('login-form').style.display = 'flex';
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    
    showNotification('Logged out successfully.', 'info');
}

/**
 * Switches the UI from the login view to the main dashboard view.
 * It hides the login form and displays the user's information and device controls.
 */
function showMainContent() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('master-id').textContent = currentMasterImei;
}

// --- Device Management Functions ---

/**
 * Fetches and displays the list of child devices associated with the logged-in master.
 * It sets up a real-time Firestore listener to keep the device list updated.
 */
function loadDevices() {
    if (!currentMasterImei) return;
    
    const devicesListElement = document.getElementById('devices-list');
    devicesListElement.innerHTML = '<div class="loading">Loading devices...</div>';
    
    // Listen to real-time updates of children collection
    devicesListener = db.collection('children')
        .where('masterImei', '==', currentMasterImei)
        .onSnapshot(snapshot => {
            const devices = [];
            snapshot.forEach(doc => {
                devices.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            renderDevices(devices);
        }, error => {
            console.error('Error loading devices:', error);
            devicesListElement.innerHTML = '<div class="loading">Error loading devices: ' + error.message + '</div>';
        });
}

/**
 * Renders the list of device cards into the UI.
 * @param {Array<object>} devices - An array of device objects from Firestore.
 */
function renderDevices(devices) {
    const devicesListElement = document.getElementById('devices-list');
    
    if (devices.length === 0) {
        devicesListElement.innerHTML = '<div class="loading">No paired devices found. Use the mobile app to pair devices.</div>';
        return;
    }
    
    const devicesHtml = devices.map(device => {
        const isOnline = device.lastSeen ? 
            (Date.now() / 1000 - device.lastSeen) < (20 * 60) : false; // 20 minutes
        
        return `
            <div class="device-card">
                <div class="device-header">
                    <div class="device-info">
                        <h3>Device: ${device.id}</h3>
                        <div class="device-status">
                            <span class="status-indicator ${isOnline ? 'status-online' : 'status-offline'}"></span>
                            <span>${isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                    <div class="device-controls">
                        <div class="lock-control">
                            <span>Locked</span>
                            <label class="switch">
                                <input type="checkbox" ${device.isLocked ? 'checked' : ''} 
                                       onchange="toggleDeviceLock('${device.id}', this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="btn btn-primary" onclick="openTaskModal('${device.id}')">
                        Create Task
                    </button>
                    <button class="btn btn-secondary" onclick='openRulesModal(${JSON.stringify(device)})'>
                        Configure Rules
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    devicesListElement.innerHTML = devicesHtml;
}

/**
 * Calls the 'setDeviceLocked' Firebase Cloud Function to lock or unlock a child device.
 * @param {string} childImei - The unique identifier of the child device.
 * @param {boolean} isLocked - The desired new lock state.
 */
function toggleDeviceLock(childImei, isLocked) {
    const setDeviceLocked = functions.httpsCallable('setDeviceLocked');
    
    setDeviceLocked({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        isLocked: isLocked
    }).then(result => {
        showNotification(`Device ${isLocked ? 'locked' : 'unlocked'} successfully`, 'success');
    }).catch(error => {
        console.error('Error toggling device lock:', error);
        showNotification('Error changing device lock: ' + error.message, 'error');
        
        // Revert the switch if there was an error
        loadDevices();
    });
}

// --- Task Management Functions ---

/**
 * Opens the task creation modal and pre-fills the child ID.
 * @param {string} childId - The ID of the child device for which to create the task.
 */
function openTaskModal(childId) {
    document.getElementById('task-child-id').value = childId;
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('unlock-duration').value = 30; // Default value
    
    document.getElementById('task-creation-modal').style.display = 'flex';
}

/**
 * Closes the task creation modal.
 */
function closeTaskModal() {
    document.getElementById('task-creation-modal').style.display = 'none';
    document.getElementById('task-form').reset();
}

/**
 * Calls the 'createTask' Firebase Cloud Function to assign a new task.
 * @param {Event} event - The form submission event.
 */
function assignTask(event) {
    event.preventDefault();
    const childId = document.getElementById('task-child-id').value;
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const unlockDuration = parseInt(document.getElementById('unlock-duration').value, 10);

    if (!childId || !title || !description || isNaN(unlockDuration) || unlockDuration <= 0) {
        showNotification('Please fill all fields correctly.', 'error');
        return;
    }

    const createTask = functions.httpsCallable('createTask');
    
    createTask({
        childId: childId,
        title: title,
        description: description,
        unlockDuration: unlockDuration
    }).then(result => {
        showNotification('Task assigned successfully! Task ID: ' + result.data.taskId, 'success');
        closeTaskModal();
    }).catch(error => {
        console.error('Error assigning task:', error);
        showNotification('Error assigning task: ' + error.message, 'error');
    });
}

// --- Rules Management Functions ---

/**
 * Opens the rules configuration modal and populates it with current device settings.
 * @param {object} device - The device object containing current rules.
 */
function openRulesModal(device) {
    document.getElementById('rules-child-id').value = device.id;

    // Populate blocked apps
    const blockedApps = device.appBlacklist || [];
    document.getElementById('blocked-apps').value = blockedApps.join(', ');

    // Populate daily limit
    let dailyLimit = -1;
    if (device.usageRules && device.usageRules.dailyLimitSeconds) {
        dailyLimit = Math.floor(device.usageRules.dailyLimitSeconds / 60);
    }
    document.getElementById('daily-limit').value = dailyLimit;

    document.getElementById('rules-modal').style.display = 'flex';
}

/**
 * Closes the rules configuration modal.
 */
function closeRulesModal() {
    document.getElementById('rules-modal').style.display = 'none';
}

/**
 * Handles the submission of the rules form. It calls the relevant Cloud Functions.
 * @param {Event} event - The form submission event.
 */
function saveRules(event) {
    event.preventDefault();

    const childImei = document.getElementById('rules-child-id').value;
    const dailyLimitMinutes = parseInt(document.getElementById('daily-limit').value);
    const blockedAppsStr = document.getElementById('blocked-apps').value;

    const blockedApps = blockedAppsStr.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const usageRules = {};
    if (dailyLimitMinutes >= 0) {
        usageRules.dailyLimitSeconds = dailyLimitMinutes * 60;
    }

    const promises = [];

    // Update Usage Rules
    const setUsageRules = functions.httpsCallable('setUsageRules');
    promises.push(setUsageRules({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        usageRules: usageRules
    }));

    // Update App Blacklist
    const updateAppBlacklist = functions.httpsCallable('updateAppBlacklist');
    promises.push(updateAppBlacklist({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        appBlacklist: blockedApps
    }));

    Promise.all(promises)
        .then(() => {
            showNotification('Rules updated successfully!', 'success');
            closeRulesModal();
        })
        .catch(error => {
            console.error('Error updating rules:', error);
            showNotification('Error updating rules: ' + error.message, 'error');
        });
}

// --- Rules Management Functions ---

/**
 * Opens the rules configuration modal and populates it with current device settings.
 * @param {object} device - The device object containing current rules.
 */
function openRulesModal(device) {
    document.getElementById('rules-child-id').value = device.id;

    // Populate blocked apps
    const blockedApps = device.appBlacklist || [];
    document.getElementById('blocked-apps').value = blockedApps.join(', ');

    // Populate daily limit
    let dailyLimit = -1;
    if (device.usageRules && device.usageRules.dailyLimitSeconds) {
        dailyLimit = Math.floor(device.usageRules.dailyLimitSeconds / 60);
    }
    document.getElementById('daily-limit').value = dailyLimit;

    document.getElementById('rules-modal').style.display = 'flex';

    loadUsageHistory(device.id);
}

/**
 * Closes the rules configuration modal.
 */
function closeRulesModal() {
    document.getElementById('rules-modal').style.display = 'none';
    if (usageChartInstance) {
        usageChartInstance.destroy();
        usageChartInstance = null;
    }
}

/**
 * Loads usage history from Firestore and renders a chart.
 * @param {string} childId
 */
function loadUsageHistory(childId) {
    const ctx = document.getElementById('usageChart').getContext('2d');

    // Calculate last 7 days dates
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    // Prepare chart skeleton
    if (usageChartInstance) usageChartInstance.destroy();
    usageChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: 'Screen Time (Minutes)',
                data: Array(7).fill(0),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Fetch data for each date
    dates.forEach((date, index) => {
        db.collection('children').doc(childId).collection('usageHistory').doc(date).get()
            .then(doc => {
                if (doc.exists) {
                    const millis = doc.data().totalUsageMillis || 0;
                    const minutes = Math.round(millis / 60000);
                    usageChartInstance.data.datasets[0].data[index] = minutes;
                    usageChartInstance.update();
                }
            })
            .catch(console.error);
    });
}

/**
 * Handles the submission of the rules form. It calls the relevant Cloud Functions.
 * @param {Event} event - The form submission event.
 */
function saveRules(event) {
    event.preventDefault();

    const childImei = document.getElementById('rules-child-id').value;
    const dailyLimitMinutes = parseInt(document.getElementById('daily-limit').value);
    const blockedAppsStr = document.getElementById('blocked-apps').value;

    const blockedApps = blockedAppsStr.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const usageRules = {};
    if (dailyLimitMinutes >= 0) {
        usageRules.dailyLimitSeconds = dailyLimitMinutes * 60;
    }

    const promises = [];

    // Update Usage Rules
    const setUsageRules = functions.httpsCallable('setUsageRules');
    promises.push(setUsageRules({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        usageRules: usageRules
    }));

    // Update App Blacklist
    const updateAppBlacklist = functions.httpsCallable('updateAppBlacklist');
    promises.push(updateAppBlacklist({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        appBlacklist: blockedApps
    }));

    Promise.all(promises)
        .then(() => {
            showNotification('Rules updated successfully!', 'success');
            closeRulesModal();
        })
        .catch(error => {
            console.error('Error updating rules:', error);
            showNotification('Error updating rules: ' + error.message, 'error');
        });
}

/**
 * Switches the view to the task review section and loads tasks pending approval.
 */
function showReviewTasks() {
    document.querySelector('.dashboard').style.display = 'none';
    document.getElementById('task-review-section').style.display = 'block';
    document.getElementById('subscription-section').style.display = 'none';
    
    loadTasksToReview();
}

/**
 * Fetches all tasks with a 'pending_approval' status across all child devices
 * associated with the current master account.
 */
function loadTasksToReview() {
    const tasksListElement = document.getElementById('tasks-to-review');
    tasksListElement.innerHTML = '<div class="loading">Loading tasks...</div>';
    
    // Annahme: Master-ID ist der aktuelle Firebase Auth UID
    const masterId = firebase.auth().currentUser?.uid || currentMasterImei;

    // Da wir die Cloud Functions so implementiert haben, dass sie die Auth-Context nutzen,
    // müssen wir hier die Firestore-Abfrage anpassen, um alle Tasks mit Status 'SUBMITTED'
    // zu finden, die dem aktuellen Master gehören.
    
    // ACHTUNG: collectionGroup-Abfragen benötigen einen Index in Firestore.
    firebase.firestore().collectionGroup('tasks')
        .where('masterId', '==', masterId)
        .where('status', '==', 'SUBMITTED')
        .get()
        .then(snapshot => {
            const tasks = [];
            snapshot.forEach(doc => {
                tasks.push({
                    taskId: doc.id,
                    ...doc.data()
                });
            });
            renderTasksToReview(tasks);
        })
        .catch(error => {
            console.error('Error loading tasks:', error);
            tasksListElement.innerHTML = '<div class="loading">Error loading tasks: ' + error.message + '</div>';
        });
}

/**
 * Renders the list of tasks awaiting review into the UI.
 * @param {Array<object>} tasks - An array of task objects from Firestore.
 */
function renderTasksToReview(tasks) {
    const tasksListElement = document.getElementById('tasks-to-review');
    
    if (tasks.length === 0) {
        tasksListElement.innerHTML = '<div class="loading">No tasks pending review.</div>';
        return;
    }
    
    const tasksHtml = tasks.map(task => {
        const assignedTime = task.assignedAt ? new Date(task.assignedAt.seconds * 1000).toLocaleString() : 'N/A';
        return `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-info">
                        <h4>Child ID: ${task.childId}</h4>
                        <p><strong>Task:</strong> ${task.title}</p>
                        <p><strong>Description:</strong> ${task.description}</p>
                        <p><strong>Assigned:</strong> ${assignedTime}</p>
                        <p><strong>Unlock Duration:</strong> ${task.unlockDuration} minutes</p>
                    </div>
                </div>
                ${task.proofUrl ? `<a href="${task.proofUrl}" target="_blank" rel="noopener noreferrer"><img src="${task.proofUrl}" alt="Task proof" class="task-photo"></a>` : '<p>No photo proof submitted.</p>'}
                <div class="task-actions">
                    <button class="btn btn-success" onclick="reviewTask('${task.taskId}', true)">
                        Approve (Unlock)
                    </button>
                    <button class="btn btn-danger" onclick="reviewTask('${task.taskId}', false)">
                        Reject
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    tasksListElement.innerHTML = tasksHtml;
}

/**
 * Calls the 'reviewTask' Firebase Cloud Function to approve or reject a task.
 * @param {string} taskId - The ID of the task to review.
 * @param {boolean} approved - True to approve, false to reject.
 */
function reviewTask(taskId, approved) {
    const reviewTask = functions.httpsCallable('reviewTask');
    
    reviewTask({
        taskId: taskId,
        approved: approved
    }).then(result => {
        showNotification('Task reviewed successfully! Status: ' + (approved ? 'Approved' : 'Rejected'), 'success');
        loadTasksToReview(); // Refresh the list after review.
    }).catch(error => {
        console.error('Error reviewing task:', error);
        showNotification('Error reviewing task: ' + error.message, 'error');
    });
}

/**
 * Switches the view to the subscription management section.
 */
function showSubscription() {
    document.querySelector('.dashboard').style.display = 'none';
    document.getElementById('task-review-section').style.display = 'none';
    document.getElementById('subscription-section').style.display = 'block';
}

/**
 * Switches the view back to the main device dashboard.
 */
function showDashboard() {
    document.querySelector('.dashboard').style.display = 'block';
    document.getElementById('task-review-section').style.display = 'none';
    document.getElementById('subscription-section').style.display = 'none';
    document.getElementById('support-section').style.display = 'none';
}

// --- Utility Functions ---

/**
 * Displays a notification message at the top of the screen.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'} [type='info'] - The type of notification, which affects its color.
 */
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    // The notification automatically hides after 5 seconds.
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

/**
 * Global click handler to close the task creation modal if a click occurs
 * outside of the modal's content area.
 * @param {MouseEvent} event - The mouse click event.
 */
window.onclick = function(event) {
    const modal = document.getElementById('task-creation-modal');
    if (event.target === modal) {
        closeTaskModal();
    }
}


// ==================== SUPPORT FUNCTIONS ====================

function showSupport() {
    document.querySelector('.dashboard').style.display = 'none';
    document.getElementById('task-review-section').style.display = 'none';
    document.getElementById('subscription-section').style.display = 'none';
    document.getElementById('support-section').style.display = 'block';
    loadSupportTickets();
}

async function createSupportTicket(event) {
    event.preventDefault();
    
    const problemDescription = document.getElementById('problem-description').value;
    
    if (!problemDescription.trim()) {
        showNotification('Please describe your problem.', 'error');
        return;
    }
    
    try {
        const createTicket = functions.httpsCallable('createSupportTicket');
        const result = await createTicket({ problemDescription });
        
        if (result.data.success) {
            showNotification('Support ticket created successfully!', 'success');
            document.getElementById('problem-description').value = '';
            loadSupportTickets();
        }
    } catch (error) {
        console.error('Error creating support ticket:', error);
        showNotification('Failed to create support ticket: ' + error.message, 'error');
    }
}

async function loadSupportTickets() {
    const ticketsContainer = document.getElementById('support-tickets');
    ticketsContainer.innerHTML = '<div class="loading">Loading tickets...</div>';
    
    try {
        const snapshot = await db.collection('supportTickets')
            .where('masterImei', '==', currentMasterImei)
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            ticketsContainer.innerHTML = '<p>No support tickets found.</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const ticket = doc.data();
            const createdAt = ticket.createdAt ? ticket.createdAt.toDate().toLocaleString() : 'N/A';
            const statusClass = ticket.status === 'open' ? 'status-open' : ticket.status === 'in_progress' ? 'status-progress' : 'status-closed';
            
            html += `
                <div class="ticket-card">
                    <div class="ticket-header">
                        <span class="ticket-id">Ticket #${doc.id.substring(0, 8)}</span>
                        <span class="ticket-status ${statusClass}">${ticket.status}</span>
                    </div>
                    <div class="ticket-body">
                        <p><strong>Created:</strong> ${createdAt}</p>
                        <p><strong>Problem:</strong> ${ticket.problemDescription}</p>
                        ${ticket.accessGranted ? 
                            `<p class="access-granted">✓ Support access granted (expires in 48h)</p>
                             <button onclick="revokeAccess('${ticket.accessGrantId}')" class="btn btn-danger">Revoke Access</button>` :
                            `<button onclick="grantAccess('${doc.id}')" class="btn btn-primary">Grant Support Access</button>`
                        }
                    </div>
                </div>
            `;
        });
        
        ticketsContainer.innerHTML = html;
    } catch (error) {
        console.error('Error loading support tickets:', error);
        ticketsContainer.innerHTML = '<p>Error loading tickets.</p>';
    }
}

async function grantAccess(ticketId) {
    if (!confirm('This will grant the support team temporary access to your account data for 48 hours. Continue?')) {
        return;
    }
    
    try {
        const grantAccess = functions.httpsCallable('grantSupportAccess');
        const result = await grantAccess({ ticketId });
        
        if (result.data.success) {
            showNotification('Support access granted successfully!', 'success');
            loadSupportTickets();
        }
    } catch (error) {
        console.error('Error granting access:', error);
        showNotification('Failed to grant access: ' + error.message, 'error');
    }
}

async function revokeAccess(grantId) {
    if (!confirm('This will revoke support access to your account. Continue?')) {
        return;
    }
    
    try {
        const revokeAccess = functions.httpsCallable('revokeSupportAccess');
        const result = await revokeAccess({ grantId });
        
        if (result.data.success) {
            showNotification('Support access revoked successfully!', 'success');
            loadSupportTickets();
        }
    } catch (error) {
        console.error('Error revoking access:', error);
        showNotification('Failed to revoke access: ' + error.message, 'error');
    }
}
