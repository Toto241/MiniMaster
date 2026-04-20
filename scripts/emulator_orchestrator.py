#!/usr/bin/env python3
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol

import emulator_manager
from adb_client import AdbClient


REPO_ROOT = Path(__file__).resolve().parent.parent


class TargetAdapter(Protocol):
    platform: str

    def list_targets(self) -> list[dict[str, object]]: ...


@dataclass(frozen=True)
class EmulatorTarget:
    platform: str
    target_id: str
    display_name: str
    state: str
    runtime: str = ""
    serial: str = ""
    metadata: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class OrchestratorResult:
    platform: str
    operation: str
    ok: bool
    target_id: str = ""
    details: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class AndroidEmulatorAdapter:
    platform = "android"

    def __init__(self, repo_root: Path | None = None):
        self.repo_root = repo_root or REPO_ROOT

    def list_targets(self) -> list[dict[str, object]]:
        running = emulator_manager.list_running_emulators()
        avd_names = emulator_manager.list_avds()
        targets: list[EmulatorTarget] = []

        serial = str(running[0].get("serial", "")).strip() if running else ""
        runtime = str(running[0].get("androidVersion", "")).strip() if running else ""
        state = str(running[0].get("state", "stopped")).strip() if running else "stopped"

        for avd_name in avd_names:
            targets.append(
                EmulatorTarget(
                    platform=self.platform,
                    target_id=avd_name,
                    display_name=avd_name.replace("_", " "),
                    state=state,
                    runtime=runtime,
                    serial=serial,
                    metadata={"avdName": avd_name, "managed": True},
                )
            )

        for entry in running:
            running_serial = str(entry.get("serial", "")).strip()
            if not running_serial:
                continue
            if any(target.serial == running_serial for target in targets):
                continue
            targets.append(
                EmulatorTarget(
                    platform=self.platform,
                    target_id=running_serial,
                    display_name=str(entry.get("model") or running_serial),
                    state=str(entry.get("state") or "device"),
                    runtime=str(entry.get("androidVersion") or ""),
                    serial=running_serial,
                    metadata={"serial": running_serial, "managed": False, **entry},
                )
            )

        return [target.to_dict() for target in targets]

    def boot_target(
        self,
        avd_name: str,
        *,
        headless: bool = True,
        wipe_data: bool = False,
        no_snapshot: bool = True,
        timeout_sec: int = 240,
    ) -> dict[str, object]:
        start_result = emulator_manager.start_emulator(
            avd_name,
            headless=headless,
            wipe_data=wipe_data,
            no_snapshot=no_snapshot,
        )
        serial = self._await_serial(timeout_sec=timeout_sec)
        boot = emulator_manager.wait_for_emulator_ready(serial, timeout_sec=timeout_sec)
        return OrchestratorResult(
            platform=self.platform,
            operation="bootTarget",
            ok=True,
            target_id=avd_name,
            details={"avdName": avd_name, "serial": serial, "start": start_result, "boot": boot},
        ).to_dict()

    def shutdown_target(self, serial: str) -> dict[str, object]:
        stopped = emulator_manager.stop_emulator(serial)
        return OrchestratorResult(
            platform=self.platform,
            operation="shutdownTarget",
            ok=True,
            target_id=serial,
            details=stopped,
        ).to_dict()

    def install_artifact(self, serial: str, artifact_path: str | Path) -> dict[str, object]:
        adb = AdbClient(serial=serial)
        result = adb.install_apk(artifact_path)
        if not result.ok:
            raise ValueError(result.output or f"APK-Installation für {artifact_path} fehlgeschlagen.")
        return OrchestratorResult(
            platform=self.platform,
            operation="installArtifact",
            ok=True,
            target_id=serial,
            details={"serial": serial, "artifactPath": str(artifact_path), "output": result.output},
        ).to_dict()

    def open_deep_link(self, serial: str, url: str, *, package: str | None = None) -> dict[str, object]:
        adb = AdbClient(serial=serial)
        result = adb.open_deep_link(url, package=package)
        if not result.ok:
            raise ValueError(result.output or f"Deep Link {url} konnte nicht geöffnet werden.")
        return OrchestratorResult(
            platform=self.platform,
            operation="openDeepLink",
            ok=True,
            target_id=serial,
            details={"serial": serial, "url": url, "package": package or "", "output": result.output},
        ).to_dict()

    def capture_logs(self, serial: str, *, tag: str | None = None, since_seconds: int = 5, max_lines: int = 200) -> dict[str, object]:
        adb = AdbClient(serial=serial)
        result = adb.capture_logcat(tag=tag, since_seconds=since_seconds, max_lines=max_lines)
        if not result.ok:
            raise ValueError(result.output or "Logcat konnte nicht gelesen werden.")
        return OrchestratorResult(
            platform=self.platform,
            operation="captureLogs",
            ok=True,
            target_id=serial,
            details={
                "serial": serial,
                "tag": tag or "",
                "lines": [line for line in result.stdout.splitlines() if line.strip()],
            },
        ).to_dict()

    def capture_screenshot(self, serial: str, destination: str | Path) -> dict[str, object]:
        adb = AdbClient(serial=serial)
        result = adb.capture_screenshot(destination)
        if not result.ok:
            raise ValueError(result.output or result.stderr or "Screenshot konnte nicht erstellt werden.")
        return OrchestratorResult(
            platform=self.platform,
            operation="captureScreenshot",
            ok=True,
            target_id=serial,
            details={"serial": serial, "path": result.stdout.strip() or str(destination)},
        ).to_dict()

    def record_video(self, serial: str, destination: str | Path, *, time_limit_sec: int = 30, bit_rate: int | None = None) -> dict[str, object]:
        adb = AdbClient(serial=serial)
        destination_path = Path(destination)
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        remote_path = f"/sdcard/minimaster-recording-{int(time.time())}.mp4"
        record = adb.record_screen(remote_path, time_limit_sec=time_limit_sec, bit_rate=bit_rate)
        if not record.ok:
            raise ValueError(record.output or record.stderr or "Screenrecord konnte nicht gestartet werden.")
        pull = adb.pull_file(remote_path, destination_path)
        if not pull.ok:
            raise ValueError(pull.output or pull.stderr or "Aufzeichnung konnte nicht kopiert werden.")
        adb.run(["shell", "rm", remote_path], timeout=15)
        return OrchestratorResult(
            platform=self.platform,
            operation="recordVideo",
            ok=True,
            target_id=serial,
            details={"serial": serial, "path": str(destination_path), "remotePath": remote_path},
        ).to_dict()

    def _await_serial(self, *, timeout_sec: int = 240) -> str:
        deadline = time.time() + max(30, timeout_sec)
        while time.time() < deadline:
            running = emulator_manager.list_running_emulators()
            serials = [str(item.get("serial", "")).strip() for item in running if str(item.get("serial", "")).strip()]
            if serials:
                return serials[-1]
            time.sleep(2)
        raise ValueError("Kein Emulator-Serial erkannt.")


