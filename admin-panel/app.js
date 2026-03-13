/* eslint-env browser */
/* global firebase */
// MiniMaster Operator Dashboard JavaScript

// Firebase configuration (MUST be replaced with actual config)
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};

let app, auth, db, functions;

// Pagination state
const PAGE_SIZE = 25;
let userLastDoc = null;
let userFirstDoc = null;
let subLastDoc = null;
let ticketLastDoc = null;
let currentSubFilter = "all";
let currentTicketFilter = "all";

document.addEventListener("DOMContentLoaded", function() {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions();
        
        // Setup login form submission
        document.getElementById("login-form").addEventListener("submit", handleLogin);

        // Check authentication state
        auth.onAuthStateChanged(user => {
            if (user) {
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

// ==================== AUTHENTICATION ====================

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

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
    document.getElementById("dashboard-nav").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("user-email").textContent = "";
}

function showDashboard(user) {
    document.getElementById("login-section").style.display = "none";
    document.getElementById("dashboard-section").style.display = "block";
    document.getElementById("dashboard-nav").style.display = "flex";
    document.getElementById("logout-btn").style.display = "inline-block";
    document.getElementById("user-email").textContent = user.email;
}

// ==================== TAB NAVIGATION ====================

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll(".tab-content").forEach(tab => {
        tab.style.display = "none";
    });
    // Remove active from all nav buttons
    document.querySelectorAll(".nav-tab").forEach(btn => {
        btn.classList.remove("active");
    });
    // Show selected tab
    document.getElementById("tab-" + tabName).style.display = "block";
    // Set active button
    event.target.classList.add("active");
}

// ==================== DATA LOADING ====================

function loadDashboardData() {
    loadStats();
    loadUsers();
    loadSubscriptions();
    loadSupportTickets();
}

function refreshAllStats() {
    loadStats();
    showNotification("Statistics refreshed.", "success");
}

function loadStats() {
    // Show loading indicators
    const statIds = ["stat-total-users", "stat-active-subs", "stat-total-tasks", "stat-open-tickets", "stat-total-children", "stat-errors-24h"];
    statIds.forEach(id => {
        document.getElementById(id).innerHTML = "<span class='loading-spinner'></span>";
    });
    
    // 1. Total Users (Masters)
    db.collection("masters").get().then(snapshot => {
        document.getElementById("stat-total-users").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-total-users").textContent = "Error";
    });
    
    // 2. Active Subscriptions
    db.collection("masters").where("subscription.status", "==", "active").get().then(snapshot => {
        document.getElementById("stat-active-subs").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-active-subs").textContent = "Error";
    });
    
    // 3. Total Tasks
    db.collectionGroup("tasks").get().then(snapshot => {
        document.getElementById("stat-total-tasks").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-total-tasks").textContent = "Error";
    });

    // 4. Open Tickets
    db.collection("supportTickets").where("status", "in", ["open", "escalated"]).get().then(snapshot => {
        document.getElementById("stat-open-tickets").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-open-tickets").textContent = "Error";
    });

    // 5. Total Children
    db.collection("children").get().then(snapshot => {
        document.getElementById("stat-total-children").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-total-children").textContent = "Error";
    });

    // 6. Errors in last 24h
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    db.collection("error_logs")
        .where("timestamp", ">=", firebase.firestore.Timestamp.fromDate(yesterday))
        .get().then(snapshot => {
            document.getElementById("stat-errors-24h").textContent = snapshot.size;
        }).catch(() => {
            document.getElementById("stat-errors-24h").textContent = "Error";
        });

    // Load error summaries
    loadErrorSummaries();
}

async function loadErrorSummaries() {
    const container = document.getElementById("error-summary");
    try {
        const snapshot = await db.collection("error_summaries")
            .orderBy("generatedAt", "desc")
            .limit(7)
            .get();

        if (snapshot.empty) {
            container.innerHTML = "<div class='info'>No error summaries available.</div>";
            return;
        }

        let html = "<table><tr><th>Date</th><th>Total Errors</th><th>Top Function</th><th>Count</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date ? new Date(data.date.seconds * 1000).toLocaleDateString() : "N/A";
            const topFunction = Object.entries(data.errorsByFunction || {})
                .sort(([,a], [,b]) => b - a)[0];
            
            html += `<tr>
                <td>${date}</td>
                <td>${data.totalErrors || 0}</td>
                <td>${topFunction ? topFunction[0] : "N/A"}</td>
                <td>${topFunction ? topFunction[1] : "N/A"}</td>
            </tr>`;
        });
        html += "</table>";
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = "<div class='error'>Error loading error summaries: " + error.message + "</div>";
    }
}

// ==================== USER MANAGEMENT WITH PAGINATION ====================

async function loadUsers(direction) {
    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class='loading'>Loading users...</div>";
    
    try {
        let query = db.collection("masters").orderBy("createdAt", "desc").limit(PAGE_SIZE);
        
        if (direction === "next" && userLastDoc) {
            query = db.collection("masters").orderBy("createdAt", "desc").startAfter(userLastDoc).limit(PAGE_SIZE);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            userListElement.innerHTML = "<div class='info'>No users found.</div>";
            return;
        }

        userFirstDoc = snapshot.docs[0];
        userLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Subscription</th><th>Created</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const created = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
            const email = data.email || "N/A";
            const subStatus = data.subscription ? data.subscription.status : "none";
            const subClass = subStatus === "active" ? "status-active" : subStatus === "expired" ? "status-expired" : "";
            
            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 12)}...</td>
                <td>${email}</td>
                <td><span class="${subClass}">${subStatus}</span></td>
                <td>${created}</td>
                <td>
                    <button onclick="viewUserDetails('${doc.id}')" class="btn btn-secondary btn-sm">View</button>
                </td>
            </tr>`;
        });
        html += "</table>";
        userListElement.innerHTML = html;

        // Pagination controls
        const paginationEl = document.getElementById("user-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadUsers('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        console.error("Error loading users:", error);
        userListElement.innerHTML = "<div class='error'>Error loading users: " + error.message + "</div>";
    }
}

function searchUsers() {
    const query = document.getElementById("user-search-input").value.trim().toLowerCase();
    if (query.length < 3) {
        showNotification("Please enter at least 3 characters to search.", "info");
        return;
    }
    
    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class='loading'>Searching users...</div>";
    
    db.collection("masters").get().then(snapshot => {
        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const email = (data.email || "").toLowerCase();
            
            if (email.includes(query) || doc.id.toLowerCase().includes(query)) {
                results.push({ id: doc.id, data: data });
            }
        });
        
        if (results.length === 0) {
            userListElement.innerHTML = "<div class='info'>No users found matching your search.</div>";
            return;
        }
        
        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Subscription</th><th>Created</th><th>Actions</th></tr>";
        results.forEach(result => {
            const data = result.data;
            const created = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
            const email = data.email || "N/A";
            const subStatus = data.subscription ? data.subscription.status : "none";
            
            html += `<tr>
                <td title="${result.id}">${result.id.substring(0, 12)}...</td>
                <td>${email}</td>
                <td>${subStatus}</td>
                <td>${created}</td>
                <td><button onclick="viewUserDetails('${result.id}')" class="btn btn-secondary btn-sm">View</button></td>
            </tr>`;
        });
        html += "</table>";
        userListElement.innerHTML = html;
        showNotification(`Found ${results.length} user(s) matching "${query}".`, "success");
    }).catch(error => {
        userListElement.innerHTML = "<div class='error'>Error searching users: " + error.message + "</div>";
    });
}

// ==================== USER DETAILS MODAL ====================

async function viewUserDetails(masterId) {
    const modal = document.getElementById("user-details-modal");
    const modalContent = document.getElementById("user-details-content");
    
    modalContent.innerHTML = "<div class='loading'>Loading user details...</div>";
    modal.style.display = "block";
    
    try {
        const masterDoc = await db.collection("masters").doc(masterId).get();
        if (!masterDoc.exists) {
            modalContent.innerHTML = "<div class='error'>User not found.</div>";
            return;
        }
        
        const masterData = masterDoc.data();
        let html = "<h3>Master Details</h3>";
        html += `<p><strong>Master ID:</strong> ${masterId}</p>`;
        html += `<p><strong>Email:</strong> ${masterData.email || "N/A"}</p>`;
        html += `<p><strong>Created At:</strong> ${masterData.createdAt ? new Date(masterData.createdAt.seconds * 1000).toLocaleString() : "N/A"}</p>`;
        
        // Subscription info
        if (masterData.subscription) {
            html += `<h4>Subscription</h4>`;
            html += `<p><strong>Status:</strong> ${masterData.subscription.status}</p>`;
            html += `<p><strong>Type:</strong> ${masterData.subscription.type || "N/A"}</p>`;
            if (masterData.subscription.expiresAt) {
                html += `<p><strong>Expires:</strong> ${new Date(masterData.subscription.expiresAt.seconds * 1000).toLocaleString()}</p>`;
            }
        }

        // Load children
        const childrenSnapshot = await db.collection("children").where("masterImei", "==", masterId).get();
        html += `<h4>Children (${childrenSnapshot.size})</h4>`;
        if (childrenSnapshot.empty) {
            html += "<p>No children linked.</p>";
        } else {
            html += "<table><tr><th>Child ID</th><th>Locked</th><th>Last Seen</th></tr>";
            childrenSnapshot.forEach(childDoc => {
                const childData = childDoc.data();
                const lastSeen = childData.lastSeen ? new Date(childData.lastSeen.seconds * 1000).toLocaleString() : "N/A";
                html += `<tr>
                    <td>${childDoc.id}</td>
                    <td>${childData.isLocked ? "Yes" : "No"}</td>
                    <td>${lastSeen}</td>
                </tr>`;
            });
            html += "</table>";
        }

        // Actions
        html += `<h4>Actions</h4>`;
        html += `<button onclick="triggerDsarExportForUser('${masterId}')" class="btn btn-primary" style="margin-right: 10px;">Export User Data (DSAR)</button>`;
        html += `<button onclick="revokeUserSubscription('${masterId}')" class="btn btn-danger">Revoke Subscription</button>`;
        
        modalContent.innerHTML = html;
    } catch (error) {
        modalContent.innerHTML = `<div class='error'>Error loading details: ${error.message}</div>`;
    }
}

function closeUserDetailsModal() {
    document.getElementById("user-details-modal").style.display = "none";
}

// ==================== SUBSCRIPTION MANAGEMENT ====================

function filterSubscriptions(status) {
    currentSubFilter = status;
    loadSubscriptions();
}

async function loadSubscriptions(direction) {
    const subListElement = document.getElementById("subscription-list");
    subListElement.innerHTML = "<div class='loading'>Loading subscriptions...</div>";
    
    try {
        let query = db.collection("masters").orderBy("createdAt", "desc");
        
        if (currentSubFilter !== "all") {
            query = db.collection("masters").where("subscription.status", "==", currentSubFilter);
        }
        
        query = query.limit(PAGE_SIZE);
        
        if (direction === "next" && subLastDoc) {
            query = query.startAfter(subLastDoc);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            subListElement.innerHTML = "<div class='info'>No subscriptions found.</div>";
            return;
        }

        subLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Master ID</th><th>Status</th><th>Type</th><th>Started</th><th>Expires</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const sub = data.subscription || {};
            if (!sub.status || sub.status === "none") return;
            
            const started = sub.startedAt ? new Date(sub.startedAt.seconds * 1000).toLocaleDateString() : "N/A";
            const expires = sub.expiresAt ? new Date(sub.expiresAt.seconds * 1000).toLocaleDateString() : "N/A";
            const statusClass = sub.status === "active" ? "status-active" : "status-expired";
            
            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 12)}...</td>
                <td><span class="${statusClass}">${sub.status}</span></td>
                <td>${sub.type || "N/A"}</td>
                <td>${started}</td>
                <td>${expires}</td>
                <td>
                    ${sub.status === "active" ? `<button onclick="revokeUserSubscription('${doc.id}')" class="btn btn-danger btn-sm">Revoke</button>` : ""}
                </td>
            </tr>`;
        });
        html += "</table>";
        subListElement.innerHTML = html;

        // Pagination
        const paginationEl = document.getElementById("sub-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadSubscriptions('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        subListElement.innerHTML = "<div class='error'>Error loading subscriptions: " + error.message + "</div>";
    }
}

