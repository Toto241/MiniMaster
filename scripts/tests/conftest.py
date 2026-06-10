"""Gemeinsame Fixtures für MiniMaster Python-Tests."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

_PYTHON_ADMIN_DIR = SCRIPTS_DIR.parent / "python_admin"
if str(_PYTHON_ADMIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PYTHON_ADMIN_DIR))


@pytest.fixture(autouse=True)
def _reset_testing_register_cache():
    """Verwirft den TTL-Cache des Testing-Registers vor jedem Test.

    build_testing_register() memoisiert seinen ~4s teuren Snapshot fuer die
    Produktion. Damit Tests, die das echte Register berechnen (ggf. mit
    gemockten Abhaengigkeiten), nie einen Cache-Treffer aus einem frueheren
    Test sehen, wird der Cache vor jedem Test geleert.
    """
    try:
        import app
        clear_cache = getattr(app, "clear_testing_register_cache", None)
    except Exception:
        clear_cache = None

    if clear_cache:
        clear_cache()
    yield
    if clear_cache:
        clear_cache()


@pytest.fixture()
def tmp_repo(tmp_path: Path) -> Path:
    """Erstellt ein temporäres Repo-Verzeichnis mit minimaler Struktur."""
    (tmp_path / "local.properties").write_text(
        "sdk.dir=C\\:\\\\Android\\\\sdk\n"
        "debug.session.secret.master=abc123secret456master789abcdef01234567890abcdef012345678901234567\n"
        "debug.session.secret.child=child_secret_abcdef01234567890abcdef01234567890abcdef01234567890ab\n",
        encoding="utf-8",
    )
    (tmp_path / "masterApp" / "build" / "outputs" / "apk" / "debug").mkdir(parents=True)
    (tmp_path / "childApp" / "build" / "outputs" / "apk" / "debug").mkdir(parents=True)
    return tmp_path


@pytest.fixture()
def mock_subprocess(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Mockt subprocess.run global."""
    mock_run = MagicMock()
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="",
        stderr="",
    )
    monkeypatch.setattr("subprocess.run", mock_run)
    return mock_run
