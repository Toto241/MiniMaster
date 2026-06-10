#!/usr/bin/env python3
"""Installiert MiniMaster-Git-Hooks fuer automatische Konfig-Snapshots.

Vor riskanten Git-Operationen (``checkout``, ``merge``, ``rebase``) wird
automatisch ein Snapshot der Konfig-Pflicht-Dateien angelegt, sodass ein
Zustand vor dem Wechsel jederzeit wiederherstellbar ist.

Aufruf:
    python -m scripts.install_git_hooks            # idempotent installieren
    python -m scripts.install_git_hooks --check    # nur pruefen, ob installiert
    python -m scripts.install_git_hooks --uninstall

Die Hooks rufen ``python -m scripts.config_snapshot save --reason <hook>`` auf.
Misslingt der Snapshot, blockiert das die Git-Operation NICHT (Exit 0).
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOKS_DIR = REPO_ROOT / ".git" / "hooks"

# Wir markieren von uns generierte Hooks mit diesem Sentinel, sodass
# Re-Installation oder Deinstallation bestehende Fremd-Hooks nicht
# ueberschreibt.
HOOK_SENTINEL = "# MINIMASTER_CONFIG_SNAPSHOT_HOOK v1"

HOOKS: dict[str, str] = {
    # Vor jedem Branch-Wechsel oder Datei-Checkout.
    "post-checkout": "post-checkout",
    # Vor jeder Merge-Operation (nur wenn auch tatsaechlich gemergt wird).
    "post-merge": "post-merge",
    # Vor Rebase.
    "post-rewrite": "post-rewrite",
}


def _hook_script(hook_name: str) -> str:
    """Liefert den Shell-Skript-Inhalt fuer einen Hook."""
    return f"""#!/bin/sh
{HOOK_SENTINEL}
# Automatischer Konfig-Snapshot nach Git-{hook_name}.
# Schlaegt der Snapshot fehl, wird die Git-Operation NICHT blockiert.
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if command -v python >/dev/null 2>&1; then
    PY=python
elif command -v python3 >/dev/null 2>&1; then
    PY=python3
else
    exit 0
fi
"$PY" -m scripts.config_snapshot save --reason "git-{hook_name}" >/dev/null 2>&1 || true
exit 0
"""


def _has_minimaster_sentinel(path: Path) -> bool:
    try:
        return HOOK_SENTINEL in path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False


def _is_git_repo() -> bool:
    return (REPO_ROOT / ".git").is_dir() or (REPO_ROOT / ".git").is_file()


def install(force: bool = False) -> dict[str, str]:
    """Installiert / aktualisiert die Hooks. Idempotent.

    Returns Status-Dict {hook_name: "installed"|"updated"|"skipped (foreign hook)"}.
    """
    if not _is_git_repo():
        return {"_error": ".git fehlt – kein Repository, Hooks werden nicht installiert."}
    HOOKS_DIR.mkdir(parents=True, exist_ok=True)
    status: dict[str, str] = {}
    for hook_name in HOOKS:
        hook_path = HOOKS_DIR / hook_name
        script = _hook_script(hook_name)
        if hook_path.exists():
            if _has_minimaster_sentinel(hook_path):
                hook_path.write_text(script, encoding="utf-8")
                status[hook_name] = "updated"
            elif force:
                # Vorher den fremden Hook sichern.
                backup = hook_path.with_suffix(".pre-minimaster.bak")
                shutil.copy2(hook_path, backup)
                hook_path.write_text(script, encoding="utf-8")
                status[hook_name] = f"installed (foreign backed up to {backup.name})"
            else:
                status[hook_name] = "skipped (foreign hook – use --force to overwrite)"
                continue
        else:
            hook_path.write_text(script, encoding="utf-8")
            status[hook_name] = "installed"
        # Auf Unix Bit setzen; auf Windows ignoriert Git die Mode trotzdem.
        try:
            os.chmod(hook_path, 0o755)
        except Exception:
            pass
    return status


def uninstall() -> dict[str, str]:
    if not HOOKS_DIR.exists():
        return {}
    status: dict[str, str] = {}
    for hook_name in HOOKS:
        hook_path = HOOKS_DIR / hook_name
        if hook_path.exists() and _has_minimaster_sentinel(hook_path):
            hook_path.unlink()
            status[hook_name] = "removed"
        elif hook_path.exists():
            status[hook_name] = "skipped (foreign hook)"
        else:
            status[hook_name] = "not present"
    return status


def check() -> dict[str, str]:
    if not _is_git_repo():
        return {"_error": ".git fehlt – kein Repository."}
    status: dict[str, str] = {}
    for hook_name in HOOKS:
        hook_path = HOOKS_DIR / hook_name
        if not hook_path.exists():
            status[hook_name] = "missing"
        elif _has_minimaster_sentinel(hook_path):
            status[hook_name] = "ok (minimaster)"
        else:
            status[hook_name] = "foreign hook present"
    return status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Git-Hook Installer")
    parser.add_argument("--check", action="store_true", help="Nur Status anzeigen.")
    parser.add_argument("--uninstall", action="store_true", help="MiniMaster-Hooks entfernen.")
    parser.add_argument("--force", action="store_true", help="Fremde Hooks ueberschreiben (mit Backup).")
    parser.add_argument("--quiet", "-q", action="store_true", help="Kein Output bei Erfolg.")
    args = parser.parse_args(argv)

    if args.check:
        result = check()
    elif args.uninstall:
        result = uninstall()
    else:
        result = install(force=args.force)

    if "_error" in result:
        if not args.quiet:
            print(f"[FEHLER] {result['_error']}")
        return 1

    if not args.quiet:
        for hook, state in result.items():
            print(f"  {hook:15s} -> {state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
