# GitHub Pages für Datenschutz-URL (einmalig)

Bis `https://minimaster.app/privacy` produktiv ist, kann die Play-Console-URL auf GitHub Pages zeigen:

`https://toto241.github.io/MiniMaster/privacy/`

Quelle: [PRIVACY_POLICY_DE.md](PRIVACY_POLICY_DE.md)

## Automatisch (PowerShell)

Voraussetzungen: [GitHub CLI](https://cli.github.com/) (`gh auth login`), Python 3.

```powershell
cd D:\Tools\MiniMaster
pwsh ./scripts/setup-github-pages.ps1
```

Das Skript:

1. Aktiviert Pages per API (`build_type: workflow`)
2. Setzt die Repository-Variable `PRIVACY_POLICY_URL`
3. Rendert `site/privacy/index.html` aus `docs/PRIVACY_POLICY_DE.md`
4. Startet den Workflow **Privacy-Policy Pages** und wartet auf Erfolg
5. Prüft die URL per HTTP HEAD

Optional nur lokal bauen ohne Deploy:

```powershell
python scripts/render_privacy_policy.py --build
pwsh ./scripts/setup-github-pages.ps1 -SkipWorkflow
```

## Manuell

1. https://github.com/Toto241/MiniMaster/settings/pages
2. Source: **GitHub Actions**
3. Actions → **Privacy-Policy Pages** → **Run workflow**

## Play Console

Trage in beiden App-Listings (Master + Child) dieselbe Privacy-URL ein. Später auf `https://minimaster.app/privacy` umstellen, wenn die Domain live ist.

**Hinweis:** `PRIVACY_POLICY_DE.md` ist eine technische Vorlage — vor Store-Release juristisch prüfen lassen.
