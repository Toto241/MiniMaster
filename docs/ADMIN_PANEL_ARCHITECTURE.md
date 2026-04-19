# MiniMaster Admin Panel Architecture and Security Concept

## 1. Goal
To create a secure, functional, and maintainable web-based Admin Panel for MiniMaster operators, enabling user management, subscription monitoring, and key statistics viewing.

## 2. Technology Stack
*   **Frontend:** HTML, CSS, JavaScript (Single Page Application structure).
*   **Backend/Database:** Firebase (Firestore, Authentication, Cloud Functions).
*   **Hosting:** Firebase Hosting (Free Tier / Spark Plan).

## 3. Security Concept (Crucial for Admin Panel)

The Admin Panel must not rely on simple password protection or shared secrets. It must leverage Firebase Authentication with a specific authorization layer.

### 3.1. Operator Authentication
1.  **Firebase Authentication:** Operators will log in using standard Firebase Email/Password authentication.
2.  **Custom Claims for Authorization:** After successful login, a Cloud Function will check if the authenticated user's UID is listed in a secure `operators` collection (or a hardcoded list in the function).
3.  If authorized, the function will mint a **Custom Claim** on the user's Firebase Auth Token, e.g., `role: 'admin'`.
4.  The Admin Panel frontend will check for this `role: 'admin'` claim upon loading to grant access.

### 3.2. Data Access Control (Firestore Security Rules)
All data access from the Admin Panel will be governed by strict Firestore Security Rules.

```firestore
service cloud.firestore {
  match /databases/{database}/documents {
    // Only users with the 'admin' custom claim can read/write the entire database
    match /{document=**} {
      allow read, write: if request.auth.token.role == 'admin';
    }
  }
}
```
*Note: This is a simplified rule. A more granular rule might be needed for specific collections.*

### 3.3. API Access Control (Cloud Functions)
All Cloud Functions used by the Admin Panel (e.g., `getUsers`, `revokeSubscription`) must verify the `admin` claim in the context.

```typescript
exports.getUsers = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // 2. Authorization Check (Custom Claim)
    if (context.auth.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only operators can access this data.');
    }

    // ... function logic ...
});
```

## 4. Functional Requirements

### 4.1. User Management
*   **Overview:** Display total number of users (Masters and Children).
*   **Search/Filter:** Ability to search users by email (Master) or device ID (Child).
*   **Actions:** View user details, manually revoke subscription (calls a secure Cloud Function).

### 4.2. Subscription Monitoring
*   **Statistics:** Total active subscriptions, monthly recurring revenue (MRR - simplified estimate).
*   **List:** List of currently active premium users.
*   **Status Check:** Ability to manually trigger a subscription status check for a specific user.

### 4.3. Key Statistics
*   Total paired devices.
*   Total tasks assigned (since feature launch).
*   Task completion rate (Approved / Submitted).

## 5. Implementation Plan (Frontend)
1.  Create a new directory `MiniMaster/admin-panel/`.
2.  Implement a simple login page using Firebase Auth.
3.  Implement the main dashboard, conditionally rendered based on the `admin` claim.
4.  Use Firebase SDK to fetch data (protected by the new Firestore Rules).
5.  Implement UI components for data display and management actions.

## 6. Aktueller Funktionsumfang (Stand 2026-04)

Die Abschnitte 1–5 beschreiben den ursprünglichen Entwurf. Das tatsächlich produktive Operator-Panel ist seitdem deutlich gewachsen. Diese Sektion dokumentiert den realen Stand auf Basis von [admin-panel/index.html](../admin-panel/index.html), [admin-panel/app.js](../admin-panel/app.js), [admin-panel/logs.js](../admin-panel/logs.js) und [firestore.rules](../firestore.rules).

### 6.1 Rollen & Auth
- **Firebase Email/Password Login** mit Custom-Claim-basierter RBAC. Drei Rollen: `admin`, `support`, `auditor`. UI-Restriktionen werden clientseitig per `applyRoleRestrictions()` durchgesetzt; Backend-Enforcement liegt zusätzlich in [src/auth.ts](../src/auth.ts).
- **Operator-Bootstrap-Dialog** (`bootstrapFirstAdmin`, `redeemOperatorAccessKey`) – einmaliger Self-Service-Pfad zur Initialerstellung des ersten Admin-Accounts via vorgenerierten Access-Key.
- **Inaktivitäts-Logout** nach 30 min ohne Interaktion (Session-Timer in [admin-panel/app.js](../admin-panel/app.js)).
- **Recovery-Pfad** für gesperrte/verlorene Operator-Accounts (`resetAllAuthUsers`, `resetAllAuthUsersHealth`, `resetOperatorAccounts`) – in Production über Env-Flags (`ENABLE_OPERATOR_ACCOUNT_RESET`, `ADMIN_RECOVERY_TOKEN`) hart abgesichert.

### 6.2 App Check Integration
- `firebase-app-check-compat.js` + [admin-panel/appcheck-init.js](../admin-panel/appcheck-init.js) liefern reCAPTCHA-v3-basierte Token-Validierung.
- Site-Key wird via `window.MINIMASTER_APP_CHECK_SITE_KEY` (Bootstrap) oder `localStorage.minimasterAppCheckSiteKey` gesetzt. Ohne Site-Key bleibt App Check inaktiv (klare Konsolen-Diagnose).

