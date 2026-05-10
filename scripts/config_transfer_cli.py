"""Interaktive Firebase-/Secret-Erfassung für Start.bat.

Erfragt die wichtigsten Firebase-Web-Konfig-Felder und (optional) Secrets von
der Konsole und schreibt sie über die zentrale Übertragungs-Logik in `python_admin/app.py`
in die `.env` und in `admin-panel/firebase-config.js`. Felder können leer
gelassen werden, dann bleibt der bestehende Wert in `.env` unverändert.

Aufruf: `python -m scripts.config_transfer_cli`
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from python_admin.app import (  # noqa: E402  (Pfad-Setup notwendig)
    apply_config_transfer,
    load_config_transfer_state,
)


FIREBASE_PROMPTS: list[tuple[str, str]] = [
    ("apiKey", "Firebase API Key (z.B. AIzaSy...)"),
    ("authDomain", "Firebase Auth Domain (z.B. <projekt>.firebaseapp.com)"),
    ("projectId", "Firebase Project ID"),
    ("storageBucket", "Firebase Storage Bucket"),
    ("messagingSenderId", "Messaging Sender ID"),
    ("appId", "Firebase App ID (z.B. 1:123:web:abc)"),
    ("measurementId", "Measurement ID (optional, leer lassen für überspringen)"),
    ("appCheckSiteKey", "App Check reCAPTCHA Site Key (optional)"),
]

ENV_PROMPTS: list[tuple[str, str]] = [
    ("GEMINI_API_KEY", "GEMINI_API_KEY (optional, leer lassen für überspringen)"),
    ("OPENAI_API_KEY", "OPENAI_API_KEY (optional)"),
    ("APPLE_BUNDLE_ID", "APPLE_BUNDLE_ID (optional)"),
]


def _prompt(label: str, current: str) -> str:
    if current:
        suffix = f" [aktuell: {current}]"
    else:
        suffix = " [leer = nicht ändern]"
    try:
        raw = input(f"{label}{suffix}: ")
    except EOFError:
        return ""
    return raw.strip()


def main() -> int:
    print("=" * 72)
    print("MiniMaster – Firebase- & Secret-Konfiguration übertragen")
    print("=" * 72)
    print(
        "Eingaben werden in .env (Repo-Stamm) und admin-panel/firebase-config.js\n"
        "geschrieben. Felder einfach leer lassen, um den bestehenden Wert\n"
        "unverändert zu lassen.\n"
    )

    state = load_config_transfer_state()
    firebase_current = state.get("firebase", {}) if isinstance(state, dict) else {}
    env_current = state.get("env", {}) if isinstance(state, dict) else {}

    firebase_payload: dict[str, str] = {}
    print("--- Firebase-Web-Konfiguration ---")
    for key, label in FIREBASE_PROMPTS:
        current = str(firebase_current.get(key, "")) if isinstance(firebase_current, dict) else ""
        new_value = _prompt(label, current)
        if new_value:
            firebase_payload[key] = new_value

    env_payload: dict[str, str] = {}
    print("\n--- Optionale Secrets / Umgebungsvariablen ---")
    for key, label in ENV_PROMPTS:
        current = str(env_current.get(key, "")) if isinstance(env_current, dict) else ""
        new_value = _prompt(label, current)
        if new_value:
            env_payload[key] = new_value

    if not firebase_payload and not env_payload:
        print("\nKeine Werte angegeben – nichts zu übertragen.")
        return 0

    result = apply_config_transfer({"firebase": firebase_payload, "env": env_payload})
    print("\n--- Übertragen abgeschlossen ---")
    print(f"  .env-Datei:                 {result.get('envFile')}")
    written = result.get("envWritten") or []
    if written:
        print(f"  Geschriebene .env-Schlüssel: {', '.join(written)}")
    else:
        print("  Keine .env-Schlüssel geändert.")
    if result.get("adminPanelFirebaseConfigWritten"):
        print(f"  Admin-Panel Firebase-Config: {result.get('adminPanelFirebaseConfigFile')}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
