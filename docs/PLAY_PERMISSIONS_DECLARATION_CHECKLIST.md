# Play Permissions Declaration Checklist

**Status:** In progress; operative Vorlage vorhanden, finale Play-Console-Einreichung noch offen.

**Companion docs:** [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md), [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md), [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

## 1. Ziel

Diese Checkliste sammelt alle benoetigten Nachweise fuer die Google Play Permissions Declaration (Accessibility Service, Usage Access, Overlay) fuer MiniMaster Child App.

## 2. App-Umfang

| Feld | Wert |
| ----- | ----- |
| App | MiniMaster Child App |
| Package Name | com.google.pairing |
| Version Scope | RC-2026-03-21 |
| Owner | Compliance Owner |
| Co-Owner | Product/Ops |

## 3. Declaration Items

| Permission / API | Warum benoetigt | User Benefit | Nachweis im Repo | Play Console Status | Owner |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Accessibility Service | Erzwingung von App-Sperrregeln und Block-Overlay auf dem Child-Geraet | Eltern koennen gesperrte Apps und Regeln technisch durchsetzen | [ACCESSIBILITY_SERVICE_GUIDE.md](../ACCESSIBILITY_SERVICE_GUIDE.md), [childApp/src/](../childApp/src/) | ⬜ Not submitted | Compliance Owner |
| Usage Access (PACKAGE_USAGE_STATS) | Erkennung von App-Nutzungszeiten fuer Zeitlimits und Regelverletzungen | Zeitlimits und Nutzungsregeln funktionieren nachvollziehbar | [CHILDAPP_LOCK_LOGIC.md](CHILDAPP_LOCK_LOGIC.md), [childApp/src/](../childApp/src/) | ⬜ Not submitted | Compliance Owner |
| Draw over other apps (SYSTEM_ALERT_WINDOW) | Anzeige eines Sperr-Overlays bei blockierten Apps | Kind sieht klare Sperrbegruendung statt App-Inhalt | [ACCESSIBILITY_SERVICE_GUIDE.md](../ACCESSIBILITY_SERVICE_GUIDE.md), [childApp/src/](../childApp/src/) | ⬜ Not submitted | Compliance Owner |

### 3.1 Copy-Paste Texte fuer Play Console

Use case summary:
"MiniMaster Child App enforces parent-defined app blocking and daily usage rules for child safety and digital wellbeing. Accessibility, usage access, and overlay are only used to enforce configured restrictions and to show a clear block screen to the child."

Accessibility declaration text:
"Accessibility Service is required to detect when a blocked application is opened and immediately enforce parent-defined restrictions. The service is not used for advertising, analytics profiling, or unrelated data collection."

Usage access declaration text:
"Usage access is required to evaluate app usage duration against configured daily limits and to enforce time-based rules. Data is used solely for parental control enforcement and displayed to the parent as rule status."

Overlay declaration text:
"Draw over other apps is required to present a blocking overlay when a restricted app is launched. The overlay communicates the active rule and prevents interaction with blocked content."

Data handling note:
"Permission-related processing is limited to parental control enforcement. No permission is used for hidden behavior, ad targeting, or non-safety features."

## 4. Required Artifacts for Submission

| Artefakt | Beschreibung | Status | Link/Ort |
| ----- | ----- | ----- | ----- |
| Screencast Permissions Flow | Video: Aktivierung der Berechtigungen + echter Enforcement-Flow | ⬜ | _(to add)_ |
| Reviewer Login/App Access | Testkonto oder reproduzierbare Reviewer-Schritte | 🔄 | [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md) |
| Privacy/Disclosure Text | Klare Offenlegung in App und Store Listing | 🔄 | [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md) |
| Enforcement Proof | Nachweis: Regel gesetzt -> App blockiert | ⬜ | [PHYSICAL_COMMISSIONING_CHECKLIST.md](PHYSICAL_COMMISSIONING_CHECKLIST.md) |

## 5. Submission Steps

1. Play Console -> App Content -> Sensitive permissions.
2. Fuer jede deklarierte Permission den Zwecktext aus Abschnitt 3.1 eintragen.
3. Screencast und Reviewer-Hinweise verlinken/hochladen.
4. Submission absenden und Review-Status dokumentieren.
5. Freigabestatus in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) aktualisieren.

## 6. Submission Evidence Log

| Schritt | Nachweis | Erledigt von | Datum/Uhrzeit | Status |
| ----- | ----- | ----- | ----- | ----- |
| Accessibility eingereicht | Screenshot "Submitted" + Formularauszug | | | ⬜ |
| Usage Access eingereicht | Screenshot "Submitted" + Formularauszug | | | ⬜ |
| Overlay eingereicht | Screenshot "Submitted" + Formularauszug | | | ⬜ |
| Reviewer-Guide verlinkt | Screenshot App Access + URL | | | ⬜ |
| Review-Status dokumentiert | Ticket/Kommentar im Release Board | | | ⬜ |

## 7. Sign-Off

| Rolle | Name | Datum | Signatur |
| ----- | ----- | ----- | ----- |
| Compliance Owner | | | |
| Product/Ops | | | |
| Release Manager | | | |

## 8. Abschlusskriterium

Done erst wenn:
- Alle relevanten Permission-Eintraege in Play Console auf submitted/reviewed stehen.
- Reviewer-Artefakte verlinkt sind.
- Status in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) von offen auf erledigt gesetzt wurde.
