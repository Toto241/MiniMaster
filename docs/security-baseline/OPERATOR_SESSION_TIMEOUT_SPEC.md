# Operator Session-Timeout & Re-Auth Specification

> **Status:** Draft v0.2 — AP-N3 (Web-/Desktop-Sicherheitsbasis)
> **Scope:** `admin-panel`, `parent-panel`, `child-panel`, `web-control`

## Problemstellung

Operator-Zugriffe auf das Admin-Panel sind aktuell an ein Firebase Auth Session-Token gebunden, das standardmäßig unbegrenzt gültig bleibt (bis zum expliziten Logout oder Token-Revocation). Bei verlassenen Browser-Sessions oder gestohlenen Geräten entsteht ein Risiko.

## Ziel

Einführung einer **Session-Idle-Timeout**-Logik mit erzwungener Re-Authentifizierung für privilegierte Aktionen.

---

## 1. Session-Tier-Modell

| Tier | Gültigkeit | Aktionen | Re-Auth erforderlich |
|------|-----------|----------|---------------------|
| **T1 — Idle** | 15 Min Inaktivität | Dashboard ansehen, Listen lesen, Logs browsen | Nein |
| **T2 — Active** | Bis zu 8h bei Aktivität | Device-Details, Task-Listen, Support-Tickets lesen | Bei Ablauf |
| **T3 — Privileged** | Max 2h seit Login | Subscription-Änderungen, User-Reset, Recovery-Token-Rotation, Config-Änderungen | **Immer vor Aktion** |
| **T4 — Critical** | Max 30 Min seit Login | `resetAllAuthUsers`, `deleteUserAccount`, Operator-Config-Deploy | **Immer + 2FA/Admin-PIN** |

---

## 2. Implementierungsplan

### Phase 1 — Client-Seitiges Idle-Tracking (admin-panel)

**Deliverable:** `admin-panel/modules/core/session-manager.js`

- **`lastActivityAt`** — Timestamp der letzten Nutzerinteraktion (mousemove, keydown, click, touch)
- **`sessionTier`** — Aktueller Tier-Level (T1–T4)
- **`tierPromotion()`** — Hebt Tier bei expliziter Re-Auth an
- **`checkIdle()`** — Wird alle 60s geprüft:
  - T1 → nach 15min Idle: Warn-Banner "Session abgelaufen — bitte neu anmelden"
  - T2 → nach 8h: Auto-Logout
  - T3/T4 → nach 2h/30min: Auto-Logout + Banner

**UI-Komponenten:**
- `SessionExpiryBanner` — Top-Banner mit Countdown (5 Minuten vor Ablauf)
- `ReAuthModal` — Passwort-Eingabe zur Tier-Promotion
- `LogoutButton` — Sofort-Logout

### Phase 2 — Server-Seitiges Action-Gating (Cloud Functions)

**Deliverable:** Erweiterung `src/shared.ts` — `requireTier(context, minTier, actionName)`

- Extrahiert `sessionAgeMinutes` aus Firebase Auth Token Metadata (`auth_time` Claim)
- Prüft gegen Mindest-Tier
- Bei T4: Prüft zusätzlich Admin-PIN/2FA-Claim (`admin_verified_at`)

**Betroffene Functions:**
- `resetAllAuthUsers` → T4
- `resetOperatorAccounts` → T4
- `deleteUserAccount` → T4
- `setAdminClaim` → T3
- `revokeUserTokens` → T3
- `updateKnowledgeBase` → T3
- `executeAutoFix` → T3

### Phase 3 — Admin-PIN / 2FA-Verification

**Deliverable:** `src/auth.ts` — `verifyAdminPin(context, pin)`

- Admin-PIN wird bei `createOperatorAccessKey` / `bootstrapFirstAdmin` gesetzt
- Gespeichert in Firestore `operatorConfig/adminPin` (gehashed, scrypt)
- T4-Aktionen verlangen PIN-Eingabe im Admin-Panel
- Bei korrekter Eingabe: `admin_verified_at` Claim für 30 Minuten

---

## 3. Session-Manager Code-Skizze

