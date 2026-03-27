"""Loader-Helfer: Stellt sicher, dass python_admin/app.py als 'app' importierbar ist."""
from __future__ import annotations

import sys
from pathlib import Path

_python_admin_dir = Path(__file__).resolve().parent.parent.parent / "python_admin"
if str(_python_admin_dir) not in sys.path:
    sys.path.insert(0, str(_python_admin_dir))
