# tools/ — versionierte Helper-Binaries

Dieses Verzeichnis ist die offizielle Ablage fuer externe Tools, die der
Setup-Wizard und die Admin-Server-Helper aufrufen, wenn sie nicht im PATH
verfuegbar sind. Der Konvention nach gilt:

1. **Pfad-Aufloesung** der Helfer-Wrapper (`scripts/keystore_tools.py`,
   `scripts/install_git_hooks.py`, …) versucht zuerst `shutil.which(<tool>)`
   und faellt — bei Fehlen — auf `<repo-root>/tools/<tool>` zurueck.

2. **Was hier abgelegt werden darf:**
   - Statisch gelinkte Single-File-Binaries mit klarer Lizenz (z. B. eine
     `windows/`/`linux/`/`darwin/`-Untergliederung pro Architektur).
   - Skript-Wrapper, die das eigentliche System-Tool aufrufen.

3. **Was hier NICHT abgelegt werden darf:**
   - Komplette SDKs (Android SDK, JDK, gcloud CLI) — zu gross, gehoeren in
     den User-Install.
   - Binaries ohne klare Lizenz-Bedingungen.
   - Private Schluessel, Service-Account-Keys, Test-Daten – das ist Aufgabe
     der `.gitignore`.

## Aktuell genutzte externe Tools (alle aus User-Install, NICHT hier abgelegt)

| Tool | Genutzt von | Pflicht oder optional |
|---|---|---|
| `keytool` (JDK 17) | `scripts/keystore_tools.py` (SHA-1/SHA-256 aus Android-Keystores) | optional – nur fuer Android-Builds + Google-Sign-In-Setup |
| `firebase` CLI | `scripts/config_transfer_cli.py`, Wizard-CLI-Import | optional – Wizard hat Browser-Direktimport als Alternative |
| `git` | `scripts/install_git_hooks.py`, `scripts/config_snapshot.py` | Pflicht – das Repo ist ein Git-Repo |
| `node`, `npm` | Cloud-Functions-Build, ESLint, Jest | Pflicht |

## Wann hier echte Binaries ablegen?

Wenn ein User-Setup-Schritt aktuell mit *"bitte installiere Tool X"* endet
und Tool X (a) klein (< 20 MB), (b) eindeutig lizenziert und (c) plattform-
specific reproduzierbar ist, kann es hier in einer `<os>/<arch>/`-Struktur
abgelegt werden, damit `start.bat` ohne weiteren Install-Schritt durchlaeuft.

Beispiel-Struktur fuer einen hypothetischen Single-Binary-Helper:

```
tools/
  README.md
  windows/x64/<tool>.exe
  linux/x64/<tool>
  darwin/arm64/<tool>
```

Die Wrapper-Helper-Module nutzen dann denselben `_resolve_or_bundled()`-
Mechanismus wie `keystore_tools.py`.
