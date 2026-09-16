"""Verify the CADTF prototype runtime and its SQLite integration."""

from __future__ import annotations

import importlib
import sqlite3
import sys
from pathlib import Path


REQUIRED_MODULES = [
    "streamlit",
    "pandas",
    "numpy",
    "scipy",
    "sklearn",
    "plotly",
    "openpyxl",
    "sqlalchemy",
    "pydantic",
    "pytest",
]


def main() -> int:
    print(f"Python: {sys.version.split()[0]}")
    print(f"Executable: {sys.executable}")
    print(f"SQLite: {sqlite3.sqlite_version}")

    missing: list[str] = []
    for module_name in REQUIRED_MODULES:
        try:
            module = importlib.import_module(module_name)
        except Exception as exc:
            print(f"FAIL import {module_name}: {exc}")
            missing.append(module_name)
            continue

        version = getattr(module, "__version__", "installed")
        print(f"OK {module_name}: {version}")

    with sqlite3.connect(":memory:") as connection:
        connection.execute(
            "CREATE TABLE evidence (id INTEGER PRIMARY KEY, label TEXT NOT NULL)"
        )
        connection.execute(
            "INSERT INTO evidence (label) VALUES (?)", ("CADTF runtime check",)
        )
        row = connection.execute("SELECT label FROM evidence").fetchone()
        if row != ("CADTF runtime check",):
            raise RuntimeError("SQLite round-trip check failed")

    project_root = Path(__file__).resolve().parent
    print(f"Project: {project_root}")
    print("SQLite round-trip: OK")

    if missing:
        print("Environment status: FAIL")
        return 1

    print("Environment status: READY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
