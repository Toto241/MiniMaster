#!/usr/bin/env python3
"""gcloud-CLI-Helfer fuer den Setup-Wizard.

Erlaubt es, einige Google-Cloud-Setup-Schritte direkt aus dem Wizard
auszufuehren, wenn die ``gcloud`` CLI lokal installiert und authentifiziert
ist – aktuell:

  * Status-Check: ist gcloud da, wer ist eingeloggt, welches Default-Projekt?
  * Pub/Sub-Topic anlegen (fuer Play Billing RTDN: ``PLAY_BILLING_PUBSUB_TOPIC``)
  * Pub/Sub-Topic auf Existenz pruefen

Warum nicht im Repo mitliefern?
  ``gcloud`` ist ~100 MB gross; das ist zu gross fuer ein Repo-Tools-Verzeichnis.
  Wenn gcloud fehlt, fallen wir auf "im Browser manuell anlegen"-Anleitung zurueck.

CLI:
  python -m scripts.gcloud_tools status
  python -m scripts.gcloud_tools create-pubsub-topic <topic> --project <project-id>
  python -m scripts.gcloud_tools check-pubsub-topic <topic> --project <project-id>
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from typing import Iterable


def _resolve_gcloud() -> str | None:
    """``gcloud`` aus dem PATH aufloesen. Auf Windows ist es ``gcloud.cmd``."""
    return shutil.which("gcloud")


def _run_gcloud(args: list[str], *, timeout: int = 30) -> tuple[int, str, str]:
    gcloud = _resolve_gcloud()
    if not gcloud:
        return (127, "", "gcloud CLI nicht im PATH installiert. "
                          "Installation: https://cloud.google.com/sdk/docs/install")
    try:
        proc = subprocess.run(
            [gcloud, *args],
            capture_output=True, text=True, timeout=timeout, encoding="utf-8",
            errors="replace",
        )
        return (proc.returncode, proc.stdout or "", proc.stderr or "")
    except subprocess.TimeoutExpired:
        return (1, "", f"gcloud-Aufruf nach {timeout}s abgebrochen.")
    except Exception as exc:
        return (1, "", str(exc))


def gcloud_status() -> dict[str, object]:
    """Liefert {installed, account, project, available} – immer ohne Exceptions."""
    gcloud = _resolve_gcloud()
    if not gcloud:
        return {
            "installed": False,
            "available": False,
            "hint": (
                "gcloud CLI nicht gefunden. Installation: "
                "https://cloud.google.com/sdk/docs/install – danach 'gcloud auth login'."
            ),
        }
    # Aktiver Account?
    rc, out, err = _run_gcloud(["auth", "list", "--filter=status:ACTIVE",
                                 "--format=value(account)"])
    account = (out or "").strip() if rc == 0 else ""
    # Aktives Projekt?
    rc2, out2, _ = _run_gcloud(["config", "get-value", "project"])
    project = (out2 or "").strip()
    if project.lower() in ("(unset)", ""):
        project = ""
    return {
        "installed": True,
        "available": bool(account),
        "account": account,
        "project": project,
        "gcloudPath": gcloud,
        "hint": (
            f"Eingeloggt als {account}." if account else
            "Installiert, aber kein aktiver Account. 'gcloud auth login' ausfuehren."
        ),
    }


_TOPIC_NAME_RE = re.compile(r"^[A-Za-z][\w.\-]{2,254}$")
_FQDN_TOPIC_RE = re.compile(r"^projects/([a-z][a-z0-9-]{4,29})/topics/([A-Za-z][\w.\-]{2,254})$")


def _normalize_topic(project_id: str, topic: str) -> tuple[str, str]:
    """Liefert (kurzer_name, fully_qualified_name) und prueft das Format."""
    if not project_id or not re.match(r"^[a-z][a-z0-9-]{4,29}$", project_id):
        raise ValueError(f"Ungueltige projectId: {project_id!r}")
    match = _FQDN_TOPIC_RE.match(topic)
    if match:
        if match.group(1) != project_id:
            raise ValueError(
                f"Topic ist auf Projekt '{match.group(1)}' qualifiziert, "
                f"projectId-Argument war '{project_id}'."
            )
        short = match.group(2)
    else:
        if not _TOPIC_NAME_RE.match(topic):
            raise ValueError(
                f"Ungueltiger Topic-Name: {topic!r}. Erlaubt: Buchstabe gefolgt von "
                "Buchstaben/Zahlen/_-., 3..255 Zeichen."
            )
        short = topic
    return short, f"projects/{project_id}/topics/{short}"


def check_pubsub_topic(project_id: str, topic: str) -> dict[str, object]:
    """Pruefen ob ein Pub/Sub-Topic existiert. Wirft RuntimeError bei CLI-Fehlern."""
    short, fqdn = _normalize_topic(project_id, topic)
    rc, out, err = _run_gcloud(
        ["pubsub", "topics", "describe", short, "--project", project_id, "--format=json"],
    )
    if rc == 0:
        try:
            data = json.loads(out)
        except Exception:
            data = {}
        return {
            "exists": True,
            "topic": fqdn,
            "name": data.get("name", fqdn),
            "hint": f"Topic '{fqdn}' existiert.",
        }
    # gcloud meldet "NOT_FOUND" bei nicht vorhandenen Topics
    combined = (err + out).strip()
    if "NOT_FOUND" in combined or "Resource not found" in combined:
        return {
            "exists": False,
            "topic": fqdn,
            "hint": f"Topic '{fqdn}' existiert (noch) nicht.",
        }
    if "PERMISSION_DENIED" in combined:
        raise RuntimeError(
            f"Kein Lesezugriff auf Pub/Sub im Projekt '{project_id}'. "
            "IAM-Rolle 'roles/pubsub.viewer' oder hoeher noetig."
        )
    raise RuntimeError(
        f"gcloud pubsub topics describe fehlgeschlagen: {combined[:400] or '(keine Ausgabe)'}"
    )


def create_pubsub_topic(project_id: str, topic: str) -> dict[str, object]:
    """Legt das Topic an. Bei bereits-vorhanden wird das als Erfolg gewertet."""
    short, fqdn = _normalize_topic(project_id, topic)

    # Bestehendes Topic? -> kein erneutes Anlegen noetig.
    try:
        existing = check_pubsub_topic(project_id, topic)
        if existing.get("exists"):
            return {
                "created": False,
                "alreadyExisted": True,
                "topic": fqdn,
                "hint": f"Topic '{fqdn}' war bereits vorhanden – kein erneuter Create-Call.",
            }
    except RuntimeError:
        # Falls describe scheitert (z.B. keine Permission), versuchen wir trotzdem
        # zu erstellen – die Antwort darauf ist meist klarer.
        pass

    rc, out, err = _run_gcloud(
        ["pubsub", "topics", "create", short, "--project", project_id, "--format=json"],
    )
    combined = (err + out).strip()
    if rc == 0:
        return {
            "created": True,
            "alreadyExisted": False,
            "topic": fqdn,
            "hint": f"Topic '{fqdn}' erfolgreich angelegt.",
        }
    if "ALREADY_EXISTS" in combined or "already exists" in combined.lower():
        return {
            "created": False,
            "alreadyExisted": True,
            "topic": fqdn,
            "hint": f"Topic '{fqdn}' war bereits vorhanden.",
        }
    if "PERMISSION_DENIED" in combined:
        raise RuntimeError(
            f"Kein Schreibzugriff auf Pub/Sub im Projekt '{project_id}'. "
            "IAM-Rolle 'roles/pubsub.editor' oder hoeher noetig."
        )
    raise RuntimeError(
        f"gcloud pubsub topics create fehlgeschlagen: {combined[:400] or '(keine Ausgabe)'}"
    )


# ─── CLI ──────────────────────────────────────────────────────────────

def _cmd_status(args: argparse.Namespace) -> int:
    result = gcloud_status()
    if args.json:
        print(json.dumps(result, indent=2))
        return 0 if result.get("available") else 1
    print(f"gcloud installiert:  {result.get('installed')}")
    print(f"aktiver Account:     {result.get('account', '-') or '(none)'}")
    print(f"Default-Projekt:     {result.get('project', '-') or '(none)'}")
    print(f"Hinweis:             {result.get('hint', '')}")
    return 0 if result.get("available") else 1


def _cmd_create_topic(args: argparse.Namespace) -> int:
    try:
        result = create_pubsub_topic(args.project, args.topic)
    except (ValueError, RuntimeError) as exc:
        print(f"[FEHLER] {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(result.get("hint", ""))
    return 0


def _cmd_check_topic(args: argparse.Namespace) -> int:
    try:
        result = check_pubsub_topic(args.project, args.topic)
    except (ValueError, RuntimeError) as exc:
        print(f"[FEHLER] {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(result.get("hint", ""))
    return 0 if result.get("exists") else 1


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster gcloud-Helfer")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_status = sub.add_parser("status", help="gcloud-Login-/Projekt-Status")
    p_status.add_argument("--json", action="store_true")
    p_status.set_defaults(func=_cmd_status)

    p_create = sub.add_parser("create-pubsub-topic", help="Pub/Sub-Topic anlegen")
    p_create.add_argument("topic", help="Kurzname oder projects/<id>/topics/<name>")
    p_create.add_argument("--project", required=True)
    p_create.add_argument("--json", action="store_true")
    p_create.set_defaults(func=_cmd_create_topic)

    p_check = sub.add_parser("check-pubsub-topic", help="Topic-Existenz pruefen")
    p_check.add_argument("topic")
    p_check.add_argument("--project", required=True)
    p_check.add_argument("--json", action="store_true")
    p_check.set_defaults(func=_cmd_check_topic)

    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
