# Release-Blocker-Runbook (Deutsch)

> Stand: erstellt auf Branch `backend/autonomous-hardening`. Ziel: die **vier externen
> Release-Blocker** abarbeiten, die `npm run release:doctor` / `analyze:fertigungsstand`
> meldet. Alle Backend-Code-Gates sind grün (Build, Lint 0 Fehler, 2764 Tests,
> `npm audit` 0, Coverage über allen Schwellen) — diese vier Punkte sind **nicht im Code
> lösbar**, sondern brauchen GitHub-/Firebase-Rechte, echte Geräte und ein Zeitfenster.

**Eckdaten:** Repo `Toto241/MiniMaster` · Firebase-Projekt `minimaster-28fbd` ·
GitHub-Deploy-Workflow `.github/workflows/deploy.yml`.

**Voraussetzungen (einmalig):**
- `gh` CLI authentifiziert mit Admin-Rechten am Repo (`gh auth status`).
- Firebase-/GCP-Rechte für `minimaster-28fbd` (Service-Account-Key).
- Für Blocker 3: 1 Android-Master- + 1 Android-Kind-Gerät (oder Emulator) mit `adb`.

## Reihenfolge / Abhängigkeiten
1. **Blocker 1 (CodeQL)** zuerst — `deploy.yml` hat ein **hartes Gate** „Wait for successful
   CodeQL run on this commit"; ohne grünen CodeQL-Lauf deployt nichts.
2. **Blocker 2 (Prod-Deploy)** danach — erzeugt die Deployment-Referenz für die Evidenz.
3. **Blocker 4 (Legacy-Auth)** läuft **parallel** als 14-Tage-Beobachtung; der finale
   Flag-Schalter erfolgt über einen erneuten Deploy (Blocker 2).
4. **Blocker 3 (Commissioning)** ist unabhängig und kann jederzeit parallel laufen.

Abschluss-Check nach allen vier: `npm run release:doctor` → `hardBlockerCount: 0`.

---

## Blocker 1 — GitHub Code Scanning (CodeQL) aktivieren

**Warum:** `deploy.yml` blockiert ohne grünen CodeQL-Lauf; `fertigungsstand` verlangt
aktuelle CodeQL-Evidenz. Der Workflow `.github/workflows/codeql-analysis.yml` existiert
bereits (wöchentlich + push auf `main`), Code Scanning ist aber im Repo noch nicht aktiviert.

**Schritte:**
1. Settings öffnen: `https://github.com/Toto241/MiniMaster/settings/security_analysis`
2. **Code scanning / CodeQL analysis** aktivieren.
3. Status prüfen + CodeQL anstoßen (Helfer-Skript ist vorhanden):
   ```bash
   npm run code-scanning:enable           # prüft Status, zeigt Settings-URL
   pwsh ./scripts/enable-code-scanning.ps1 -TriggerWorkflow   # löst CodeQL-Lauf aus
   ```
4. Lauf abwarten und auf grün prüfen:
   ```bash
   gh run list --repo Toto241/MiniMaster --workflow codeql-analysis.yml --limit 3
   ```

**Nachweis:** grüner CodeQL-Run-Link + Screenshot der aktivierten Einstellung.
**Verifikation:** `npm run release:doctor` → Sektion „GitHub Code Scanning" = `pass`,
Sektion „GitHub Runs" ohne fehlgeschlagenen CodeQL-Lauf.

---

## Blocker 2 — Authentifizierter Produktions-Deploy + Evidenz

**Warum:** `fertigungsstand` verlangt eine echte Deployment-Referenz aus produktiver
Runtime-Konfiguration.

**Schritte:**
1. **GitHub Secrets** setzen (Settings → Secrets and variables → Actions):
   - **`FIREBASE_SERVICE_ACCOUNT_KEY`** — *erforderlich* (JSON-Key eines Deploy-Service-Accounts).
   - Optional je nach Feature: `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`,
     `OPENAI_FALLBACK_ENABLED`, `LEGAL_POLICY_BASE_URL`, `PAIRING_LINK_BASE_URL`,
     `DISABLE_LEGACY_SECRETKEY_AUTH` (siehe Blocker 4).
   > Hinweis: fehlende optionale Secrets sind unkritisch — der Workflow nutzt Leerstring-Fallbacks.
2. Deploy über `workflow_dispatch` starten (Input `deploy_target`: `all` | `functions` |
   `firestore` | `storage` | `hosting`):
   ```bash
   gh workflow run deploy.yml --repo Toto241/MiniMaster -f deploy_target=all
   gh run watch --repo Toto241/MiniMaster   # Fortschritt verfolgen
   ```
   (Deploy-Befehle intern: `firebase deploy --only functions|firestore:rules|storage --project minimaster-28fbd`.)
