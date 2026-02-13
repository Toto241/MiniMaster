/* eslint-env browser */
/* global firebase */
// MiniMaster Operator Dashboard JavaScript

// Firebase configuration - uses environment variables
// For development: copy .env.example to .env and fill in values
// Note: Environment variables are accessed differently in plain HTML/JS vs build tools
// Since this is a static HTML page, we check for both import.meta.env (Vite) and window.ENV
const firebaseConfig = {
    apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || 
            (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_API_KEY) || 
            "your-api-key",
    authDomain: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || 
                (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_AUTH_DOMAIN) || 
                "your-project.firebaseapp.com",
    projectId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) || 
               (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_PROJECT_ID) || 
               "your-project-id",
    storageBucket: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || 
                   (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_STORAGE_BUCKET) || 
                   "your-project.appspot.com",
    messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || 
                       (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_MESSAGING_SENDER_ID) || 
                       "123456789",
    appId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID) || 
           (typeof window !== 'undefined' && window.ENV?.VITE_FIREBASE_APP_ID) || 
           "your-app-id"
};

let app, auth, db, functions;

document.addEventListener("DOMContentLoaded", function() {
    try {
        // Validate Firebase configuration
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "your-api-key") {
            console.error('Firebase configuration missing. Check .env file');
            showNotification('Configuration error: Firebase not configured. Contact administrator.', 'error');
            return;
        }
        
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions();
        
        // Setup login form submission
        document.getElementById("login-form").addEventListener("submit", handleLogin);

        // Check authentication state
        auth.onAuthStateChanged(user => {
            if (user) {
                // Check for admin custom claim
                user.getIdTokenResult(true).then(idTokenResult => {
                    if (idTokenResult.claims.role === "admin") {
                        showDashboard(user);
                        loadDashboardData();
                    } else {
                        showNotification("Access Denied: Not an authorized operator.", "error");
                        auth.signOut();
                    }
                });
            } else {
                showLogin();
            }
        });
        
        console.log("Firebase initialized successfully.");
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showNotification("Firebase configuration error. Please check your setup.", "error");
    }
});

// --- Authentication ---

function validateEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();
    
    // Validate email format
    if (!validateEmail(email)) {
        showNotification("Invalid email format.", "error");
        return;
    }
    
    if (!password || password.length < 6) {
        showNotification("Password must be at least 6 characters.", "error");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            showNotification("Login failed: " + error.message, "error");
        });
}

function logout() {
    auth.signOut();
}

function showLogin() {
    document.getElementById("login-section").style.display = "block";
    document.getElementById("dashboard-section").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("user-email").textContent = "";
}

function showDashboard(user) {
    document.getElementById("login-section").style.display = "none";
    document.getElementById("dashboard-section").style.display = "block";
    document.getElementById("logout-btn").style.display = "inline-block";
    document.getElementById("user-email").textContent = user.email;
}

// --- Data Loading ---

function loadDashboardData() {
    // 1. Load Statistics
    loadStats();
    
    // 2. Load User List (simplified initial load)
    loadUsers();
    
    // 3. Load Subscriptions (simplified initial load)
    loadSubscriptions();
    
    // 4. Load Support Tickets
    loadSupportTickets();
}

function loadStats() {
    // Show loading indicators
    document.getElementById("stat-total-users").innerHTML = "<span class='loading-spinner'></span>";
    document.getElementById("stat-active-subs").innerHTML = "<span class='loading-spinner'></span>";
    document.getElementById("stat-total-tasks").innerHTML = "<span class='loading-spinner'></span>";
    
    // In a real scenario, this would call a secure Cloud Function to aggregate data
    // For now, we'll use direct Firestore queries (protected by admin rules)
    
    // 1. Total Users (Masters)
    db.collection("masters").get().then(snapshot => {
        document.getElementById("stat-total-users").textContent = snapshot.size;
    }).catch(error => {
        console.error("Error loading total users:", error);
        document.getElementById("stat-total-users").textContent = "Error";
    });
    
    // 2. Active Subscriptions
    db.collection("subscriptions").where("status", "==", "active").get().then(snapshot => {
        document.getElementById("stat-active-subs").textContent = snapshot.size;
    }).catch(error => {
        console.error("Error loading active subscriptions:", error);
        document.getElementById("stat-active-subs").textContent = "Error";
    });
    
    // 3. Total Tasks Assigned (Requires collectionGroup query and index)
    db.collectionGroup("tasks").get().then(snapshot => {
        document.getElementById("stat-total-tasks").textContent = snapshot.size;
    }).catch(error => {
        console.error("Error loading total tasks:", error);
        document.getElementById("stat-total-tasks").textContent = "Error";
    });
}

