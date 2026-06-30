#!/usr/bin/env python3
"""MiniMaster Konfigurations-Snapshots.

Sichert die sechs Konfig-Pflicht-Dateien aus dem Repo in einen Ordner
ausserhalb des Git-Tree, sodass sie ``git clean``, Branch-Wechsel und
Schema-Updates ueberleben:

  Standard-Ablage: %USERPROFILE%/.minimaster/config-snapshots/

Pro Snapshot wird ein Unterordner mit ISO-Timestamp und einem optionalen
``reason`` angelegt. Darin liegen die Konfig-Dateien in flachem Layout
(Pfad-Separatoren werden zu ``--``) plus eine ``manifest.json`` mit
Datei-Hashes, Schema-Hashes und Git-Commit zum Aufnahmezeitpunkt.

CLI:
    python -m scripts.config_snapshot save [--reason <text>]
    python -m scripts.config_snapshot list
    python -m scripts.config_snapshot restore <snapshot-id>
    python -m scripts.config_snapshot prune [--keep-recent 10] [--keep-monthly 12]
    python -m scripts.config_snapshot show <snapshot-id>

Wird auch programmatisch genutzt:
    from scripts.config_snapshot import create_snapshot, list_snapshots, restore_snapshot
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Die sechs (eigentlich acht: vier Panel-Configs) Konfig-Pflicht-Dateien.
# Schluessel = stabiler logischer Name, der auch im Snapshot-Verzeichnis als
# Dateiname (mit '/' -> '--') verwendet wird.
TRACKED_FILES: dict[str, Path] = {
    ".env": REPO_ROOT / ".env",
    "serviceAccountKey.json": REPO_ROOT / "serviceAccountKey.json",
    "masterApp/google-services.json": REPO_ROOT / "masterApp" / "google-services.json",
    "childApp/google-services.json": REPO_ROOT / "childApp" / "google-services.json",
    "admin-panel/firebase-config.js": REPO_ROOT / "admin-panel" / "firebase-config.js",
    "web-control/firebase-config.js": REPO_ROOT / "web-control" / "firebase-config.js",
    "parent-panel/firebase-config.js": REPO_ROOT / "parent-panel" / "firebase-config.js",
    "child-panel/firebase-config.js": REPO_ROOT / "child-panel" / "firebase-config.js",
    "iosMasterApp/GoogleService-Info.plist": REPO_ROOT / "iosMasterApp" / "GoogleService-Info.plist",
    "iosChildApp/GoogleService-Info.plist": REPO_ROOT / "iosChildApp" / "GoogleService-Info.plist",
}

# Schema-Quellen, deren Hash mitprotokolliert wird (Drift-Erkennung).
SCHEMA_SOURCES: dict[str, Path] = {
    ".env.example": REPO_ROOT / ".env.example",
    "admin-panel/firebase-config.template.js": REPO_ROOT / "admin-panel" / "firebase-config.template.js",
    "masterApp/google-services.template.json": REPO_ROOT / "masterApp" / "google-services.template.json",
    "childApp/google-services.template.json": REPO_ROOT / "childApp" / "google-services.template.json",
    "iosMasterApp/GoogleService-Info.template.plist": REPO_ROOT / "iosMasterApp" / "GoogleService-Info.template.plist",
    "iosChildApp/GoogleService-Info.template.plist": REPO_ROOT / "iosChildApp" / "GoogleService-Info.template.plist",
}


def _default_snapshot_root() -> Path:
    """Bevorzugt ``$MINIMASTER_SNAPSHOT_ROOT``, sonst ``~/.minimaster/config-snapshots``."""
    override = os.environ.get("MINIMASTER_SNAPSHOT_ROOT")
    if override:
        return Path(override)
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    return home / ".minimaster" / "config-snapshots"


SNAPSHOT_ROOT = _default_snapshot_root()
SNAPSHOT_ID_RE = re.compile(r"^\d{8}T\d{6}Z(?:__[A-Za-z0-9_.-]+)?$")


@dataclass(frozen=True)
class SnapshotManifest:
    snapshot_id: str
    created_at: str
    reason: str
    git_commit: str | None
    file_hashes: dict[str, str]      # logischer Name -> sha256 (oder "" wenn nicht vorhanden)
    schema_hashes: dict[str, str]    # logischer Name -> sha256
    file_sizes: dict[str, int]


def _hash_file(path: Path) -> str:
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _sanitize_reason(reason: str) -> str:
    """Reason wird Teil des Verzeichnisnamens – nur sichere Zeichen erlauben."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", (reason or "").strip())
    cleaned = cleaned.strip("-")
    return cleaned[:60]


