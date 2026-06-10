#!/usr/bin/env python3
"""Kombinatorischer Test-Matrix-Generator (n-wise / pairwise) fuer MiniMaster.

Bisher werden Android-Versionen pro Szenario in qa/catalog/*.json *handverlesen*
(z. B. ["10","13","15","16"]). Niemand kann begruenden, warum gerade diese vier –
und welche Feature/Version/Profil-Kombinationen dadurch *nicht* abgedeckt sind.

Dieses Skript ersetzt das durch eine **deterministische, beweisbare Abdeckung**:
Aus den Dimensionen (Android-Version x Device-Profil x Rolle x Fehlermodus) eines
Szenarios wird ein *Covering Array* der Staerke t erzeugt. Bei t=2 (pairwise) ist
garantiert, dass *jedes Paar* aus zwei Dimensionen mindestens einmal gemeinsam
getestet wird – meist mit einem Bruchteil der Zeilen des vollen Kreuzprodukts.

Verwendung:
    python scripts/combinatorial_matrix.py                       # alle Szenarien, pairwise
    python scripts/combinatorial_matrix.py --profile minimal     # nur Versionen des Profils
    python scripts/combinatorial_matrix.py --strength 3          # 3-wise
    python scripts/combinatorial_matrix.py --scenario rule-sync-lock-unlock
    python scripts/combinatorial_matrix.py --format table
    python scripts/combinatorial_matrix.py --json-out build/test-automation/matrix.json
    python scripts/combinatorial_matrix.py --selftest            # Abdeckung verifizieren

Exit-Codes: 0 ok, 1 ungueltige Eingabe, 2 Selbsttest fehlgeschlagen.
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path
from typing import Iterable, Sequence, cast

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_ROOT = REPO_ROOT / "qa" / "catalog"
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "test-automation" / "combinatorial-matrix.json"


# --------------------------------------------------------------------------- #
# Generischer Covering-Array-Generator (reine Standardbibliothek)
# --------------------------------------------------------------------------- #

Parameters = "list[tuple[str, list[str]]]"


def _required_combinations(
    params: list[tuple[str, list[str]]], strength: int
) -> set[tuple[tuple[int, str], ...]]:
    """Alle t-wise Wert-Kombinationen, die mindestens einmal vorkommen muessen."""
    required: set[tuple[tuple[int, str], ...]] = set()
    indices = range(len(params))
    for combo_idx in itertools.combinations(indices, strength):
        value_lists = [params[i][1] for i in combo_idx]
        for value_tuple in itertools.product(*value_lists):
            required.add(tuple(zip(combo_idx, value_tuple)))
    return required


def _row_covers(
    row: tuple[str, ...], required: set[tuple[tuple[int, str], ...]], strength: int
) -> set[tuple[tuple[int, str], ...]]:
    covered: set[tuple[tuple[int, str], ...]] = set()
    indices = range(len(row))
    for combo_idx in itertools.combinations(indices, strength):
        key = tuple((i, row[i]) for i in combo_idx)
        if key in required:
            covered.add(key)
    return covered


def generate_covering_array(
    params: list[tuple[str, list[str]]], strength: int = 2
) -> list[dict[str, str]]:
    """Deterministischer seed-basierter (AETG-aehnlicher) Covering-Array-Generator.

    Liefert eine Liste von Zeilen (dict name->wert), sodass jede t-wise
    Wert-Kombination mindestens einmal abgedeckt ist. Deterministisch: keine
    Zufallswerte, damit CI-Laeufe reproduzierbar sind.

    Jede Zeile startet mit einer noch *unabgedeckten* t-Kombination als Saat und
    fuellt die restlichen Parameter greedy auf. Da die Saat selbst Teil der Zeile
    ist, deckt jede Zeile garantiert mindestens eine offene Kombination ab –
    der Algorithmus terminiert also immer und deckt am Ende alles ab.
    """
    if strength < 1:
        raise ValueError("strength muss >= 1 sein")
    if not params:
        return []
    for name, values in params:
        if not values:
            raise ValueError(f"Parameter '{name}' darf keine leere Werteliste haben")
    effective_strength = min(strength, len(params))
    required = _required_combinations(params, effective_strength)

    names = [name for name, _ in params]
    rows: list[tuple[str, ...]] = []

    while required:
        # Saat: die offene Kombination mit der hoechsten Wert-Beteiligung an
        # weiteren offenen Kombinationen (deterministisch durch sort + Index).
        participation = _value_participation(required)
        seed = max(
            sorted(required),
            key=lambda combo: sum(participation[(pi, val)] for pi, val in combo),
        )
        assigned: dict[int, str] = {pi: val for pi, val in seed}

        # Restliche Parameter in fester Reihenfolge greedy auffuellen.
        for param_index in range(len(params)):
            if param_index in assigned:
                continue
            best_value = params[param_index][1][0]
            best_score = (-1, -1)
            for value in params[param_index][1]:
                trial = dict(assigned)
                trial[param_index] = value
                immediate = _closed_gain(trial, required, effective_strength)
                future = participation.get((param_index, value), 0)
                score = (immediate, future)
                if score > best_score:
                    best_score = score
                    best_value = value
            assigned[param_index] = best_value

        row = tuple(assigned[i] for i in range(len(params)))
        newly = _row_covers(row, required, effective_strength)
        required -= newly
        rows.append(row)

    return [dict(zip(names, row)) for row in rows]


def _value_participation(
    required: set[tuple[tuple[int, str], ...]]
) -> dict[tuple[int, str], int]:
    """Zaehlt, in wie vielen offenen Kombinationen jeder (Param, Wert) vorkommt."""
    counts: dict[tuple[int, str], int] = {}
    for combo in required:
        for member in combo:
            counts[member] = counts.get(member, 0) + 1
    return counts


def _closed_gain(
    assigned: dict[int, str],
    required: set[tuple[tuple[int, str], ...]],
    strength: int,
) -> int:
    """Anzahl offener Kombinationen, die durch die bisherigen Zuweisungen vollstaendig abgedeckt sind."""
    gain = 0
    for combo in required:
        if all(pi in assigned and assigned[pi] == val for (pi, val) in combo):
            gain += 1
    return gain


# --------------------------------------------------------------------------- #
# Katalog-Anbindung (Domain-Schicht)
# --------------------------------------------------------------------------- #

def _read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_dual_device_scenarios() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json(CATALOG_ROOT / "dual-device-scenarios.json"))


def load_device_profiles() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json(CATALOG_ROOT / "device-profiles.json"))


def load_execution_profiles() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json(CATALOG_ROOT / "execution-profiles.json"))


def _str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _execution_profile_versions(profile_id: str | None) -> set[str] | None:
    if not profile_id:
        return None
    for profile in load_execution_profiles():
        if str(profile.get("profileId") or "").strip() == profile_id:
            return set(_str_list(profile.get("androidVersions")))
    raise ValueError(f"Unbekanntes Execution-Profil: {profile_id}")


def _dual_device_profile_ids() -> list[str]:
    return [
        str(profile.get("profileId") or "").strip()
        for profile in load_device_profiles()
        if str(profile.get("deviceMode") or "").strip() == "dual-device"
    ]


def build_scenario_parameters(
    scenario: dict[str, object], *, execution_versions: set[str] | None
) -> list[tuple[str, list[str]]]:
    """Dimensionen eines Szenarios als Parameterliste fuer das Covering Array."""
    versions = _str_list(scenario.get("androidVersions"))
    if execution_versions is not None:
        versions = [v for v in versions if v in execution_versions]
    roles = _str_list(scenario.get("deviceRoles")) or ["child"]
    failure_modes = _str_list(scenario.get("failureModes"))
    failure_modes = ["none", *failure_modes]  # "none" = Happy Path immer abdecken
    device_profiles = _dual_device_profile_ids() or ["dual-device-balanced"]

    params: list[tuple[str, list[str]]] = []
    if versions:
        params.append(("androidVersion", versions))
    params.append(("deviceProfile", device_profiles))
    params.append(("role", roles))
    params.append(("failureMode", failure_modes))
    return params


def build_matrix(
    *,
    strength: int = 2,
    execution_profile: str | None = None,
    only_scenario: str | None = None,
) -> dict[str, object]:
    execution_versions = _execution_profile_versions(execution_profile)
    scenarios = load_dual_device_scenarios()
    if only_scenario:
        scenarios = [
            s for s in scenarios
            if str(s.get("scenarioId") or "").strip() == only_scenario
        ]
        if not scenarios:
            raise ValueError(f"Unbekanntes Szenario: {only_scenario}")

    scenario_blocks: list[dict[str, object]] = []
    grand_rows = 0
    grand_cartesian = 0

    for scenario in scenarios:
        scenario_id = str(scenario.get("scenarioId") or "").strip()
        params = build_scenario_parameters(scenario, execution_versions=execution_versions)
        # Szenarien ohne gueltige Version im gewaehlten Profil ueberspringen.
        if execution_versions is not None and not any(
            name == "androidVersion" for name, _ in params
        ):
            continue
        rows = generate_covering_array(params, strength=strength)
        cartesian = 1
        for _, values in params:
            cartesian *= max(1, len(values))
        for row in rows:
            row["scenarioId"] = scenario_id
        scenario_blocks.append({
            "scenarioId": scenario_id,
            "title": scenario.get("title"),
            "priority": scenario.get("priority"),
            "strength": min(strength, len(params)),
            "dimensions": {name: values for name, values in params},
            "rowCount": len(rows),
            "cartesianSize": cartesian,
            "reductionPercent": round((1 - len(rows) / cartesian) * 100, 1) if cartesian else 0.0,
            "rows": rows,
        })
        grand_rows += len(rows)
        grand_cartesian += cartesian

    return {
        "generator": "combinatorial_matrix",
        "strength": strength,
        "executionProfile": execution_profile,
        "scenarioCount": len(scenario_blocks),
        "totalRows": grand_rows,
        "totalCartesianSize": grand_cartesian,
        "overallReductionPercent": (
            round((1 - grand_rows / grand_cartesian) * 100, 1) if grand_cartesian else 0.0
        ),
        "scenarios": scenario_blocks,
    }


# --------------------------------------------------------------------------- #
# Selbsttest: verifiziert, dass die Abdeckung wirklich vollstaendig ist
# --------------------------------------------------------------------------- #

def verify_coverage(params: list[tuple[str, list[str]]], rows: list[dict[str, str]], strength: int) -> list[str]:
    """Gibt eine Liste *unabgedeckter* t-Kombinationen zurueck (leer = vollstaendig)."""
    names = [name for name, _ in params]
    effective = min(strength, len(params))
    required = _required_combinations(params, effective)
    for row in rows:
        tup = tuple(row[name] for name in names)
        required -= _row_covers(tup, required, effective)
    missing: list[str] = []
    for combo in sorted(required):
        missing.append(", ".join(f"{names[pi]}={val}" for pi, val in combo))
    return missing


def run_selftest() -> int:
    cases: list[tuple[str, list[tuple[str, list[str]]], int]] = [
        ("3x3x2 pairwise", [("a", ["1", "2", "3"]), ("b", ["x", "y", "z"]), ("c", ["p", "q"])], 2),
        ("4x3x3x2 pairwise", [
            ("ver", ["10", "12", "14", "15"]),
            ("prof", ["low", "bal", "high"]),
            ("mode", ["none", "drop", "delay"]),
            ("role", ["master", "child"]),
        ], 2),
        ("3x3x3 threewise", [("a", ["1", "2", "3"]), ("b", ["x", "y", "z"]), ("c", ["p", "q", "r"])], 3),
        ("single param", [("a", ["1", "2", "3"])], 2),
    ]
    failures = 0
    for label, params, strength in cases:
        rows = generate_covering_array(params, strength=strength)
        missing = verify_coverage(params, rows, strength)
        cartesian = 1
        for _, values in params:
            cartesian *= len(values)
        status = "OK" if not missing else "FAIL"
        if missing:
            failures += 1
        print(f"[{status}] {label}: {len(rows)} Zeilen (Kreuzprodukt {cartesian}), "
              f"{len(missing)} unabgedeckte Kombinationen")
        for entry in missing[:5]:
            print(f"        fehlt: {entry}")

    # Realer Katalog-Selbsttest ueber alle Szenarien.
    matrix = build_matrix(strength=2)
    for block in cast(list[dict[str, object]], matrix["scenarios"]):
        params = [(name, list(values)) for name, values in cast(dict, block["dimensions"]).items()]
        rows = cast(list[dict[str, str]], block["rows"])
        missing = verify_coverage(params, rows, 2)
        if missing:
            failures += 1
            print(f"[FAIL] Katalog-Szenario {block['scenarioId']}: "
                  f"{len(missing)} unabgedeckte Paare")
        else:
            print(f"[OK] Katalog-Szenario {block['scenarioId']}: "
                  f"{block['rowCount']} Zeilen, {block['reductionPercent']}% Reduktion")

    if failures:
        print(f"\nSelbsttest FEHLGESCHLAGEN: {failures} Faelle mit Luecken.")
        return 2
    print("\nSelbsttest bestanden: alle Covering Arrays vollstaendig.")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _render_table(matrix: dict[str, object]) -> str:
    lines: list[str] = []
    for block in cast(list[dict[str, object]], matrix["scenarios"]):
        lines.append("")
        lines.append(f"### {block['scenarioId']} ({block['priority']}) -> "
                     f"{block['rowCount']} Zeilen statt {block['cartesianSize']} "
                     f"(-{block['reductionPercent']}%)")
        rows = cast(list[dict[str, str]], block["rows"])
        if not rows:
            lines.append("  (keine gueltige Kombination im gewaehlten Profil)")
            continue
        keys = [k for k in ("androidVersion", "deviceProfile", "role", "failureMode") if k in rows[0]]
        header = " | ".join(f"{k:<16}" for k in keys)
        lines.append("  " + header)
        lines.append("  " + "-" * len(header))
        for row in rows:
            lines.append("  " + " | ".join(f"{row.get(k, ''):<16}" for k in keys))
    summary = (f"\nGesamt: {matrix['totalRows']} Zeilen statt "
               f"{matrix['totalCartesianSize']} (Kreuzprodukt) "
               f"= -{matrix['overallReductionPercent']}% ueber "
               f"{matrix['scenarioCount']} Szenarien (Staerke {matrix['strength']}).")
    return "\n".join(lines) + "\n" + summary


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Kombinatorischer Test-Matrix-Generator (n-wise)")
    parser.add_argument("--strength", type=int, default=2,
                        help="Covering-Array-Staerke (2=pairwise, 3=3-wise). Default 2.")
    parser.add_argument("--profile", default=None,
                        help="Execution-Profil (minimal|standard|full) zur Versionsfilterung.")
    parser.add_argument("--scenario", default=None,
                        help="Nur dieses Dual-Device-Szenario erzeugen.")
    parser.add_argument("--format", choices=("json", "table"), default="json",
                        help="Ausgabeformat. Default json.")
    parser.add_argument("--json-out", default=None,
                        help="Pfad fuer JSON-Export (zusaetzlich zur stdout-Ausgabe).")
    parser.add_argument("--selftest", action="store_true",
                        help="Verifiziert, dass alle Covering Arrays vollstaendig abdecken.")
    args = parser.parse_args(argv)

    if args.selftest:
        return run_selftest()

    try:
        matrix = build_matrix(
            strength=args.strength,
            execution_profile=args.profile,
            only_scenario=args.scenario,
        )
    except ValueError as exc:
        print(f"[FEHLER] {exc}", file=sys.stderr)
        return 1

    if args.json_out:
        out_path = Path(args.json_out)
        if not out_path.is_absolute():
            out_path = REPO_ROOT / out_path
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(matrix, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[OK] Matrix geschrieben: {out_path}", file=sys.stderr)

    if args.format == "table":
        print(_render_table(matrix))
    else:
        print(json.dumps(matrix, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
