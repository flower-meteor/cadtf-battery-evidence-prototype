"""Evidence-package construction and integrity checks."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from .models import (
    BatteryPack,
    EvidencePackage,
    HealthEstimate,
    Installation,
    Measurement,
    ModelDomain,
    ValidationResult,
)


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def sha256_json(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def build_evidence_package(
    pack: BatteryPack,
    installation: Installation,
    measurement: Measurement,
    model: ModelDomain,
    validation: ValidationResult,
    estimate: HealthEstimate,
    created_at: datetime | None = None,
) -> EvidencePackage:
    created = created_at or datetime.now(timezone.utc)
    package_seed = {
        "pack_id": pack.pack_id,
        "measurement_id": measurement.measurement_id,
        "source_hash": measurement.source_hash,
        "model_id": model.model_id,
        "configuration_revision": installation.configuration_revision,
        "software_version": installation.software_version,
        "created_at": created.isoformat(),
    }
    package_id = "EVP-" + sha256_json(package_seed)[:16].upper()

    physical_asset = {
        "pack_id": pack.pack_id,
        "manufacturer": pack.manufacturer,
        "chemistry": pack.chemistry,
        "rated_capacity_ah": pack.rated_capacity_ah,
        "baseline_resistance_mohm": pack.baseline_resistance_mohm,
        "aircraft_id": installation.aircraft_id,
        "configuration_revision": installation.configuration_revision,
        "software_version": installation.software_version,
        "installed_at": installation.installed_at.isoformat(),
        "calibration_valid": installation.calibration_valid,
        "calibration_date": installation.calibration_date,
    }
    input_record = {
        "measurement_id": measurement.measurement_id,
        "batch_id": measurement.batch_id,
        "measured_at": measurement.measured_at.isoformat(),
        "capacity_ah": measurement.capacity_ah,
        "resistance_mohm": measurement.resistance_mohm,
        "temperature_range_c": [
            measurement.min_temp_c,
            measurement.max_temp_c,
        ],
        "charge_c_rate": measurement.charge_c_rate,
        "discharge_c_rate": measurement.discharge_c_rate,
        "cycles": measurement.cycles,
        "provenance": measurement.provenance,
        "source_hash": measurement.source_hash,
    }
    model_record = {
        "model_id": model.model_id,
        "model_name": model.model_name,
        "algorithm": model.algorithm,
        "chemistry": model.chemistry,
        "validation_domain": {
            "temperature_c": [model.temp_min_c, model.temp_max_c],
            "charge_c_rate": model.max_charge_c_rate,
            "discharge_c_rate": model.max_discharge_c_rate,
            "max_cycles": model.max_cycles,
            "allowed_config_revisions": model.allowed_config_revisions,
            "allowed_software_major": model.allowed_software_major,
        },
        "minimum_soh_pct": model.min_soh_pct,
    }
    validation_record = validation.model_dump(mode="json")
    estimate_record = estimate.model_dump(mode="json")
    review_record = {
        "required": validation.status != "valid",
        "state": "pending" if validation.status != "valid" else "optional",
        "authorised_disposition": None,
    }

    required_components = [
        physical_asset.get("pack_id"),
        physical_asset.get("aircraft_id"),
        physical_asset.get("configuration_revision"),
        physical_asset.get("software_version"),
        input_record.get("source_hash"),
        input_record.get("provenance"),
        model_record.get("model_id"),
        model_record.get("validation_domain"),
        validation_record.get("checks"),
        estimate_record.get("soh_pct") is not None,
    ]
    score = round(
        100.0 * sum(bool(item) for item in required_components)
        / len(required_components),
        1,
    )

    package = EvidencePackage(
        package_id=package_id,
        created_at=created,
        physical_asset=physical_asset,
        input_record=input_record,
        model_record=model_record,
        validation_record=validation_record,
        estimate_record=estimate_record,
        review_record=review_record,
        traceability_score_pct=score,
    )
    payload = package.model_dump(mode="json")
    package.package_hash = sha256_json(payload)
    return package


def verify_package(package_payload: dict[str, Any]) -> bool:
    stored_hash = package_payload.get("package_hash", "")
    payload = dict(package_payload)
    payload["package_hash"] = ""
    return stored_hash == sha256_json(payload)
