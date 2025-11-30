# MiniMaster - Quick Start Guide for New Operators

Welcome to MiniMaster! This guide will walk you through the process of setting up and deploying the MiniMaster project for the first time.

## Step 1: Clone the Repository

First, clone the MiniMaster repository to your local machine:

```bash
git clone https://github.com/Toto241/MiniMaster.git
cd MiniMaster
```

## Step 2: Install Dependencies

Install the necessary Node.js dependencies:

```bash
npm install
```

## Step 3: Set Up Your Firebase Project

1.  **Create a Firebase Project:** Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Enable Services:** Enable **Authentication**, **Firestore**, and **Storage**.
3.  **Get Service Account Key:**
    *   Go to **Project Settings** > **Service Accounts**.
    *   Click **Generate New Private Key**.
    *   Save the downloaded JSON file as `serviceAccountKey.json` in the project root.

## Step 4: Update Firebase Configuration

Run the `update-firebase-config.sh` script to update the Firebase configuration in the web apps:

```bash
./scripts/update-firebase-config.sh
```

Follow the prompts to enter your Firebase project configuration.

## Step 5: Deploy the Project

Run the `deploy.sh` script to deploy all components to Firebase:

```bash
./deploy.sh
```

This will deploy:
*   Firestore Security Rules
*   Firestore Indexes
*   Cloud Functions
*   Hosting (Web-Control & Admin Panel)

## Step 6: Create the First Admin User

Run the `setup-admin.js` script to create the first admin user:

```bash
node scripts/setup-admin.js <your-admin-email> <your-admin-password>
```

**Example:**
```bash
node scripts/setup-admin.js admin@minimaster.com MySecurePassword123
```

## Step 7: Run Security Tests

Run the automated security tests to verify your setup:

```bash
node scripts/run-security-tests.js
```

Follow the prompts to complete the tests.

## Step 8: Access Your Applications

*   **Admin Panel:** Open the Admin Panel URL provided by Firebase Hosting.
*   **Web-Control:** Open the Web-Control URL provided by Firebase Hosting.
*   **ChildApp / MasterApp:** Build and run the Android apps from Android Studio.

## Congratulations!

You have successfully deployed the MiniMaster project. For more detailed information, please refer to the documentation in the `docs/` directory.

### Key Documents

*   **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md):** Detailed deployment instructions.
*   **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md):** Recommended security enhancements.
*   **[Auth Token Migration Guide](docs/AUTH_TOKEN_MIGRATION_GUIDE.md):** Guide to migrating to Firebase Auth Tokens.
