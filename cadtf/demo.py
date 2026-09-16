"""Deterministic demonstration data for the CADTF prototype."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from .db import Database
from .evidence import sha256_json


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def seed_demo_data(db: Database, now: datetime | None = None) -> bool:
    """Seed deterministic demo records once.

    Returns True when records were inserted and False when data already existed.
    """

    db.initialize()
    if int(db.scalar("SELECT COUNT(*) FROM battery_packs")) > 0:
        return False

    current = now or datetime.now(timezone.utc)
    created = _iso(current)
    aircraft = [
        ("TRAIN-01", "Two-seat electric trainer", "Demo Flight Academy", "active"),
        ("TRAIN-02", "Two-seat electric trainer", "Demo Flight Academy", "active"),
    ]
    db.executemany(
        """
        INSERT INTO aircraft (
            aircraft_id, model, operator, status, created_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        [(*row, created) for row in aircraft],
    )

    models = [
        {
            "model_id": "BATT-NMC-M1",
            "model_name": "NMC equivalent-circuit baseline",
            "algorithm": "Capacity-resistance weighted estimator v1",
            "chemistry": "NMC",
            "rated_capacity_ah": 20.0,
            "baseline_resistance_mohm": 20.0,
            "temp_min_c": -10.0,
            "temp_max_c": 45.0,
            "max_charge_c_rate": 1.0,
            "max_discharge_c_rate": 2.0,
            "max_cycles": 1200,
            "min_soh_pct": 80.0,
            "allowed_config_revisions": ["CONF-A", "CONF-B"],
            "allowed_software_major": ["2"],
        },
        {
            "model_id": "BATT-LFP-M1",
            "model_name": "LFP equivalent-circuit baseline",
            "algorithm": "Capacity-resistance weighted estimator v1",
            "chemistry": "LFP",
            "rated_capacity_ah": 22.0,
            "baseline_resistance_mohm": 18.0,
            "temp_min_c": -15.0,
            "temp_max_c": 50.0,
            "max_charge_c_rate": 1.0,
            "max_discharge_c_rate": 2.0,
            "max_cycles": 2500,
            "min_soh_pct": 80.0,
            "allowed_config_revisions": ["CONF-L1"],
            "allowed_software_major": ["2", "3"],
        },
    ]
    db.executemany(
        """
        INSERT INTO model_versions (
            model_id, model_name, algorithm, chemistry, rated_capacity_ah,
            baseline_resistance_mohm, temp_min_c, temp_max_c,
            max_charge_c_rate, max_discharge_c_rate, max_cycles,
            min_soh_pct, allowed_config_revisions, allowed_software_major,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                item["model_id"],
                item["model_name"],
                item["algorithm"],
                item["chemistry"],
                item["rated_capacity_ah"],
                item["baseline_resistance_mohm"],
                item["temp_min_c"],
                item["temp_max_c"],
                item["max_charge_c_rate"],
                item["max_discharge_c_rate"],
                item["max_cycles"],
                item["min_soh_pct"],
                json.dumps(item["allowed_config_revisions"]),
                json.dumps(item["allowed_software_major"]),
                created,
            )
            for item in models
        ],
    )

    packs = [
        (
            "BAT-001",
            "Demo Cell Systems",
            "NMC",
            20.0,
            20.0,
            "2024-01-15",
            "active",
        ),
        (
            "BAT-002",
            "Demo Cell Systems",
            "NMC",
            20.0,
            20.0,
            "2022-06-10",
            "active",
        ),
        (
            "BAT-003",
            "Demo Cell Systems",
            "LFP",
            22.0,
            18.0,
            "2025-02-20",
            "active",
        ),
    ]
    db.executemany(
        """
        INSERT INTO battery_packs (
            pack_id, manufacturer, chemistry, rated_capacity_ah,
            baseline_resistance_mohm, manufacture_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [(*row, created) for row in packs],
    )

    installations = [
        (
            "TRAIN-01",
            "BAT-001",
            "CONF-A",
            "2.1.0",
            _iso(current - timedelta(days=120)),
            1,
            "2026-07-01",
            "Nominal installation",
        ),
        (
            "TRAIN-02",
            "BAT-002",
            "CONF-B",
            "2.0.1",
            _iso(current - timedelta(days=260)),
            1,
            "2026-05-15",
            "Older service installation",
        ),
        (
            "TRAIN-01",
            "BAT-003",
            "CONF-L1",
            "3.0.0",
            _iso(current - timedelta(days=25)),
            1,
            "2026-08-01",
            "Laboratory representative LFP configuration",
        ),
    ]
    db.executemany(
        """
        INSERT INTO installations (
            aircraft_id, pack_id, configuration_revision, software_version,
            installed_at, removed_at, calibration_valid, calibration_date, notes
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
        """,
        installations,
    )

    measurement_rows = [
        {
            "pack_id": "BAT-001",
            "batch_id": "LAB-001",
            "days_ago": 2,
            "capacity_ah": 18.72,
            "resistance_mohm": 21.2,
            "min_temp_c": -5.0,
            "max_temp_c": 38.0,
            "charge_c_rate": 0.80,
            "discharge_c_rate": 1.45,
            "cycles": 410,
            "provenance": "Synthetic laboratory summary for prototype demonstration",
            "notes": "Valid nominal case",
        },
        {
            "pack_id": "BAT-002",
            "batch_id": "LAB-002",
            "days_ago": 1,
            "capacity_ah": 15.90,
            "resistance_mohm": 29.4,
            "min_temp_c": 1.0,
            "max_temp_c": 51.5,
            "charge_c_rate": 1.10,
            "discharge_c_rate": 2.20,
            "cycles": 1180,
            "provenance": "Synthetic high-stress case for prototype demonstration",
            "notes": "Blocked domain case",
        },
        {
            "pack_id": "BAT-003",
            "batch_id": "LAB-003",
            "days_ago": 3,
            "capacity_ah": 20.90,
            "resistance_mohm": 18.6,
            "min_temp_c": -8.0,
            "max_temp_c": 36.0,
            "charge_c_rate": 0.75,
            "discharge_c_rate": 1.35,
            "cycles": 260,
            "provenance": "Synthetic LFP laboratory summary for prototype demonstration",
            "notes": "Valid LFP case",
        },
    ]

    prepared_measurements = []
    for row in measurement_rows:
        source_payload = {
            key: value
            for key, value in row.items()
            if key not in {"days_ago", "notes"}
        }
        source_hash = sha256_json(source_payload)
        prepared_measurements.append(
            (
                row["pack_id"],
                row["batch_id"],
                _iso(current - timedelta(days=row["days_ago"])),
                row["capacity_ah"],
                row["resistance_mohm"],
                row["min_temp_c"],
                row["max_temp_c"],
                row["charge_c_rate"],
                row["discharge_c_rate"],
                row["cycles"],
                row["provenance"],
                source_hash,
                row["notes"],
            )
        )
    db.executemany(
        """
        INSERT INTO measurements (
            pack_id, batch_id, measured_at, capacity_ah, resistance_mohm,
            min_temp_c, max_temp_c, charge_c_rate, discharge_c_rate, cycles,
            provenance, source_hash, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        prepared_measurements,
    )

    db.record_event(
        "DEMO_DATA_SEEDED",
        "SYSTEM",
        {"record_type": "synthetic demonstration", "privacy": "no personal data"},
        created,
    )

    pilot_rows = []
    for index in range(1, 13):
        case_id = f"CASE-{index:02d}"
        pilot_rows.extend(
            [
                (
                    case_id,
                    "manual",
                    58.0 + (index % 4) * 7.0,
                    14.0 + (index % 5) * 1.8,
                    8.0 + (index % 4) * 0.9,
                    2 + (index % 3),
                    10.0 + index * 0.4,
                    created,
                ),
                (
                    case_id,
                    "cadtf_synthetic",
                    92.0 - (index % 3) * 3.0,
                    3.5 + (index % 4) * 0.45,
                    7.0 + (index % 4) * 0.7,
                    1 + (index % 2),
                    6.2 + index * 0.22,
                    created,
                ),
            ]
        )
    db.executemany(
        """
        INSERT INTO pilot_runs (
            case_id, method, traceability_pct, reconstruction_minutes,
            model_error_pct, alert_count, cost_units, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        pilot_rows,
    )
    return True
