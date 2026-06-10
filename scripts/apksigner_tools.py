#!/usr/bin/env python3
"""apksigner-Helfer fuer den Setup-Wizard und Admin-Panel.

Pruefen einer signierten APK-Datei vor dem Play-Console-Upload. Liefert:
  * Verifizierungs-Status (verifies / does not verify)
  * Verwendete Signaturschemata (v1, v2, v3, v4)
  * SHA-256 der Signatur-Zertifikate (zum Abgleich mit Play App Signing)

Tool-Lookup-Reihenfolge:
  1. shutil.which("apksigner")
  2. $ANDROID_HOME / $ANDROID_SDK_ROOT / Standard-SDK-Pfade
     (Windows: %LOCALAPPDATA%\\Android\\Sdk, macOS: ~/Library/Android/sdk, Linux: ~/Android/Sdk)
     -> build-tools/<hoechste-version>/apksigner[.bat]
  3. <repo>/tools/<os>/<arch>/apksigner (Repo-Fallback)

CLI:
  python -m scripts.apksigner_tools verify <pfad-zur-apk>
  python -m scripts.apksigner_tools locate    # zeigt nur den gefundenen Pfad
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
from typing import Iterable

_REPO_ROOT = Path(__file__).resolve().parent.parent
_TOOLS_DIR = _REPO_ROOT / "tools"


def _candidate_sdk_roots() -> list[Path]:
    """Liefert moegliche Android-SDK-Wurzeln in Such-Reihenfolge."""
    roots: list[Path] = []
    for env_name in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        env = os.environ.get(env_name)
        if env:
            roots.append(Path(env))
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            roots.append(Path(local) / "Android" / "Sdk")
        user = os.environ.get("USERPROFILE")
        if user:
            roots.append(Path(user) / "AppData" / "Local" / "Android" / "Sdk")
    elif sys.platform == "darwin":
        home = os.environ.get("HOME") or os.path.expanduser("~")
        roots.append(Path(home) / "Library" / "Android" / "sdk")
    else:
        home = os.environ.get("HOME") or os.path.expanduser("~")
        roots.append(Path(home) / "Android" / "Sdk")
    return roots


def _latest_build_tools(sdk_root: Path) -> Path | None:
    build_tools = sdk_root / "build-tools"
    if not build_tools.is_dir():
        return None
    versions: list[tuple[tuple[int, ...], Path]] = []
    for entry in build_tools.iterdir():
        if not entry.is_dir():
            continue
        parts = tuple(int(p) if p.isdigit() else 0 for p in entry.name.split("."))
        versions.append((parts, entry))
    if not versions:
        return None
    versions.sort(reverse=True)
    return versions[0][1]


def _bundled_apksigner() -> Path | None:
    if os.name == "nt":
        return _TOOLS_DIR / "windows" / "x64" / "apksigner.bat"
    if sys.platform == "darwin":
        return _TOOLS_DIR / "darwin" / ("arm64" if os.uname().machine == "arm64" else "x64") / "apksigner"
    return _TOOLS_DIR / "linux" / "x64" / "apksigner"


def _resolve_apksigner() -> str | None:
    found = shutil.which("apksigner")
    if found:
        return found
    binary_name = "apksigner.bat" if os.name == "nt" else "apksigner"
    for sdk_root in _candidate_sdk_roots():
        bt = _latest_build_tools(sdk_root)
        if not bt:
            continue
        candidate = bt / binary_name
        if candidate.is_file():
            return str(candidate)
    bundled = _bundled_apksigner()
    if bundled and bundled.is_file():
        return str(bundled)
    return None


_VERIFIES_RE = re.compile(r"^Verifies\b", re.MULTILINE)
_SCHEME_RE = re.compile(r"Verified using v(\d) scheme \(([^)]+)\):\s*(true|false)", re.IGNORECASE)
_CERT_SHA_RE = re.compile(
    r"Signer #?\d+ certificate SHA-256 digest:\s*([0-9a-fA-F]+)", re.IGNORECASE,
)
_CERT_DN_RE = re.compile(r"Signer #?\d+ certificate DN:\s*(.+)$", re.MULTILINE | re.IGNORECASE)


def verify_apk(apk_path: Path, *, timeout: int = 60) -> dict[str, object]:
    """Ruft ``apksigner verify -v --print-certs`` und parsed das Ergebnis."""
    apksigner = _resolve_apksigner()
    if not apksigner:
        return {
            "verified": False,
            "error": "apksigner_missing",
            "hint": (
                "apksigner nicht gefunden. Installation: Android Studio "
                "→ SDK Manager → 'Android SDK Build-Tools'. Alternativ "
                "$ANDROID_HOME setzen oder Binary in tools/<os>/<arch>/apksigner ablegen."
            ),
        }
    if not apk_path.is_file():
        return {
            "verified": False,
            "error": "apk_missing",
            "hint": f"APK-Datei nicht gefunden: {apk_path}",
            "apksigner": apksigner,
        }
    try:
        proc = subprocess.run(
            [apksigner, "verify", "-v", "--print-certs", str(apk_path)],
            capture_output=True, text=True, timeout=timeout, encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        return {
            "verified": False,
            "error": "apksigner_timeout",
            "hint": f"apksigner hat nach {timeout}s nicht geantwortet.",
            "apksigner": apksigner,
        }
    except Exception as exc:
        return {
            "verified": False,
            "error": "apksigner_call_failed",
            "hint": f"apksigner-Aufruf fehlgeschlagen: {exc}",
            "apksigner": apksigner,
        }

    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    verified = proc.returncode == 0 and bool(_VERIFIES_RE.search(out))

    schemes: dict[str, bool] = {}
    for match in _SCHEME_RE.finditer(out):
        version = f"v{match.group(1)}"
        active = match.group(3).lower() == "true"
        schemes[version] = active

    certs: list[dict[str, str]] = []
    sha_matches = list(_CERT_SHA_RE.finditer(out))
    dn_matches = list(_CERT_DN_RE.finditer(out))
    for index, sha_m in enumerate(sha_matches):
        entry = {"sha256": sha_m.group(1).upper()}
        if index < len(dn_matches):
            entry["dn"] = dn_matches[index].group(1).strip()
        certs.append(entry)

    return {
        "verified": verified,
        "apksigner": apksigner,
        "apkPath": str(apk_path),
        "schemes": schemes,
        "certs": certs,
        "rawOutput": out.strip()[:4000],
        "hint": (
            "APK ist gueltig signiert."
            if verified
            else "apksigner meldet KEINE gueltige Signatur. Details siehe rawOutput."
        ),
    }


# ─── CLI ──────────────────────────────────────────────────────────────

def _cmd_verify(args: argparse.Namespace) -> int:
    result = verify_apk(Path(args.apk).expanduser())
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        status = "OK" if result.get("verified") else "FAIL"
        print(f"[{status}] {result.get('hint', '')}")
        if result.get("schemes"):
            print("Schemes: " + ", ".join(
                f"{v}={'on' if active else 'off'}"
                for v, active in sorted(result["schemes"].items())
            ))
        for index, cert in enumerate(result.get("certs", []), start=1):
            print(f"Cert {index}: SHA-256 {cert.get('sha256', '-')}")
            if cert.get("dn"):
                print(f"         DN {cert['dn']}")
    return 0 if result.get("verified") else 1


def _cmd_locate(args: argparse.Namespace) -> int:
    path = _resolve_apksigner()
    if args.json:
        print(json.dumps({"apksigner": path}, indent=2))
    elif path:
        print(path)
    else:
        print("(nicht gefunden)", file=sys.stderr)
    return 0 if path else 1


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster apksigner-Helfer")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_verify = sub.add_parser("verify", help="APK verifizieren")
    p_verify.add_argument("apk", help="Pfad zur signierten APK-Datei")
    p_verify.add_argument("--json", action="store_true")
    p_verify.set_defaults(func=_cmd_verify)

    p_locate = sub.add_parser("locate", help="Nur den apksigner-Pfad ausgeben")
    p_locate.add_argument("--json", action="store_true")
    p_locate.set_defaults(func=_cmd_locate)

    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
