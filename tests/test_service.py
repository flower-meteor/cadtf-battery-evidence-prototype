from pathlib import Path

import pytest

from cadtf.service import CADTFService


def service(tmp_path: Path) -> CADTFService:
    instance = CADTFService(tmp_path / "test.db")
    instance.ensure_demo_data(run_estimates=True)
    return instance


def test_end_to_end_estimate_generation(tmp_path: Path) -> None:
    app = service(tmp_path)
    estimates = app.list_estimates(limit=20)
    by_pack = {row["pack_id"]: row for row in estimates}

    assert by_pack["BAT-001"]["validation_status"] == "valid"
    assert by_pack["BAT-002"]["validation_status"] == "blocked"
    assert by_pack["BAT-003"]["validation_status"] == "valid"
    assert all(row["evidence_score_pct"] == 100.0 for row in estimates)
    assert all(
        app.get_estimate(row["estimate_id"])["evidence_verified"]
        for row in estimates
    )


def test_blocked_estimate_cannot_be_accepted(tmp_path: Path) -> None:
    app = service(tmp_path)
    blocked = next(
        row
        for row in app.list_estimates(limit=20)
        if row["validation_status"] == "blocked"
    )
    with pytest.raises(ValueError):
        app.record_review(
            blocked["estimate_id"],
            "Maintenance reviewer",
            "accepted",
            "Attempted acceptance without closing findings.",
            "AUTH-DEMO-1",
        )


def test_valid_estimate_can_be_reviewed(tmp_path: Path) -> None:
    app = service(tmp_path)
    valid = next(
        row
        for row in app.list_estimates(limit=20)
        if row["validation_status"] == "valid"
    )
    review_id = app.record_review(
        valid["estimate_id"],
        "Authorised reviewer",
        "accepted",
        "Evidence links and validation domain were checked.",
        "AUTH-DEMO-2",
    )
    assert review_id > 0
    assert app.get_estimate(valid["estimate_id"])["latest_review"][
        "disposition"
    ] == "accepted"


def test_configuration_change_requires_model_review(tmp_path: Path) -> None:
    app = service(tmp_path)
    app.change_installation(
        aircraft_id="TRAIN-01",
        pack_id="BAT-001",
        configuration_revision="CONF-NEW",
        software_version="2.2.0",
        calibration_valid=True,
        calibration_date="2026-09-01",
    )
    result = app.run_estimate("BAT-001")
    assert result["validation"].status == "review_required"
    codes = {issue.code for issue in result["validation"].issues}
    assert "CONFIGURATION_CHANGED" in codes


def test_export_contains_required_tables(tmp_path: Path) -> None:
    app = service(tmp_path)
    tables = app.export_tables()
    assert set(tables) == {
        "aircraft",
        "battery_packs",
        "model_versions",
        "installations",
        "measurements",
        "estimates",
        "reviews",
        "events",
        "pilot_runs",
    }
    assert len(tables["battery_packs"]) == 3


def test_csv_style_measurement_import_and_estimation(tmp_path: Path) -> None:
    app = service(tmp_path)
    result = app.import_measurements(
        [
            {
                "pack_id": "BAT-001",
                "batch_id": "CSV-001",
                "measured_at": "2026-09-16T00:00:00+00:00",
                "capacity_ah": 18.4,
                "resistance_mohm": 21.6,
                "min_temp_c": -4.0,
                "max_temp_c": 39.0,
                "charge_c_rate": 0.8,
                "discharge_c_rate": 1.4,
                "cycles": 440,
                "provenance": "Synthetic CSV import test",
                "notes": "",
            }
        ],
        run_estimates=True,
    )
    assert len(result["imported_measurement_ids"]) == 1
    assert len(result["created_estimate_ids"]) == 1
    assert result["errors"] == []
