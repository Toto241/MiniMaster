# Code Scanning aktivieren (Issue #158)

**Status:** Workflow existiert (`.github/workflows/codeql-analysis.yml`), aber GitHub Code Scanning ist im Repository noch **nicht aktiviert**. Die API liefert HTTP 403, bis die einmalige UI-Aktivierung erfolgt ist.

## Schritte (Repo Owner, ~5 Minuten)

1. Öffne https://github.com/Toto241/MiniMaster/settings/security_analysis
2. Unter **Code security and analysis** → **Code scanning** → **Set up** oder **Enable**
3. Wähle **Default setup** (CodeQL) **oder** behalte den bestehenden Workflow `codeql-analysis.yml` (Advanced setup).
   - Bei Default setup kann GitHub den vorhandenen Workflow überschreiben — prüfen, ob `codeql-analysis.yml` (JS + Java/Kotlin) erhalten bleiben soll.
4. Prüfe **Settings → Actions → General** → Billing/Spending-Limit (laut Release Evidence Register oft Blocker).
5. Nach Aktivierung manuell ausführen:
   ```powershell
   gh workflow run codeql-analysis.yml --repo Toto241/MiniMaster
   gh run list --repo Toto241/MiniMaster --workflow codeql-analysis.yml --limit 5
   ```
6. Optional per API (nach UI-Aktivierung):
   ```powershell
   gh api -X PATCH repos/Toto241/MiniMaster/code-scanning/default-setup -f state=configured
   ```

## Akzeptanzkriterien (Issue #158)

- [ ] Code Scanning in Repository Settings aktiv
- [ ] Mindestens ein erfolgreicher CodeQL-Run (JavaScript + Java/Kotlin)
- [ ] SARIF-Upload in Security-Tab sichtbar
- [ ] `docs/RELEASE_EVIDENCE_REGISTER.md` mit Run-Link aktualisiert

## Verwandte Blocker

- GitHub Actions Billing/Spending-Limit (siehe `docs/RELEASE_EVIDENCE_REGISTER.md` §5)
- Android CI ebenfalls von Billing betroffen
