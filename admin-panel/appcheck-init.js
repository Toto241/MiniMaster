/**
 * Firebase App Check Initialization for Admin Panel
 * 
 * This file provides an example of how to initialize Firebase App Check
 * in the Admin Panel application.
 * 
 * To enable App Check:
 * 1. Add the App Check SDK to index.html:
 *    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check-compat.js"></script>
 * 
 * 2. Include this file in index.html:
 *    <script src="appcheck-init.js"></script>
 * 
 * 3. Enable reCAPTCHA v3 in Firebase Console:
 *    - Go to Build > App Check
 *    - Register your web app
 *    - Select reCAPTCHA v3 as the provider
 *    - Get your reCAPTCHA site key
 * 
 * 4. Replace 'YOUR_RECAPTCHA_V3_SITE_KEY' below with your actual site key
 * 
 * For more details, see docs/FIREBASE_APP_CHECK_SETUP.md
 */

(function() {
    // Wait for Firebase to be initialized
    if (typeof firebase === 'undefined') {
        console.error('Firebase is not loaded. Make sure to include Firebase SDK before App Check.');
        return;
    }

    // Initialize App Check
    try {
        const appCheck = firebase.appCheck();
        
        // Activate App Check with reCAPTCHA v3
        appCheck.activate(
            'YOUR_RECAPTCHA_V3_SITE_KEY', // Replace with your actual reCAPTCHA site key
            true // Use reCAPTCHA v3
        );
        
        console.log('✅ Firebase App Check initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase App Check:', error);
    }
})();
