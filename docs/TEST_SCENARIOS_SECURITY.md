# MiniMaster Security Hardening Test Scenarios

This document outlines the critical test scenarios to validate the new, stricter security rules and the overall hardened state of the MiniMaster project.

## Prerequisites

1.  The new `firestore.rules` have been deployed.
2.  The `setAdminClaim` function has been updated and deployed.
3.  At least three test users exist in Firebase Authentication:
    *   **User A (Admin):** Has the custom claim `role: 'admin'`. 
    *   **User B (Master):** A regular Master user, owner of Child C.
    *   **User C (Child):** A regular Child user, linked to Master B.
    *   **User D (Unrelated Master):** A regular Master user, not linked to Child C.

## Test Cases

### 1. Firestore Rules Validation (Critical)

| ID | Test Case | Action | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-FS-01** | **Master Isolation (Write):** User D attempts to write to User B's master document (`/masters/{user_B_uid}`). | Firestore Write | **PERMISSION_DENIED**. A user cannot modify another master's data. | |
| **SEC-FS-02** | **Master Isolation (Read):** User D attempts to read User B's master document (`/masters/{user_B_uid}`). | Firestore Read | **PERMISSION_DENIED**. A user cannot read another master's data. | |
| **SEC-FS-03** | **Child Data Access (Owner):** User B (Master) attempts to read Child C's document (`/children/{child_C_uid}`). | Firestore Read | **SUCCESS**. The owner can read their child's data. | |
| **SEC-FS-04** | **Child Data Access (Unrelated):** User D (Unrelated Master) attempts to read Child C's document. | Firestore Read | **PERMISSION_DENIED**. An unrelated master cannot read another's child data. | |
| **SEC-FS-05** | **Task Creation (Child):** User C (Child) attempts to create a new task under their own document. | Firestore Create | **PERMISSION_DENIED**. Only masters can create tasks. | |
| **SEC-FS-06** | **Task Deletion (Child):** User C (Child) attempts to delete a task assigned to them. | Firestore Delete | **PERMISSION_DENIED**. Only masters can delete tasks. | |
| **SEC-FS-07** | **Admin Full Access:** User A (Admin) attempts to read and write to any document in any collection. | Firestore Read/Write | **SUCCESS**. The admin has full override access. | |
| **SEC-FS-08** | **Pairing Code Security:** Any user attempts to write to the `/pairingCodes` collection. | Firestore Write | **PERMISSION_DENIED**. Only Cloud Functions can create pairing codes. | |

### 2. Cloud Function Authorization

| ID | Test Case | Action | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CF-01** | **`setAdminClaim` (Non-Admin):** User B (Master) attempts to call the `setAdminClaim` function. | Cloud Function Call | **PERMISSION_DENIED** HttpsError. The function correctly rejects calls from non-admins. | |
| **SEC-CF-02** | **`setAdminClaim` (Admin):** User A (Admin) calls the `setAdminClaim` function to grant admin rights to another user. | Cloud Function Call | **SUCCESS**. The target user receives the `role: 'admin'` custom claim. | |

### 3. ChildApp Logic Validation

| ID | Test Case | Action | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CA-01** | **Child ID Persistence:** Pair a new child device, then restart the app. | Open the app after restart. | The app correctly retrieves and uses the stored `childId` from SharedPreferences. The hardcoded value is no longer used. | |
| **SEC-CA-02** | **Upload Failure UX:** Manually simulate a network error during the image upload in `ProofSubmissionScreen`. | Attempt to submit proof. | The `isUploading` state is correctly reset, and a `Toast` message "Failed to submit proof. Please try again." is displayed to the user. | |
