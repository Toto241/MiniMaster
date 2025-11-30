# MiniMaster Project Hardening & Completion Plan

This document outlines the identified gaps, security vulnerabilities, and missing features in the MiniMaster project. It also provides a concrete plan to address these issues to bring the project to a production-ready state.

## 1. Identified Gaps and Vulnerabilities

### 1.1. Critical Security Vulnerabilities

*   **Insecure Firestore Rules:** The current rules (`firestore.rules`) are dangerously permissive. They allow any authenticated user to read and write data of any other user (`allow read, write: if isSignedIn();`). This is the most critical vulnerability and must be fixed.
*   **Insecure Authentication Model:** The custom authentication model, which relies on passing a `secretKey` from the client in every Cloud Function call, is not secure. The standard approach is to use Firebase Auth tokens, which are automatically verified. The current model exposes the secret key on the client side.
*   **Unprotected Admin Function:** The `setAdminClaim` Cloud Function is not protected. Any authenticated user could theoretically call it to make themselves an admin.

### 1.2. Missing Core Functionality

*   **Hardcoded Child ID:** In `ProofSubmissionScreen.kt`, the `childId` is hardcoded (`current_child_id`). This is a **blocker** that prevents the task feature from working correctly for any real device.
*   **Missing User Notifications:** The Master user does not receive any notifications (e.g., push notifications) when a child submits a task for review or when a task is approved/rejected. This is a major UX gap.
*   **Incomplete Admin Panel:** The Admin Panel is a scaffold. The "View Details" and "Search" functionalities are not implemented, and there is no pagination for long user lists.

### 1.3. Missing Error Handling and UX

*   **ChildApp Error Handling:** The `ProofSubmissionScreen.kt` has a `TODO` for proper error handling. If an image upload fails, the user is not notified.
*   **No Loading Indicators:** The Web-Control and Admin Panel lack loading indicators, making the UI feel unresponsive when fetching data.

### 1.4. Missing Test Scenarios

*   **Security Rules:** There are no test scenarios to validate that a user *cannot* access or modify another user's data.
*   **Edge Cases:** Tests for scenarios like network failure during upload, handling of large images, or race conditions are missing.
*   **Admin Panel:** The existing test scenarios only cover the implemented scaffold, not the missing detailed views or actions.

## 2. Implementation and Hardening Plan

This plan prioritizes fixing the most critical security issues first.

### Phase 1: Security Hardening (Highest Priority)

1.  **Revamp Firestore Rules:** Rewrite `firestore.rules` from the ground up to enforce strict, user-specific access. A user should only be ableto read/write their own documents.
2.  **Protect Admin Function:** Add an authorization check to the `setAdminClaim` function to ensure only existing admins can call it.
3.  **Refactor to Firebase Auth (Long-term):** While a full refactor is a large task, the immediate step is to document this vulnerability and recommend migrating away from the `secretKey` model to standard Firebase Auth ID tokens.

### Phase 2: Implement Missing Core Logic

1.  **Implement Child ID Provider:** Create a mechanism (e.g., using SharedPreferences) to store and retrieve the actual `childId` on the device, removing the hardcoded value.
2.  **Implement Push Notifications:** Create a new Cloud Function that triggers on task status updates (`onUpdate`) and sends a Firebase Cloud Messaging (FCM) notification to the corresponding Master device.
3.  **Enhance Admin Panel:** Implement the "View Details" modal to show all of a user's data and add a basic search/filter functionality to the user list.

### Phase 3: Add Missing Tests and Finalize

1.  **Create Security Test Scenarios:** Write a new test document (`TEST_SCENARIOS_SECURITY.md`) that explicitly defines tests for validating the new, stricter Firestore Rules.
2.  **Implement ChildApp Error Handling:** Add `Toast` messages or other UI feedback in `ProofSubmissionScreen.kt` to inform the user of upload failures.
3.  **Update All Documentation:** Update the `DEPLOYMENT_GUIDE.md` and other documents to reflect the new security rules and implementation details.