function loadUsers() {
    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class=\"loading\">Loading users...</div>";
    
    // Load first 50 masters for a quick overview
    db.collection("masters").limit(50).get().then(snapshot => {
        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Children</th><th>Last Seen</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const lastSeen = data.lastSeen ? new Date(data.lastSeen.seconds * 1000).toLocaleString() : "N/A";
            const email = data.email || "N/A";
            
            html += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${email}</td>
                    <td>${data.childCount || 0}</td>
                    <td>${lastSeen}</td>
                    <td><button onclick="viewUserDetails('${doc.id}')" class="btn btn-secondary">View</button></td>
                </tr>
            `;
        });
        html += "</table>";
        userListElement.innerHTML = html;
    }).catch(error => {
        console.error("Error loading users:", error);
        userListElement.innerHTML = "<div class=\"error\">Error loading users: " + error.message + "</div>";
    });
}

function loadSubscriptions() {
    const subListElement = document.getElementById("subscription-list");
    subListElement.innerHTML = "<div class=\"loading\">Loading subscriptions...</div>";
    
    // Load active subscriptions (assuming a 'subscriptions' collection exists)
    db.collection("subscriptions").where("status", "==", "active").limit(50).get().then(snapshot => {
        let html = "<table><tr><th>Subscription ID</th><th>Master ID</th><th>Status</th><th>Expires</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const expiryDate = data.expiryDate ? new Date(data.expiryDate.seconds * 1000).toLocaleDateString() : "N/A";
            
            html += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${data.masterId || "N/A"}</td>
                    <td>${data.status}</td>
                    <td>${expiryDate}</td>
                    <td><button onclick="revokeSubscription('${doc.id}')" class="btn btn-danger">Revoke</button></td>
                </tr>
            `;
        });
        html += "</table>";
        subListElement.innerHTML = html;
    }).catch(error => {
        console.error("Error loading subscriptions:", error);
        subListElement.innerHTML = "<div class=\"error\">Error loading subscriptions: " + error.message + "</div>";
    });
}

// --- Actions ---

