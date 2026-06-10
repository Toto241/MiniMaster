/*
 * Firebase configuration template for MiniMaster Web Control (Parent).
 *
 * Diese Datei dient als Vorlage. Sie wird vom Setup-Wizard
 * ('python -m scripts.config_transfer_cli' oder Admin-Panel-Button
 * "Übertragen") als firebase-config.js mit echten Werten überschrieben.
 *
 * firebase-config.js ist in .gitignore – echte API-Keys gelangen nicht
 * versehentlich ins Repository. Die Template-Datei bleibt versioniert.
 */
(function (root) {
  var firebaseConfig = {
    apiKey: 'your-api-key',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project-id',
    storageBucket: 'your-project.firebasestorage.app',
    messagingSenderId: 'your-messaging-sender-id',
    appId: 'your-app-id',
    measurementId: '',
    appCheck: {
      provider: 'reCaptchaV3',
      siteKey: ''
    }
  };
  root.__MM_FIREBASE_CONFIG__ = firebaseConfig;
  if (firebaseConfig.appCheck && firebaseConfig.appCheck.siteKey) {
    root.MINIMASTER_APP_CHECK_SITE_KEY = firebaseConfig.appCheck.siteKey;
  }
})(typeof window !== 'undefined' ? window : globalThis);
