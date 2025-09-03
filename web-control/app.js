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

// Initialize Firebase
let app, db, functions;
let currentMasterImei = null;
let currentSecretKey = null;
let devicesListener = null;

// Initialize Firebase when page loads
document.addEventListener('DOMContentLoaded', function() {
    try {
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        functions = firebase.functions();
        
        // Check if user was previously logged in
        const savedCredentials = localStorage.getItem('minimaster-credentials');
        if (savedCredentials) {
            const credentials = JSON.parse(savedCredentials);
            currentMasterImei = credentials.masterImei;
            currentSecretKey = credentials.secretKey;
            showMainContent();
            loadDevices();
        }
        
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Firebase initialization error:', error);
        showNotification('Firebase configuration error. Please check the configuration.', 'error');
    }
});

// Authentication functions
function login() {
    const masterImei = document.getElementById('master-imei').value.trim();
    const secretKey = document.getElementById('secret-key').value.trim();
    
    if (!masterImei || !secretKey) {
        showNotification('Please enter both Master IMEI and Secret Key', 'error');
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

function logout() {
    currentMasterImei = null;
    currentSecretKey = null;
    localStorage.removeItem('minimaster-credentials');
    
    // Stop listening to devices
    if (devicesListener) {
        devicesListener();
        devicesListener = null;
    }
    
    // Reset form
    document.getElementById('master-imei').value = '';
    document.getElementById('secret-key').value = '';
    
    // Show login form and hide main content
    document.getElementById('login-form').style.display = 'flex';
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    
    showNotification('Logged out successfully', 'info');
}

function showMainContent() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('master-id').textContent = currentMasterImei;
}

// Device management functions
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

// Task management functions
function openTaskModal(childId) {
    document.getElementById('task-child-id').value = childId;
    document.getElementById('task-description').value = '';
    document.getElementById('task-deadline').value = '';
    
    // Set default deadline to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0); // 6 PM
    document.getElementById('task-deadline').value = tomorrow.toISOString().slice(0, 16);
    
    document.getElementById('task-creation-modal').style.display = 'flex';
}

function closeTaskModal() {
    document.getElementById('task-creation-modal').style.display = 'none';
}

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

function showReviewTasks() {
    document.querySelector('.dashboard').style.display = 'none';
    document.getElementById('task-review-section').style.display = 'block';
    document.getElementById('subscription-section').style.display = 'none';
    
    loadTasksToReview();
}

function loadTasksToReview() {
    const tasksListElement = document.getElementById('tasks-to-review');
    tasksListElement.innerHTML = '<div class="loading">Loading tasks...</div>';
    
    // Query all children to find tasks pending approval
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

function renderTasksToReview(tasks) {
    const tasksListElement = document.getElementById('tasks-to-review');
    
    if (tasks.length === 0) {
        tasksListElement.innerHTML = '<div class="loading">No tasks pending review.</div>';
        return;
    }
    
    const tasksHtml = tasks.map(task => {
        return `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-info">
                        <h4>Child: ${task.childId}</h4>
                        <p><strong>Task:</strong> ${task.description}</p>
                        <p><strong>Completed:</strong> ${task.completedAt ? new Date(task.completedAt.seconds * 1000).toLocaleString() : 'Unknown'}</p>
                    </div>
                </div>
                ${task.photoUrl ? `<img src="${task.photoUrl}" alt="Task proof" class="task-photo">` : ''}
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

function approveTask(childImei, taskId) {
    const approveTask = functions.httpsCallable('approveTask');
    
    approveTask({
        masterImei: currentMasterImei,
        secretKey: currentSecretKey,
        childImei: childImei,
        taskId: taskId
    }).then(result => {
        showNotification('Task approved successfully!', 'success');
        loadTasksToReview(); // Refresh the list
    }).catch(error => {
        console.error('Error approving task:', error);
        showNotification('Error approving task: ' + error.message, 'error');
    });
}

function showSubscription() {
    document.querySelector('.dashboard').style.display = 'none';
    document.getElementById('task-review-section').style.display = 'none';
    document.getElementById('subscription-section').style.display = 'block';
}

function showDashboard() {
    document.querySelector('.dashboard').style.display = 'block';
    document.getElementById('task-review-section').style.display = 'none';
    document.getElementById('subscription-section').style.display = 'none';
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Handle modal clicks (close when clicking outside)
window.onclick = function(event) {
    const modal = document.getElementById('task-creation-modal');
    if (event.target === modal) {
        closeTaskModal();
    }
}