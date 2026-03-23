/* eslint-env browser */
/* global firebase, Chart */
// Mini-Master Web Control Panel JavaScript

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} text - The raw text to escape.
 * @returns {string} The HTML-safe string.
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
}

const FIREBASE_CONFIG_STORAGE_KEY = "operatorFirebaseConfigOverride";

// ==================== SESSION TIMEOUT ====================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 Minuten Inaktivität
let sessionTimeoutTimer = null;
let sessionWarningTimer = null;

function resetSessionTimeout() {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
    if (!currentMasterImei) return;

    sessionWarningTimer = setTimeout(() => {
        showNotification("Ihre Sitzung läuft in 5 Minuten ab. Bewegen Sie die Maus, um eingeloggt zu bleiben.", "error");
    }, SESSION_TIMEOUT_MS - 5 * 60 * 1000);

    sessionTimeoutTimer = setTimeout(() => {
        if (currentMasterImei) {
            showNotification("Sitzung abgelaufen – automatisch abgemeldet.", "error");
            logout();
        }
    }, SESSION_TIMEOUT_MS);
}

function startSessionMonitoring() {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(evt => document.addEventListener(evt, resetSessionTimeout, { passive: true }));
    resetSessionTimeout();
}

function stopSessionMonitoring() {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
    sessionTimeoutTimer = null;
    sessionWarningTimer = null;
}

// Firebase configuration — configure via Operator-Dashboard (localStorage) or replace placeholders
const fallbackFirebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
};

function hasCompleteFirebaseConfig(config) {
    if (!config || typeof config !== 'object') return false;
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    return requiredKeys.every(key => typeof config[key] === 'string' && config[key].trim().length > 0);
}

function isPlaceholderFirebaseConfig(config) {
    if (!hasCompleteFirebaseConfig(config)) return true;
    return Object.values(config).some(value =>
        typeof value === 'string' && (value.includes('your-') || value.includes('your_project'))
    );
}

function loadFirebaseConfig() {
    try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (hasCompleteFirebaseConfig(parsed) && !isPlaceholderFirebaseConfig(parsed)) {
            return parsed;
        }
    } catch (error) {
        console.warn('Failed to load Firebase config override:', error);
    }
    return fallbackFirebaseConfig;
}

const firebaseConfig = loadFirebaseConfig();

// --- Global Variables ---
let app, db, functions;
let currentMasterImei = null;
let devicesListener = null; // Firestore listener for real-time updates
let usageChartInstance = null;
let cachedDevices = [];

function getDashboardChromeElements() {
    return [
        document.getElementById('dashboard-action-bar'),
        document.getElementById('devices-list')
    ].filter(Boolean);
}

function setDashboardChromeVisible(visible) {
    getDashboardChromeElements().forEach(element => {
        element.style.display = visible ? '' : 'none';
    });
}

