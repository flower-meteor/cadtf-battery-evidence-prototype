from datetime import datetime, timezone

from cadtf.evidence import build_evidence_package, verify_package
from cadtf.health import estimate_health, validate_measurement
from cadtf.models import BatteryPack, Installation, Measurement, ModelDomain


def test_package_hash_round_trip() -> None:
    pack = BatteryPack(
        pack_id="BAT-1",
        manufacturer="Demo",
        chemistry="NMC",
        rated_capacity_ah=20.0,
        baseline_resistance_mohm=20.0,
        manufacture_date="2025-01-01",
    )
    installation = Installation(
        aircraft_id="A1",
        pack_id="BAT-1",
        configuration_revision="CONF-A",
        software_version="2.0.0",
        installed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        calibration_valid=True,
        calibration_date="2025-12-01",
    )
    measurement = Measurement(
        measurement_id=1,
        pack_id="BAT-1",
        batch_id="B1",
        measured_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        capacity_ah=18.0,
        resistance_mohm=22.0,
        min_temp_c=-5.0,
        max_temp_c=38.0,
        charge_c_rate=0.8,
        discharge_c_rate=1.4,
        cycles=400,
        provenance="test",
        source_hash="b" * 64,
    )
    model = ModelDomain(
        model_id="MODEL-1",
        model_name="Test",
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
    validation = validate_measurement(
        model, pack.chemistry, installation, measurement
    )
    estimate = estimate_health(
        model, measurement, validation, calibration_valid=True
    )
    package = build_evidence_package(
        pack,
        installation,
        measurement,
        model,
        validation,
        estimate,
        created_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
    )
    assert package.traceability_score_pct == 100.0
    assert package.package_hash
    assert verify_package(package.model_dump(mode="json"))


def test_package_detects_tampering() -> None:
    payload = {
        "package_hash": "not-a-valid-hash",
        "estimate_record": {"soh_pct": 90.0},
    }
    assert not verify_package(payload)