```javascript
// admin-panel/modules/core/session-manager.js
const SESSION_CONFIG = {
  T1_IDLE_MINUTES: 15,
  T2_MAX_HOURS: 8,
  T3_MAX_HOURS: 2,
  T4_MAX_MINUTES: 30,
  WARNING_MINUTES_BEFORE: 5,
};

class SessionManager {
  constructor() {
    this.lastActivityAt = Date.now();
    this.currentTier = 'T2'; // Default after login
    this.warningShown = false;
    this.initListeners();
    this.startIdleCheck();
  }

  initListeners() {
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, () => this.recordActivity(), { passive: true });
    });
  }

  recordActivity() {
    this.lastActivityAt = Date.now();
    this.warningShown = false;
  }

  checkIdle() {
    const idleMinutes = (Date.now() - this.lastActivityAt) / 60000;
    
    if (idleMinutes >= SESSION_CONFIG.T1_IDLE_MINUTES) {
      this.showExpiryBanner('Session abgelaufen — bitte neu anmelden');
      this.logout();
      return;
    }

    const sessionAgeMinutes = this.getSessionAgeMinutes();
    
    if (this.currentTier === 'T2' && sessionAgeMinutes >= SESSION_CONFIG.T2_MAX_HOURS * 60) {
      this.showExpiryBanner('Session abgelaufen — 8-Stunden-Limit erreicht');
      this.logout();
      return;
    }

    const warningThreshold = (this.getTierMaxMinutes() - SESSION_CONFIG.WARNING_MINUTES_BEFORE);
    if (sessionAgeMinutes >= warningThreshold && !this.warningShown) {
      this.showWarningBanner();
      this.warningShown = true;
    }
  }

  async promoteToTier(targetTier) {
    const user = firebase.auth().currentUser;
    if (!user) return false;
    
    try {
      const credential = firebase.auth.EmailAuthProvider.credential(
        user.email, 
        await this.promptForPassword()
      );
      await user.reauthenticateWithCredential(credential);
      
      this.currentTier = targetTier;
      this.tierGrantedAt = Date.now();
      return true;
    } catch (e) {
      return false;
    }
  }

  getSessionAgeMinutes() {
    const authTime = firebase.auth().currentUser?.metadata?.lastSignInTime;
    return authTime ? (Date.now() - new Date(authTime).getTime()) / 60000 : 0;
  }

  getTierMaxMinutes() {
    const map = { T1: 15, T2: 8*60, T3: 2*60, T4: 30 };
    return map[this.currentTier] || 8*60;
  }

  startIdleCheck() {
    setInterval(() => this.checkIdle(), 60000);
  }

  showExpiryBanner(message) { /* DOM manipulation */ }
  showWarningBanner() { /* DOM manipulation with countdown */ }
  logout() { /* call global logout() */ }
  async promptForPassword() { /* modal prompt */ }
}

window.sessionManager = new SessionManager();
```

---

## 4. Rollout-Plan

| Phase | Dauer | Deliverables | Tests |
|-------|-------|-------------|-------|
| 1 | 1 Tag | `session-manager.js`, Idle-Check, Banner, Auto-Logout | Unit-Tests (Mock-Time), UI-Tests |
| 2 | 1–2 Tage | `requireTier()` in `shared.ts`, Function-Gating | Auth-Tests, Integration-Tests |
| 3 | 2–3 Tage | Admin-PIN-Setup, `verifyAdminPin()`, 2FA-Claim | Security-Tests, PIN-Brute-Force-Protection |

---

## 5. Risiken & Mitigation

| Risiko | Mitigation |
|--------|-----------|
| Session-Timeout zu aggressiv → Operator-Frustration | T2 = 8h (arbeitstag-typisch), T1-Warnung 5 Min vor Ablauf |
| PIN-Brute-Force | Rate-Limiting (5 Versuche / 15 Min) via `checkRateLimit()` |
| Token-Replay nach Theft | Short-lived T3/T4 + Re-Auth-Pflicht |
| Mobile Touch → Falsch-Logout | Touch-Events zählen als Aktivität |

---

## 6. Akzeptanzkriterien

- [x] Nach 15 Min Inaktivität im Admin-Panel: Auto-Logout + Banner *(Phase 1 — `session-manager.js`)*
- [x] Nach 8h Session-Dauer: Auto-Logout (unabhängig von Aktivität) *(Phase 1)*
- [x] T3-Aktionen zeigen Re-Auth-Modal vor Ausführung *(Dashboard-Gates + Server-Tier)*
- [x] T4-Aktionen zeigen Re-Auth-Modal + PIN-Eingabe *(Phase 3 — `verifyAdminPin`, Session-Manager)*
- [x] Admin-PIN kann im Operator-Setup-Tab gesetzt/geändert werden
- [x] Session-Timeout-Verhalten ist überall konsistent (admin-panel, web-control, parent-panel) *(Master-Panels: 15 Min Idle + 8h Limit via `shared-ui-session-manager.js`)*
- [x] Server-seitiges Action-Gating via `requireTier()` für kritische Cloud Functions *(Phase 2)*
- [x] Tests decken Timeout-Pfade und Re-Auth-Flows ab *(Unit-Tests Phase 1/2)*

---

*Phase 1–3 umgesetzt (2026-05-31). Offen: konsistentes Session-Timeout in web-control/parent-panel.*
