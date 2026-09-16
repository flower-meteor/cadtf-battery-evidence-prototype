from datetime import datetime, timezone

from cadtf.health import estimate_health, validate_measurement
from cadtf.models import Installation, Measurement, ModelDomain


def model() -> ModelDomain:
    return ModelDomain(
        model_id="MODEL-1",
        model_name="Test model",
        algorithm="test",
        chemistry="NMC",
        rated_capacity_ah=20.0,
        baseline_resistance_mohm=20.0,
        temp_min_c=-10.0,
        temp_max_c=45.0,
        max_charge_c_rate=1.0,
        max_discharge_c_rate=2.0,
        max_cycles=1200,
        min_soh_pct=80.0,
        allowed_config_revisions=["CONF-A"],
        allowed_software_major=["2"],
    )


def measurement(**overrides) -> Measurement:
    values = {
        "pack_id": "BAT-1",
        "batch_id": "B1",
        "measured_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "capacity_ah": 18.0,
        "resistance_mohm": 22.0,
        "min_temp_c": -5.0,
        "max_temp_c": 38.0,
        "charge_c_rate": 0.8,
        "discharge_c_rate": 1.4,
        "cycles": 400,
        "provenance": "test",
        "source_hash": "a" * 64,
    }
    values.update(overrides)
    return Measurement(**values)


def installation(**overrides) -> Installation:
    values = {
        "aircraft_id": "A1",
        "pack_id": "BAT-1",
        "configuration_revision": "CONF-A",
        "software_version": "2.1.0",
        "installed_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "calibration_valid": True,
        "calibration_date": "2025-12-01",
    }
    values.update(overrides)
    return Installation(**values)


def test_valid_case_is_releasable() -> None:
    result = validate_measurement(
        model(), "NMC", installation(), measurement()
    )
    assert result.status == "valid"
    assert all(result.checks.values())


def test_temperature_outside_domain_blocks_advisory() -> None:
    result = validate_measurement(
        model(),
        "NMC",
        installation(),
        measurement(max_temp_c=52.0),
    )
    assert result.status == "blocked"
    assert any(
        issue.code == "TEMPERATURE_OUT_OF_DOMAIN" for issue in result.issues
    )


def test_configuration_change_requires_review() -> None:
    result = validate_measurement(
        model(),
        "NMC",
        installation(configuration_revision="CONF-NEW"),
        measurement(),
    )
    assert result.status == "review_required"
    assert any(
        issue.code == "CONFIGURATION_CHANGED" for issue in result.issues
    )


def test_health_estimate_is_bounded_and_explainable() -> None:
    item = measurement()
    validation = validate_measurement(model(), "NMC", installation(), item)
    estimate = estimate_health(model(), item, validation, calibration_valid=True)
    assert 0.0 <= estimate.soh_pct <= 110.0
    assert 0.0 <= estimate.uncertainty_pct <= 25.0
    assert estimate.indicative_remaining_cycles >= 0