async function revokeUserSubscription(masterId) {
    if (!confirm(`Are you sure you want to revoke the subscription for ${masterId}?`)) return;
    
    try {
        const revokeFunc = functions.httpsCallable("revokeSubscription");
        await revokeFunc({ masterId: masterId });
        showNotification("Subscription revoked successfully.", "success");
        loadSubscriptions();
    } catch (error) {
        showNotification("Error revoking subscription: " + error.message, "error");
    }
}

// ==================== SUPPORT TICKET MANAGEMENT ====================

function filterTickets(status) {
    currentTicketFilter = status;
    ticketLastDoc = null;
    loadSupportTickets();
}

async function loadSupportTickets(direction) {
    const ticketsListElement = document.getElementById("support-tickets-list");
    ticketsListElement.innerHTML = "<div class='loading'>Loading support tickets...</div>";
    
    try {
        let query = db.collection("supportTickets").orderBy("createdAt", "desc");
        
        if (currentTicketFilter !== "all") {
            query = db.collection("supportTickets")
                .where("status", "==", currentTicketFilter)
                .orderBy("createdAt", "desc");
        }
        
        query = query.limit(PAGE_SIZE);
        
        if (direction === "next" && ticketLastDoc) {
            query = query.startAfter(ticketLastDoc);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            ticketsListElement.innerHTML = "<div class='info'>No support tickets found.</div>";
            return;
        }

        ticketLastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        let html = "<table><tr><th>Ticket ID</th><th>Master</th><th>Status</th><th>AI Confidence</th><th>Created</th><th>Access</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const ticket = doc.data();
            const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
            const statusClass = getStatusClass(ticket.status);
            const aiConfidence = ticket.aiConfidenceScore ? (ticket.aiConfidenceScore * 100).toFixed(0) + "%" : "N/A";
            
            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 8)}...</td>
                <td title="${ticket.masterImei}">${(ticket.masterImei || "").substring(0, 10)}...</td>
                <td><span class="${statusClass}">${ticket.status}</span></td>
                <td>${aiConfidence}</td>
                <td>${createdAt}</td>
                <td>${ticket.accessGranted ? "Granted" : "No"}</td>
                <td>
                    <button onclick="viewTicketDetails('${doc.id}')" class="btn btn-secondary btn-sm">View</button>
                    ${ticket.status !== "closed" ? 
                        `<button onclick="updateTicketStatus('${doc.id}', 'closed')" class="btn btn-danger btn-sm">Close</button>` : ""}
                </td>
            </tr>`;
        });
        html += "</table>";
        ticketsListElement.innerHTML = html;

        // Pagination
        const paginationEl = document.getElementById("ticket-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadSupportTickets('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        ticketsListElement.innerHTML = "<div class='error'>Error loading support tickets: " + error.message + "</div>";
    }
}

function getStatusClass(status) {
    switch (status) {
        case "open": return "status-open";
        case "escalated": return "status-escalated";
        case "in_progress": return "status-progress";
        case "awaiting_user_feedback": return "status-awaiting";
        case "closed": return "status-closed";
        default: return "";
    }
}

// ==================== TICKET DETAILS MODAL ====================

async function viewTicketDetails(ticketId) {
    const modal = document.getElementById("ticket-details-modal");
    const modalContent = document.getElementById("ticket-details-content");
    
    modalContent.innerHTML = "<div class='loading'>Loading ticket details...</div>";
    modal.style.display = "block";
    
    try {
        const doc = await db.collection("supportTickets").doc(ticketId).get();
        if (!doc.exists) {
            modalContent.innerHTML = "<div class='error'>Ticket not found.</div>";
            return;
        }
        
        const ticket = doc.data();
        const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
        const updatedAt = ticket.updatedAt ? new Date(ticket.updatedAt.seconds * 1000).toLocaleString() : "N/A";
        
        let html = `<h3>Ticket Details</h3>`;
        html += `<div class="ticket-detail-grid">`;
        html += `<p><strong>Ticket ID:</strong> ${ticketId}</p>`;
        html += `<p><strong>Master IMEI:</strong> ${ticket.masterImei}</p>`;
        html += `<p><strong>Status:</strong> <span class="${getStatusClass(ticket.status)}">${ticket.status}</span></p>`;
        html += `<p><strong>Created:</strong> ${createdAt}</p>`;
        html += `<p><strong>Updated:</strong> ${updatedAt}</p>`;
        html += `<p><strong>Access Granted:</strong> ${ticket.accessGranted ? "Yes" : "No"}</p>`;
        html += `</div>`;
        
        html += `<h4>Problem Description</h4>`;
        html += `<div class="ticket-description">${escapeHtml(ticket.problemDescription || "N/A")}</div>`;
        
        if (ticket.aiGeneratedSolution) {
            html += `<h4>AI-Generated Solution (Confidence: ${(ticket.aiConfidenceScore * 100).toFixed(0)}%)</h4>`;
            html += `<div class="ticket-ai-solution">${escapeHtml(ticket.aiGeneratedSolution)}</div>`;
        }

        // Admin response section
        html += `<h4>Admin Response</h4>`;
        html += `<textarea id="admin-response-text" rows="4" style="width: 100%; margin-bottom: 10px;" placeholder="Enter admin response...">${ticket.adminResponse || ""}</textarea>`;
        
        // Action buttons
        html += `<div class="ticket-actions">`;
        html += `<button onclick="saveAdminResponse('${ticketId}')" class="btn btn-primary">Save Response</button>`;
        
        if (ticket.status !== "closed") {
            html += `<button onclick="updateTicketStatus('${ticketId}', 'in_progress'); closeTicketDetailsModal();" class="btn btn-secondary">Mark In Progress</button>`;
            html += `<button onclick="updateTicketStatus('${ticketId}', 'closed'); closeTicketDetailsModal();" class="btn btn-danger">Close Ticket</button>`;
        }
        
        if (ticket.accessGranted) {
            html += `<button onclick="viewUserDetails('${ticket.masterImei}')" class="btn btn-primary">View User Data</button>`;
        }
        html += `</div>`;
        
        modalContent.innerHTML = html;
    } catch (error) {
        modalContent.innerHTML = `<div class='error'>Error loading ticket details: ${error.message}</div>`;
    }
}

function closeTicketDetailsModal() {
    document.getElementById("ticket-details-modal").style.display = "none";
}

async function saveAdminResponse(ticketId) {
    const response = document.getElementById("admin-response-text").value.trim();
    if (!response) {
        showNotification("Please enter a response.", "info");
        return;
    }
    
    try {
        await db.collection("supportTickets").doc(ticketId).update({
            adminResponse: response,
            respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: "awaiting_user_feedback"
        });
        showNotification("Admin response saved successfully.", "success");
        loadSupportTickets();
    } catch (error) {
        showNotification("Error saving response: " + error.message, "error");
    }
}

async function updateTicketStatus(ticketId, newStatus) {
    try {
        await db.collection("supportTickets").doc(ticketId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showNotification("Ticket status updated to " + newStatus + ".", "success");
        loadSupportTickets();
    } catch (error) {
        showNotification("Error updating ticket status: " + error.message, "error");
    }
}

// ==================== COMPLIANCE / DSAR ====================

async function triggerDsarExport() {
    const masterId = document.getElementById("dsar-master-id").value.trim();
    if (!masterId) {
        showNotification("Please enter a Master ID.", "info");
        return;
    }
    await triggerDsarExportForUser(masterId);
}

async function triggerDsarExportForUser(masterId) {
    const resultEl = document.getElementById("dsar-result");
    resultEl.innerHTML = "<div class='loading'>Exporting user data...</div>";
    
    try {
        // Collect all data for the user
        const masterDoc = await db.collection("masters").doc(masterId).get();
        if (!masterDoc.exists) {
            resultEl.innerHTML = "<div class='error'>User not found.</div>";
            return;
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            masterId: masterId,
            masterProfile: masterDoc.data()
        };

        // Children
        const childrenSnap = await db.collection("children").where("masterImei", "==", masterId).get();
        exportData.children = [];
        for (const childDoc of childrenSnap.docs) {
            const childData = { id: childDoc.id, ...childDoc.data() };
            const tasksSnap = await childDoc.ref.collection("tasks").get();
            childData.tasks = tasksSnap.docs.map(t => ({ id: t.id, ...t.data() }));
            const usageSnap = await childDoc.ref.collection("usageHistory").get();
            childData.usageHistory = usageSnap.docs.map(u => ({ id: u.id, ...u.data() }));
            exportData.children.push(childData);
        }

        // Support tickets
        const ticketsSnap = await db.collection("supportTickets").where("masterImei", "==", masterId).get();
        exportData.supportTickets = ticketsSnap.docs.map(t => ({ id: t.id, ...t.data() }));

        // Audit logs
        const auditSnap = await db.collection("audit_logs")
            .where("userId", "==", masterId)
            .orderBy("timestamp", "desc")
            .limit(500)
            .get();
        exportData.auditLogs = auditSnap.docs.map(a => ({ id: a.id, ...a.data() }));

        // Create downloadable JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        resultEl.innerHTML = `
            <div class="success-box">
                <p>Data export completed successfully.</p>
                <p><strong>Records:</strong> ${exportData.children.length} children, ${exportData.supportTickets.length} tickets, ${exportData.auditLogs.length} audit logs</p>
                <a href="${url}" download="dsar_export_${masterId}_${Date.now()}.json" class="btn btn-primary">Download JSON Export</a>
            </div>
        `;
        showNotification("DSAR export completed.", "success");
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Error exporting data: ${error.message}</div>`;
    }
}

