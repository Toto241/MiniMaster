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
    document.getElementById('task-description').value = '';
    
    // Set a default deadline for tomorrow at 6 PM.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    document.getElementById('task-deadline').value = tomorrow.toISOString().slice(0, 16);
    
    document.getElementById('task-creation-modal').style.display = 'flex';
}

/**
 * Closes the task creation modal.
 */
function closeTaskModal() {
    document.getElementById('task-creation-modal').style.display = 'none';
}

/**
 * Handles the submission of the new task form. It calls the 'createTask'
 * Firebase Cloud Function with the provided details.
 * @param {Event} event - The form submission event.
 */
function createTask(event) {
    event.preventDefault();
    
    const childImei = document.getElementById('task-child-id').value;
    const description = document.getElementById('task-description').value.trim();
    const deadline = document.getElementById('task-deadline').value;
    
    if (!description || !deadline) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const createTask = functions.httpsCallable('createTask');
    
    createTask({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        description: description,
        deadlineISO: new Date(deadline).toISOString()
    }).then(result => {
        showNotification('Task created successfully!', 'success');
        closeTaskModal();
    }).catch(error => {
        console.error('Error creating task:', error);
        showNotification('Error creating task: ' + error.message, 'error');
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
    
    // This requires querying each child's subcollection of tasks.
    db.collection('children')
        .where('masterImei', '==', currentMasterImei)
        .get()
        .then(snapshot => {
            const promises = [];
            
            snapshot.forEach(childDoc => {
                const promise = childDoc.ref.collection('tasks')
                    .where('status', '==', 'pending_approval')
                    .get()
                    .then(tasksSnapshot => {
                        const tasks = [];
                        tasksSnapshot.forEach(taskDoc => {
                            tasks.push({
                                childId: childDoc.id,
                                taskId: taskDoc.id,
                                ...taskDoc.data()
                            });
                        });
                        return tasks;
                    });
                
                promises.push(promise);
            });
            
            return Promise.all(promises);
        })
        .then(results => {
            const allTasks = results.flat();
            renderTasksToReview(allTasks);
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
        const completedTime = task.completedAt ? new Date(task.completedAt.seconds * 1000).toLocaleString() : 'N/A';
        return `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-info">
                        <h4>Child: ${task.childId}</h4>
                        <p><strong>Task:</strong> ${task.description}</p>
                        <p><strong>Completed:</strong> ${completedTime}</p>
                    </div>
                </div>
                ${task.photoUrl ? `<a href="${task.photoUrl}" target="_blank" rel="noopener noreferrer"><img src="${task.photoUrl}" alt="Task proof" class="task-photo"></a>` : ''}
                <div class="device-actions">
                    <button class="btn btn-success" onclick="approveTask('${task.childId}', '${task.taskId}')">
                        Approve Task
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    tasksListElement.innerHTML = tasksHtml;
}

/**
 * Calls the 'approveTask' Firebase Cloud Function to mark a task as approved.
 * @param {string} childImei - The unique identifier of the child device.
 * @param {string} taskId - The ID of the task to approve.
 */
function approveTask(childImei, taskId) {
    const approveTask = functions.httpsCallable('approveTask');
    
    approveTask({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        taskId: taskId
    }).then(result => {
        showNotification('Task approved successfully!', 'success');
        loadTasksToReview(); // Refresh the list after approval.
    }).catch(error => {
        console.error('Error approving task:', error);
        showNotification('Error approving task: ' + error.message, 'error');
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