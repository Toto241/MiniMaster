#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
CHILD_RES_ROOT = REPO_ROOT / "childApp" / "src" / "main" / "res"
TARGET_PATTERN = "values*/strings.xml"

TASK_STRINGS: dict[str, str] = {
    "task_required_title": "Task Required",
    "task_proof_rejected": "Proof rejected. Please submit again.",
    "task_complete_to_unlock": "To unlock the device, please complete this task.",
    "task_submit_proof": "Submit Proof",
    "task_waiting_for_approval": "Proof submitted. Waiting for parent approval.",
    "task_status_format": "Status: %1$s",
    "your_tasks_title": "Your Tasks",
    "no_tasks_for_now": "No tasks for now, good job!",
    "task_complete_button": "Complete",
}


@dataclass
class FileChange:
    path: Path
    added_keys: list[str]
    cleaned_tools_ignore: bool


def contains_key(content: str, key: str) -> bool:
    return re.search(rf'<string\s+name="{re.escape(key)}"', content) is not None


def build_missing_block(missing_keys: list[str]) -> str:
    lines = ["", "    <!-- Task lock and proof flow -->"]
    for key in missing_keys:
        lines.append(f'    <string name="{key}">{TASK_STRINGS[key]}</string>')
    lines.append("")
    return "\n".join(lines)


def normalize_base_file(content: str) -> tuple[str, bool]:
    cleaned = re.sub(r'\s+tools:ignore="MissingTranslation"', "", content)
    used_tools_ignore = "tools:ignore=" in cleaned
    if not used_tools_ignore:
        cleaned = cleaned.replace(' xmlns:tools="http://schemas.android.com/tools"', "")
    return cleaned, cleaned != content


def process_file(path: Path, apply_changes: bool) -> FileChange:
    original = path.read_text(encoding="utf-8")
    updated = original
    missing = [key for key in TASK_STRINGS if not contains_key(updated, key)]

    if missing:
        insertion = build_missing_block(missing)
        if "</resources>" not in updated:
            raise ValueError(f"Invalid resources XML without closing tag: {path}")
        updated = updated.replace("</resources>", f"{insertion}</resources>")

    cleaned_tools_ignore = False
    if path.parent.name == "values":
        updated, cleaned_tools_ignore = normalize_base_file(updated)

    if apply_changes and updated != original:
        path.write_text(updated, encoding="utf-8")

    return FileChange(path=path, added_keys=missing, cleaned_tools_ignore=cleaned_tools_ignore)


def collect_target_files() -> list[Path]:
    files = sorted(CHILD_RES_ROOT.glob(TARGET_PATTERN))
    if not files:
        raise SystemExit("No childApp locale files found.")
    return files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync missing child task strings across all locale files.")
    parser.add_argument("--apply", action="store_true", help="Apply changes in-place. Without this flag, run in check mode.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    changes: list[FileChange] = []
    for file_path in collect_target_files():
        changes.append(process_file(file_path, apply_changes=args.apply))

    files_with_missing = [change for change in changes if change.added_keys]
    base_cleaned = any(change.cleaned_tools_ignore for change in changes)

    if files_with_missing:
        print("Missing task strings detected:")
        for change in files_with_missing:
            rel = change.path.relative_to(REPO_ROOT).as_posix()
            keys = ", ".join(change.added_keys)
            print(f"- {rel}: {keys}")

    if base_cleaned:
        print("Base values file cleaned: removed temporary MissingTranslation suppressions.")

    if not args.apply:
        return 1 if files_with_missing else 0

    if files_with_missing or base_cleaned:
        print("Translation sync applied.")
    else:
        print("Translation sync: no changes needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
