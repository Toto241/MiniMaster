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
    const globalSiteKey = typeof window !== "undefined" ? window.MINIMASTER_APP_CHECK_SITE_KEY : null;
    let storageSiteKey = null;
    try {
        storageSiteKey = typeof localStorage !== "undefined"
            ? localStorage.getItem("minimasterAppCheckSiteKey")
            : null;
    } catch (storageError) {
        // localStorage kann in privaten Modi / strikten CSPs werfen
        console.warn("App Check: Zugriff auf localStorage nicht möglich:", storageError);
    }
    const siteKey = globalSiteKey || storageSiteKey;

    if (!siteKey) {
        console.info(
            "App Check inaktiv: Kein reCAPTCHA-Site-Key konfiguriert. " +
            "Setze window.MINIMASTER_APP_CHECK_SITE_KEY (z. B. via Bootstrap-Dialog) oder " +
            "localStorage.minimasterAppCheckSiteKey. Details: docs/FIREBASE_APP_CHECK_SETUP.md"
        );
        return;
    }

    if (typeof firebase === "undefined") {
        console.error("App Check: Firebase Compat-SDK nicht geladen – Skript-Reihenfolge in index.html prüfen.");
        return;
    }

    if (typeof firebase.appCheck !== "function") {
        console.error(
            "App Check: firebase.appCheck() nicht verfügbar. " +
            "firebase-app-check-compat.js fehlt im <head>."
        );
        return;
    }

    try {
        const appCheck = firebase.appCheck();
        appCheck.activate(siteKey, true);
        console.log("Firebase App Check aktiviert (admin-panel).");
    } catch (error) {
        console.error("App Check Aktivierung fehlgeschlagen:", error);
    }
})();