function viewUserDetails(masterId) {
    const modal = document.getElementById("user-details-modal");
    const modalContent = document.getElementById("user-details-content");
    
    modalContent.innerHTML = "<div class='loading'>Loading user details...</div>";
    modal.style.display = "block";
    
    // Load master data
    db.collection("masters").doc(masterId).get().then(masterDoc => {
        if (!masterDoc.exists) {
            modalContent.innerHTML = "<div class='error'>User not found.</div>";
            return;
        }
        
        const masterData = masterDoc.data();
        let html = "<h3>Master Details</h3>";
        html += `<p><strong>Master ID:</strong> ${masterId}</p>`;
        html += `<p><strong>Email:</strong> ${masterData.email || "N/A"}</p>`;
        html += `<p><strong>IMEI:</strong> ${masterData.imei || "N/A"}</p>`;
        html += `<p><strong>Created At:</strong> ${masterData.createdAt ? new Date(masterData.createdAt.seconds * 1000).toLocaleString() : "N/A"}</p>`;
        html += `<p><strong>Last Seen:</strong> ${masterData.lastSeen ? new Date(masterData.lastSeen.seconds * 1000).toLocaleString() : "N/A"}</p>`;
        
        // Load children
        db.collection("children").where("masterImei", "==", masterId).get().then(childrenSnapshot => {
            html += `<h4>Children (${childrenSnapshot.size})</h4>`;
            if (childrenSnapshot.empty) {
                html += "<p>No children linked.</p>";
            } else {
                html += "<ul>";
                childrenSnapshot.forEach(childDoc => {
                    const childData = childDoc.data();
                    html += `<li><strong>${childDoc.id}</strong> - Locked: ${childData.isLocked ? "Yes" : "No"}</li>`;
                });
                html += "</ul>";
            }
            
            // Load subscription
            db.collection("subscriptions").where("masterId", "==", masterId).get().then(subSnapshot => {
                html += "<h4>Subscription</h4>";
                if (subSnapshot.empty) {
                    html += "<p>No active subscription.</p>";
                } else {
                    subSnapshot.forEach(subDoc => {
                        const subData = subDoc.data();
                        html += `<p><strong>Status:</strong> ${subData.status}</p>`;
                        html += `<p><strong>Expires:</strong> ${subData.expiryDate ? new Date(subData.expiryDate.seconds * 1000).toLocaleDateString() : "N/A"}</p>`;
                    });
                }
                
                modalContent.innerHTML = html;
            });
        });
    }).catch(error => {
        console.error("Error loading user details:", error);
        modalContent.innerHTML = `<div class='error'>Error loading details: ${error.message}</div>`;
    });
}

function closeUserDetailsModal() {
    document.getElementById("user-details-modal").style.display = "none";
}

function revokeSubscription(subscriptionId) {
    if (!confirm(`Are you sure you want to revoke subscription ${subscriptionId}?`)) {
        return;
    }
    
    // Call a secure Cloud Function to handle revocation
    const revokeSub = functions.httpsCallable("revokeSubscription");
    
    revokeSub({ subscriptionId: subscriptionId })
        .then(result => {
            showNotification(`Subscription ${subscriptionId} revoked successfully.`, "success");
            loadSubscriptions();
        })
        .catch(error => {
            console.error("Error revoking subscription:", error);
            showNotification("Error revoking subscription: " + error.message, "error");
        });
}

function searchUsers() {
    const query = document.getElementById("user-search-input").value.trim().toLowerCase();
    if (query.length < 3) {
        showNotification("Please enter at least 3 characters to search.", "info");
        return;
    }
    
    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class='loading'>Searching users...</div>";
    
    // Simple client-side search by IMEI or email
    // In production, use a Cloud Function with Algolia or similar for full-text search
    db.collection("masters").get().then(snapshot => {
        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const imei = (data.imei || "").toLowerCase();
            const email = (data.email || "").toLowerCase();
            
            if (imei.includes(query) || email.includes(query) || doc.id.toLowerCase().includes(query)) {
                results.push({ id: doc.id, data: data });
            }
        });
        
        if (results.length === 0) {
            userListElement.innerHTML = "<div class='info'>No users found matching your search.</div>";
            return;
        }
        
        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Children</th><th>Last Seen</th><th>Actions</th></tr>";
        results.forEach(result => {
            const data = result.data;
            const lastSeen = data.lastSeen ? new Date(data.lastSeen.seconds * 1000).toLocaleString() : "N/A";
            const email = data.email || "N/A";
            
            html += `
                <tr>
                    <td>${result.id}</td>
                    <td>${email}</td>
                    <td>${data.childCount || 0}</td>
                    <td>${lastSeen}</td>
                    <td><button onclick="viewUserDetails('${result.id}')" class="btn btn-secondary">View</button></td>
                </tr>
            `;
        });
        html += "</table>";
        userListElement.innerHTML = html;
        showNotification(`Found ${results.length} user(s) matching "${query}".`, "success");
    }).catch(error => {
        console.error("Error searching users:", error);
        userListElement.innerHTML = "<div class='error'>Error searching users: " + error.message + "</div>";
    });
}

// --- Utility ---

