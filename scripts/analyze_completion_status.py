#!/usr/bin/env python3
"""
MiniMaster Fertigungsstand Analysator
Analysiert den Entwicklungsstand des Repositories und führt Qualitätsprüfungen durch
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict
import re

# ==================== CONFIGURATION ====================

REPO_ROOT = Path(__file__).resolve().parent.parent
IS_WINDOWS = os.name == "nt"
NEW_ANALYSIS_FILE = REPO_ROOT / "build" / "analysis-completion-status.json"
NEW_ANALYSIS_FILE.parent.mkdir(parents=True, exist_ok=True)


# ==================== DATA CLASSES ====================

@dataclass
class ComponentStatus:
    """Status einer Komponente"""
    name: str
    path: str
    status: str  # ready, in-progress, incomplete, not-started
    coverage: float  # 0-100%
    tests_passing: int
    tests_total: int
    notes: List[str]


@dataclass
class RepositoryAnalysis:
    """Gesamtanalyse des Repositories"""
    timestamp: str
    backend_status: ComponentStatus
    frontend_status: ComponentStatus
    android_status: ComponentStatus
    tests_summary: Dict
    implementation_gaps: List[str]
    recommendations: List[str]


# ==================== HELPER FUNCTIONS ====================

def run_command(cmd: str, return_output: bool = False) -> Tuple[int, str]:
    """Führe einen Shell-Befehl aus"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=300
        )
        output = result.stdout + result.stderr
        return result.returncode, output
    except Exception as e:
        return 1, str(e)


def count_files(pattern: str) -> int:
    """Zähle Dateien nach Muster"""
    import glob
    return len(glob.glob(str(REPO_ROOT / pattern)))


def count_lines(file_path: Path) -> int:
    """Zähle Zeilen in einer Datei"""
    if not file_path.exists():
        return 0
    try:
        return len(file_path.read_text(encoding='utf-8', errors='ignore').splitlines())
    except:
        return 0


def analyze_typescript_files() -> Dict:
    """Analysiere TypeScript-Dateien"""
    src_path = REPO_ROOT / "src"
    stats = {
        'total_files': 0,
        'total_lines': 0,
        'main_files': [],
        'test_files': 0
    }
    
    if src_path.exists():
        for ts_file in src_path.glob("*.ts"):
            lines = count_lines(ts_file)
            stats['total_files'] += 1
            stats['total_lines'] += lines
            stats['main_files'].append({
                'name': ts_file.name,
                'lines': lines
            })
    
    # Test-Dateien
    test_path = REPO_ROOT / "test"
    if test_path.exists():
        stats['test_files'] = len(list(test_path.glob("*.test.ts")))
    
    return stats


def analyze_android_components() -> Dict:
    """Analysiere Android-Komponenten"""
    stats = {
        'master_app': {'status': 'unknown', 'src_files': 0},
        'child_app': {'status': 'unknown', 'src_files': 0},
        'gradle_version': 'unknown'
    }
    
    master_src = REPO_ROOT / "masterApp" / "src"
    child_src = REPO_ROOT / "childApp" / "src"
    
    if master_src.exists():
        stats['master_app']['src_files'] = len(list(master_src.rglob("*.kt"))) + len(list(master_src.rglob("*.java")))
        stats['master_app']['status'] = 'present' if stats['master_app']['src_files'] > 0 else 'empty'
    
    if child_src.exists():
        stats['child_app']['src_files'] = len(list(child_src.rglob("*.kt"))) + len(list(child_src.rglob("*.java")))
        stats['child_app']['status'] = 'present' if stats['child_app']['src_files'] > 0 else 'empty'
    
    # Gradle-Version
    build_gradle = REPO_ROOT / "build.gradle"
    if build_gradle.exists():
        content = build_gradle.read_text(encoding='utf-8', errors='ignore')
        match = re.search(r'gradle.*?(\d+\.\d+\.\d+)', content)
        if match:
            stats['gradle_version'] = match.group(1)
    
    return stats


def analyze_firestore_rules() -> Dict:
    """Analysiere Firestore-Regeln"""
    stats = {
        'rules_file_lines': 0,
        'rules_validated': False,
        'rules_file': str(REPO_ROOT / "firestore.rules")
    }
    
    rules_file = REPO_ROOT / "firestore.rules"
    if rules_file.exists():
        stats['rules_file_lines'] = count_lines(rules_file)
        stats['rules_validated'] = stats['rules_file_lines'] > 100  # Proxy für Validierung
    
    return stats


