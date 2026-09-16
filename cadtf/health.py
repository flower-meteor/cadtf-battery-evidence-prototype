"""Interpretable health estimation and model-domain validation."""

from __future__ import annotations

from .models import (
    HealthEstimate,
    Installation,
    Measurement,
    ModelDomain,
    ValidationIssue,
    ValidationResult,
)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def validate_measurement(
    model: ModelDomain,
    pack_chemistry: str,
    installation: Installation | None,
    measurement: Measurement,
) -> ValidationResult:
    issues: list[ValidationIssue] = []
    checks: dict[str, str] = {}

    chemistry_match = model.chemistry.casefold() == pack_chemistry.casefold()
    checks["chemistry"] = "pass" if chemistry_match else "blocked"
    if not chemistry_match:
        issues.append(
            ValidationIssue(
                code="CHEMISTRY_MISMATCH",
                severity="blocked",
                message=(
                    f"Pack chemistry {pack_chemistry} does not match model domain "
                    f"{model.chemistry}."
                ),
            )
        )

    temperatures_valid = (
        measurement.min_temp_c >= model.temp_min_c
        and measurement.max_temp_c <= model.temp_max_c
    )
    checks["temperature_envelope"] = "pass" if temperatures_valid else "blocked"
    if not temperatures_valid:
        issues.append(
            ValidationIssue(
                code="TEMPERATURE_OUT_OF_DOMAIN",
                severity="blocked",
                message=(
                    f"Measured {measurement.min_temp_c:.1f} to "
                    f"{measurement.max_temp_c:.1f} C falls outside the validated "
                    f"{model.temp_min_c:.1f} to {model.temp_max_c:.1f} C domain."
                ),
            )
        )
    elif (
        measurement.max_temp_c >= model.temp_max_c - 2.0
        or measurement.min_temp_c <= model.temp_min_c + 2.0
    ):
        checks["temperature_envelope"] = "review"
        issues.append(
            ValidationIssue(
                code="TEMPERATURE_NEAR_LIMIT",
                severity="review",
                message="Temperature is close to the validated boundary.",
            )
        )

    charge_valid = measurement.charge_c_rate <= model.max_charge_c_rate
    checks["charge_rate"] = "pass" if charge_valid else "blocked"
    if not charge_valid:
        issues.append(
            ValidationIssue(
                code="CHARGE_RATE_OUT_OF_DOMAIN",
                severity="blocked",
                message=(
                    f"Charge rate {measurement.charge_c_rate:.2f}C exceeds the "
                    f"validated {model.max_charge_c_rate:.2f}C limit."
                ),
            )
        )

    discharge_valid = measurement.discharge_c_rate <= model.max_discharge_c_rate
    checks["discharge_rate"] = "pass" if discharge_valid else "blocked"
    if not discharge_valid:
        issues.append(
            ValidationIssue(
                code="DISCHARGE_RATE_OUT_OF_DOMAIN",
                severity="blocked",
                message=(
                    f"Discharge rate {measurement.discharge_c_rate:.2f}C exceeds "
                    f"the validated {model.max_discharge_c_rate:.2f}C limit."
                ),
            )
        )

    cycles_valid = measurement.cycles <= model.max_cycles
    checks["cycle_life"] = "pass" if cycles_valid else "blocked"
    if not cycles_valid:
        issues.append(
            ValidationIssue(
                code="CYCLES_OUT_OF_DOMAIN",
                severity="blocked",
                message=(
                    f"{measurement.cycles} cycles exceed the validated "
                    f"{model.max_cycles}-cycle domain."
                ),
            )
        )
    elif measurement.cycles >= int(model.max_cycles * 0.95):
        checks["cycle_life"] = "review"
        issues.append(
            ValidationIssue(
                code="CYCLES_NEAR_LIMIT",
                severity="review",
                message="Cycle count is close to the validated boundary.",
            )
        )

    if installation is None:
        checks["installation_record"] = "review"
        issues.append(
            ValidationIssue(
                code="INSTALLATION_MISSING",
                severity="review",
                message="No current installation record is linked to this pack.",
            )
        )
    else:
        config_valid = (
            installation.configuration_revision
            in model.allowed_config_revisions
        )
        checks["configuration_revision"] = "pass" if config_valid else "review"
        if not config_valid:
            issues.append(
                ValidationIssue(
                    code="CONFIGURATION_CHANGED",
                    severity="review",
                    message=(
                        f"Configuration {installation.configuration_revision} has "
                        "not been included in the model validation evidence."
                    ),
                )
            )

        software_major = installation.software_version.split(".", 1)[0]
        software_valid = software_major in model.allowed_software_major
        checks["software_baseline"] = "pass" if software_valid else "review"
        if not software_valid:
            issues.append(
                ValidationIssue(
                    code="SOFTWARE_CHANGED",
                    severity="review",
                    message=(
                        f"Software major version {software_major} has not been "
                        "included in the model validation evidence."
                    ),
                )
            )

        calibration_valid = installation.calibration_valid
        checks["sensor_calibration"] = "pass" if calibration_valid else "review"
        if not calibration_valid:
            issues.append(
                ValidationIssue(
                    code="CALIBRATION_INVALID",
                    severity="review",
                    message="Sensor calibration is invalid or expired.",
                )
            )

    provenance_valid = bool(
        measurement.provenance.strip() and measurement.source_hash.strip()
    )
    checks["provenance"] = "pass" if provenance_valid else "review"
    if not provenance_valid:
        issues.append(
            ValidationIssue(
                code="PROVENANCE_MISSING",
                severity="review",
                message="Measurement provenance or source hash is missing.",
            )
        )

    if any(issue.severity == "blocked" for issue in issues):
        status = "blocked"
    elif any(issue.severity == "review" for issue in issues):
        status = "review_required"
    else:
        status = "valid"

    return ValidationResult(status=status, issues=issues, checks=checks)


