# Firebase Custom Auth Token Migration Guide

This guide provides a step-by-step plan to migrate the MiniMaster project from the current `secretKey`-based authentication model to Firebase Custom Auth Tokens, which is the recommended secure authentication method.

## Why Migrate?

The current authentication model uses a custom `secretKey` that is passed from the client in every Cloud Function call. This model has several security vulnerabilities:

*   **Client-Side Storage:** The `secretKey` is stored on the client device and can be extracted by an attacker.
*   **No Expiration:** The `secretKey` does not expire, meaning a compromised key can be used indefinitely.
*   **No Revocation:** There is no built-in mechanism to revoke a compromised `secretKey`.

Firebase Custom Auth Tokens address all these issues by providing short-lived, cryptographically signed tokens that can be verified server-side.

## Migration Overview

The migration involves the following steps:

1.  **Backend:** Generate custom tokens for users and update Cloud Functions to verify Firebase Auth tokens.
2.  **Client Apps:** Update the apps to authenticate with Firebase Auth using custom tokens.
3.  **Firestore Rules:** Update security rules to rely on `request.auth` instead of custom validation.

## Step 1: Backend Changes

### 1.1 Create a Custom Token Generation Function

Add a new Cloud Function that generates a custom token for a user after verifying their `secretKey`:

```typescript
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

export const generateCustomToken = functions.https.onCall(async (data: { masterImei: string; secretKey: string }, _context) => {
    const { masterImei, secretKey } = data;

    if (!masterImei || !secretKey) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDoc = await admin.firestore().collection("masters").doc(masterImei).get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
        throw new functions.https.HttpsError("unauthenticated", "Invalid credentials.");
    }

    // Generate a custom token
    const customToken = await admin.auth().createCustomToken(masterImei, {
        role: "master",
        masterImei: masterImei,
    });

    return { customToken };
});
```

### 1.2 Update Existing Cloud Functions

Update all Cloud Functions to verify Firebase Auth tokens instead of the `secretKey`:

**Before:**
```typescript
export const myFunction = functions.https.onCall(async (data: { masterImei: string; secretKey: string }, _context) => {
    const { masterImei, secretKey } = data;
    
    const masterDoc = await admin.firestore().collection("masters").doc(masterImei).get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
        throw new functions.https.HttpsError("unauthenticated", "Invalid credentials.");
    }
    
    // Function logic
});
```

**After:**
```typescript
export const myFunction = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    
    const masterImei = context.auth.uid;
    
    // Function logic
});
```

## Step 2: Client App Changes

### 2.1 MasterApp (Android)

1.  **Call the `generateCustomToken` function** after successful registration or login:
    ```kotlin
    val functions = Firebase.functions
    val data = hashMapOf(
        "masterImei" to masterImei,
        "secretKey" to secretKey
    )
    
    functions.getHttpsCallable("generateCustomToken")
        .call(data)
        .addOnSuccessListener { result ->
            val customToken = (result.data as Map<*, *>)["customToken"] as String
            signInWithCustomToken(customToken)
        }
    ```

2.  **Sign in with the custom token:**
    ```kotlin
    Firebase.auth.signInWithCustomToken(customToken)
        .addOnCompleteListener { task ->
            if (task.isSuccessful) {
                // User is now authenticated
            }
        }
    ```

3.  **Remove `secretKey` from all function calls** and rely on Firebase Auth for authentication.

### 2.2 ChildApp (Android)

Follow the same steps as the MasterApp.

### 2.3 Web-Control and Admin Panel

1.  **Call the `generateCustomToken` function** after login.
2.  **Sign in with the custom token:**
    ```javascript
    firebase.auth().signInWithCustomToken(customToken)
        .then(() => {
            // User is authenticated
        });
    ```

## Step 3: Firestore Rules Changes

Update your `firestore.rules` to rely on `request.auth` instead of custom validation:

**Before:**
```javascript
match /masters/{masterImei} {
  allow read, write: if request.auth != null;
}
```

**After:**
```javascript
match /masters/{masterImei} {
  allow read, write: if request.auth != null && request.auth.uid == masterImei;
}
```

## Step 4: Gradual Rollout

To avoid breaking existing users, implement a gradual rollout:

1.  **Deploy the new `generateCustomToken` function** without removing the old authentication logic.
2.  **Update the client apps** to use the new authentication flow.
3.  **Monitor** the usage of the old `secretKey`-based authentication.
4.  **Once all users have migrated**, remove the `secretKey` validation from Cloud Functions.

## Benefits of Migration

*   **Enhanced Security:** Tokens are short-lived and cryptographically signed.
*   **Revocation:** Tokens can be revoked by disabling the user account.
*   **Standardization:** Uses Firebase's built-in authentication system.
*   **Better Integration:** Works seamlessly with other Firebase services.

By following this guide, you can migrate to a more secure and robust authentication system.