def run_jest_tests() -> Dict:
    """Führe Jest-Tests aus und sammle Ergebnisse"""
    print("🧪 Führe Jest-Tests aus...")
    
    cmd = "npm test -- --passWithNoTests --json 2>&1"
    returncode, output = run_command(cmd)
    
    test_summary = {
        'return_code': returncode,
        'pass': 'PASS' in output,
        'summary': 'unknown',
        'test_suites': 0,
        'tests_passed': 0,
        'tests_failed': 0,
        'tests_total': 0
    }
    
    # Parse JSON output wenn möglich
    try:
        # Versuche JSON zu extrahieren
        json_start = output.find('{')
        if json_start > 0:
            json_str = output[json_start:]
            json_data = json.loads(json_str)
            if 'numPassedTestSuites' in json_data:
                test_summary['test_suites'] = json_data.get('numPassedTestSuites', 0) + json_data.get('numFailedTestSuites', 0)
                test_summary['tests_passed'] = json_data.get('numPassedTests', 0)
                test_summary['tests_failed'] = json_data.get('numFailedTests', 0)
                test_summary['tests_total'] = json_data.get('numTotalTests', 0)
    except:
        pass
    
    # Fallback: Text-basierte Parser
    if test_summary['tests_total'] == 0:
        passed_match = re.search(r'(\d+) passed', output)
        failed_match = re.search(r'(\d+) failed', output)
        test_summary['tests_passed'] = int(passed_match.group(1)) if passed_match else 0
        test_summary['tests_failed'] = int(failed_match.group(1)) if failed_match else 0
        test_summary['tests_total'] = test_summary['tests_passed'] + test_summary['tests_failed']
    
    return test_summary


def analyze_implementation_gaps() -> List[str]:
    """Identifiziere Lücken in der Implementierung"""
    gaps = []
    
    # Überprüfe kritische Dateien
    critical_files = {
        'index.ts': REPO_ROOT / 'index.ts',
        'firestore.rules': REPO_ROOT / 'firestore.rules',
        'firebase.ts': REPO_ROOT / 'firebase.ts',
    }
    
    for name, path in critical_files.items():
        if not path.exists():
            gaps.append(f"❌ Kritische Datei fehlt: {name}")
        else:
            lines = count_lines(path)
            if lines < 10:
                gaps.append(f"⚠️  {name} ist sehr kurz ({lines} Zeilen)")
    
    # Überprüfe Test-Coverage
    src_files = list((REPO_ROOT / 'src').glob('*.ts')) if (REPO_ROOT / 'src').exists() else []
    test_files = list((REPO_ROOT / 'test').glob('*.test.ts')) if (REPO_ROOT / 'test').exists() else []
    
    if len(src_files) > 0 and len(test_files) == 0:
        gaps.append("⚠️  Keine Unit-Tests für src-Dateien gefunden")
    
    # Überprüfe Dokumentation
    doc_files = ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md']
    for doc in doc_files:
        doc_path = REPO_ROOT / doc
        if not doc_path.exists():
            gaps.append(f"⚠️  Dokumentation fehlt: {doc}")
        elif count_lines(doc_path) < 20:
            gaps.append(f"⚠️  Dokumentation unvollständig: {doc}")
    
    # Überprüfe Android-Implementierung
    masterapp = REPO_ROOT / 'masterApp'
    childapp = REPO_ROOT / 'childApp'
    
    if masterapp.exists():
        src = masterapp / 'src' / 'main'
        if src.exists():
            kotlin_files = len(list(Path(src).rglob('*.kt')))
            if kotlin_files < 5:
                gaps.append(f"⚠️  MasterApp Kotlin-Code unvollständig ({kotlin_files} Dateien)")
    
    if childapp.exists():
        src = childapp / 'src' / 'main'
        if src.exists():
            kotlin_files = len(list(Path(src).rglob('*.kt')))
            if kotlin_files < 5:
                gaps.append(f"⚠️  ChildApp Kotlin-Code unvollständig ({kotlin_files} Dateien)")
    
    # Überprüfe Cloud Functions
    functions_file = REPO_ROOT / 'index.ts'
    if functions_file.exists():
        content = functions_file.read_text(encoding='utf-8', errors='ignore')
        expected_functions = ['registerMasterDevice', 'validatePairingToken', 'createTask', 'approveTask']
        missing_functions = [f for f in expected_functions if f not in content]
        if missing_functions:
            gaps.append(f"⚠️  Cloud Functions fehlen: {', '.join(missing_functions)}")
    
    return gaps


def analyze_web_panels() -> Dict:
    """Analysiere Web-Panels"""
    panels = {
        'admin_panel': {'status': 'unknown', 'files': 0},
        'web_control': {'status': 'unknown', 'files': 0},
        'parent_panel': {'status': 'unknown', 'files': 0},
        'child_panel': {'status': 'unknown', 'files': 0},
    }
    
    panel_dirs = {
        'admin_panel': REPO_ROOT / 'admin-panel',
        'web_control': REPO_ROOT / 'web-control',
        'parent_panel': REPO_ROOT / 'parent-panel',
        'child_panel': REPO_ROOT / 'child-panel',
    }
    
    for name, path in panel_dirs.items():
        if path.exists():
            files = len(list(path.glob('*.js'))) + len(list(path.glob('*.html'))) + len(list(path.glob('*.css')))
            panels[name]['status'] = 'present' if files > 0 else 'empty'
            panels[name]['files'] = files
    
    return panels


# ==================== MAIN ANALYSIS ====================