def estimate_health(
    model: ModelDomain,
    measurement: Measurement,
    validation: ValidationResult,
    calibration_valid: bool,
) -> HealthEstimate:
    capacity_health = _clamp(
        measurement.capacity_ah / model.rated_capacity_ah, 0.0, 1.1
    )
    resistance_health = _clamp(
        model.baseline_resistance_mohm / measurement.resistance_mohm, 0.0, 1.1
    )
    soh = _clamp(0.75 * capacity_health + 0.25 * resistance_health, 0.0, 1.1)

    temperature_span = model.temp_max_c - model.temp_min_c
    maximum_temperature_position = (
        (measurement.max_temp_c - model.temp_min_c) / temperature_span
        if temperature_span > 0
        else 0.0
    )
    temperature_penalty = max(0.0, maximum_temperature_position - 0.8) * 0.10
    cycle_fraction = min(
        measurement.cycles / model.max_cycles if model.max_cycles else 0.0, 1.5
    )
    uncertainty = 0.02 + 0.03 * cycle_fraction + temperature_penalty
    if not calibration_valid:
        uncertainty += 0.04
    if validation.status != "valid":
        uncertainty += 0.05
    uncertainty = _clamp(uncertainty, 0.015, 0.25)

    temperature_factor = _clamp(
        1.0 - max(0.0, maximum_temperature_position - 0.85) * 0.35,
        0.90,
        1.0,
    )
    usable_power = _clamp(
        temperature_factor * (0.55 + 0.45 * resistance_health), 0.45, 1.05
    )

    if soh <= model.min_soh_pct / 100:
        remaining_cycles = 0
    else:
        degradation_per_cycle = max((1.0 - soh) / max(measurement.cycles, 1), 1e-6)
        remaining_cycles = min(
            int((soh - model.min_soh_pct / 100) / degradation_per_cycle),
            5000,
        )

    if validation.status == "blocked":
        advisory = (
            "Advisory suppressed: the input is outside the validated model "
            "domain. Escalate to authorised engineering review."
        )
    elif validation.status == "review_required":
        advisory = (
            "Do not release the estimate as maintenance evidence until the "
            "open review items are closed."
        )
    elif soh >= 0.90 and usable_power >= 0.85:
        advisory = (
            "Within the validated domain. Continue normal monitoring and "
            "approved maintenance intervals."
        )
    elif soh >= model.min_soh_pct / 100:
        advisory = (
            "Within the validated domain. Schedule a diagnostic capacity and "
            "resistance check before extending the service interval."
        )
    else:
        advisory = (
            "Estimated health is below the configured threshold. Perform an "
            "authorised maintenance assessment."
        )

    return HealthEstimate(
        soh_pct=round(soh * 100, 1),
        capacity_health_pct=round(capacity_health * 100, 1),
        resistance_health_pct=round(resistance_health * 100, 1),
        usable_power_pct=round(usable_power * 100, 1),
        uncertainty_pct=round(uncertainty * 100, 1),
        indicative_remaining_cycles=remaining_cycles,
        advisory=advisory,
    )