function showNotification(message, type = "info") {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = "block";
    
    setTimeout(() => {
        notification.style.display = "none";
    }, 5000);
}


// ==================== SUPPORT TICKET MANAGEMENT ====================

let currentTicketFilter = "all";

async function loadSupportTickets() {
    const ticketsListElement = document.getElementById("support-tickets-list");
    ticketsListElement.innerHTML = "<div class='loading'><div class='spinner'></div> Loading support tickets...</div>";
    
    try {
        let query = db.collection("supportTickets");
        
        if (currentTicketFilter !== "all") {
            query = query.where("status", "==", currentTicketFilter);
        }
        
        const snapshot = await query.orderBy("createdAt", "desc").get();
        
        if (snapshot.empty) {
            ticketsListElement.innerHTML = "<div class='info'>No support tickets found.</div>";
            return;
        }
        
        let html = "<table><tr><th>Ticket ID</th><th>Master IMEI</th><th>Status</th><th>Created</th><th>Access Granted</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const ticket = doc.data();
            const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
            const statusClass = ticket.status === "open" ? "status-open" : ticket.status === "in_progress" ? "status-progress" : "status-closed";
            
            html += `
                <tr>
                    <td>${doc.id.substring(0, 8)}</td>
                    <td>${ticket.masterImei}</td>
                    <td><span class="${statusClass}">${ticket.status}</span></td>
                    <td>${createdAt}</td>
                    <td>${ticket.accessGranted ? "✓ Yes" : "✗ No"}</td>
                    <td>
                        <button onclick="viewTicketDetails('${doc.id}')" class="btn btn-secondary">View</button>
                        ${ticket.accessGranted ? 
                            `<button onclick="viewUserDetails('${ticket.masterImei}')" class="btn btn-primary">View User Data</button>` : 
                            ""}
                        ${ticket.status !== "closed" ? 
                            `<button onclick="updateTicketStatus('${doc.id}', 'in_progress')" class="btn btn-secondary">Mark In Progress</button>
                             <button onclick="updateTicketStatus('${doc.id}', 'closed')" class="btn btn-secondary">Close</button>` : 
                            ""}
                    </td>
                </tr>
            `;
        });
        html += "</table>";
        ticketsListElement.innerHTML = html;
    } catch (error) {
        console.error("Error loading support tickets:", error);
        ticketsListElement.innerHTML = "<div class='error'>Error loading support tickets: " + error.message + "</div>";
    }
}

function filterTickets(status) {
    currentTicketFilter = status;
    loadSupportTickets();
}

async function viewTicketDetails(ticketId) {
    try {
        const doc = await db.collection("supportTickets").doc(ticketId).get();
        if (!doc.exists) {
            showNotification("Ticket not found.", "error");
            return;
        }
        
        const ticket = doc.data();
        const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
        
        const aiSolution = ticket.aiGeneratedSolution ? `\n\nAI-Generated Solution (Confidence: ${(ticket.aiConfidenceScore * 100).toFixed(0)}%):\n${ticket.aiGeneratedSolution}` : "";
        alert(`Ticket Details:\n\nTicket ID: ${ticketId}\nMaster IMEI: ${ticket.masterImei}\nStatus: ${ticket.status}\nCreated: ${createdAt}\nProblem Description:\n${ticket.problemDescription}${aiSolution}`);
    } catch (error) {
        console.error("Error viewing ticket details:", error);
        showNotification("Error viewing ticket details: " + error.message, "error");
    }
}

async function updateTicketStatus(ticketId, newStatus) {
    if (!confirm(`Are you sure you want to change the ticket status to "${newStatus}"?`)) {
        return;
    }
    
    try {
        await db.collection("supportTickets").doc(ticketId).update({
            status: newStatus
        });
        
        showNotification("Ticket status updated successfully!", "success");
        loadSupportTickets();
    } catch (error) {
        console.error("Error updating ticket status:", error);
        showNotification("Error updating ticket status: " + error.message, "error");
    }
}