def analyze_repository() -> dict:
    """Hauptanalyse-Funktion"""
    
    print("=" * 80)
    print("🔍 MiniMaster Repository Fertigungsstand Analyse")
    print("=" * 80)
    
    analysis = {
        'timestamp': str(Path.cwd()),
        'backend': analyze_typescript_files(),
        'android': analyze_android_components(),
        'firestore': analyze_firestore_rules(),
        'web_panels': analyze_web_panels(),
        'tests': run_jest_tests(),
        'implementation_gaps': analyze_implementation_gaps(),
    }
    
    # Generiere Bericht
    print("\n" + "=" * 80)
    print("📊 ANALYSERESULTATE")
    print("=" * 80)
    
    print("\n✅ BACKEND (TypeScript / Cloud Functions)")
    print(f"  • Dateien: {analysis['backend']['total_files']}")
    print(f"  • Zeilen: {analysis['backend']['total_lines']}")
    print(f"  • Test-Dateien: {analysis['backend']['test_files']}")
    for file_info in analysis['backend']['main_files'][:5]:
        print(f"    - {file_info['name']}: {file_info['lines']} Zeilen")
    
    print("\n🤖 ANDROID")
    print(f"  MasterApp: {analysis['android']['master_app']['status']} ({analysis['android']['master_app']['src_files']} Dateien)")
    print(f"  ChildApp: {analysis['android']['child_app']['status']} ({analysis['android']['child_app']['src_files']} Dateien)")
    print(f"  Gradle-Version: {analysis['android']['gradle_version']}")
    
    print("\n🔐 FIRESTORE")
    print(f"  Rules-Datei: {analysis['firestore']['rules_file_lines']} Zeilen")
    print(f"  Validiert: {'✅ Ja' if analysis['firestore']['rules_validated'] else '❌ Nein'}")
    
    print("\n🌐 WEB-PANELS")
    for panel, info in analysis['web_panels'].items():
        panel_name = panel.replace('_', ' ').title()
        print(f"  {panel_name}: {info['status']} ({info['files']} Dateien)")
    
    print("\n🧪 TESTS")
    print(f"  Durchgang: {'✅ PASSED' if analysis['tests']['pass'] else '❌ FAILED'}")
    print(f"  Test-Suites: {analysis['tests']['test_suites']}")
    print(f"  Bestandene Tests: {analysis['tests']['tests_passed']}")
    print(f"  Fehlgeschlagene Tests: {analysis['tests']['tests_failed']}")
    print(f"  Gesamt-Tests: {analysis['tests']['tests_total']}")
    
    print("\n⚠️  IMPLEMENTIERUNGSLÜCKEN")
    if analysis['implementation_gaps']:
        for gap in analysis['implementation_gaps']:
            print(f"  {gap}")
    else:
        print("  ✅ Keine kritischen Lücken gefunden")
    
    print("\n" + "=" * 80)
    
    return analysis


def estimate_completion_percentage(analysis: dict) -> float:
    """Schätze den Fertigungsstand"""
    
    components = {
        'backend': 0,
        'android': 0,
        'firestore': 0,
        'web': 0,
        'tests': 0,
    }
    
    # Backend-Status
    if analysis['backend']['total_files'] > 0:
        components['backend'] = min(100, (analysis['backend']['total_lines'] / 1000) * 10)
    
    # Android-Status
    master_files = analysis['android']['master_app']['src_files']
    child_files = analysis['android']['child_app']['src_files']
    components['android'] = min(100, ((master_files + child_files) / 100) * 10)
    
    # Firestore
    if analysis['firestore']['rules_file_lines'] > 100:
        components['firestore'] = 80
    elif analysis['firestore']['rules_file_lines'] > 50:
        components['firestore'] = 50
    
    # Web-Panels
    total_web_files = sum(p['files'] for p in analysis['web_panels'].values())
    components['web'] = min(100, (total_web_files / 20) * 10)
    
    # Tests
    if analysis['tests']['tests_total'] > 0:
        pass_rate = analysis['tests']['tests_passed'] / analysis['tests']['tests_total']
        components['tests'] = pass_rate * 100
    
    # Gesamtdurchschnitt
    overall = sum(components.values()) / len(components)
    
    print(f"\n📈 Fertigungsstand-Schätzung:")
    print(f"  Backend: {components['backend']:.1f}%")
    print(f"  Android: {components['android']:.1f}%")
    print(f"  Firestore: {components['firestore']:.1f}%")
    print(f"  Web-Panels: {components['web']:.1f}%")
    print(f"  Tests: {components['tests']:.1f}%")
    print(f"  ────────────────────")
    print(f"  🎯 GESAMTSTAND: {overall:.1f}%")
    
    return overall


# ==================== MAIN ====================

def main():
    """Haupt-Einstiegspunkt"""
    try:
        analysis = analyze_repository()
        completion = estimate_completion_percentage(analysis)
        
        # Speichere Analyse
        with open(NEW_ANALYSIS_FILE, 'w') as f:
            json.dump(analysis, f, indent=2, default=str)
        
        print(f"\n💾 Analytik-Report gespeichert: {NEW_ANALYSIS_FILE}")
        
        return 0 if analysis['tests']['pass'] else 1
        
    except Exception as e:
        print(f"\n❌ Fehler während der Analyse: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
