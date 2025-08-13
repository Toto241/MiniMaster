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
*This is a placeholder runbook. Expand it with more detailed monitoring queries and incident response procedures.*
