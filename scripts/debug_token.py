#!/usr/bin/env python3
"""
Python HMAC-SHA256 Debug-Token-Generator für MiniMaster.

Ersetzt `generate-debug-token.ps1` vollständig.
Liest das App-Secret aus local.properties und berechnet HMAC-SHA256(secret, challenge + suffix).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SUFFIXES = {
    "master": "_ACTIVATE_MASTER",
    "child": "_ACTIVATE_CHILD",
}

PACKAGES = {
    "master": "com.minimaster.masterapp",
    "child": "com.google.pairing",
}

SECRET_KEYS = {
    "master": "debug.session.secret.master",
    "child": "debug.session.secret.child",
}


def read_local_properties(repo_root: Path | None = None) -> dict[str, str]:
    """Liest local.properties und gibt Key-Value-Paare zurück."""
    props_path = (repo_root or REPO_ROOT) / "local.properties"
    if not props_path.exists():
        return {}

    values: dict[str, str] = {}
    for line in props_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().replace("\\:", ":").replace("\\\\", "\\")
    return values


def get_debug_secret(app_id: str, repo_root: Path | None = None) -> str | None:
    """
    Liest das Debug-Secret für die angegebene App aus local.properties.

    Returns: Secret-String oder None wenn nicht gefunden/Platzhalter.
    """
    if app_id not in SECRET_KEYS:
        return None

    props = read_local_properties(repo_root)
    secret_key = SECRET_KEYS[app_id]
    secret_value = props.get(secret_key, "").strip()

    if not secret_value or secret_value == "REPLACE_WITH_STRONG_RANDOM_SECRET":
        return None

    return secret_value


def compute_debug_token(secret: str, challenge: str, app_id: str) -> str:
    """
    Berechnet den HMAC-SHA256-Token.

    Args:
        secret: Das App-Secret aus local.properties
        challenge: Die Challenge vom Gerät
        app_id: "master" oder "child"

    Returns: 64-Zeichen Hex-Token
    """
    suffix = SUFFIXES.get(app_id)
    if suffix is None:
        raise ValueError(f"Ungültige App-ID: {app_id}. Erlaubt: master, child")

    data = f"{challenge}{suffix}"
    key_bytes = secret.encode("utf-8")
    data_bytes = data.encode("utf-8")

    token_bytes = hmac.new(key_bytes, data_bytes, hashlib.sha256).digest()
    return token_bytes.hex()


def generate_secret() -> str:
    """Generiert ein kryptographisch sicheres 32-Byte (256-Bit) Secret."""
    return secrets.token_hex(32)


def generate_token(app_id: str, challenge: str, repo_root: Path | None = None) -> str:
    """
    Kompletter Token-Generierungs-Flow: Secret lesen + HMAC berechnen.

    Raises:
        ValueError: Wenn Secret nicht gefunden oder App-ID ungültig.
    """
    secret = get_debug_secret(app_id, repo_root)
    if secret is None:
        raise ValueError(
            f"Secret '{SECRET_KEYS.get(app_id, '?')}' nicht in local.properties gefunden "
            f"oder noch Platzhalterwert. Bitte konfigurieren."
        )
    return compute_debug_token(secret, challenge, app_id)


def main() -> int:
    """CLI-Einstiegspunkt: python debug_token.py <app_id> <challenge> | --gen-secret"""
    args = sys.argv[1:]

    if "--gen-secret" in args:
        new_secret = generate_secret()
        print(f"\nGeneriertes Secret (64-Zeichen Hex, 256 Bit):")
        print(f"  {new_secret}")
        print(f"\nIn local.properties eintragen:")
        print(f"  debug.session.secret.master={new_secret}")
        print(f"  debug.session.secret.child={new_secret}   # unterschiedliche Werte verwenden!")
        return 0

    if len(args) < 2:
        print("Verwendung: python debug_token.py <master|child> <challenge>")
        print("             python debug_token.py --gen-secret")
        return 1

    app_id = args[0].lower()
    challenge = args[1]

    try:
        token = generate_token(app_id, challenge)
    except ValueError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1

    package = PACKAGES.get(app_id, "?")
    print(f"\nToken für {app_id} (HMAC-SHA256):")
    print(f"  {token}")
    print(f"\nAktivieren mit:")
    print(f"  adb shell am broadcast -a {package}.DEBUG_ACTIVATE -e response {token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