class EmulatorOrchestrator:
    def __init__(self, adapters: list[TargetAdapter] | None = None):
        self.adapters = {adapter.platform: adapter for adapter in (adapters or [AndroidEmulatorAdapter()])}

    def list_targets(self, platform: str | None = None) -> list[dict[str, object]]:
        if platform:
            return self._adapter(platform).list_targets()
        targets: list[dict[str, object]] = []
        for adapter in self.adapters.values():
            targets.extend(adapter.list_targets())
        return targets

    def boot_target(self, platform: str, target_id: str, **kwargs: object) -> dict[str, object]:
        return self._adapter(platform).boot_target(target_id, **kwargs)

    def shutdown_target(self, platform: str, target_id: str) -> dict[str, object]:
        return self._adapter(platform).shutdown_target(target_id)

    def install_artifact(self, platform: str, target_id: str, artifact_path: str | Path) -> dict[str, object]:
        return self._adapter(platform).install_artifact(target_id, artifact_path)

    def open_deep_link(self, platform: str, target_id: str, url: str, **kwargs: object) -> dict[str, object]:
        return self._adapter(platform).open_deep_link(target_id, url, **kwargs)

    def capture_logs(self, platform: str, target_id: str, **kwargs: object) -> dict[str, object]:
        return self._adapter(platform).capture_logs(target_id, **kwargs)

    def capture_screenshot(self, platform: str, target_id: str, destination: str | Path) -> dict[str, object]:
        return self._adapter(platform).capture_screenshot(target_id, destination)

    def record_video(self, platform: str, target_id: str, destination: str | Path, **kwargs: object) -> dict[str, object]:
        return self._adapter(platform).record_video(target_id, destination, **kwargs)

    def _adapter(self, platform: str) -> Any:
        normalized = platform.strip().lower()
        adapter = self.adapters.get(normalized)
        if adapter is None:
            raise ValueError(f"Kein Adapter für Plattform {platform} registriert.")
        return adapter


def default_evidence_dir() -> Path:
    return REPO_ROOT / "build" / "emulator-orchestrator"


def build_artifact_path(app_id: str, filename: str) -> Path:
    safe_app_id = app_id.strip() or "android"
    target_dir = default_evidence_dir() / safe_app_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / filename