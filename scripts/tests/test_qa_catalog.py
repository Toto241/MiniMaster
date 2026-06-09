from __future__ import annotations

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from qa_catalog import build_qa_catalog, export_qa_catalog, load_android_version_matrix


class TestQaCatalog:
    def test_build_catalog_contains_core_sections(self):
        result = build_qa_catalog()

        assert result["catalogMaturity"] == "seed"
        assert "androidMatrix" in result
        assert "deviceProfiles" in result
        assert "executionProfiles" in result
        assert "dualDeviceScenarios" in result
        assert "androidScenarioMappings" in result
        assert "suiteEntries" in result
        assert "inventoryEntries" in result
        assert "automationBacklog" in result
        assert "classificationTypes" in result

    def test_execution_profiles_cover_minimal_standard_full(self):
        result = build_qa_catalog()

        assert [entry["profileId"] for entry in result["executionProfiles"]] == ["minimal", "standard", "full"]

    def test_android_matrix_covers_versions_10_to_16(self):
        matrix = load_android_version_matrix()
        versions = [entry["androidVersion"] for entry in matrix]
        assert versions == ["10", "11", "12", "13", "14", "15", "16"]

    def test_dual_device_scenarios_have_both_roles(self):
        result = build_qa_catalog()
        assert result["dualDeviceScenarios"]

        for scenario in result["dualDeviceScenarios"]:
            assert scenario["deviceRoles"] == ["master", "child"]

    def test_suite_entries_include_device_modes(self):
        result = build_qa_catalog()
        suite_entries = {entry["id"]: entry for entry in result["suiteEntries"]}

        assert suite_entries["android-connected-master"]["deviceMode"] == "single-device"
        assert suite_entries["android-e2e-shell-script"]["deviceMode"] == "dual-device"
        assert suite_entries["backend-jest"]["deviceMode"] == "host"
        assert suite_entries["android-unit-master"]["testLevel"] == "module"
        assert suite_entries["android-e2e-shell-script"]["testLevel"] == "system"
        assert suite_entries["android-unit-master"]["appRole"] == "parent"
        assert "full" in suite_entries["android-e2e-shell-script"]["executionProfiles"]

    def test_suite_entries_include_release_automation_metadata(self):
        result = build_qa_catalog()
        suite_entries = {entry["id"]: entry for entry in result["suiteEntries"]}

        backend = suite_entries["backend-jest"]
        assert backend["automationType"] == "automated"
        assert backend["environmentRequirement"] == "lokaler Host/CI"
        assert backend["evidenceTarget"] == "build/test-automation/latest-summary.json"
        assert backend["migrationPriority"] == backend["priority"]

        e2e = suite_entries["android-e2e-shell-script"]
        assert e2e["automationType"] == "automated-with-device-prereqs"
        assert e2e["environmentRequirement"] == "zwei ADB-Targets oder Dual-AVD-Konfiguration"
        assert e2e["evidenceTarget"] == "build/test-automation/latest-summary.json"
        assert e2e["migrationPriority"] == e2e["priority"]

    def test_classification_types_cover_automation_manual_and_external(self):
        result = build_qa_catalog()
        classifications = {entry["classification"] for entry in result["classificationTypes"]}
        automation_types = {entry["automationType"] for entry in result["classificationTypes"]}

        assert {"automation", "manual", "external"}.issubset(classifications)
        assert {"automated", "manual", "external"}.issubset(automation_types)

    def test_android_scenario_mappings_reference_known_scenarios(self):
        result = build_qa_catalog()
        scenario_ids = {entry["scenarioId"] for entry in result["dualDeviceScenarios"]}

        assert result["androidScenarioMappings"]
        assert all(entry["scenarioId"] in scenario_ids for entry in result["androidScenarioMappings"])
        assert any(entry["role"] == "master" for entry in result["androidScenarioMappings"])
        assert any(entry["role"] == "child" for entry in result["androidScenarioMappings"])

    def test_catalog_summary_exposes_unmapped_scenarios(self):
        result = build_qa_catalog()

        assert result["summary"]["unmappedScenarioCount"] == 4
        assert set(result["summary"]["unmappedScenarioIds"]) == {
            "device-restart-recovery",
            "notification-permission-cross-device",
            "offline-online-resync",
            "pairing-code-expiry",
        }

    def test_export_writes_json_file(self, tmp_path: Path):
        output = tmp_path / "qa-catalog.json"

        payload = export_qa_catalog(output)

        assert output.exists()
        assert payload["summary"]["suiteCount"] >= 1
        assert payload["summary"]["androidScenarioMappingCount"] >= 1