def _now_id(reason: str = "") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = _sanitize_reason(reason)
    return f"{stamp}__{safe}" if safe else stamp


def _flat_name(logical: str) -> str:
    return logical.replace("/", "--")


def _git_commit() -> str | None:
    try:
        proc = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        if proc.returncode == 0:
            return proc.stdout.strip() or None
    except Exception:
        return None
    return None


def _build_manifest(snapshot_id: str, reason: str) -> SnapshotManifest:
    file_hashes: dict[str, str] = {}
    file_sizes: dict[str, int] = {}
    for name, path in TRACKED_FILES.items():
        file_hashes[name] = _hash_file(path)
        file_sizes[name] = path.stat().st_size if path.exists() else 0
    schema_hashes = {name: _hash_file(path) for name, path in SCHEMA_SOURCES.items()}
    return SnapshotManifest(
        snapshot_id=snapshot_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        reason=reason,
        git_commit=_git_commit(),
        file_hashes=file_hashes,
        schema_hashes=schema_hashes,
        file_sizes=file_sizes,
    )


def _write_manifest(target_dir: Path, manifest: SnapshotManifest) -> None:
    data = {
        "snapshotId": manifest.snapshot_id,
        "createdAt": manifest.created_at,
        "reason": manifest.reason,
        "gitCommit": manifest.git_commit,
        "fileHashes": manifest.file_hashes,
        "schemaHashes": manifest.schema_hashes,
        "fileSizes": manifest.file_sizes,
        "trackedFiles": sorted(TRACKED_FILES.keys()),
        "snapshotRoot": str(SNAPSHOT_ROOT),
    }
    (target_dir / "manifest.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8",
    )


def create_snapshot(reason: str = "", *, root: Path | None = None) -> dict[str, object]:
    """Legt einen neuen Snapshot an.

    Liefert ein Dict mit ``snapshotId``, ``path``, ``manifest`` und einer Liste
    der tatsaechlich enthaltenen Dateien. Existieren keine Konfig-Dateien (z.B.
    ganz frisches Repo), wird trotzdem ein Manifest geschrieben, der Ordner
    enthaelt dann nur die `manifest.json`.
    """
    root = root or SNAPSHOT_ROOT
    root.mkdir(parents=True, exist_ok=True)
    snapshot_id = _now_id(reason)
    target_dir = root / snapshot_id
    # Bei (extrem unwahrscheinlicher) Kollision haengen wir einen Suffix an.
    suffix = 1
    while target_dir.exists():
        target_dir = root / f"{snapshot_id}-{suffix}"
        suffix += 1
    target_dir.mkdir(parents=True, exist_ok=False)

    written: list[str] = []
    for name, source in TRACKED_FILES.items():
        if not source.exists():
            continue
        dest = target_dir / _flat_name(name)
        try:
            shutil.copy2(source, dest)
            written.append(name)
        except Exception as exc:
            # Einzelne Datei nicht lesbar? Snapshot trotzdem fortsetzen,
            # aber Fehler im Manifest dokumentieren.
            (target_dir / f"{_flat_name(name)}.error").write_text(
                f"Kopieren fehlgeschlagen: {exc}", encoding="utf-8",
            )

    manifest = _build_manifest(target_dir.name, reason)
    _write_manifest(target_dir, manifest)

    return {
        "snapshotId": target_dir.name,
        "path": str(target_dir),
        "filesIncluded": written,
        "reason": reason,
        "createdAt": manifest.created_at,
        "gitCommit": manifest.git_commit,
    }


