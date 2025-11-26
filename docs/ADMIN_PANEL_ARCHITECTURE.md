# MiniMaster Admin Panel Architecture and Security Concept

## 1. Goal
To create a secure, functional, and maintainable web-based Admin Panel for MiniMaster operators, enabling user management, subscription monitoring, and key statistics viewing.

## 2. Technology Stack
*   **Frontend:** HTML, CSS, JavaScript (Single Page Application structure).
*   **Backend/Database:** Firebase (Firestore, Authentication, Cloud Functions).
*   **Hosting:** Firebase Hosting (Free Tier / Spark Plan).

## 3. Security Concept (Crucial for Admin Panel)

The Admin Panel must not rely on simple password protection or shared secrets. It must leverage Firebase Authentication with a specific authorization layer.

### 3.1. Operator Authentication
1.  **Firebase Authentication:** Operators will log in using standard Firebase Email/Password authentication.
2.  **Custom Claims for Authorization:** After successful login, a Cloud Function will check if the authenticated user's UID is listed in a secure `operators` collection (or a hardcoded list in the function).
3.  If authorized, the function will mint a **Custom Claim** on the user's Firebase Auth Token, e.g., `role: 'admin'`.
4.  The Admin Panel frontend will check for this `role: 'admin'` claim upon loading to grant access.

### 3.2. Data Access Control (Firestore Security Rules)
All data access from the Admin Panel will be governed by strict Firestore Security Rules.

```firestore
service cloud.firestore {
  match /databases/{database}/documents {
    // Only users with the 'admin' custom claim can read/write the entire database
    match /{document=**} {
      allow read, write: if request.auth.token.role == 'admin';
    }
  }
}
```
*Note: This is a simplified rule. A more granular rule might be needed for specific collections.*

### 3.3. API Access Control (Cloud Functions)
All Cloud Functions used by the Admin Panel (e.g., `getUsers`, `revokeSubscription`) must verify the `admin` claim in the context.

```typescript
exports.getUsers = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // 2. Authorization Check (Custom Claim)
    if (context.auth.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only operators can access this data.');
    }

    // ... function logic ...
});
```

## 4. Functional Requirements

### 4.1. User Management
*   **Overview:** Display total number of users (Masters and Children).
*   **Search/Filter:** Ability to search users by email (Master) or device ID (Child).
*   **Actions:** View user details, manually revoke subscription (calls a secure Cloud Function).

### 4.2. Subscription Monitoring
*   **Statistics:** Total active subscriptions, monthly recurring revenue (MRR - simplified estimate).
*   **List:** List of currently active premium users.
*   **Status Check:** Ability to manually trigger a subscription status check for a specific user.

### 4.3. Key Statistics
*   Total paired devices.
*   Total tasks assigned (since feature launch).
*   Task completion rate (Approved / Submitted).

## 5. Implementation Plan (Frontend)
1.  Create a new directory `MiniMaster/admin-panel/`.
2.  Implement a simple login page using Firebase Auth.
3.  Implement the main dashboard, conditionally rendered based on the `admin` claim.
4.  Use Firebase SDK to fetch data (protected by the new Firestore Rules).
5.  Implement UI components for data display and management actions.
