# Firebase App Check Setup Guide

Firebase App Check helps protect your backend resources from abuse by ensuring that requests to your backend services originate from your authentic app. This guide provides instructions for setting up App Check in the MiniMaster project.

## What is Firebase App Check?

Firebase App Check works with platform-specific attestation providers to verify that requests come from your app and not from unauthorized third parties. It can protect:

*   **Cloud Functions:** Prevent unauthorized function calls.
*   **Firestore:** Ensure database access comes from legitimate clients.
*   **Storage:** Protect file uploads and downloads.

## Implementation Steps

### Step 1: Enable App Check in Firebase Console

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project.
3.  Navigate to **Build** → **App Check**.
4.  Click **Get Started**.
5.  Register your apps:
    *   **For Android (ChildApp and MasterApp):**
        *   Select **Play Integrity** as the provider (recommended for production).
        *   For development, you can use **Debug** provider.
    *   **For Web (Web-Control and Admin Panel):**
        *   Select **reCAPTCHA v3** or **reCAPTCHA Enterprise**.

### Step 2: Add App Check SDK to Android Apps

1.  **Add the dependency** to `build.gradle` (app-level):
    ```gradle
    dependencies {
        // ... other dependencies
        implementation 'com.google.firebase:firebase-appcheck-playintegrity:17.1.1'
        // For debug builds:
        debugImplementation 'com.google.firebase:firebase-appcheck-debug:17.1.1'
    }
    ```

2.  **Initialize App Check** in your `Application` class or `MainActivity`:
    ```kotlin
    import com.google.firebase.FirebaseApp
    import com.google.firebase.appcheck.FirebaseAppCheck
    import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
    
    class MyApplication : Application() {
        override fun onCreate() {
            super.onCreate()
            FirebaseApp.initializeApp(this)
            val firebaseAppCheck = FirebaseAppCheck.getInstance()
            firebaseAppCheck.installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            )
        }
    }
    ```

3.  **For debug builds**, use the debug provider:
    ```kotlin
    import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
    
    firebaseAppCheck.installAppCheckProviderFactory(
        DebugAppCheckProviderFactory.getInstance()
    )
    ```

### Step 3: Add App Check SDK to Web Apps

1.  **Add the SDK** to `admin-panel/index.html` and `web-control/index.html`:
    ```html
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check-compat.js"></script>
    ```

2.  **Initialize App Check** in `app.js`:
    ```javascript
    // After firebase.initializeApp(firebaseConfig);
    const appCheck = firebase.appCheck();
    appCheck.activate(
        'YOUR_RECAPTCHA_V3_SITE_KEY', // Get this from Firebase Console
        true // Use reCAPTCHA v3
    );
    ```

### Step 4: Enforce App Check in Cloud Functions

By default, App Check is not enforced. To require App Check tokens:

1.  **Update Cloud Functions** to check for App Check tokens:
    ```typescript
    import { onCall, HttpsError } from "firebase-functions/v2/https";
    
    export const myFunction = onCall(
        { enforceAppCheck: true }, // Enforce App Check
        async (request) => {
            // Your function logic
        }
    );
    ```

2.  **For existing v1 functions**, you can manually check the token:
    ```typescript
    export const myFunction = functions.https.onCall(async (data, context) => {
        if (context.app === undefined) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'The function must be called from an App Check verified app.'
            );
        }
        // Your function logic
    });
    ```

### Step 5: Enforce App Check in Firestore Rules

Update your `firestore.rules` to require App Check:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Require App Check for all requests
    match /{document=**} {
      allow read, write: if request.auth != null && request.app.token != null;
    }
  }
}
```

## Testing

1.  **Debug Mode:** During development, use the debug provider to get debug tokens.
2.  **Production:** Ensure Play Integrity and reCAPTCHA are properly configured before deploying to production.

## Important Notes

*   **Gradual Rollout:** Start with monitoring mode (don't enforce) to ensure your apps are correctly configured.
*   **Metrics:** Monitor App Check metrics in the Firebase Console to detect issues.
*   **Replay Protection:** App Check tokens are short-lived and can't be reused, providing strong protection against replay attacks.

By implementing Firebase App Check, you significantly reduce the risk of abuse and unauthorized access to your backend resources.
