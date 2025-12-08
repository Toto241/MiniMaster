# GDPR-Compliant Support Interface - Architecture

This document outlines the architecture for a GDPR-compliant support interface for the MiniMaster project. The core principle is **user consent** and **data minimization**.

## 1. Core Concepts

*   **Opt-In Model:** Users must explicitly grant support access. No data is accessible by the operator without consent.
*   **Temporary Access:** Access is granted for a limited time (e.g., 48 hours) and can be revoked by the user at any time.
*   **Data Minimization:** Only the necessary data for troubleshooting is made accessible.
*   **Audit Trail:** All access and actions are logged.

## 2. Data Model (Firestore)

We will introduce two new collections:

### `supportTickets`

This collection stores all support requests.

```json
{
  "ticketId": "<auto-id>",
  "masterImei": "<user-imei>",
  "createdAt": "<timestamp>",
  "status": "open" | "in_progress" | "closed",
  "problemDescription": "<user-provided-text>",
  "accessGranted": true | false,
  "accessGrantId": "<grant-id>" // (optional)
}
```

### `supportAccessGrants`

This collection stores the consent for temporary data access.

```json
{
  "grantId": "<auto-id>",
  "masterImei": "<user-imei>",
  "grantedAt": "<timestamp>",
  "expiresAt": "<timestamp>", // (e.g., 48 hours from grantedAt)
  "status": "active" | "expired" | "revoked"
}
```

## 3. Backend (Cloud Functions)

We will add the following Cloud Functions:

### `createSupportTicket`

*   **Trigger:** Callable Function from Web-Control.
*   **Action:** Creates a new document in the `supportTickets` collection.
*   **Input:** `{ problemDescription: string }`
*   **Authentication:** Requires authenticated user.

### `grantSupportAccess`

*   **Trigger:** Callable Function from Web-Control.
*   **Action:**
    1.  Creates a new document in `supportAccessGrants` with an expiration date.
    2.  Updates the corresponding `supportTickets` document.
*   **Input:** `{ ticketId: string }`
*   **Authentication:** Requires authenticated user.

### `revokeSupportAccess`

*   **Trigger:** Callable Function from Web-Control.
*   **Action:** Updates the status of the `supportAccessGrants` document to `revoked`.
*   **Input:** `{ grantId: string }`
*   **Authentication:** Requires authenticated user.

### `cleanupExpiredGrants` (Scheduled Function)

*   **Trigger:** Scheduled Function (e.g., runs every hour).
*   **Action:** Queries for `supportAccessGrants` where `expiresAt` is in the past and updates the status to `expired`.

## 4. Frontend UI/UX

### Web-Control (Parent App)

1.  **New "Support" Section:**
    *   Form to create a new support ticket.
    *   List of existing support tickets.
    *   For each ticket, a button to "Grant Support Access".
    *   If access is granted, a button to "Revoke Support Access".

### Admin Panel

1.  **New "Support Tickets" Tab:**
    *   List of all support tickets.
    *   Filter by status (open, in_progress, closed).
    *   When a ticket is selected:
        *   Display ticket details.
        *   If access is granted, a "View User Data" button appears.
        *   This button opens the existing "User Details" modal, but with a clear indication that this is a temporary support session.

## 5. Security (Firestore Rules)

We will update `firestore.rules` to protect the new collections:

```javascript
// Allow users to manage their own support tickets and grants
match /supportTickets/{ticketId} {
  allow read, create: if request.auth.uid == resource.data.masterImei;
}

match /supportAccessGrants/{grantId} {
  allow read, create, update: if request.auth.uid == resource.data.masterImei;
}

// Allow admins to access support data ONLY if a valid grant exists
function hasActiveSupportGrant(masterImei) {
  return exists(/databases/$(database)/documents/supportAccessGrants/$(grantId)) &&
         get(/databases/$(database)/documents/supportAccessGrants/$(grantId)).data.masterImei == masterImei &&
         get(/databases/$(database)/documents/supportAccessGrants/$(grantId)).data.status == 'active';
}

// Example: Admin access to master data
match /masters/{masterImei} {
  allow read: if request.auth.token.role == 'admin' && hasActiveSupportGrant(masterImei);
  // ... other rules
}
```

## 6. End-to-End Workflow

1.  **User has a problem:** The parent opens the Web-Control and navigates to the "Support" section.
2.  **User creates a ticket:** The parent fills out the form and submits a new support ticket.
3.  **Operator is notified:** The new ticket appears in the Admin Panel.
4.  **Operator requests access:** The operator communicates with the user (e.g., via email) and requests temporary access.
5.  **User grants access:** The parent clicks "Grant Support Access" in the Web-Control.
6.  **Operator views data:** The operator can now view the user's data in the Admin Panel for the duration of the grant.
7.  **Problem is solved:** The operator closes the ticket.
8.  **Access expires:** The `cleanupExpiredGrants` function automatically revokes access after 48 hours, or the user revokes it manually.

This architecture ensures that the support interface is both **functional** and **fully compliant with GDPR principles**.
