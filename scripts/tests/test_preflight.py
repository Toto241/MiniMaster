from __future__ import annotations

import json
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import preflight


def _write_google_services(path: Path, *packages: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clients = [
        {
            "client_info": {
                "mobilesdk_app_id": f"1:123:android:{idx}",
                "android_client_info": {"package_name": package},
            },
            "api_key": [{"current_key": "AIzaSyExampleKey"}],
        }
        for idx, package in enumerate(packages)
    ]
    payload = {
        "project_info": {
            "project_number": "123456789",
            "project_id": "minimaster-prod",
            "storage_bucket": "minimaster-prod.firebasestorage.app",
        },
        "client": clients,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_google_services_package_names_are_extracted(tmp_path: Path):
    config = tmp_path / "google-services.json"
    _write_google_services(config, "com.minimaster.masterapp", "com.minimaster.childapp")

    assert preflight._google_services_package_names(config) == [
        "com.minimaster.childapp",
        "com.minimaster.masterapp",
    ]


def test_google_services_check_fails_when_expected_package_is_missing(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(preflight, "REPO_ROOT", tmp_path)
    _write_google_services(tmp_path / "childApp" / "google-services.json", "com.google.pairing")

    result = preflight._check_google_services_file(
        "config-gs-child",
        "childApp/google-services.json",
        "childApp/google-services.json",
        "com.minimaster.childapp",
    )

    assert result.status == "fail"
    assert result.required is True
    assert "com.minimaster.childapp" in result.details
    assert "com.google.pairing" in result.details


def test_google_services_check_passes_for_expected_package(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(preflight, "REPO_ROOT", tmp_path)
    _write_google_services(tmp_path / "childApp" / "google-services.json", "com.minimaster.childapp")

    result = preflight._check_google_services_file(
        "config-gs-child",
        "childApp/google-services.json",
        "childApp/google-services.json",
        "com.minimaster.childapp",
    )

    assert result.status == "ok"
    assert "Package-ID com.minimaster.childapp gefunden" in result.details
