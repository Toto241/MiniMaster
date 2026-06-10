#!/usr/bin/env python3
"""Keystore-Helfer fuer den Setup-Wizard.

Wraps das ``keytool``-Kommando aus dem JDK, um die SHA-1- und SHA-256-Fingerprints
von Android-Keystores zu extrahieren. Genutzt von:
  * Wizard-Block „SHA aus Debug-Keystore lesen" (admin-panel/wizard.html)
  * API-Routen ``/api/tools/android-debug-sha`` und ``/api/tools/keystore-sha``

Warum brauchen wir das?
  Diese Fingerprints muessen in der Firebase-Console pro Android-App eingetragen
  werden, damit Google Sign-In, App Check (Play Integrity) und Dynamic Links
  funktionieren. Der Wert kommt NICHT automatisch in der google-services.json,
  sondern muss vom Entwickler aus dem Signierungs-Zertifikat ausgelesen werden.

CLI:
  python -m scripts.keystore_tools debug
  python -m scripts.keystore_tools keystore <pfad> [--alias <name>] [--storepass <pw>]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, cast

# Standard-Debug-Keystore – wird vom Android-SDK in $HOME/.android/debug.keystore
# angelegt, sobald das erste Android-Projekt gebaut wurde. Die Credentials sind
# offiziell und ueberall im Android-Universum dieselben.
DEBUG_KEYSTORE_ALIAS = "androiddebugkey"
DEBUG_KEYSTORE_PASSWORD = "android"


def _default_debug_keystore_path() -> Path:
    """Liefert den Standardpfad des Android-Debug-Keystores fuer das aktuelle OS."""
    if os.name == "nt":
        # Windows: %USERPROFILE%\.android\debug.keystore
        home = os.environ.get("USERPROFILE") or os.path.expanduser("~")
    else:
        home = os.environ.get("HOME") or os.path.expanduser("~")
    return Path(home) / ".android" / "debug.keystore"


_REPO_ROOT = Path(__file__).resolve().parent.parent
_TOOLS_DIR = _REPO_ROOT / "tools"


def _resolve_keytool() -> str | None:
    """Sucht keytool zuerst im PATH, dann im repo-eigenen ``tools/``-Verzeichnis.

    Konvention (siehe ``tools/README.md``): Helper-Wrapper versuchen
    ``shutil.which(<tool>)`` zuerst – schlaegt das fehl, fallen sie auf
    ``<repo>/tools/<os>/<arch>/<tool>`` zurueck. So kann ein Tool versioniert
    mitausgeliefert werden, ohne dass der User es global installieren muss.
    """
    found = shutil.which("keytool")
    if found:
        return found
    # Repo-Fallback: tools/windows/x64/keytool.exe, tools/linux/x64/keytool, …
    if os.name == "nt":
        bundled = _TOOLS_DIR / "windows" / "x64" / "keytool.exe"
    elif sys.platform == "darwin":
        bundled = _TOOLS_DIR / "darwin" / ("arm64" if os.uname().machine == "arm64" else "x64") / "keytool"
    else:
        bundled = _TOOLS_DIR / "linux" / "x64" / "keytool"
    return str(bundled) if bundled.is_file() else None


# Akzeptiert sowohl Englische ("SHA1:") als auch Deutsche ("SHA1:") Locale,
# Doppelpunkt-getrennte Hex-Bytes mit optionalen Whitespaces.
_SHA1_RE = re.compile(r"SHA1:\s*([0-9A-Fa-f:]+)")
_SHA256_RE = re.compile(r"SHA256:\s*([0-9A-Fa-f:]+)")
_MD5_RE = re.compile(r"MD5:\s*([0-9A-Fa-f:]+)")


def _parse_fingerprints(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    m1 = _SHA1_RE.search(text)
    m256 = _SHA256_RE.search(text)
    mm5 = _MD5_RE.search(text)
    if m1:
        out["sha1"] = m1.group(1).upper().replace(" ", "")
    if m256:
        out["sha256"] = m256.group(1).upper().replace(" ", "")
    if mm5:
        out["md5"] = mm5.group(1).upper().replace(" ", "")
    return out


def read_keystore_fingerprints(
    keystore_path: Path,
    *,
    alias: str = DEBUG_KEYSTORE_ALIAS,
    storepass: str = DEBUG_KEYSTORE_PASSWORD,
    keypass: str | None = None,
    timeout: int = 30,
) -> dict[str, object]:
    """Liefert SHA-1/SHA-256/MD5-Fingerprints eines Keystores.

    Wirft ``FileNotFoundError`` wenn keytool oder der Keystore fehlt.
    Wirft ``RuntimeError`` wenn keytool fehlschlaegt (z.B. falsches Passwort).
    """
    keytool = _resolve_keytool()
    if not keytool:
        raise FileNotFoundError(
            "keytool nicht im PATH gefunden. Bitte JDK 17 installieren "
            "(JAVA_HOME setzen)."
        )
    if not keystore_path.is_file():
        raise FileNotFoundError(f"Keystore-Datei fehlt: {keystore_path}")

    cmd = [
        keytool, "-list", "-v",
        "-keystore", str(keystore_path),
        "-alias", alias,
        "-storepass", storepass,
        "-keypass", keypass or storepass,
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"keytool hat nach {timeout}s nicht geantwortet.")
    except Exception as exc:
        raise RuntimeError(f"keytool-Aufruf fehlgeschlagen: {exc}")

    if proc.returncode != 0:
        # Stderr enthaelt typischerweise „Falsches Passwort", „Alias existiert
        # nicht" oder „Keystore-Format ungueltig". Wir reichen das durch.
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"keytool fehlgeschlagen (rc={proc.returncode}): {err[:400]}")

    output = (proc.stdout or "") + "\n" + (proc.stderr or "")
    fingerprints = _parse_fingerprints(output)
    if not fingerprints.get("sha1") or not fingerprints.get("sha256"):
        raise RuntimeError(
            "keytool-Ausgabe enthaelt keine SHA-Fingerprints. "
            f"Output (gekuerzt): {output[:300]}"
        )

    return {
        "keystorePath": str(keystore_path),
        "alias": alias,
        "fingerprints": fingerprints,
        "keytool": keytool,
    }


def read_debug_keystore_fingerprints() -> dict[str, object]:
    """Convenience: liest den Default-Debug-Keystore mit Default-Credentials."""
    return read_keystore_fingerprints(_default_debug_keystore_path())


# ─── CLI ──────────────────────────────────────────────────────────────

def _cmd_debug(args: argparse.Namespace) -> int:
    try:
        result = read_debug_keystore_fingerprints()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"[FEHLER] {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    fp = cast(dict[str, str], result["fingerprints"])
    print(f"Debug-Keystore: {result['keystorePath']}")
    print(f"Alias:          {result['alias']}")
    print(f"SHA-1:    {fp.get('sha1', '-')}")
    print(f"SHA-256:  {fp.get('sha256', '-')}")
    if fp.get("md5"):
        print(f"MD5:      {fp.get('md5')}")
    return 0


def _cmd_keystore(args: argparse.Namespace) -> int:
    try:
        result = read_keystore_fingerprints(
            Path(args.path).expanduser(),
            alias=args.alias,
            storepass=args.storepass,
            keypass=args.keypass,
        )
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"[FEHLER] {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    fp = cast(dict[str, str], result["fingerprints"])
    print(f"Keystore: {result['keystorePath']}")
    print(f"Alias:    {result['alias']}")
    for label, key in (("SHA-1", "sha1"), ("SHA-256", "sha256"), ("MD5", "md5")):
        if fp.get(key):
            print(f"{label}: {fp[key]}")
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Keystore-Helfer")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_debug = sub.add_parser("debug",
                             help="Default-Android-Debug-Keystore auslesen")
    p_debug.add_argument("--json", action="store_true", help="JSON-Ausgabe.")
    p_debug.set_defaults(func=_cmd_debug)

    p_keystore = sub.add_parser("keystore",
                                help="Beliebigen Keystore auslesen")
    p_keystore.add_argument("path", help="Pfad zur .jks/.keystore-Datei")
    p_keystore.add_argument("--alias", default=DEBUG_KEYSTORE_ALIAS)
    p_keystore.add_argument("--storepass", default=DEBUG_KEYSTORE_PASSWORD)
    p_keystore.add_argument("--keypass", default=None)
    p_keystore.add_argument("--json", action="store_true", help="JSON-Ausgabe.")
    p_keystore.set_defaults(func=_cmd_keystore)

    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
