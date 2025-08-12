# Security Policy

This document outlines the security policies and considerations for the Mini-Master project.

## Authentication

- **Parent App:** Describe how the parent app authenticates with the backend (e.g., using its registered IMEI and a secret key).
- **Child App:** Describe how the child app authenticates its calls (e.g., sending its unique IMEI).

## Authorization

- **Firestore Rules:** The `firestore.rules` are configured to be "server-only," meaning no direct client access is allowed. All database interactions are mediated by Cloud Functions.
- **Cloud Functions:** Each function performs checks to ensure the caller is authorized to perform the requested action (e.g., a parent can only control their own child's device).

## Data Storage & Privacy

- **Sensitive Data:** The `masterImei` and `secretKey` are stored locally on the parent's device using Android's DataStore.
- **Data in Transit:** All communication with Firebase services is encrypted via TLS.
- **DSGVO/GDPR:** Specify the Firebase project region (e.g., `europe-west1`) to comply with data residency requirements.

## Vulnerability Reporting

- Please report any security vulnerabilities to [EMAIL_ADDRESS].

---
*This is a placeholder document. Please fill it out with a comprehensive security policy.*
