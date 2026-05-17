#!/usr/bin/env python3
"""MiniMaster Setup-Init-Wizard.

Bootstraps die lokale Einrichtung, soweit ohne Browser-/Firebase-Konsole
moeglich:

1. Legt .env aus .env.example an (idempotent, ueberschreibt nichts).
2. Bietet 'npm install' an, falls node_modules fehlt.
3. Bietet 'npm install -g firebase-tools' an, falls firebase-CLI fehlt.
4. Bietet 'firebase login' / 'firebase use --add' an.
5. Ruft optional den Firebase-Konfig-Wizard (scripts.config_transfer_cli).
6. Schliesst mit einem Pre-Flight ab.

Alle Schritte sind opt-in (Y/n) und koennen einzeln uebersprungen werden.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env"
ENV_EXAMPLE = REPO_ROOT / ".env.example"


def _ask(prompt: str, default: bool = True, assume_yes: bool = False) -> bool:
    if assume_yes:
        return True
    suffix = " [Y/n] " if default else " [y/N] "
    try:
        raw = input(prompt + suffix).strip().lower()
    except EOFError:
        return default
    if not raw:
        return default
    return raw in ("y", "yes", "j", "ja")


def _run(cmd: list[str], cwd: Path | None = None) -> int:
    print(f"\n>>> {' '.join(cmd)}")
    try:
        return subprocess.call(cmd, cwd=str(cwd) if cwd else None)
    except FileNotFoundError as exc:
        print(f"[FEHLER] Befehl nicht gefunden: {exc}")
        return 127


def step_env(assume_yes: bool) -> bool:
    print("\n--- Schritt 1: .env anlegen ---")
    if ENV_FILE.exists():
        print(".env existiert bereits – nicht ueberschrieben.")
        return True
    if not ENV_EXAMPLE.exists():
        print("[FEHLER] .env.example fehlt – kann .env nicht anlegen.")
        return False
    if not _ask(".env aus .env.example kopieren?", True, assume_yes):
        return True
    shutil.copy(ENV_EXAMPLE, ENV_FILE)
    print(f"Erstellt: {ENV_FILE}")
    print("Hinweis: Wert-Felder sind leer – spaeter im Admin-Panel oder via "
          "'python -m scripts.config_transfer_cli' fuellen.")
    return True


def step_npm_install(assume_yes: bool) -> bool:
    print("\n--- Schritt 2: Backend-Dependencies ---")
    if (REPO_ROOT / "node_modules").is_dir():
        print("node_modules/ vorhanden – uebersprungen.")
        return True
    if not shutil.which("npm"):
        print("[WARN] npm fehlt – bitte Node.js 22 installieren.")
        return False
    if not _ask("'npm install' jetzt ausfuehren?", True, assume_yes):
        return True
    rc = _run(["npm", "install"], cwd=REPO_ROOT)
    return rc == 0


def step_firebase_cli(assume_yes: bool) -> bool:
    print("\n--- Schritt 3: Firebase CLI ---")
    if shutil.which("firebase"):
        print("firebase CLI bereits installiert.")
        return True
    if not shutil.which("npm"):
        print("[WARN] npm fehlt – Firebase CLI nicht installierbar.")
        return False
    if not _ask("'npm install -g firebase-tools' ausfuehren?", True, assume_yes):
        return True
    rc = _run(["npm", "install", "-g", "firebase-tools"])
    return rc == 0


def step_firebase_login(assume_yes: bool) -> bool:
    print("\n--- Schritt 4: Firebase Login ---")
    if not shutil.which("firebase"):
        print("[WARN] firebase CLI fehlt – Login uebersprungen.")
        return False
    rc, out = 0, ""
    try:
        proc = subprocess.run(["firebase", "login:list"], capture_output=True,
                              text=True, timeout=15)
        rc = proc.returncode
        out = proc.stdout + proc.stderr
    except Exception as exc:
        print(f"[WARN] login:list nicht ausfuehrbar: {exc}")
        return False
    if rc == 0 and "No authorized accounts" not in out and "No users" not in out:
        print("Bereits eingeloggt.")
        return True
    if not _ask("'firebase login' starten?", True, assume_yes):
        return True
    return _run(["firebase", "login"]) == 0


def step_firebase_use(assume_yes: bool) -> bool:
    print("\n--- Schritt 5: Firebase-Projekt binden ---")
    rc_file = REPO_ROOT / ".firebaserc"
    if rc_file.exists():
        try:
            import json
            data = json.loads(rc_file.read_text(encoding="utf-8"))
            default = data.get("projects", {}).get("default", "")
            if default:
                print(f".firebaserc bereits gebunden an: {default}")
                if not _ask("Trotzdem 'firebase use --add' ausfuehren?", False, assume_yes):
                    return True
        except Exception:
            pass
    if not shutil.which("firebase"):
        print("[WARN] firebase CLI fehlt – Bindung uebersprungen.")
        return False
    if not _ask("'firebase use --add' jetzt starten?", True, assume_yes):
        return True
    return _run(["firebase", "use", "--add"], cwd=REPO_ROOT) == 0


def step_config_transfer(assume_yes: bool) -> bool:
    print("\n--- Schritt 6: Firebase-/Secret-Konfiguration eintragen ---")
    if not _ask("Konfigurations-Assistent (config_transfer_cli) starten?",
                True, assume_yes):
        return True
    return _run([sys.executable, "-m", "scripts.config_transfer_cli"],
                cwd=REPO_ROOT) == 0


def step_preflight(assume_yes: bool) -> int:
    print("\n--- Schritt 7: Abschluss-Pre-Flight ---")
    return _run([sys.executable, "scripts/preflight.py"], cwd=REPO_ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Setup-Init-Wizard")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="Alle Schritte ohne Rueckfrage ausfuehren.")
    parser.add_argument("--skip-install", action="store_true",
                        help="npm install und npm install -g firebase-tools auslassen.")
    parser.add_argument("--skip-cli", action="store_true",
                        help="Firebase-CLI-bezogene Schritte (login/use) auslassen.")
    args = parser.parse_args()

    print("=" * 72)
    print("MiniMaster Setup-Init")
    print("=" * 72)
    print("Dieses Skript bringt die lokale Inbetriebnahme so weit es geht.")
    print("Externe Schritte (Firebase-Projekt anlegen, google-services.json,")
    print("serviceAccountKey.json herunterladen) muessen weiterhin im Browser")
    print("durchgefuehrt werden – das Pre-Flight am Ende zeigt, was fehlt.\n")

    step_env(args.yes)
    if not args.skip_install:
        step_npm_install(args.yes)
        step_firebase_cli(args.yes)
    if not args.skip_cli:
        step_firebase_login(args.yes)
        step_firebase_use(args.yes)
    step_config_transfer(args.yes)
    step_preflight(args.yes)

    print("\nSetup-Init abgeschlossen. Bei roten Pre-Flight-Punkten die genannten")
    print("Fixes ausfuehren und 'python scripts/preflight.py' erneut starten.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