def list_snapshots(*, root: Path | None = None) -> list[dict[str, object]]:
    root = root or SNAPSHOT_ROOT
    if not root.exists():
        return []
    entries: list[dict[str, object]] = []
    for child in sorted(root.iterdir(), reverse=True):
        if not child.is_dir():
            continue
        if not SNAPSHOT_ID_RE.match(child.name) and not child.name.startswith("2"):
            # Nur ISO-stempel-aehnliche Ordner anzeigen.
            continue
        manifest_path = child / "manifest.json"
        info: dict[str, object] = {
            "snapshotId": child.name,
            "path": str(child),
            "createdAt": None,
            "reason": "",
            "gitCommit": None,
            "filesIncluded": [],
        }
        if manifest_path.exists():
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                info["createdAt"] = data.get("createdAt")
                info["reason"] = data.get("reason", "")
                info["gitCommit"] = data.get("gitCommit")
                hashes = data.get("fileHashes") or {}
                info["filesIncluded"] = sorted(k for k, v in hashes.items() if v)
            except Exception as exc:
                info["error"] = f"Manifest nicht lesbar: {exc}"
        entries.append(info)
    return entries


def get_snapshot(snapshot_id: str, *, root: Path | None = None) -> dict[str, object] | None:
    root = root or SNAPSHOT_ROOT
    target = root / snapshot_id
    if not target.is_dir():
        return None
    manifest_path = target / "manifest.json"
    if not manifest_path.exists():
        return {"snapshotId": snapshot_id, "path": str(target), "error": "manifest.json fehlt"}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"snapshotId": snapshot_id, "path": str(target), "error": str(exc)}


def restore_snapshot(snapshot_id: str, *, root: Path | None = None) -> dict[str, object]:
    """Stellt einen Snapshot wieder her.

    Vor dem eigentlichen Restore wird ein automatischer "pre-restore"-Snapshot
    angelegt, damit der vorherige Zustand nicht verloren geht.
    """
    root = root or SNAPSHOT_ROOT
    source_dir = root / snapshot_id
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Snapshot nicht gefunden: {snapshot_id}")

    manifest_path = source_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json fehlt in {source_dir}")

    pre_restore = create_snapshot(reason=f"pre-restore-of-{snapshot_id}", root=root)

    restored: list[str] = []
    skipped: list[str] = []
    for name, target_path in TRACKED_FILES.items():
        source_file = source_dir / _flat_name(name)
        if not source_file.exists():
            skipped.append(name)
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, target_path)
        restored.append(name)

    return {
        "snapshotId": snapshot_id,
        "restored": restored,
        "skipped": skipped,
        "preRestoreSnapshot": pre_restore.get("snapshotId"),
        "preRestorePath": pre_restore.get("path"),
    }


def _parse_snapshot_dt(name: str) -> datetime | None:
    """Parsen des Datums aus dem Snapshot-Ordnernamen (YYYYMMDDTHHMMSSZ...)."""
    match = re.match(r"^(\d{8})T(\d{6})Z", name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S").replace(
            tzinfo=timezone.utc,
        )
    except ValueError:
        return None


def prune_snapshots(
    keep_recent: int = 10,
    keep_monthly: int = 12,
    *,
    root: Path | None = None,
) -> dict[str, object]:
    """Loescht alte Snapshots nach einer Aufbewahrungsstrategie.

    Behalten werden:
      - die ``keep_recent`` neuesten Snapshots
      - pro Kalendermonat der jeweils neueste Snapshot, fuer ``keep_monthly`` Monate

    Alle anderen werden geloescht. ``pre-restore-*``-Snapshots zaehlen wie
    normale Snapshots; sie sind durch denselben Mechanismus geschuetzt.
    """
    root = root or SNAPSHOT_ROOT
    if not root.exists():
        return {"removed": [], "kept": [], "reason": "no snapshot root"}

    all_dirs: list[tuple[datetime, Path]] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        ts = _parse_snapshot_dt(child.name)
        if ts is None:
            continue
        all_dirs.append((ts, child))
    all_dirs.sort(key=lambda x: x[0], reverse=True)

    keep: set[Path] = set()
    for _, path in all_dirs[:max(0, keep_recent)]:
        keep.add(path)

    # Monatlich: pro YYYY-MM den juengsten halten.
    seen_months: dict[str, Path] = {}
    for ts, path in all_dirs:
        key = ts.strftime("%Y-%m")
        if key not in seen_months:
            seen_months[key] = path
    for path in list(seen_months.values())[:max(0, keep_monthly)]:
        keep.add(path)

    removed: list[str] = []
    kept: list[str] = []
    for _, path in all_dirs:
        if path in keep:
            kept.append(path.name)
            continue
        try:
            shutil.rmtree(path)
            removed.append(path.name)
        except Exception as exc:
            removed.append(f"{path.name} (Fehler: {exc})")

    return {"removed": removed, "kept": kept, "keepRecent": keep_recent, "keepMonthly": keep_monthly}