function hideSecondarySections() {
    ['task-review-section', 'subscription-section', 'support-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

/**
 * Initializes the Firebase app, services, and attempts to restore the user's
 * session from localStorage when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', function() {
    try {
        if (isPlaceholderFirebaseConfig(firebaseConfig)) {
            throw new Error('Firebase-Webkonfiguration fehlt. Bitte zuerst die Bootstrap-Konfiguration im Operator-Dashboard speichern.');
        }

        // Ensure firebase is available
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase script not loaded. Please check your internet connection and script tags.');
        }

        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        functions = firebase.functions();

        firebase.auth().onAuthStateChanged(user => {
            if (!user) {
                return;
            }

            currentMasterImei = user.uid;
            localStorage.setItem('minimaster-credentials', JSON.stringify({
                masterImei: currentMasterImei
            }));
            showMainContent();
            loadDevices();
        });

        console.log('Firebase initialized successfully.');
    } catch (error) {
        console.error('Firebase initialization error:', error);
        showNotification('Firebase configuration error. Please check your setup.', 'error');
    }
});

// --- Authentication Functions ---

/**
 * Handles the login process. It takes credentials from the input fields,
 * calls the 'generateCustomToken' Cloud Function to get a Firebase Auth token,
 * signs in with that token, and if successful, saves the session and loads the dashboard.
 */
function login() {
    const masterImei = document.getElementById('master-imei').value.trim();
    const secretKey = document.getElementById('secret-key').value.trim();

    if (!masterImei || !secretKey) {
        showNotification('Please enter both Master IMEI and Secret Key.', 'error');
        return;
    }

    const generateCustomToken = firebase.functions().httpsCallable('generateCustomToken');

    showNotification('Authenticating...', 'info');

    generateCustomToken({ masterImei: masterImei, secretKey: secretKey })
        .then(result => {
            const customToken = result.data.customToken;
            return firebase.auth().signInWithCustomToken(customToken);
        })
        .then(() => {
            currentMasterImei = firebase.auth().currentUser ? firebase.auth().currentUser.uid : masterImei;

            // Save canonical master id for next session
            localStorage.setItem('minimaster-credentials', JSON.stringify({
                masterImei: currentMasterImei
            }));

            showMainContent();
            loadDevices();
            startSessionMonitoring();
            showNotification('Login successful!', 'success');
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
    stopSessionMonitoring();
    currentMasterImei = null;
    localStorage.removeItem('minimaster-credentials');
    firebase.auth().signOut().catch(error => console.warn('Sign-out warning:', error));

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
            devicesListElement.innerHTML = '<div class="loading">Error loading devices: ' + escapeHtml(error.message) + '</div>';
        });
}

/**
 * Renders the list of device cards into the UI.
 * @param {Array<object>} devices - An array of device objects from Firestore.
 */
function renderDevices(devices) {
    cachedDevices = Array.isArray(devices) ? devices : [];
    const devicesListElement = document.getElementById('devices-list');

    if (devices.length === 0) {
        devicesListElement.innerHTML = '<div class="loading">No paired devices found. Use the mobile app to pair devices.</div>';
        return;
    }

    const devicesHtml = devices.map(device => {
        const lastSeenSeconds = device.lastSeen ? (device.lastSeen.seconds || 0) : 0;
        const isOnline = lastSeenSeconds > 0 ?
            (Date.now() / 1000 - lastSeenSeconds) < (20 * 60) : false; // 20 minutes
        const safeId = escapeHtml(device.id);

        return `
            <div class="device-card">
                <div class="device-header">
                    <div class="device-info">
                        <h3>Device: ${safeId}</h3>
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
                                       onchange="toggleDeviceLock('${safeId}', this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="btn btn-primary" onclick="openTaskModal('${safeId}')">
                        Create Task
                    </button>
                    <button class="btn btn-secondary" onclick='openRulesModal(${escapeHtml(JSON.stringify(device))})'>
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
        childId: childImei,
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

async function showTaskAssignment() {
    if (!currentMasterImei) {
        showNotification('Please log in first.', 'error');
        return;
    }

    let devices = cachedDevices;
    if (!devices.length) {
        try {
            const snapshot = await db.collection('children')
                .where('masterImei', '==', currentMasterImei)
                .get();
            devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            cachedDevices = devices;
        } catch (error) {
            console.error('Error loading devices for task assignment:', error);
            showNotification('Unable to load devices for task assignment: ' + error.message, 'error');
            return;
        }
    }

    if (!devices.length) {
        showNotification('No paired devices found. Pair a child device first.', 'info');
        return;
    }

    const childSelect = document.getElementById('task-child-select');
    const selectorGroup = document.getElementById('task-child-selector-group');
    if (!childSelect || !selectorGroup) {
        showNotification('Task assignment UI is not available.', 'error');
        return;
    }

    childSelect.innerHTML = devices
        .map(device => `<option value="${escapeHtml(device.id)}">${escapeHtml(device.id)}</option>`)
        .join('');
    selectorGroup.style.display = devices.length > 1 ? 'block' : 'none';
    openTaskModal(devices[0].id, { useSelector: devices.length > 1 });
}

function openTaskModal(childId, options = {}) {
    const useSelector = options.useSelector === true;
    document.getElementById('task-child-id').value = childId;
    document.getElementById('task-description').value = '';
    document.getElementById('task-deadline').value = '';

    const selectorGroup = document.getElementById('task-child-selector-group');
    const childSelect = document.getElementById('task-child-select');
    if (selectorGroup && childSelect) {
        selectorGroup.style.display = useSelector ? 'block' : 'none';
        childSelect.value = childId;
    }

    document.getElementById('task-creation-modal').style.display = 'flex';
}

/**
 * Closes the task creation modal.
 */
function closeTaskModal() {
    document.getElementById('task-creation-modal').style.display = 'none';
    const descriptionField = document.getElementById('task-description');
    const deadlineField = document.getElementById('task-deadline');
    const selectorGroup = document.getElementById('task-child-selector-group');
    if (descriptionField) descriptionField.value = '';
    if (deadlineField) deadlineField.value = '';
    if (selectorGroup) selectorGroup.style.display = 'none';
}

/**
 * Calls the 'createTask' Firebase Cloud Function to assign a new task.
 * @param {Event} event - The form submission event.
 */
function createTask(event) {
    event.preventDefault();
    const selectorGroup = document.getElementById('task-child-selector-group');
    const selectedChildId = document.getElementById('task-child-select')?.value;
    const childId = selectorGroup && selectorGroup.style.display !== 'none' && selectedChildId
        ? selectedChildId
        : document.getElementById('task-child-id').value;
    const description = document.getElementById('task-description').value.trim();
    const deadlineValue = document.getElementById('task-deadline').value;

    if (!childId || !description || !deadlineValue) {
        showNotification('Please fill all fields correctly.', 'error');
        return;
    }

    const createTask = functions.httpsCallable('createTask');
    const deadlineISO = new Date(deadlineValue).toISOString();

    createTask({
        childId: childId,
        description: description,
        deadlineISO: deadlineISO
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
                ["borderWidth"]: 1
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
        childId: childImei,
        usageRules: usageRules
    }));

    // Update App Blacklist
    const updateAppBlacklist = functions.httpsCallable('updateAppBlacklist');
    promises.push(updateAppBlacklist({
        childId: childImei,
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
    setDashboardChromeVisible(false);
    hideSecondarySections();
    document.getElementById('task-review-section').style.display = 'block';
    loadTasksToReview();
}

/**
 * Fetches all tasks with a 'pending_approval' status across all child devices
 * associated with the current master account.
 */
function loadTasksToReview() {
    const tasksListElement = document.getElementById('tasks-to-review');
    tasksListElement.innerHTML = '<div class="loading">Loading tasks...</div>';

    // Query tasks assigned by this master that are pending approval
    firebase.firestore().collectionGroup('tasks')
        .where('masterImei', '==', currentMasterImei)
        .where('status', '==', 'pending_approval')
        .get()
        .then(snapshot => {
            const tasks = [];
            snapshot.forEach(doc => {
                // Extract childId from the document path: children/{childId}/tasks/{taskId}
                const pathParts = doc.ref.path.split('/');
                const childId = pathParts.length >= 2 ? pathParts[1] : '';
                tasks.push({
                    taskId: doc.id,
                    childId: childId,
                    ...doc.data()
                });
            });
            renderTasksToReview(tasks);
        })
        .catch(error => {
            console.error('Error loading tasks:', error);
            tasksListElement.innerHTML = '<div class="loading">Error loading tasks: ' + escapeHtml(error.message) + '</div>';
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
        const createdTime = task.createdAt ? new Date(task.createdAt.seconds * 1000).toLocaleString() : 'N/A';
        // Derive childId from the Firestore document path (parent collection's parent doc ID)
        const childId = task.childId || '';
        const safeChildId = escapeHtml(childId);
        const safeDesc = escapeHtml(task.description || '');
        const safeTaskId = escapeHtml(task.taskId || '');
        const safePhotoUrl = task.photoUrl ? encodeURI(task.photoUrl) : '';
        return `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-info">
                        <h4>Child ID: ${safeChildId}</h4>
                        <p><strong>Description:</strong> ${safeDesc}</p>
                        <p><strong>Created:</strong> ${createdTime}</p>
                    </div>
                </div>
                ${safePhotoUrl ? `<a href="${safePhotoUrl}" target="_blank" rel="noopener noreferrer"><img src="${safePhotoUrl}" alt="Task proof" class="task-photo"></a>` : '<p>No photo proof submitted.</p>'}
                <div class="task-actions">
                    <button class="btn btn-success" onclick="approveTaskReview('${safeTaskId}', '${safeChildId}')">
                        Approve (Unlock)
                    </button>
                </div>
            </div>
        `;
    }).join('');

    tasksListElement.innerHTML = tasksHtml;
}

/**
 * Calls the 'approveTask' Firebase Cloud Function to approve a completed task.
 * @param {string} taskId - The ID of the task to approve.
 * @param {string} childImei - The ID of the child device.
 */
function approveTaskReview(taskId, childImei) {
    const approveTask = functions.httpsCallable('approveTask');

    approveTask({
        childId: childImei,
        taskId: taskId
    }).then(result => {
        showNotification('Task approved successfully!', 'success');
        loadTasksToReview(); // Refresh the list after review.
    }).catch(error => {
        console.error('Error approving task:', error);
        showNotification('Error approving task: ' + error.message, 'error');
    });
}

/**
 * Switches the view to the subscription management section.
 */
async function showSubscription() {
    setDashboardChromeVisible(false);
    hideSecondarySections();
    document.getElementById('subscription-section').style.display = 'block';
    await loadSubscriptionStatus();
}

/**
 * Switches the view back to the main device dashboard.
 */
function showDashboard() {
    setDashboardChromeVisible(true);
    hideSecondarySections();
}


async function loadSubscriptionStatus() {
    const statusCard = document.getElementById('subscription-status-card');
    if (!statusCard) return;

    statusCard.innerHTML = '<div class="loading">Loading subscription status...</div>';

    try {
        const getSubscriptionStatus = functions.httpsCallable('getSubscriptionStatus');
        const result = await getSubscriptionStatus({});
        const data = result.data || {};
        const subscription = data.subscriptionStatus || {};
        const status = escapeHtml(subscription.status || 'none');
        const expiresAt = subscription.expiresAt?.seconds
            ? new Date(subscription.expiresAt.seconds * 1000).toLocaleString()
            : 'N/A';
        const trialDays = Number.isFinite(data.trialDaysRemaining) ? data.trialDaysRemaining : null;
        const accessText = data.hasAccess ? 'Active access' : 'No active access';

        statusCard.innerHTML = `
            <h4>Current Subscription</h4>
            <p><strong>Status:</strong> ${status}</p>
            <p><strong>Access:</strong> ${accessText}</p>
            <p><strong>Child device limit:</strong> ${escapeHtml(String(data.childLimit || 0))}</p>
            <p><strong>Parent app limit:</strong> ${escapeHtml(String(data.parentAppLimit || 0))}</p>
            <p><strong>Expires:</strong> ${expiresAt}</p>
            ${trialDays !== null ? `<p><strong>Trial days remaining:</strong> ${escapeHtml(String(trialDays))}</p>` : ''}
            <p class="help-text">Purchases are currently completed via the parent Android app. Use this panel to inspect the live entitlement state.</p>
        `;
    } catch (error) {
        console.error('Error loading subscription status:', error);
        statusCard.innerHTML = `<p>Unable to load subscription status: ${escapeHtml(error.message)}</p>`;
    }
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
    setDashboardChromeVisible(false);
    hideSecondarySections();
    document.getElementById('support-section').style.display = 'block';
    loadSupportTickets();
}

async function createSupportTicket(event) {
    event.preventDefault();

    const problemDescription = document.getElementById('problem-description').value;
    const consentValue = document.querySelector('input[name="support-access-consent"]:checked')?.value;
    const allowSupportAccess = consentValue === 'yes';
    const consentSource = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

    if (!problemDescription.trim()) {
        showNotification('Please describe your problem.', 'error');
        return;
    }
    if (!consentValue) {
        showNotification('Please answer the support access question (Yes/No).', 'error');
        return;
    }

    try {
        const createTicket = functions.httpsCallable('createSupportTicket');
        const result = await createTicket({ problemDescription, allowSupportAccess, consentSource });

        if (result.data.success) {
            showNotification('Support ticket created successfully!', 'success');
            document.getElementById('problem-description').value = '';
            const checkedConsent = document.querySelector('input[name="support-access-consent"]:checked');
            if (checkedConsent) checkedConsent.checked = false;
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
            const safeDocId = escapeHtml(doc.id);
            const safeProblem = escapeHtml(ticket.problemDescription);
            const safeStatus = escapeHtml(ticket.status);
            const safeGrantId = escapeHtml(ticket.accessGrantId || '');

            html += `
                <div class="ticket-card">
                    <div class="ticket-header">
                        <span class="ticket-id">Ticket #${escapeHtml(doc.id.substring(0, 8))}</span>
                        <span class="ticket-status ${statusClass}">${safeStatus}</span>
                    </div>
                    <div class="ticket-body">
                        <p><strong>Created:</strong> ${createdAt}</p>
                        <p><strong>Problem:</strong> ${safeProblem}</p>

                        ${ticket.aiGeneratedSolution ?
                            `<div class="ai-solution">
                                <h4>🤖 AI-Generated Solution (Confidence: ${(ticket.aiConfidenceScore * 100).toFixed(0)}%)</h4>
                                <p>${escapeHtml(ticket.aiGeneratedSolution).replace(/\n/g, '<br>')}</p>
                                ${ticket.status === 'awaiting_user_feedback' ?
                                    `<div class="feedback-buttons">
                                        <button onclick="provideFeedback('${safeDocId}', 'accepted')" class="btn btn-success">✓ This solved my problem</button>
                                        <button onclick="showRejectFeedbackForm('${safeDocId}')" class="btn btn-warning">✗ I still need help</button>
                                    </div>` :
                                    ''
                                }
                                <div id="reject-feedback-form-${safeDocId}" class="reject-feedback-form" style="display:none;">
                                    <label for="reject-comment-${safeDocId}"><strong>Please tell us what is still not working:</strong></label>
                                    <textarea id="reject-comment-${safeDocId}" rows="3" placeholder="Required comment..."></textarea>
                                    <button onclick="submitRejectedFeedback('${safeDocId}')" class="btn btn-warning">Submit No + Comment</button>
                                </div>
                            </div>` :
                            ''
                        }

                        ${ticket.accessGranted ?
                            `<p class="access-granted">✓ Support access granted (expires in 48h)</p>
                             <button onclick="revokeAccess('${safeGrantId}')" class="btn btn-danger">Revoke Access</button>` :
                            (ticket.status === 'escalated' || ticket.status === 'in_progress') ?
                            `<button onclick="grantAccess('${safeDocId}')" class="btn btn-primary">Grant Support Access</button>` :
                            ''
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


async function provideFeedback(ticketId, feedback) {
    await submitFeedback(ticketId, feedback);
}

function showRejectFeedbackForm(ticketId) {
    const form = document.getElementById(`reject-feedback-form-${ticketId}`);
    if (form) {
        form.style.display = 'block';
    }
}

async function submitRejectedFeedback(ticketId) {
    const commentField = document.getElementById(`reject-comment-${ticketId}`);
    const comment = commentField ? commentField.value.trim() : '';
    if (!comment) {
        showNotification('A comment is required when selecting No.', 'error');
        return;
    }
    await submitFeedback(ticketId, 'rejected', comment);
}

async function submitFeedback(ticketId, feedback, comment = '') {
    try {
        const provideSolutionFeedback = functions.httpsCallable('provideSolutionFeedback');
        const payload = { ticketId, feedback };
        if (feedback === 'rejected') {
            payload.comment = comment;
        }
        const result = await provideSolutionFeedback(payload);

        if (result.data.success) {
            const message = feedback === 'accepted'
                ? 'Great! The ticket has been closed.'
                : 'Your ticket has been escalated to a human support agent.';
            showNotification(message, 'success');
            loadSupportTickets();
        }
    } catch (error) {
        console.error('Error providing feedback:', error);
        showNotification('Failed to provide feedback: ' + error.message, 'error');
    }
}