3. **Deployment-Referenz festhalten** (Run-URL, Commit-SHA, Zeitstempel, Functions-Release)
   in `docs/RELEASE_EVIDENCE_REGISTER.md`.
4. Evidenzpaket exportieren:
   ```bash
   npm run evidence:release
   ```

**Nachweis:** grüner `deploy.yml`-Run + Eintrag im Evidence-Register.
**Verifikation:** `npm run release:doctor` → „Final deployment reference" nicht mehr offen.

---

## Blocker 3 — Android-Commissioning-Nachweis (Gerät/Emulator)

**Warum:** `fertigungsstand` verlangt einen End-to-End-Nachweis: Pairing, Lock/Unlock,
Sync, Task-Workflow, App-Blocking auf echter/emulierter Hardware.

**Variante A — physisch (maßgeblich):** `docs/PHYSICAL_COMMISSIONING_CHECKLIST.md` abarbeiten.
Kurzfassung:
```bash
adb install -r masterApp-release.apk     # com.minimaster.masterapp
adb install -r childApp-release.apk      # com.google.pairing
adb shell pm list packages | grep -E "(minimaster|pairing)"
```
Dann gemäß Checkliste: Master-Registrierung/Auth → Pairing-Code → Kind-Pairing →
Task anlegen/erfüllen → Lock/Unlock → Sync → App-Blocking. Screenshots/Logs je Schritt.

**Variante B — emulierte Matrix (für CI-Evidenz):**
```bash
npm run plan:android-release-matrix        # Matrix planen
npm run run:android-release-matrix:smoke   # Smoke-Profil ausführen (oder run:android-release-matrix)
npm run validate:android-release-matrix    # Evidenz validieren (--allow-dry-run)
```

**Evidenz einsammeln:**
```bash
npm run commissioning:evidence:collect
```

**Nachweis:** Evidenz-Bundle + ausgefüllte `COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md`.
**Verifikation:** `npm run release:doctor` → „Android commissioning evidence" nicht mehr offen.

---

## Blocker 4 — Legacy-Auth-Decommission (14-Tage-Fenster)

**Warum:** Der Legacy-Pfad (`masterImei + secretKey`) ist eingefroren, aber noch nicht
abgeschaltet. Erst nach **14 aufeinanderfolgenden Tagen ohne Legacy-Nutzung** darf
`DISABLE_LEGACY_SECRETKEY_AUTH=true` gesetzt werden. Details: `docs/LEGACY_AUTH_CUTOVER_PLAN.md`.

**Mechanik (bereits im Code):** Legacy-Aufrufe werden in
`legacy_auth_usage/{YYYY-MM-DD}/users/{masterId}` protokolliert. `src/cutover-monitor.ts`
(täglicher Job) setzt automatisch `config/auth.legacyAuthCutoverReady/Enabled`, sobald 14 Tage
ohne Nutzung vorliegen. Die Admin-Callable `getLegacyAuthUsageStats` liefert die Tagesstatistik
inkl. `summary.cutoverReady`.

**Schritte:**
1. Über 14 Tage hinweg Nutzung prüfen (Admin-Panel oder Callable `getLegacyAuthUsageStats`,
   Default-Fenster 14 Tage). Erwartung: `summary.totalCalls = 0` und `cutoverReady = true`.
2. Wenn `cutoverReady`: GitHub Secret **`DISABLE_LEGACY_SECRETKEY_AUTH = true`** setzen.
3. Functions neu deployen (Blocker 2, Ziel `functions`):
   ```bash
   gh workflow run deploy.yml --repo Toto241/MiniMaster -f deploy_target=functions
   ```
4. Verhalten verifizieren: Legacy-Endpunkte antworten nun ablehnend; reguläre Auth unverändert.

**Rollback:** Secret `DISABLE_LEGACY_SECRETKEY_AUTH` auf `false` setzen (oder entfernen — fehlend
verhält sich wie `false`) und Functions neu deployen.

**Nachweis:** Screenshot/Export `getLegacyAuthUsageStats` (14 Tage, 0 Calls) + Deploy mit gesetztem Flag.
**Verifikation:** `npm run release:doctor` → „Legacy secretKey/IMEI auth" nicht mehr offen.

---

## Abschluss
Nach allen vier Blockern:
```bash
npm run release:doctor          # erwartet: "hardBlockerCount": 0, "releaseReady": true
npm run release:doctor:gate     # CI-Variante (Exit 1 bei verbleibenden Blockern)
```
Erst dann ist der externe Release-Pfad frei. Die Admin-Panel-QA-Hinweise („QA-Tab als
Erst-Oberfläche behalten", „externe Gates nicht automatisch als bestanden markieren") sind
Leitplanken/Policy, keine Code-Bugs — sie bleiben als Review-Erinnerung bestehen.
