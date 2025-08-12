# Architecture Overview

This document should describe the high-level architecture of the Mini-Master application suite.

## Components

- **Parent App (`masterApp`):** Describe its responsibilities, key screens, and architecture (e.g., MVVM, Jetpack Compose).
- **Child App (`childApp`):** Describe its responsibilities, key services (e.g., Accessibility Service, FCM listener), and architecture.
- **Backend (Firebase):**
  - **Cloud Functions:** Explain the purpose of each major function and the overall serverless approach.
  - **Firestore:** Detail the data model and the collections used.
  - **Firebase Storage:** Explain the storage structure for photo proofs.

## Data Flow

- Illustrate key data flows, such as:
  - The device pairing process.
  - How a parent's action (e.g., locking the device) propagates to the child app via Cloud Functions and FCM.
  - The task completion and approval flow.

---
*This is a placeholder document. Please fill it out with detailed architectural information.*