### 6.3 Funktionale Bereiche (Top-Level-Tabs)
| Bereich | Zweck | Wichtigste Backend-Endpunkte |
|---|---|---|
| **Operator-Cockpit** | P0-Übersicht, Health-Check, AI-Analyse von Tickets/Errors | `adminHealthCheck`, `aiExplainProblem`, `analyzeSystemErrors`, `executeAutoFix` |
| **Support-Tickets** | Ticket-Verwaltung mit Debug-Snapshot | `getTicketUserData`, `grantSupportAccess`*, `analyzeWithDebugData`* |
| **User-Management** | Master-/Child-Liste, Detailansicht, Sperren/Löschen | `setUserRole`, `setAdminClaim`, `revokeUserTokens`, `deleteUserAccount`, `exportUserData`, `revokeSubscription` |
| **Operator-Verwaltung** | Operator-Access-Keys erzeugen/einlösen, Rollen pflegen | `createOperatorAccessKey`, `redeemOperatorAccessKey`, `setUserRole` |
| **QA-Dashboard** | 10 Sektionen: Catalog, History, Evidence, **Self-Healing**, Register, QA-Platform, Emulators, Suites, Suite-History, Devices | `loadPythonAutomationCatalog`, `loadQaSelfHealingStatus`, `loadTestingRegister`, `loadEmulatorLabOverview`, `loadSuiteCatalog`, … |
| **QA Release Workspace** | fokussierte Leitstandsansicht für Release-Blocker, Queue, Emulatorstatus, Agenten-Synthese und Copy-/Issue-Formate | `loadQaReleaseWorkspace`, `/api/qa/release-workspace`, `startSuiteRun`, `openPythonAutomationProtocol` |
| **Commissioning** | Inbetriebnahme-Katalog, Run, Evidence-Historie | REST `/api/commissioning/{catalog,run,history,evidence}` (Python-Operator) |
| **Compliance / Legal** | Aktive Policies, Re-Consent-Trigger | `getActiveLegalPolicies`, `needsLegalReconsent`, `publishLegalPolicy`, `markLegalReconsentRequired` |
| **Knowledge Base** | AI-Wissensbasis pflegen + Gemini-Verbindungstest | `getKnowledgeBase`, `updateKnowledgeBase`, `testGeminiConnection` |
| **System-Tools** | FCM-Test, Scheduled-Jobs manuell auslösen | `sendTestFcmMessage`, `triggerScheduledJob` |
| **Audit-Logs** ([logs.html](../admin-panel/logs.html)) | Filter-/Pagination-fähige Audit-Log-Ansicht mit PII-Masking | direkter Firestore-Zugriff auf `audit_logs` (Rules-gesichert) |

\* Backend-Endpunkte vorhanden, UI-Anbindung im Admin-Panel noch nicht produktiv (siehe Finding F1).

### 6.4 PWA / Offline
- [admin-panel/manifest.webmanifest](../admin-panel/manifest.webmanifest): vollständige PWA-Manifest-Felder (`id`, `scope`, `lang`, `dir`, `description`, `orientation`).
- [admin-panel/service-worker.js](../admin-panel/service-worker.js): Cache-Version `v3`, Network-First für Same-Origin, `/api/*` durchgereicht, Offline-Fallback auf `index.html`.
- [admin-panel/pwa-register.js](../admin-panel/pwa-register.js): Update-Banner mit User-Bestätigung („Jetzt aktualisieren / Später") statt blindem Reload.

### 6.5 Sicherheit (aktueller Stand)
- **CSP** (siehe [firebase.json](../firebase.json) Hosting-Header): strikt mit `script-src 'self' https://www.gstatic.com`, **ohne** `'unsafe-inline'` für Skripte. Inline-Event-Handler (`onclick="…"`) im HTML sind eine offene Migrations-Schuld (Finding F6).
- **innerHTML-Hygiene** wird durch automatisierte Tests ([test/admin-panel-app-security.test.ts](../test/admin-panel-app-security.test.ts), [test/admin-panel-logs-security.test.ts](../test/admin-panel-logs-security.test.ts)) für ausgewählte QA-Render-Helfer durchgesetzt. Punktuelle `innerHTML`-Nutzung in app.js bleibt für andere Pfade (Finding F7).
- **PII-Masking** im Audit-Log-Detail-Modal (default maskiert, Opt-in-Toggle) – siehe [admin-panel/logs.js](../admin-panel/logs.js).
- **SRI** ist für die Firebase-CDN-Bundles gesetzt; für `firebase-app-check-compat.js` steht der SRI-Hash noch aus (TODO-Marker im HTML).

### 6.6 Test-Harness
- [test/utils/admin-panel-test-harness.ts](../test/utils/admin-panel-test-harness.ts) instanziiert `app.js` in einer VM-Sandbox und stellt `createMockElement` für DOM-mutierende Render-Funktionen bereit.
- Render-Funktionen, die `appendChild` nutzen (z. B. `renderQaRefreshStatus`), benötigen in Tests echte Mock-Elemente via `context.document.createElement('div')`. Reine `innerHTML`-Senken (`{ innerHTML: "" }`) reichen nur für stringbasierte Render-Pfade.

### 6.7 Bekannte offene Punkte
- **F1** – UI-Anbindung der Backend-Endpunkte `grantSupportAccess`, `revokeSupportAccess`, `grantDebugAccess`, `analyzeWithDebugData`.
- **F6** – Inline-`onclick`/`style` in [admin-panel/index.html](../admin-panel/index.html) auf `addEventListener`-Pattern migrieren (CSP-Konformität).
- **F7** – Verbleibende `innerHTML`-Stellen in app.js auditieren und konsequent über `escapeHtml`/`escapeHtmlText` führen.
- **App Check Site-Key** – produktive Werte müssen extern gesetzt werden (Firebase Konsole + Bootstrap-Dialog).
- **PNG/Maskable Icons** – derzeit nur SVG; für vollständige PWA-Icons sind PNG-Assets in mehreren Größen nachzuliefern.

