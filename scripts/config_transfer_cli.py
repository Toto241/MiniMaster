"""Interaktive Firebase-/Secret-Erfassung für Start.bat.

Erfragt die wichtigsten Firebase-Web-Konfig-Felder, (optional) Secrets und die
drei Pflicht-JSON-Dateien (google-services.json fuer masterApp/childApp sowie
serviceAccountKey.json) und schreibt sie ueber die zentrale Uebertragungs-Logik
in `python_admin/app.py` an die richtigen Stellen.

Felder bzw. Pfade koennen leer gelassen werden – dann bleibt der bestehende
Wert unveraendert.

Aufruf: `python -m scripts.config_transfer_cli`
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
# python_admin/app.py erwartet Top-Level-Importe wie 'acceptance_runner';
# daher fuegen wir python_admin/ direkt in sys.path ein.
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "python_admin"))

from app import (  # type: ignore[import-not-found]  # noqa: E402
    FIREBASE_ARTIFACT_TARGETS,
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

ARTIFACT_PROMPTS: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "googleServicesMaster",
        "Pfad zu masterApp google-services.json (Package com.minimaster.masterapp)",
        ("google-services.json", "masterApp-google-services.json"),
    ),
    (
        "googleServicesChild",
        "Pfad zu childApp google-services.json (Package com.minimaster.childapp)",
        ("google-services.json", "childApp-google-services.json"),
    ),
    (
        "serviceAccountKey",
        "Pfad zu serviceAccountKey.json (Firebase-Console -> Dienstkonten)",
        ("serviceAccountKey.json", "serviceAccount.json"),
    ),
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


def _strip_quoted_path(raw: str) -> str:
    """Entfernt umschliessende Anfuehrungszeichen + Drag&Drop-Whitespace."""
    text = raw.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ("'", '"'):
        text = text[1:-1].strip()
    return text


def _candidate_artifact_paths(filenames: tuple[str, ...]) -> list[Path]:
    """Sucht typische Ablageorte nach passenden Dateien.

    Wir versuchen Downloads/, Desktop/ und den Repo-Root mit allen mitgegebenen
    Dateinamen. Treffer werden in der angetroffenen Reihenfolge zurueckgegeben.
    """
    bases: list[Path] = []
    home = Path.home()
    bases.extend([home / "Downloads", home / "Desktop", REPO_ROOT, REPO_ROOT / "setup"])
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        bases.append(Path(user_profile) / "Downloads")
    seen: set[Path] = set()
    hits: list[Path] = []
    for base in bases:
        try:
            if not base.exists():
                continue
        except OSError:
            continue
        for name in filenames:
            candidate = base / name
            if candidate.exists() and candidate not in seen:
                seen.add(candidate)
                hits.append(candidate)
    return hits


def _prompt_artifact(label: str, current_status: dict, suggestions: tuple[str, ...]) -> str:
    """Fragt nach einem Datei-Pfad fuer ein Pflicht-Artefakt."""
    if current_status.get("exists") and current_status.get("valid"):
        suffix = f" [aktuell vorhanden: {current_status.get('path')} – Enter zum Behalten]"
    elif current_status.get("exists"):
        err = current_status.get("error") or "Datei existiert, aber ungueltig"
        suffix = f" [aktuell: {err} – neuen Pfad eingeben oder Enter ueberspringen]"
    else:
        suffix = " [leer = ueberspringen]"

    hits = _candidate_artifact_paths(suggestions)
    if hits:
        print(f"  Gefundene Kandidaten ({len(hits)}):")
        for index, path in enumerate(hits, start=1):
            print(f"    [{index}] {path}")
        print("  Nummer eingeben, vollstaendigen Pfad eingeben (auch Drag&Drop) oder Enter.")

    try:
        raw = input(f"{label}{suffix}: ")
    except EOFError:
        return ""
    raw = _strip_quoted_path(raw)
    if not raw:
        return ""
    if raw.isdigit() and hits:
        idx = int(raw)
        if 1 <= idx <= len(hits):
            return str(hits[idx - 1])
    return raw


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
    artifacts_current = state.get("artifacts", {}) if isinstance(state, dict) else {}

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

    artifacts_payload: dict[str, str] = {}
    print("\n--- Pflicht-Artefakte (JSON-Dateien aus der Firebase-Console) ---")
    print("Tipp: Datei aus dem Explorer in dieses Fenster ziehen – PowerShell setzt")
    print("dann automatisch den vollstaendigen Pfad ein.")
    for key, label, suggestions in ARTIFACT_PROMPTS:
        current = artifacts_current.get(key, {}) if isinstance(artifacts_current, dict) else {}
        if not isinstance(current, dict):
            current = {}
        path_value = _prompt_artifact(label, current, suggestions)
        if path_value:
            artifacts_payload[key] = path_value

    if not firebase_payload and not env_payload and not artifacts_payload:
        print("\nKeine Werte angegeben – nichts zu übertragen.")
        return 0

    try:
        result = apply_config_transfer({
            "firebase": firebase_payload,
            "env": env_payload,
            "artifacts": artifacts_payload,
        })
    except ValueError as exc:
        print(f"\n[FEHLER] Uebertragung abgebrochen: {exc}")
        return 1

    print("\n--- Übertragen abgeschlossen ---")
    print(f"  .env-Datei:                 {result.get('envFile')}")
    written = result.get("envWritten") or []
    if written:
        print(f"  Geschriebene .env-Schlüssel: {', '.join(written)}")
    else:
        print("  Keine .env-Schlüssel geändert.")
    if result.get("adminPanelFirebaseConfigWritten"):
        print(f"  Admin-Panel Firebase-Config: {result.get('adminPanelFirebaseConfigFile')}")
    written_artifacts = result.get("artifactsWritten") or []
    if written_artifacts:
        print(f"  Geschriebene Artefakte:     {', '.join(written_artifacts)}")
    artifact_status = result.get("artifacts") or {}
    if isinstance(artifact_status, dict) and artifact_status:
        print("  Artefakt-Status:")
        for key in FIREBASE_ARTIFACT_TARGETS:
            info = artifact_status.get(key) or {}
            if not isinstance(info, dict):
                continue
            symbol = "OK   " if info.get("valid") else "FEHLT"
            print(f"    [{symbol}] {key:22s} -> {info.get('path')}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
