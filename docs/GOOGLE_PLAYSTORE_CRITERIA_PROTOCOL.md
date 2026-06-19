# Google Playstore Kriterien-Protokoll

**Status:** Automatisiert prüfbar im Repo; Play-Console-Nachweise bleiben externe Release-Artefakte.  
**Primärer Gate-Befehl:** `python scripts/playstore_compliance_protocol.py --fail-on-open`  
**Admin-Panel-Gate:** `npm test -- --runInBand test/admin-panel-modules.test.ts test/admin-panel-playstore-protocol.test.ts`

## 1. Ziel

Dieses Protokoll bündelt die Kriterien, die vor einer Google-Play-Store-Einreichung für MiniMaster nachweisbar sein müssen. Es ergänzt die operativen Dokumente im Repo um einen automatisierten, in CI ausführbaren Strukturcheck.

## 2. Automatisierte Kriterien

| Kriterium | Repo-Nachweis | Automatisierte Prüfung |
| --- | --- | --- |
| Data Safety ist vorbereitet und mit Privacy-/Datenflüssen konsistent | `docs/PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md` | Marker `Data Safety`, `Data Collection`, `Play Console` |
| Sensitive Permissions Declaration ist vorbereitet | `docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md` | Marker `Accessibility`, `PACKAGE_USAGE_STATS`, `SYSTEM_ALERT_WINDOW` |
| Store Listing und IARC sind releasefähig vorbereitet | `docs/STORE_LISTING_AND_IARC_READINESS.md` | Marker `IARC`, `Store Listing`, `Privacy` |
| Reviewer-Zugang und App-Access-Ablauf sind beschrieben | `docs/APP_ACCESS_REVIEWER_GUIDE.md` | Marker `Reviewer`, `Permissions`, `Credentials` |
| Finale Einreichungsnachweise werden im Release Evidence Register geführt | `docs/RELEASE_EVIDENCE_REGISTER.md` | Marker `Evidence`, `Play`, `Release` |

## 3. Automatisierte Gates

1. `python scripts/playstore_compliance_protocol.py --fail-on-open` erzeugt `build/playstore-compliance/latest-protocol.json` und `build/playstore-compliance/latest-protocol.md` und schlägt fehl, wenn ein Repo-Kriterium offen ist.
2. `npm test -- --runInBand test/admin-panel-modules.test.ts test/admin-panel-playstore-protocol.test.ts` deckt die Admin-Panel-Helfer für Readiness, Reviewer-Guide und Protokoll-Payload ab.
3. `npm run plan:admin-qa` hält externe oder manuelle Restarbeiten im priorisierten Admin-Panel-QA-Plan sichtbar.
4. `npm run play:plan` erstellt einen lokalen Play-Console-Release-Plan fuer AABs, Package-IDs und Android-Publisher-Credentials; `npm run play:upload:internal` kann bestehende Play-Apps in den internen Track als Draft hochladen.

## 4. Manuell in der Play Console beizulegende Nachweise

Diese Punkte können nicht vollständig lokal automatisiert werden und müssen als Screenshots/Links im Release Evidence Register abgelegt werden:

- [ ] Play Console Data-Safety final submitted/reviewed Screenshot
- [ ] Sensitive permissions declaration submitted/reviewed Screenshots
- [ ] IARC certificate oder Play Console Age-Rating Screenshot
- [ ] Store listing preview Screenshot inklusive Privacy-URL und Support-Kontakt
- [ ] Reviewer App Access instructions in der Play Console hinterlegt

## 5. Bestehungskriterium

Die Google-Play-Store-Kriterien gelten aus Repo-Sicht als bestanden, wenn:

- der Protokollgenerator mit `--fail-on-open` erfolgreich läuft,
- die Admin-Panel-Playstore-Tests grün sind,
- die externen Play-Console-Nachweise im Release Evidence Register verlinkt sind,
- der Go/No-Go-Sign-off im Admin-Panel auf grün steht.
