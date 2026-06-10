#!/usr/bin/env python3
"""OpenSSL-Helfer fuer den Setup-Wizard.

Validiert Apple-Private-Keys (PKCS8, fuer App Store Server API v2) bevor
sie in `.env` landen. Hauptzweck: den haeufigsten Copy-Paste-Stolperstein
abfangen – fehlende BEGIN/END-Tags, falsche Zeilenumbrueche, gemixtes
PEM/PKCS1-Format.

API:
  validate_apple_private_key(text: str) -> dict
    -> {"valid": bool, "keyType": str, "details": str, ...}

CLI:
  python -m scripts.openssl_tools validate-apple-key < key.p8
  python -m scripts.openssl_tools validate-apple-key --path key.p8
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

_REPO_ROOT = Path(__file__).resolve().parent.parent
_TOOLS_DIR = _REPO_ROOT / "tools"


def _resolve_openssl() -> str | None:
    """PATH zuerst, dann Repo-Fallback ``tools/<os>/<arch>/openssl``."""
    found = shutil.which("openssl")
    if found:
        return found
    if os.name == "nt":
        bundled = _TOOLS_DIR / "windows" / "x64" / "openssl.exe"
    elif sys.platform == "darwin":
        bundled = _TOOLS_DIR / "darwin" / ("arm64" if os.uname().machine == "arm64" else "x64") / "openssl"
    else:
        bundled = _TOOLS_DIR / "linux" / "x64" / "openssl"
    return str(bundled) if bundled.is_file() else None


_PEM_HEADER_RE = re.compile(r"-----BEGIN ([A-Z0-9 ]+?)-----")


def _looks_like_pem(text: str) -> str | None:
    """Liefert den PEM-Header-Typ (z.B. 'PRIVATE KEY', 'EC PRIVATE KEY')."""
    match = _PEM_HEADER_RE.search(text)
    return match.group(1).strip() if match else None


def validate_apple_private_key(raw_text: str, *, timeout: int = 15) -> dict[str, object]:
    """Prueft, ob ``raw_text`` ein gueltiger Apple-Private-Key (PKCS8) ist.

    Apple liefert Private-Keys im PKCS8-PEM-Format (.p8-Datei mit
    ``-----BEGIN PRIVATE KEY-----``-Header und EC-P-256-Schluessel).
    Diese Funktion ruft ``openssl pkey -in <tmp> -noout -text`` auf.
    """
    text = (raw_text or "").strip()
    if not text:
        return {
            "valid": False,
            "error": "empty",
            "hint": "Kein Inhalt – bitte den Apple-Private-Key (Inhalt der .p8-Datei) einfuegen.",
        }

    # Quick-Checks bevor wir openssl aufrufen.
    pem_type = _looks_like_pem(text)
    if not pem_type:
        return {
            "valid": False,
            "error": "missing_pem_header",
            "hint": (
                "Der Schluessel hat keinen '-----BEGIN ...-----'-Header. "
                "Inhalt der .p8-Datei muss inkl. Header und Footer eingefuegt werden."
            ),
        }

    openssl = _resolve_openssl()
    if not openssl:
        return {
            "valid": False,
            "error": "openssl_missing",
            "hint": (
                "openssl ist nicht im PATH und nicht in tools/<os>/<arch>/. "
                "Installation: https://wiki.openssl.org/index.php/Binaries – "
                "Windows-Nutzer haben es typischerweise via 'Git for Windows' bereits installiert."
            ),
        }

    # Temp-Datei schreiben (openssl liest robuster aus Datei als aus stdin).
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".pem", mode="w", encoding="utf-8",
    )
    try:
        tmp.write(text)
        tmp.flush()
        tmp.close()
        try:
            proc = subprocess.run(
                [openssl, "pkey", "-in", tmp.name, "-noout", "-text"],
                capture_output=True, text=True, timeout=timeout, encoding="utf-8",
                errors="replace",
            )
        except subprocess.TimeoutExpired:
            return {
                "valid": False,
                "error": "openssl_timeout",
                "hint": f"openssl hat nach {timeout}s nicht geantwortet.",
            }
        except Exception as exc:
            return {
                "valid": False,
                "error": "openssl_call_failed",
                "hint": f"openssl-Aufruf fehlgeschlagen: {exc}",
            }
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        return {
            "valid": False,
            "error": "openssl_rejected",
            "openssl_output": err[:400],
            "hint": (
                "openssl konnte den Schluessel nicht parsen. Haeufige Ursachen: "
                "falsche Zeilenumbrueche (CRLF statt LF), Whitespace am Anfang/Ende, "
                "abgeschnittene Zeilen, falscher Header-Typ. "
                "Apple liefert den Key als .p8-Datei – Inhalt 1:1 kopieren."
            ),
        }

    # openssl-Output enthaelt z.B. 'Private-Key: (256 bit, ...)' und Kurven-Name.
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    curve = ""
    m = re.search(r"ASN1 OID:\s*(\S+)", out)
    if m:
        curve = m.group(1)
    bits_match = re.search(r"Private-Key:\s*\((\d+)\s*bit", out)
    bits = int(bits_match.group(1)) if bits_match else 0

    is_apple_compatible = "EC" in pem_type or "PRIVATE KEY" in pem_type
    return {
        "valid": True,
        "pemType": pem_type,
        "curve": curve,
        "bits": bits,
        "appleCompatible": is_apple_compatible,
        "openssl": openssl,
        "hint": (
            f"OK – PEM-Typ '{pem_type}'"
            + (f", Kurve '{curve}'" if curve else "")
            + (f", {bits} Bit." if bits else ".")
        ),
    }


# ─── CLI ──────────────────────────────────────────────────────────────

def _cmd_validate_apple_key(args: argparse.Namespace) -> int:
    if args.path:
        try:
            raw = Path(args.path).expanduser().read_text(encoding="utf-8")
        except Exception as exc:
            print(f"[FEHLER] Datei nicht lesbar: {exc}", file=sys.stderr)
            return 1
    else:
        raw = sys.stdin.read()
    result = validate_apple_private_key(raw)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        status = "OK" if result.get("valid") else "INVALID"
        print(f"[{status}] {result.get('hint', '')}")
        if not result.get("valid") and result.get("openssl_output"):
            print(f"\nopenssl-Output:\n{result['openssl_output']}")
    return 0 if result.get("valid") else 1


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster OpenSSL-Helfer")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_key = sub.add_parser("validate-apple-key",
                           help="Apple Private Key (PKCS8) validieren")
    p_key.add_argument("--path", help="Datei einlesen statt stdin.")
    p_key.add_argument("--json", action="store_true", help="JSON-Ausgabe.")
    p_key.set_defaults(func=_cmd_validate_apple_key)

    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
