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
class ChallengeRequestResult:
    challenge: str | None = None
    reason: str | None = None
    details: str = ""

    @property
    def ok(self) -> bool:
        return self.challenge is not None


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

    def send_broadcast(
        self,
        action: str,
        extras: dict[str, str] | None = None,
        component: str | None = None,
        receiver_foreground: bool = False,
    ) -> AdbResult:
        """Sendet einen Broadcast an das Gerät."""
        args = ["shell", "am", "broadcast", "-a", action]
        if receiver_foreground:
            args.append("--receiver-foreground")
        if component:
            args.extend(["-n", component])
        for key, value in (extras or {}).items():
            args.extend(["-e", key, value])
        return self.run(args)

    @staticmethod
    def debug_receiver_component(package: str) -> str | None:
        """Gibt die explizite Receiver-Komponente für bekannte Debug-Interfaces zurück."""
        mapping = {
            "com.minimaster.masterapp": "com.minimaster.masterapp/com.minimaster.masterapp.debug.DebugBroadcastReceiver",
            "com.google.pairing": "com.google.pairing/com.google.pairing.debug.DebugBroadcastReceiver",
        }
        return mapping.get(package)

    @staticmethod
    def extract_broadcast_result_data(output: str) -> str | None:
        """Extrahiert result/data-Felder aus der Ausgabe von `adb shell am broadcast`."""
        if not output:
            return None

        patterns = [
            r"\bdata=\"([^\"]+)\"",
            r"\bdata=([^\s]+)",
            r"resultData=\"([^\"]+)\"",
            r"resultData=([^\s]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, output)
            if match:
                return match.group(1).strip()
        return None

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

    def open_deep_link(self, url: str, package: str | None = None, wait_for_launch: bool = True) -> AdbResult:
        """Öffnet einen Deep Link über den Activity Manager."""
        args = ["shell", "am", "start"]
        if wait_for_launch:
            args.append("-W")
        args.extend(["-a", "android.intent.action.VIEW", "-d", url])
        if package:
            args.append(package)
        return self.run(args, timeout=30)

    def capture_logcat(self, tag: str | None = None, since_seconds: int = 5, max_lines: int | None = None) -> AdbResult:
        """Liest Logcat-Ausgabe optional gefiltert nach Tag."""
        args = ["logcat", "-d", "-T", str(since_seconds)]
        if tag:
            args.extend(["-s", f"{tag}:D"])
        result = self.run(args, timeout=30)
        if not result.ok or max_lines is None:
            return result
        lines = result.stdout.splitlines()
        trimmed = "\n".join(lines[-max_lines:])
        return AdbResult(result.returncode, trimmed + ("\n" if trimmed else ""), result.stderr)

    def capture_screenshot(self, destination: str | Path) -> AdbResult:
        """Erstellt einen PNG-Screenshot direkt auf dem Host."""
        target = Path(destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        cmd = self._base_cmd() + ["exec-out", "screencap", "-p"]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return AdbResult(124, "", "ADB-Befehl Timeout nach 30s")
        except FileNotFoundError:
            return AdbResult(127, "", f"{_adb_binary()} nicht gefunden im PATH")

        stdout = proc.stdout or b""
        stderr = (proc.stderr or b"").decode("utf-8", errors="replace")
        if proc.returncode == 0:
            target.write_bytes(stdout)
            return AdbResult(proc.returncode, str(target), stderr)
        return AdbResult(proc.returncode, "", stderr)

    def record_screen(self, device_destination: str, *, time_limit_sec: int = 30, bit_rate: int | None = None) -> AdbResult:
        """Startet eine Bildschirmaufzeichnung auf dem Gerät."""
        args = ["shell", "screenrecord", "--time-limit", str(max(1, min(time_limit_sec, 180)))]
        if bit_rate is not None:
            args.extend(["--bit-rate", str(bit_rate)])
        args.append(device_destination)
        return self.run(args, timeout=max(35, time_limit_sec + 10))

    def pull_file(self, remote_path: str, local_path: str | Path) -> AdbResult:
        """Kopiert eine Datei vom Gerät auf den Host."""
        target = Path(local_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        return self.run(["pull", remote_path, str(target)], timeout=60)

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
        result = self.request_debug_challenge_result(package)
        return result.challenge

    def request_debug_challenge_result(self, package: str) -> ChallengeRequestResult:
        """
        Fordert eine Challenge vom Gerät an und liest sie aus dem Logcat.

        Returns: strukturierte Diagnose mit Challenge oder Fehlergrund.
        """
        challenge_action = f"{package}.DEBUG_GET_CHALLENGE"
        challenge_tag = "MINIMASTER_DEBUG_CHALLENGE"
        debug_tag = "MINIMASTER_DEBUG"
        if package == "com.google.pairing":
            challenge_tag = "MINIMASTER_DEBUG_CHALLENGE_CHILD"
            debug_tag = "MINIMASTER_DEBUG_CHILD"

        self.clear_logcat()
        broadcast_result = self.send_broadcast(
            challenge_action,
            component=self.debug_receiver_component(package),
            receiver_foreground=True,
        )
        if not broadcast_result.ok:
            return ChallengeRequestResult(
                reason="ADB-Broadcast für die Challenge ist fehlgeschlagen.",
                details=broadcast_result.output,
            )

        broadcast_challenge = self.extract_broadcast_result_data(broadcast_result.output)
        if broadcast_challenge == "DEBUG_INTERFACE_DISABLED":
            return ChallengeRequestResult(
                reason="Debug-Interface ist im App-Build deaktiviert. Secret in local.properties prüfen und die APK neu bauen.",
                details=broadcast_result.output,
            )
        if broadcast_challenge:
            return ChallengeRequestResult(
                challenge=broadcast_challenge,
                details=f"Broadcast: {broadcast_result.output.strip()}",
            )

        deadline = time.time() + 3.0
        last_debug_lines: list[str] = []
        while time.time() < deadline:
            challenge_lines = self.read_logcat(challenge_tag, since_seconds=5)
            for line in reversed(challenge_lines):
                if "CHALLENGE:" in line:
                    parts = line.split("CHALLENGE:", 1)
                    if len(parts) == 2:
                        return ChallengeRequestResult(challenge=parts[1].strip(), details=line.strip())

            last_debug_lines = self.read_logcat(debug_tag, since_seconds=5)
            if any("DISABLED" in line for line in last_debug_lines):
                details = "\n".join(last_debug_lines[-5:])
                return ChallengeRequestResult(
                    reason="Debug-Interface ist im App-Build deaktiviert. Secret in local.properties prüfen und die APK neu bauen.",
                    details=details,
                )

            time.sleep(0.4)

        details_parts: list[str] = []
        if broadcast_result.output:
            details_parts.append(f"Broadcast: {broadcast_result.output}")
        if last_debug_lines:
            details_parts.append("Logcat:\n" + "\n".join(last_debug_lines[-5:]))

        return ChallengeRequestResult(
            reason=(
                "Challenge nicht aus Logcat lesbar. Die APK ist zwar installiert, aber das Debug-Secret "
                "ist vermutlich nicht im Build enthalten oder der ADB-Broadcast wurde vom Gerät blockiert."
            ),
            details="\n\n".join(details_parts),
        )

    def activate_debug_session(self, package: str, token: str) -> bool:
        """
        Aktiviert die Debug-Session mit dem gegebenen Token.

        Returns: True bei Erfolg, False bei Fehler.
        """
        activate_action = f"{package}.DEBUG_ACTIVATE"
        self.send_broadcast(
            activate_action,
            extras={"response": token},
            component=self.debug_receiver_component(package),
            receiver_foreground=True,
        )
        time.sleep(0.5)

        log_tag = "MINIMASTER_DEBUG"
        if package == "com.google.pairing":
            log_tag = "MINIMASTER_DEBUG_CHILD"

        lines = self.read_logcat(log_tag, since_seconds=5)
        return any("Session activated" in line for line in lines)

    def deactivate_debug_session(self, package: str) -> AdbResult:
        """Deaktiviert die Debug-Session."""
        deactivate_action = f"{package}.DEBUG_DEACTIVATE"
        return self.send_broadcast(
            deactivate_action,
            component=self.debug_receiver_component(package),
            receiver_foreground=True,
        )


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

    # Nur installierbare App-APKs berücksichtigen; androidTest-Artefakte sind keine Ziel-App.
    preferred_apks = sorted(
        (
            apk for apk in apk_dir.rglob("*.apk")
            if "androidtest" not in apk.name.lower()
            and "androidtest" not in {part.lower() for part in apk.parts}
        ),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if preferred_apks:
        return preferred_apks[0]

    apks = sorted(apk_dir.rglob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True)
    return apks[0] if apks else None
