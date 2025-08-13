# Architecture Document

This document outlines the high-level architecture of the Mini-Master application suite.

## 1. High-Level Diagram (C4 - Context)

A context diagram should be placed here, showing the main components and their interactions:
- **Parent User** -> `masterApp`
- **Child User** -> `childApp`
- `masterApp` <-> **Firebase Backend**
- `childApp` <-> **Firebase Backend**
- **Firebase Backend** <-> **Google Play API**

## 2. Component Breakdown

### 2.1. `masterApp` (Parent App)
- **Purpose:** Allows parents to manage devices, set rules, create tasks, and review proofs.
- **Tech:** Native Android, Kotlin, Jetpack Compose, Hilt, WorkManager, Google Play Billing Library.
- **Key Screens:** Registration, Dashboard, Create Task, Review Task, Subscription.

### 2.2. `childApp` (Child App)
- **Purpose:** Enforces rules set by the parent, reports status, and allows task completion.
- **Tech:** Native Android, Kotlin, Jetpack Compose, Hilt.
- **Key Components:**
  - `RuleSyncService`: Listens for FCM messages to trigger real-time rule updates.
  - `HeartbeatWorker`: Periodically sends status updates to the backend.
  - `Accessibility Service` (to be implemented): Required for app blocking and usage monitoring.

### 2.3. Firebase Backend
- **Cloud Functions (TypeScript):** The core business logic. All client interactions are mediated through these functions. Key functions include `registerMasterDevice`, `setDeviceLocked`, `createTask`, `approveTask`, `verifyPurchase`.
- **Firestore:** NoSQL database for storing all application state (families, children, tasks, etc.). Access is locked down via security rules.
- **Firebase Storage:** Used to store photo proofs uploaded by the child app. Access is secured via storage rules.
- **Firebase Cloud Messaging (FCM):** Used to send real-time commands from the backend to the `childApp`.

## 3. Key Architectural Decisions & Patterns
- **Server-Authoritative Logic:** No business logic resides on the client. Clients send requests to Cloud Functions, which validate the request and perform the action. This enhances security.
- **Real-Time Sync via Push:** Instead of constant polling, the backend uses FCM to "wake up" the child app and command it to sync, which is efficient and fast.
- **MVVM on Android:** The Android apps use a Model-View-ViewModel architecture to separate UI from business logic.
- **Dependency Injection with Hilt:** Simplifies dependency management in both Android apps.

## 4. Data Model (Firestore)
- **`families/{familyId}`:** Top-level collection.
  - **`children/{childId}`:** Subcollection for child devices. Contains fields like `isLocked`, `fcmToken`, `lastSeen`.
    - **`tasks/{taskId}`:** Subcollection for tasks. Contains `description`, `status`, `photoUrl`, etc.

---
*This document provides a high-level overview. Detailed sequence diagrams for key flows (e.g., pairing, task approval) should be added for clarity.*