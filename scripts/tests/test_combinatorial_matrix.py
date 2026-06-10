"""Tests für combinatorial_matrix.py — n-wise Covering-Array-Generator."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from combinatorial_matrix import (
    build_matrix,
    generate_covering_array,
    run_selftest,
    verify_coverage,
)


# ═══════════════════════════════════════════════════════════════════
#  Generischer Covering-Array-Generator
# ═══════════════════════════════════════════════════════════════════

class TestCoveringArray:
    def test_pairwise_covers_all_pairs(self):
        params = [
            ("ver", ["10", "12", "14", "15"]),
            ("prof", ["low", "bal", "high"]),
            ("mode", ["none", "drop", "delay"]),
            ("role", ["master", "child"]),
        ]
        rows = generate_covering_array(params, strength=2)
        assert verify_coverage(params, rows, 2) == []

    def test_pairwise_is_smaller_than_cartesian(self):
        params = [
            ("ver", ["10", "12", "14", "15"]),
            ("prof", ["low", "bal", "high"]),
            ("mode", ["none", "drop", "delay"]),
            ("role", ["master", "child"]),
        ]
        rows = generate_covering_array(params, strength=2)
        # Kreuzprodukt waere 72; pairwise muss deutlich kleiner sein.
        assert len(rows) < 72
        assert len(rows) <= 20

    def test_threewise_covers_all_triples(self):
        params = [("a", ["1", "2", "3"]), ("b", ["x", "y", "z"]), ("c", ["p", "q", "r"])]
        rows = generate_covering_array(params, strength=3)
        assert verify_coverage(params, rows, 3) == []

    def test_strength_capped_at_param_count(self):
        # Strength 5 bei 2 Parametern degradiert sauber auf 2-wise (= Kreuzprodukt).
        params = [("a", ["1", "2"]), ("b", ["x", "y"])]
        rows = generate_covering_array(params, strength=5)
        assert verify_coverage(params, rows, 2) == []

    def test_deterministic_output(self):
        params = [("a", ["1", "2", "3"]), ("b", ["x", "y", "z"]), ("c", ["p", "q"])]
        first = generate_covering_array(params, strength=2)
        second = generate_covering_array(params, strength=2)
        assert first == second

    def test_empty_params(self):
        assert generate_covering_array([], strength=2) == []

    def test_empty_value_list_raises(self):
        import pytest

        with pytest.raises(ValueError):
            generate_covering_array([("ver", ["10"]), ("mode", [])], strength=2)

    def test_single_param(self):
        params = [("a", ["1", "2", "3"])]
        rows = generate_covering_array(params, strength=2)
        assert {r["a"] for r in rows} == {"1", "2", "3"}


# ═══════════════════════════════════════════════════════════════════
#  Katalog-Anbindung
# ═══════════════════════════════════════════════════════════════════

class TestCatalogMatrix:
    def test_build_matrix_full_coverage(self):
        matrix = build_matrix(strength=2)
        assert matrix["scenarioCount"] > 0
        for block in matrix["scenarios"]:
            params = [(name, list(values)) for name, values in block["dimensions"].items()]
            assert verify_coverage(params, block["rows"], 2) == [], (
                f"Szenario {block['scenarioId']} unvollstaendig abgedeckt"
            )

    def test_build_matrix_reduces_rows(self):
        matrix = build_matrix(strength=2)
        assert matrix["totalRows"] < matrix["totalCartesianSize"]
        assert matrix["overallReductionPercent"] > 0

    def test_profile_filters_versions(self):
        minimal = build_matrix(strength=2, execution_profile="minimal")
        full = build_matrix(strength=2, execution_profile="full")
        # Vollprofil deckt mindestens so viele Versionen ab wie Minimal.
        assert full["totalRows"] >= minimal["totalRows"]

    def test_unknown_profile_raises(self):
        import pytest

        with pytest.raises(ValueError):
            build_matrix(strength=2, execution_profile="does-not-exist")

    def test_unknown_scenario_raises(self):
        import pytest

        with pytest.raises(ValueError):
            build_matrix(strength=2, only_scenario="nope")


# ═══════════════════════════════════════════════════════════════════
#  Selbsttest-Gate (genutzt vom CLI und der CI)
# ═══════════════════════════════════════════════════════════════════

def test_cli_selftest_passes():
    assert run_selftest() == 0
