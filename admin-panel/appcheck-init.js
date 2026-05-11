/**
 * Firebase App Check Initialization for Admin Panel
 *
 * Aktiviert reCAPTCHA-v3-basiertes App Check, sobald app.js Firebase
 * initialisiert hat. Da app.js den firebase.initializeApp()-Aufruf erst
 * im DOMContentLoaded-Handler ausführt, wartet dieses Skript per Event +
 * kurzer Polling-Phase auf den Default-App.
 *
 * Konfiguration:
 * - window.MINIMASTER_APP_CHECK_SITE_KEY (Bootstrap-Dialog) oder
 * - localStorage.minimasterAppCheckSiteKey
 * Details: docs/FIREBASE_APP_CHECK_SETUP.md
 */

(function () {
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

    let activated = false;

    function tryActivate() {
        if (activated) return true;
        if (typeof firebase === "undefined" || typeof firebase.appCheck !== "function") return false;
        if (!firebase.apps || firebase.apps.length === 0) return false;
        try {
            firebase.appCheck().activate(siteKey, true);
            activated = true;
            console.log("Firebase App Check aktiviert (admin-panel).");
            return true;
        } catch (error) {
            console.error("App Check Aktivierung fehlgeschlagen:", error);
            activated = true;
            return true;
        }
    }

    if (tryActivate()) return;

    const start = Date.now();
    const intervalId = setInterval(() => {
        if (tryActivate() || Date.now() - start > 15000) {
            clearInterval(intervalId);
            if (!activated) {
                console.warn(
                    "App Check: Firebase wurde innerhalb von 15 s nicht initialisiert. " +
                    "Site-Key vorhanden, aber firebase.initializeApp() blieb aus."
                );
            }
        }
    }, 250);
})();
