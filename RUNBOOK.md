# Runbook / Operations Guide

This document provides instructions for operating and maintaining the Mini-Master service.

## Deploying the Service

### Deploying Cloud Functions & Rules

A CI/CD pipeline should be set up to do this automatically. For manual deployments:

1.  **Prerequisites:** Ensure you have the Firebase CLI installed and are authenticated (`firebase login`).
2.  **Deploy Functions:**
    ```bash
    firebase deploy --only functions
    ```
3.  **Deploy Firestore Rules:**
    ```bash
    firebase deploy --only firestore
    ```
4.  **Deploy Storage Rules:**
    ```bash
    firebase deploy --only storage
    ```

## Monitoring

- **Firebase Console:** The primary tool for monitoring.
  - **Functions:** Check logs for errors and execution times. Set up alerts for high failure rates.
  - **Firestore:** Monitor read/write operations and storage size.
  - **Storage:** Monitor bandwidth and storage usage.
- **Google Cloud Logging:** For more advanced log queries and analysis.

## Common Issues & Troubleshooting

- **Issue:** `childApp` does not receive FCM notifications.
  - **Checklist:**
    1.  Is the `fcmToken` correctly stored in the child's Firestore document?
    2.  Are there any errors in the `onChildDeviceUpdate` function logs in the Firebase Console?
    3.  Does the child device have a stable network connection?

- **Issue:** Purchase verification fails.
  - **Checklist:**
    1.  Are the Google API credentials (service account) for the Play Developer API correctly configured?
    2.  Is the package name in the Cloud Function identical to the one in the Play Store?
    3.  Is the purchase token valid and not expired?

---

## Standard Operating Procedures

### Core Pairing Flow

The device pairing process is the most critical user flow. It works as follows:

1.  The `masterApp` registers itself with the backend using its IMEI, receiving a `secretKey`.
2.  The `masterApp` requests a single-use `pairingToken` from the backend, authenticating with its IMEI and `secretKey`.
3.  The `pairingToken` is transferred to the child device (e.g., via QR code or manual entry).
4.  The `childApp` uses the `pairingToken` and its own IMEI to call the `validatePairingToken` backend function.
5.  If the token is valid, the backend creates a permanent link between the `masterImei` and `childImei` in Firestore.
6.  The `childApp` is now paired and begins syncing rules from the master.

### Required API Keys & Secrets

For the system to function, the following secrets must be configured in the environment where the Cloud Functions are deployed (e.g., using `firebase functions:secrets:set`):

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to the service account JSON file with access to Firebase and Google Play Developer API.
- `SOME_OTHER_API_KEY`: (Placeholder) Add any other required third-party API keys here.

### Test Accounts

For quality assurance and testing purposes, the following accounts should be used:

- **Master / Parent Account (Google Play):** `[PARENT_TEST_ACCOUNT_EMAIL]`
- **Child Account (Google Play):** `[CHILD_TEST_ACCOUNT_EMAIL]`
- **Test Subscription SKU:** `[TEST_SKU_ID]` (e.g., `test.subscription.monthly`)

---
*This is a placeholder runbook. Expand it with more detailed monitoring queries and incident response procedures.*
