// Firebase Configuration Template
// Copy this file to firebase-config.js and fill in your actual Firebase project details

const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "minimaster-app.firebaseapp.com",
    projectId: "minimaster-app",
    storageBucket: "minimaster-app.firebasestorage.app",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
};

// How to get these values:
// 1. Go to Firebase Console (https://console.firebase.google.com/)
// 2. Select your project
// 3. Click on the gear icon (Project Settings)
// 4. Scroll down to "Your apps" section
// 5. Click on the web app icon or "Add app" to create a web app
// 6. Copy the configuration object

// Alternative: You can also replace the firebaseConfig object directly in app.js
// if you prefer not to use a separate configuration file.

// Security Note:
// These values are safe to include in client-side code as they are public identifiers.
// The actual security is handled by Firebase Security Rules and Functions.

// Export the configuration (if using as a module)
// window.firebaseConfig = firebaseConfig;
