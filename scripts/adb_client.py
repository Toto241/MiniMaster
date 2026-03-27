#!/usr/bin/env python3
"""
Python ADB-Wrapper für MiniMaster USB-Testautomatisierung.

Kapselt alle ADB-Interaktionen (Geräterkennung, Broadcast, Logcat, APK-Install,
Screen-State) in einer sauberen Python-API.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

IS_WINDOWS = os.name == "nt"
REPO_ROOT = Path(__file__).resolve().parent.parent


def _adb_binary() -> str:
    """Gibt den ADB-Befehlsnamen zurück."""
    return "adb.exe" if IS_WINDOWS else "adb"


def adb_available() -> bool:
    """Prüft ob ADB im PATH erreichbar ist."""
    return shutil.which(_adb_binary()) is not None


@dataclass(frozen=True)
class AdbDevice:
    serial: str
    state: str  # "device", "offline", "unauthorized", etc.

    @property
    def is_ready(self) -> bool:
        return self.state == "device"


@dataclass
class AdbResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    @property
    def output(self) -> str:
        return (self.stdout + self.stderr).strip()


@dataclass
class TestCaseResult:
    classname: str
    name: str
    passed: bool
    message: str = ""


@dataclass
class InstrumentedTestSummary:
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    failures: list[TestCaseResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.failed == 0 and self.total > 0


class AdbClient:
    """Wrapper um adb-CLI-Befehle für ein bestimmtes Gerät."""

    def __init__(self, serial: str | None = None, timeout: int = 30):
        self.serial = serial
        self.timeout = timeout

    def _base_cmd(self) -> list[str]:
        cmd = [_adb_binary()]
        if self.serial:
            cmd.extend(["-s", self.serial])
        return cmd

    def run(self, args: Sequence[str], timeout: int | None = None) -> AdbResult:
        """Führt einen ADB-Befehl aus und gibt das Ergebnis zurück."""
        cmd = self._base_cmd() + list(args)
        effective_timeout = timeout if timeout is not None else self.timeout
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=effective_timeout,
                check=False,
            )
            return AdbResult(proc.returncode, proc.stdout or "", proc.stderr or "")
        except subprocess.TimeoutExpired:
            return AdbResult(124, "", f"ADB-Befehl Timeout nach {effective_timeout}s")
        except FileNotFoundError:
            return AdbResult(127, "", f"{_adb_binary()} nicht gefunden im PATH")

    # ── Geräte ────────────────────────────────────────────────────────────

    @staticmethod
    def list_devices() -> list[AdbDevice]:
        """Listet alle angeschlossenen ADB-Geräte auf."""
        adb = _adb_binary()
        try:
            proc = subprocess.run(
                [adb, "devices"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
                check=False,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []

        devices: list[AdbDevice] = []
        for line in proc.stdout.splitlines()[1:]:
            line = line.strip()
            if not line or "\t" not in line:
                continue
            parts = line.split("\t", 1)
            if len(parts) == 2:
                devices.append(AdbDevice(serial=parts[0].strip(), state=parts[1].strip()))
        return devices

    @staticmethod
    def first_ready_device() -> str | None:
        """Gibt die Serial-Nummer des ersten bereiten Geräts zurück."""
        for dev in AdbClient.list_devices():
            if dev.is_ready:
                return dev.serial
        return None

    # ── Broadcast ─────────────────────────────────────────────────────────

    def send_broadcast(self, action: str, extras: dict[str, str] | None = None) -> AdbResult:
        """Sendet einen Broadcast an das Gerät."""
        args = ["shell", "am", "broadcast", "-a", action]
        for key, value in (extras or {}).items():
            args.extend(["-e", key, value])
        return self.run(args)

    # ── Logcat ────────────────────────────────────────────────────────────

    def read_logcat(self, tag: str, max_lines: int = 50, since_seconds: int = 5) -> list[str]:
        """Liest aktuelle Logcat-Zeilen für einen bestimmten Tag."""
        result = self.run(["logcat", "-s", f"{tag}:D", "-d", "-T", str(since_seconds)])
        if not result.ok:
            return []
        lines = result.stdout.splitlines()
        return lines[-max_lines:] if len(lines) > max_lines else lines

    def clear_logcat(self) -> AdbResult:
        """Leert den Logcat-Buffer."""
        return self.run(["logcat", "-c"])

    # ── APK-Verwaltung ────────────────────────────────────────────────────

    def install_apk(self, apk_path: str | Path, reinstall: bool = True, downgrade: bool = True) -> AdbResult:
        """Installiert eine APK auf dem Gerät."""
        args = ["install"]
        if reinstall:
            args.append("-r")
        if downgrade:
            args.append("-d")
        args.append(str(apk_path))
        return self.run(args, timeout=120)

    def uninstall_package(self, package: str) -> AdbResult:
        """Deinstalliert ein Paket vom Gerät."""
        return self.run(["uninstall", package], timeout=30)

    # ── Geräte-Info ───────────────────────────────────────────────────────

    def get_screen_state(self) -> str:
        """Gibt den Display-Zustand zurück ('ON', 'OFF', 'unknown')."""
        result = self.run(["shell", "dumpsys", "display"], timeout=10)
        if not result.ok:
            return "unknown"
        if "mScreenState=ON" in result.stdout:
            return "ON"
        if "mScreenState=OFF" in result.stdout:
            return "OFF"
        return "unknown"

    def is_screen_locked(self) -> bool | None:
        """Prüft ob der Bildschirm gesperrt ist. None bei Fehler."""
        result = self.run(["shell", "dumpsys", "window"], timeout=10)
        if not result.ok:
            return None
        return "mDreamingLockscreen=true" in result.stdout or "isStatusBarKeyguard=true" in result.stdout

    def get_foreground_activity(self) -> str | None:
        """Gibt die aktuell sichtbare Activity zurück."""
        result = self.run(["shell", "dumpsys", "activity", "activities"], timeout=10)
        if not result.ok:
            return None
        for line in result.stdout.splitlines():
            if "mResumedActivity" in line or "topResumedActivity" in line:
                match = re.search(r"u0\s+([^\s}]+)", line)
                if match:
                    return match.group(1)
        return None

    def start_activity(self, component: str) -> AdbResult:
        """Startet eine Activity."""
        return self.run(["shell", "am", "start", "-n", component])

    def send_keyevent(self, keycode: int | str) -> AdbResult:
        """Sendet ein Keyevent."""
        return self.run(["shell", "input", "keyevent", str(keycode)])

    def get_installed_packages(self) -> list[str]:
        """Gibt alle installierten Paketnamen zurück."""
        result = self.run(["shell", "pm", "list", "packages"], timeout=15)
        if not result.ok:
            return []
        return [
            line.replace("package:", "").strip()
            for line in result.stdout.splitlines()
            if line.startswith("package:")
        ]

    def is_package_installed(self, package: str) -> bool:
        """Prüft ob ein Paket installiert ist."""
        return package in self.get_installed_packages()

    def get_device_model(self) -> str:
        """Gibt das Gerätemodell zurück."""
        result = self.run(["shell", "getprop", "ro.product.model"])
        return result.stdout.strip() if result.ok else "unknown"

    def get_android_version(self) -> str:
        """Gibt die Android-Version zurück."""
        result = self.run(["shell", "getprop", "ro.build.version.release"])
        return result.stdout.strip() if result.ok else "unknown"

    # ── Hilfsfunktionen für Debug-Session ─────────────────────────────────

    def request_debug_challenge(self, package: str) -> str | None:
        """
        Fordert eine Challenge vom Gerät an und liest sie aus dem Logcat.

        Returns: Challenge-String oder None bei Fehler.
        """
        challenge_action = f"{package}.DEBUG_GET_CHALLENGE"
        challenge_tag = "MINIMASTER_DEBUG_CHALLENGE"
        if package == "com.google.pairing":
            challenge_tag = "MINIMASTER_DEBUG_CHALLENGE_CHILD"

        self.send_broadcast(challenge_action)
        time.sleep(0.7)

        lines = self.read_logcat(challenge_tag, since_seconds=5)
        for line in reversed(lines):
            if "CHALLENGE:" in line:
                parts = line.split("CHALLENGE:", 1)
                if len(parts) == 2:
                    return parts[1].strip()
        return None

    def activate_debug_session(self, package: str, token: str) -> bool:
        """
        Aktiviert die Debug-Session mit dem gegebenen Token.

        Returns: True bei Erfolg, False bei Fehler.
        """
        activate_action = f"{package}.DEBUG_ACTIVATE"
        self.send_broadcast(activate_action, extras={"response": token})
        time.sleep(0.5)

        log_tag = "MINIMASTER_DEBUG"
        if package == "com.google.pairing":
            log_tag = "MINIMASTER_DEBUG_CHILD"

        lines = self.read_logcat(log_tag, since_seconds=5)
        return any("Session activated" in line for line in lines)

    def deactivate_debug_session(self, package: str) -> AdbResult:
        """Deaktiviert die Debug-Session."""
        deactivate_action = f"{package}.DEBUG_DEACTIVATE"
        return self.send_broadcast(deactivate_action)


def resolve_latest_apk(app_id: str, repo_root: Path | None = None) -> Path | None:
    """
    Sucht die neueste APK im Build-Ausgabeverzeichnis.

    Args:
        app_id: "master" oder "child"
        repo_root: Repository-Wurzelverzeichnis

    Returns: Pfad zur APK oder None.
    """
    root = repo_root or REPO_ROOT
    apk_dir = root / f"{app_id}App" / "build" / "outputs" / "apk"
    if not apk_dir.exists():
        return None

    apks = sorted(apk_dir.rglob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True)
    return apks[0] if apks else None
