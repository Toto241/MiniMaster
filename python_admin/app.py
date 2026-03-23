#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HOST = os.environ.get("MINIMASTER_ADMIN_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("MINIMASTER_ADMIN_PORT", "8765"))

ALLOWED_COMMANDS = {
    "adb",
    "bash",
    "firebase",
    "node",
    "npm",
    "npx",
    "powershell",
    "pwsh",
    "python",
    "python3",
    "gradlew.bat",
    ".\\gradlew.bat",
    "./gradlew",
}


@dataclass(frozen=True)
class CommandRequest:
    command: str
    cwd: Path


def sanitize_cwd(raw_cwd: str | None) -> Path:
    if not raw_cwd:
        return REPO_ROOT

    candidate = Path(raw_cwd).expanduser()
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate



def split_command_lines(command: str) -> list[str]:
    return [line.strip() for line in command.splitlines() if line.strip()]



def normalize_program(program: str) -> str:
    return program.strip().strip('"').rstrip().lower()



def ensure_command_allowed(command: str) -> None:
    lines = split_command_lines(command)
    if not lines:
        raise ValueError("Kein Befehl angegeben.")

    for line in lines:
        try:
            parts = shlex.split(line, posix=os.name != "nt")
        except ValueError as exc:
            raise ValueError(f"Befehl konnte nicht geparst werden: {line}") from exc
        if not parts:
            continue
        program = normalize_program(Path(parts[0]).name or parts[0])
        full_program = normalize_program(parts[0])
        if program not in ALLOWED_COMMANDS and full_program not in ALLOWED_COMMANDS:
            allowed = ", ".join(sorted(ALLOWED_COMMANDS))
            raise ValueError(f"Befehl nicht erlaubt: {parts[0]}. Erlaubt: {allowed}")



def run_command(request: CommandRequest) -> dict[str, object]:
    ensure_command_allowed(request.command)
    if not request.cwd.exists() or not request.cwd.is_dir():
        raise ValueError(f"Arbeitsverzeichnis nicht gefunden: {request.cwd}")

    combined_output: list[str] = []
    exit_code = 0

    for line in split_command_lines(request.command):
        parts = shlex.split(line, posix=os.name != "nt")
        process = subprocess.run(
            parts,
            cwd=str(request.cwd),
            capture_output=True,
            text=True,
            check=False,
            env=os.environ.copy(),
        )
        combined_output.append(f"$ {line}\n")
        if process.stdout:
            combined_output.append(process.stdout)
        if process.stderr:
            combined_output.append(process.stderr)
        exit_code = process.returncode
        if exit_code != 0:
            break

    return {
        "code": exit_code,
        "output": "".join(combined_output),
    }


class MiniMasterAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/admin-panel/")
            self.end_headers()
            return

        if parsed.path == "/api/runtime-info":
            return self._write_json(
                HTTPStatus.OK,
                {
                    "isOperatorContext": True,
                    "runtime": "python",
                    "repoRoot": str(REPO_ROOT),
                },
            )

        if parsed.path == "/admin-panel":
            self.path = "/admin-panel/"
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/commands/run":
            return self._handle_run_command()
        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Route nicht gefunden."})

    def _handle_run_command(self) -> None:
        try:
            payload = self._read_json_body()
            request = CommandRequest(
                command=str(payload.get("command") or "").strip(),
                cwd=sanitize_cwd(payload.get("cwd")),
            )
            result = run_command(request)
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

        return self._write_json(HTTPStatus.OK, result)

    def _read_json_body(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Ungültiger JSON-Body.") from exc

    def _write_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path: str) -> str:
        if path.endswith(".webmanifest"):
            return "application/manifest+json"
        return mimetypes.guess_type(path)[0] or "application/octet-stream"



def main(argv: Iterable[str] | None = None) -> int:
    _ = list(argv or sys.argv[1:])
    server = ThreadingHTTPServer((DEFAULT_HOST, DEFAULT_PORT), MiniMasterAdminHandler)
    print(f"MiniMaster Python Admin läuft auf http://{DEFAULT_HOST}:{DEFAULT_PORT}/admin-panel/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer wird beendet…")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