# ─── CLI ──────────────────────────────────────────────────────────────

def _cmd_save(args: argparse.Namespace) -> int:
    result = create_snapshot(args.reason or "")
    print(f"Snapshot angelegt: {result['snapshotId']}")
    print(f"  Ablage:    {result['path']}")
    if result.get("filesIncluded"):
        print(f"  Enthalten: {', '.join(result['filesIncluded'])}")
    else:
        print("  Hinweis:   Keine Konfig-Dateien vorhanden – leeres Manifest.")
    # Sanfte Rotation nach jedem manuellen Save.
    prune_snapshots()
    return 0


def _cmd_list(args: argparse.Namespace) -> int:
    items = list_snapshots()
    if not items:
        print(f"(Keine Snapshots in {SNAPSHOT_ROOT})")
        return 0
    print(f"Snapshots in {SNAPSHOT_ROOT} ({len(items)}):")
    for entry in items[: args.limit]:
        reason = entry.get("reason") or "-"
        files = entry.get("filesIncluded") or []
        print(f"  {entry['snapshotId']}  ({len(files)} Datei(en), reason={reason})")
        if args.verbose and files:
            print(f"     {', '.join(files)}")
    if len(items) > args.limit:
        print(f"  ... +{len(items) - args.limit} weitere (--limit erhoehen)")
    return 0


def _cmd_show(args: argparse.Namespace) -> int:
    data = get_snapshot(args.snapshot_id)
    if data is None:
        print(f"[FEHLER] Snapshot nicht gefunden: {args.snapshot_id}")
        return 1
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


def _cmd_restore(args: argparse.Namespace) -> int:
    try:
        result = restore_snapshot(args.snapshot_id)
    except FileNotFoundError as exc:
        print(f"[FEHLER] {exc}")
        return 1
    print(f"Snapshot wiederhergestellt: {args.snapshot_id}")
    print(f"  Wiederhergestellt:  {', '.join(result['restored']) if result['restored'] else '(keine)'}")
    if result.get("skipped"):
        print(f"  Im Snapshot fehlend: {', '.join(result['skipped'])}")
    print(f"  Pre-Restore Backup: {result['preRestoreSnapshot']}")
    return 0


def _cmd_prune(args: argparse.Namespace) -> int:
    result = prune_snapshots(args.keep_recent, args.keep_monthly)
    print(f"Behalten: {len(result['kept'])}, geloescht: {len(result['removed'])}")
    for name in result["removed"]:
        print(f"  - {name}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Konfigurations-Snapshots")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_save = sub.add_parser("save", help="Neuen Snapshot anlegen")
    p_save.add_argument("--reason", default="", help="Optionaler Grund (z.B. 'pre-pull').")
    p_save.set_defaults(func=_cmd_save)

    p_list = sub.add_parser("list", help="Vorhandene Snapshots auflisten")
    p_list.add_argument("--limit", type=int, default=20, help="Max. Eintraege (Default: 20).")
    p_list.add_argument("--verbose", "-v", action="store_true", help="Dateinamen mit anzeigen.")
    p_list.set_defaults(func=_cmd_list)

    p_show = sub.add_parser("show", help="Manifest eines Snapshots anzeigen")
    p_show.add_argument("snapshot_id")
    p_show.set_defaults(func=_cmd_show)

    p_restore = sub.add_parser("restore", help="Snapshot wiederherstellen")
    p_restore.add_argument("snapshot_id")
    p_restore.set_defaults(func=_cmd_restore)

    p_prune = sub.add_parser("prune", help="Alte Snapshots loeschen (Rotation)")
    p_prune.add_argument("--keep-recent", type=int, default=10)
    p_prune.add_argument("--keep-monthly", type=int, default=12)
    p_prune.set_defaults(func=_cmd_prune)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
