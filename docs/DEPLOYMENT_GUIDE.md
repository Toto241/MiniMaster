# MiniMaster Deployment & Hardening Guide (v2)

This guide provides the necessary steps to deploy and secure the MiniMaster project, including the latest security hardening measures.

## 1. Prerequisites

1.  **Firebase Account:** You need a Firebase project.
2.  **Firebase CLI:** Ensure you have the Firebase CLI installed (`npm install -g firebase-tools`).
3.  **Code:** Clone the repository and check out the `feature/project-hardening` branch.

## 2. Firebase Project Setup

1.  **Authentication:** In the Firebase Console, go to **Authentication** -> **Sign-in method** and enable **Email/Password**.
2.  **Firestore:** Go to **Firestore Database** and create a database in **Production mode**.
3.  **Storage:** Go to **Storage** and set up a new storage bucket.

## 3. Deployment Steps

### Step 1: Deploy Firestore Security Rules

The new, secure `firestore.rules` are critical. Deploy them first.

```bash
firebase deploy --only firestore:rules
```

### Step 2: Deploy Cloud Functions

This will deploy all functions, including the new `onTaskStatusChange` for notifications and the protected `setAdminClaim`.

```bash
firebase deploy --only functions
```

### Step 3: Configure and Deploy Hosting

Your `firebase.json` file needs to be configured to host both the **Web-Control** and the **Admin Panel**.

**firebase.json:**
```json
{
  "hosting": [
    {
      "target": "web-control",
      "public": "web-control",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ]
    },
    {
      "target": "admin-panel",
      "public": "admin-panel",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": ".",
    "runtime": "nodejs16"
  }
}
```

**Deployment Command:**

```bash
firebase deploy --only hosting
```

## 4. Post-Deployment Hardening

### Step 1: Create the First Admin User

1.  In the Firebase Console, go to **Authentication** and manually create a new user with an email and password.
2.  Copy the **User UID** of this new user.
3.  Manually call the `setAdminClaim` function (e.g., from a temporary script or the Firebase Functions shell) to grant this user admin privileges. **This is a one-time manual step.**

### Step 2: Update Firebase Config

Replace the placeholder `firebaseConfig` in `admin-panel/app.js` and `web-control/app.js` with your actual Firebase project configuration keys.

## 5. ChildApp (Android) Finalization

1.  **Pairing Process:** During the pairing process, after a child device is successfully linked, you must call `ChildIdProviderImpl.setChildId()` to store the device's ID.
2.  **FCM Token:** The MasterApp needs to register for Firebase Cloud Messaging (FCM) and store the FCM token in the corresponding master document in Firestore (in a field named `fcmToken`) for notifications to work.

This guide provides the essential steps to get the project running securely. Further enhancements, such as a full migration to Firebase Auth tokens instead of the custom `secretKey` model, should be considered for long-term security.