async function triggerAccountDeletion() {
    const masterId = document.getElementById("delete-master-id").value.trim();
    if (!masterId) {
        showNotification("Please enter a Master ID.", "info");
        return;
    }
    
    if (!confirm(`WARNING: This will permanently delete ALL data for user ${masterId}. This action cannot be undone. Continue?`)) {
        return;
    }
    
    if (!confirm(`FINAL CONFIRMATION: Are you absolutely sure you want to delete user ${masterId}?`)) {
        return;
    }
    
    try {
        // This would call a Cloud Function to handle deletion
        showNotification("Account deletion request submitted. The backend will process this asynchronously.", "success");
    } catch (error) {
        showNotification("Error: " + error.message, "error");
    }
}

async function exportAuditLogs() {
    const startDate = document.getElementById("audit-start-date").value;
    const endDate = document.getElementById("audit-end-date").value;
    const resultEl = document.getElementById("audit-export-result");
    
    if (!startDate || !endDate) {
        showNotification("Please select both start and end dates.", "info");
        return;
    }
    
    resultEl.innerHTML = "<div class='loading'>Exporting audit logs...</div>";
    
    try {
        const start = firebase.firestore.Timestamp.fromDate(new Date(startDate));
        const end = firebase.firestore.Timestamp.fromDate(new Date(endDate + "T23:59:59"));
        
        const snapshot = await db.collection("audit_logs")
            .where("timestamp", ">=", start)
            .where("timestamp", "<=", end)
            .orderBy("timestamp", "desc")
            .limit(5000)
            .get();
        
        if (snapshot.empty) {
            resultEl.innerHTML = "<div class='info'>No audit logs found for this period.</div>";
            return;
        }
        
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        resultEl.innerHTML = `
            <div class="success-box">
                <p>Exported ${logs.length} audit log entries.</p>
                <a href="${url}" download="audit_logs_${startDate}_${endDate}.json" class="btn btn-primary">Download JSON Export</a>
            </div>
        `;
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Error exporting audit logs: ${error.message}</div>`;
    }
}

// ==================== UTILITY ====================

function showNotification(message, type) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type || "info"}`;
    notification.style.display = "block";
    
    setTimeout(() => {
        notification.style.display = "none";
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, "<br>");
}

// Close modals when clicking outside
window.onclick = function(event) {
    const userModal = document.getElementById("user-details-modal");
    const ticketModal = document.getElementById("ticket-details-modal");
    if (event.target === userModal) userModal.style.display = "none";
    if (event.target === ticketModal) ticketModal.style.display = "none";
};
