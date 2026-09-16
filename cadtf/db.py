"""SQLite persistence for the CADTF prototype."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pandas as pd


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS aircraft (
    aircraft_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    operator TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS battery_packs (
    pack_id TEXT PRIMARY KEY,
    manufacturer TEXT NOT NULL,
    chemistry TEXT NOT NULL,
    rated_capacity_ah REAL NOT NULL,
    baseline_resistance_mohm REAL NOT NULL,
    manufacture_date TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_versions (
    model_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    chemistry TEXT NOT NULL,
    rated_capacity_ah REAL NOT NULL,
    baseline_resistance_mohm REAL NOT NULL,
    temp_min_c REAL NOT NULL,
    temp_max_c REAL NOT NULL,
    max_charge_c_rate REAL NOT NULL,
    max_discharge_c_rate REAL NOT NULL,
    max_cycles INTEGER NOT NULL,
    min_soh_pct REAL NOT NULL,
    allowed_config_revisions TEXT NOT NULL,
    allowed_software_major TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
    installation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    aircraft_id TEXT NOT NULL REFERENCES aircraft(aircraft_id),
    pack_id TEXT NOT NULL REFERENCES battery_packs(pack_id),
    configuration_revision TEXT NOT NULL,
    software_version TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    removed_at TEXT,
    calibration_valid INTEGER NOT NULL,
    calibration_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS measurements (
    measurement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id TEXT NOT NULL REFERENCES battery_packs(pack_id),
    batch_id TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    capacity_ah REAL NOT NULL,
    resistance_mohm REAL NOT NULL,
    min_temp_c REAL NOT NULL,
    max_temp_c REAL NOT NULL,
    charge_c_rate REAL NOT NULL,
    discharge_c_rate REAL NOT NULL,
    cycles INTEGER NOT NULL,
    provenance TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS estimates (
    estimate_id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id TEXT NOT NULL REFERENCES battery_packs(pack_id),
    measurement_id INTEGER NOT NULL REFERENCES measurements(measurement_id),
    model_id TEXT NOT NULL REFERENCES model_versions(model_id),
    soh_pct REAL NOT NULL,
    capacity_health_pct REAL NOT NULL,
    resistance_health_pct REAL NOT NULL,
    usable_power_pct REAL NOT NULL,
    uncertainty_pct REAL NOT NULL,
    indicative_remaining_cycles INTEGER NOT NULL,
    advisory TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    evidence_score_pct REAL NOT NULL,
    evidence_hash TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER NOT NULL REFERENCES estimates(estimate_id),
    reviewer TEXT NOT NULL,
    disposition TEXT NOT NULL,
    rationale TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pilot_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    method TEXT NOT NULL,
    traceability_pct REAL NOT NULL,
    reconstruction_minutes REAL NOT NULL,
    model_error_pct REAL NOT NULL,
    alert_count INTEGER NOT NULL,
    cost_units REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installations_pack
    ON installations(pack_id, removed_at);
CREATE INDEX IF NOT EXISTS idx_measurements_pack
    ON measurements(pack_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_pack
    ON estimates(pack_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_estimate
    ON reviews(estimate_id, created_at DESC);
"""


class Database:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> int:
        with self.connect() as connection:
            cursor = connection.execute(sql, parameters)
            return int(cursor.lastrowid or 0)

    def executemany(
        self, sql: str, parameters: list[tuple[Any, ...]]
    ) -> None:
        with self.connect() as connection:
            connection.executemany(sql, parameters)

    def fetchone(
        self, sql: str, parameters: tuple[Any, ...] = ()
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(sql, parameters).fetchone()
            return dict(row) if row is not None else None

    def fetchall(
        self, sql: str, parameters: tuple[Any, ...] = ()
    ) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(sql, parameters).fetchall()
            return [dict(row) for row in rows]

    def dataframe(
        self, sql: str, parameters: tuple[Any, ...] = ()
    ) -> pd.DataFrame:
        with self.connect() as connection:
            return pd.read_sql_query(sql, connection, params=parameters)

    def scalar(
        self,
        sql: str,
        parameters: tuple[Any, ...] = (),
        default: Any = 0,
    ) -> Any:
        with self.connect() as connection:
            row = connection.execute(sql, parameters).fetchone()
            if row is None or row[0] is None:
                return default
            return row[0]

    def record_event(
        self,
        event_type: str,
        entity_id: str,
        details: dict[str, Any],
        created_at: str,
    ) -> int:
        return self.execute(
            """
            INSERT INTO events (event_type, entity_id, details_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                event_type,
                entity_id,
                json.dumps(details, ensure_ascii=False, sort_keys=True),
                created_at,
            ),
        )

    def table_counts(self) -> dict[str, int]:
        tables = [
            "aircraft",
            "battery_packs",
            "model_versions",
            "installations",
            "measurements",
            "estimates",
            "reviews",
            "events",
            "pilot_runs",
        ]
        return {
            table: int(self.scalar(f"SELECT COUNT(*) FROM {table}"))
            for table in tables
        }
