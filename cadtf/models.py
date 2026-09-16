"""Typed records used by the CADTF prototype."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ModelDomain(BaseModel):
    model_id: str
    model_name: str
    algorithm: str
    chemistry: str
    rated_capacity_ah: float = Field(gt=0)
    baseline_resistance_mohm: float = Field(gt=0)
    temp_min_c: float
    temp_max_c: float
    max_charge_c_rate: float = Field(gt=0)
    max_discharge_c_rate: float = Field(gt=0)
    max_cycles: int = Field(gt=0)
    min_soh_pct: float = Field(default=80.0, ge=0, le=100)
    allowed_config_revisions: list[str]
    allowed_software_major: list[str]

    @field_validator("temp_max_c")
    @classmethod
    def validate_temperature_range(cls, value: float, info):
        lower = info.data.get("temp_min_c")
        if lower is not None and value <= lower:
            raise ValueError("temp_max_c must be above temp_min_c")
        return value


class BatteryPack(BaseModel):
    pack_id: str
    manufacturer: str
    chemistry: str
    rated_capacity_ah: float = Field(gt=0)
    baseline_resistance_mohm: float = Field(gt=0)
    manufacture_date: str
    status: str = "active"


class Installation(BaseModel):
    installation_id: int | None = None
    aircraft_id: str
    pack_id: str
    configuration_revision: str
    software_version: str
    installed_at: datetime
    calibration_valid: bool
    calibration_date: str
    notes: str = ""


class Measurement(BaseModel):
    measurement_id: int | None = None
    pack_id: str
    batch_id: str
    measured_at: datetime
    capacity_ah: float = Field(gt=0)
    resistance_mohm: float = Field(gt=0)
    min_temp_c: float
    max_temp_c: float
    charge_c_rate: float = Field(ge=0)
    discharge_c_rate: float = Field(ge=0)
    cycles: int = Field(ge=0)
    provenance: str = Field(min_length=1)
    source_hash: str = Field(min_length=8)
    notes: str = ""

    @field_validator("max_temp_c")
    @classmethod
    def validate_temperature_range(cls, value: float, info):
        lower = info.data.get("min_temp_c")
        if lower is not None and value < lower:
            raise ValueError("max_temp_c must not be below min_temp_c")
        return value


class ValidationIssue(BaseModel):
    code: str
    severity: Literal["info", "review", "blocked"]
    message: str


class ValidationResult(BaseModel):
    status: Literal["valid", "review_required", "blocked"]
    issues: list[ValidationIssue]
    checks: dict[str, str]


class HealthEstimate(BaseModel):
    soh_pct: float
    capacity_health_pct: float
    resistance_health_pct: float
    usable_power_pct: float
    uncertainty_pct: float
    indicative_remaining_cycles: int
    advisory: str


class EvidencePackage(BaseModel):
    package_version: str = "1.0"
    package_id: str
    created_at: datetime
    physical_asset: dict
    input_record: dict
    model_record: dict
    validation_record: dict
    estimate_record: dict
    review_record: dict
    traceability_score_pct: float
    package_hash: str = ""
