"""Application services for the CADTF prototype."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .db import Database
from .demo import seed_demo_data
from .evidence import build_evidence_package, sha256_json, verify_package
from .health import estimate_health, validate_measurement
from .models import (
    BatteryPack,
    Installation,
    Measurement,
    ModelDomain,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "cadtf_demo.db"


class CADTFService:
    def __init__(self, db_path: str | Path | None = None):
        self.db = Database(db_path or DEFAULT_DB_PATH)
        self.db.initialize()

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc)

    def ensure_demo_data(self, run_estimates: bool = True) -> bool:
        inserted = seed_demo_data(self.db)
        estimate_count = int(self.db.scalar("SELECT COUNT(*) FROM estimates"))
        if run_estimates and estimate_count == 0:
            for pack in self.list_packs():
                latest = self.latest_measurement(pack["pack_id"])
                if latest is not None:
                    self.run_estimate(
                        pack["pack_id"], int(latest["measurement_id"])
                    )
        return inserted

    def reset_demo(self) -> None:
        if self.db.path.exists():
            self.db.path.unlink()
        self.db.initialize()
        self.ensure_demo_data(run_estimates=True)

    def list_packs(self) -> list[dict[str, Any]]:
        return self.db.fetchall(
            """
            SELECT
                p.*,
                i.aircraft_id,
                i.configuration_revision,
                i.software_version,
                i.calibration_valid,
                i.installed_at
            FROM battery_packs p
            LEFT JOIN installations i
              ON i.pack_id = p.pack_id
             AND i.removed_at IS NULL
            ORDER BY p.pack_id
            """
        )

    def list_aircraft(self) -> list[dict[str, Any]]:
        return self.db.fetchall(
            "SELECT * FROM aircraft ORDER BY aircraft_id"
        )

    def get_pack(self, pack_id: str) -> BatteryPack | None:
        row = self.db.fetchone(
            "SELECT * FROM battery_packs WHERE pack_id = ?", (pack_id,)
        )
        if row is None:
            return None
        return BatteryPack(
            pack_id=row["pack_id"],
            manufacturer=row["manufacturer"],
            chemistry=row["chemistry"],
            rated_capacity_ah=row["rated_capacity_ah"],
            baseline_resistance_mohm=row["baseline_resistance_mohm"],
            manufacture_date=row["manufacture_date"],
            status=row["status"],
        )

    def get_installation(self, pack_id: str) -> Installation | None:
        row = self.db.fetchone(
            """
            SELECT * FROM installations
            WHERE pack_id = ? AND removed_at IS NULL
            ORDER BY installed_at DESC
            LIMIT 1
            """,
            (pack_id,),
        )
        if row is None:
            return None
        return Installation(
            installation_id=row["installation_id"],
            aircraft_id=row["aircraft_id"],
            pack_id=row["pack_id"],
            configuration_revision=row["configuration_revision"],
            software_version=row["software_version"],
            installed_at=datetime.fromisoformat(row["installed_at"]),
            calibration_valid=bool(row["calibration_valid"]),
            calibration_date=row["calibration_date"],
            notes=row["notes"],
        )

    def get_model_for_pack(self, pack_id: str) -> ModelDomain | None:
        pack = self.get_pack(pack_id)
        if pack is None:
            return None
        row = self.db.fetchone(
            """
            SELECT * FROM model_versions
            WHERE chemistry = ?
            ORDER BY ABS(rated_capacity_ah - ?) ASC, created_at DESC
            LIMIT 1
            """,
            (pack.chemistry, pack.rated_capacity_ah),
        )
        if row is None:
            return None
        return ModelDomain(
            model_id=row["model_id"],
            model_name=row["model_name"],
            algorithm=row["algorithm"],
            chemistry=row["chemistry"],
            rated_capacity_ah=row["rated_capacity_ah"],
            baseline_resistance_mohm=row["baseline_resistance_mohm"],
            temp_min_c=row["temp_min_c"],
            temp_max_c=row["temp_max_c"],
            max_charge_c_rate=row["max_charge_c_rate"],
            max_discharge_c_rate=row["max_discharge_c_rate"],
            max_cycles=row["max_cycles"],
            min_soh_pct=row["min_soh_pct"],
            allowed_config_revisions=json.loads(
                row["allowed_config_revisions"]
            ),
            allowed_software_major=json.loads(row["allowed_software_major"]),
        )

    def latest_measurement(self, pack_id: str) -> dict[str, Any] | None:
        return self.db.fetchone(
            """
            SELECT * FROM measurements
            WHERE pack_id = ?
            ORDER BY measured_at DESC, measurement_id DESC
            LIMIT 1
            """,
            (pack_id,),
        )

    def get_measurement(
        self, measurement_id: int
    ) -> Measurement | None:
        row = self.db.fetchone(
            "SELECT * FROM measurements WHERE measurement_id = ?",
            (measurement_id,),
        )
        if row is None:
            return None
        return Measurement(
            measurement_id=row["measurement_id"],
            pack_id=row["pack_id"],
            batch_id=row["batch_id"],
            measured_at=datetime.fromisoformat(row["measured_at"]),
            capacity_ah=row["capacity_ah"],
            resistance_mohm=row["resistance_mohm"],
            min_temp_c=row["min_temp_c"],
            max_temp_c=row["max_temp_c"],
            charge_c_rate=row["charge_c_rate"],
            discharge_c_rate=row["discharge_c_rate"],
            cycles=row["cycles"],
            provenance=row["provenance"],
            source_hash=row["source_hash"],
            notes=row["notes"],
        )

    def list_measurements(
        self, pack_id: str | None = None
    ) -> list[dict[str, Any]]:
        if pack_id:
            return self.db.fetchall(
                """
                SELECT * FROM measurements
                WHERE pack_id = ?
                ORDER BY measured_at DESC
                """,
                (pack_id,),
            )
        return self.db.fetchall(
            "SELECT * FROM measurements ORDER BY measured_at DESC"
        )

    def add_measurement(
        self,
        payload: dict[str, Any],
        measured_at: datetime | None = None,
    ) -> int:
        timestamp = measured_at or self._utc_now()
        source_hash = payload.get("source_hash") or sha256_json(
            {
                **payload,
                "measured_at": timestamp.isoformat(),
            }
        )
        measurement = Measurement(
            **{
                **payload,
                "measured_at": timestamp,
                "source_hash": source_hash,
            }
        )
        measurement_id = self.db.execute(
            """
            INSERT INTO measurements (
                pack_id, batch_id, measured_at, capacity_ah,
                resistance_mohm, min_temp_c, max_temp_c, charge_c_rate,
                discharge_c_rate, cycles, provenance, source_hash, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                measurement.pack_id,
                measurement.batch_id,
                measurement.measured_at.isoformat(),
                measurement.capacity_ah,
                measurement.resistance_mohm,
                measurement.min_temp_c,
                measurement.max_temp_c,
                measurement.charge_c_rate,
                measurement.discharge_c_rate,
                measurement.cycles,
                measurement.provenance,
                measurement.source_hash,
                measurement.notes,
            ),
        )
        self.db.record_event(
            "MEASUREMENT_ADDED",
            measurement.pack_id,
            {
                "measurement_id": measurement_id,
                "batch_id": measurement.batch_id,
                "source_hash": measurement.source_hash,
            },
            self._utc_now().isoformat(),
        )
        return measurement_id

    def import_measurements(
        self,
        records: list[dict[str, Any]],
        run_estimates: bool = True,
    ) -> dict[str, Any]:
        imported_ids: list[int] = []
        errors: list[dict[str, Any]] = []
        estimate_ids: list[int] = []
        for index, record in enumerate(records, start=2):
            try:
                clean = dict(record)
                measured_at_raw = clean.pop("measured_at", None)
                if measured_at_raw is None:
                    raise ValueError("measured_at is required")
                measured_at = datetime.fromisoformat(str(measured_at_raw))
                if measured_at.tzinfo is None:
                    measured_at = measured_at.replace(tzinfo=timezone.utc)
                clean.pop("measurement_id", None)
                clean.pop("source_hash", None)
                measurement_id = self.add_measurement(
                    clean, measured_at=measured_at
                )
                imported_ids.append(measurement_id)
                if run_estimates:
                    estimate_ids.append(
                        self.run_estimate(
                            str(clean["pack_id"]), measurement_id
                        )["estimate_id"]
                    )
            except Exception as exc:
                errors.append(
                    {
                        "row": index,
                        "pack_id": record.get("pack_id", ""),
                        "error": str(exc),
                    }
                )
        return {
            "imported_measurement_ids": imported_ids,
            "created_estimate_ids": estimate_ids,
            "errors": errors,
        }

    def change_installation(
        self,
        aircraft_id: str,
        pack_id: str,
        configuration_revision: str,
        software_version: str,
        calibration_valid: bool,
        calibration_date: str,
        notes: str = "",
    ) -> int:
        timestamp = self._utc_now()
        with self.db.connect() as connection:
            connection.execute(
                """
                UPDATE installations
                SET removed_at = ?
                WHERE aircraft_id = ? AND removed_at IS NULL
                """,
                (timestamp.isoformat(), aircraft_id),
            )
            connection.execute(
                """
                UPDATE installations
                SET removed_at = ?
                WHERE pack_id = ? AND removed_at IS NULL
                """,
                (timestamp.isoformat(), pack_id),
            )
            cursor = connection.execute(
                """
                INSERT INTO installations (
                    aircraft_id, pack_id, configuration_revision,
                    software_version, installed_at, removed_at,
                    calibration_valid, calibration_date, notes
                ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
                """,
                (
                    aircraft_id,
                    pack_id,
                    configuration_revision,
                    software_version,
                    timestamp.isoformat(),
                    int(calibration_valid),
                    calibration_date,
                    notes,
                ),
            )
            installation_id = int(cursor.lastrowid)
        self.db.record_event(
            "INSTALLATION_CHANGED",
            pack_id,
            {
                "installation_id": installation_id,
                "aircraft_id": aircraft_id,
                "configuration_revision": configuration_revision,
                "software_version": software_version,
            },
            timestamp.isoformat(),
        )
        return installation_id

    def preview_installation(
        self,
        pack_id: str,
        configuration_revision: str,
        software_version: str,
        calibration_valid: bool,
    ) -> dict[str, Any]:
        pack = self.get_pack(pack_id)
        model = self.get_model_for_pack(pack_id)
        latest = self.latest_measurement(pack_id)
        if pack is None or model is None or latest is None:
            raise ValueError("Pack, model or measurement is missing")
        measurement = self.get_measurement(int(latest["measurement_id"]))
        if measurement is None:
            raise ValueError("Measurement is missing")
        installation = Installation(
            aircraft_id="PREVIEW",
            pack_id=pack_id,
            configuration_revision=configuration_revision,
            software_version=software_version,
            installed_at=self._utc_now(),
            calibration_valid=calibration_valid,
            calibration_date="PREVIEW",
            notes="Configuration preview",
        )
        validation = validate_measurement(
            model, pack.chemistry, installation, measurement
        )
        return {
            "pack": pack,
            "model": model,
            "measurement": measurement,
            "installation": installation,
            "validation": validation,
        }

    def run_estimate(
        self, pack_id: str, measurement_id: int | None = None
    ) -> dict[str, Any]:
        pack = self.get_pack(pack_id)
        if pack is None:
            raise ValueError(f"Unknown pack: {pack_id}")
        if measurement_id is None:
            latest = self.latest_measurement(pack_id)
            if latest is None:
                raise ValueError(f"No measurement exists for {pack_id}")
            measurement_id = int(latest["measurement_id"])
        measurement = self.get_measurement(measurement_id)
        if measurement is None:
            raise ValueError(f"Unknown measurement: {measurement_id}")
        if measurement.pack_id != pack.pack_id:
            raise ValueError("Measurement does not belong to the selected pack")
        installation = self.get_installation(pack_id)
        model = self.get_model_for_pack(pack_id)
        if model is None:
            raise ValueError(f"No model domain exists for {pack.chemistry}")

        validation = validate_measurement(
            model, pack.chemistry, installation, measurement
        )
        estimate = estimate_health(
            model,
            measurement,
            validation,
            calibration_valid=bool(
                installation.calibration_valid if installation else False
            ),
        )
        if installation is None:
            placeholder_installation = Installation(
                aircraft_id="UNASSIGNED",
                pack_id=pack.pack_id,
                configuration_revision="UNASSIGNED",
                software_version="UNASSIGNED",
                installed_at=self._utc_now(),
                calibration_valid=False,
                calibration_date="UNKNOWN",
                notes="No active installation record",
            )
            package = build_evidence_package(
                pack,
                placeholder_installation,
                measurement,
                model,
                validation,
                estimate,
            )
        else:
            package = build_evidence_package(
                pack,
                installation,
                measurement,
                model,
                validation,
                estimate,
            )

        created_at = self._utc_now().isoformat()
        estimate_id = self.db.execute(
            """
            INSERT INTO estimates (
                pack_id, measurement_id, model_id, soh_pct,
                capacity_health_pct, resistance_health_pct,
                usable_power_pct, uncertainty_pct,
                indicative_remaining_cycles, advisory, validation_status,
                evidence_score_pct, evidence_hash, evidence_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pack.pack_id,
                measurement_id,
                model.model_id,
                estimate.soh_pct,
                estimate.capacity_health_pct,
                estimate.resistance_health_pct,
                estimate.usable_power_pct,
                estimate.uncertainty_pct,
                estimate.indicative_remaining_cycles,
                estimate.advisory,
                validation.status,
                package.traceability_score_pct,
                package.package_hash,
                package.model_dump_json(),
                created_at,
            ),
        )
        self.db.record_event(
            "ESTIMATE_CREATED",
            pack.pack_id,
            {
                "estimate_id": estimate_id,
                "validation_status": validation.status,
                "evidence_hash": package.package_hash,
            },
            created_at,
        )
        return {
            "estimate_id": estimate_id,
            "pack": pack,
            "measurement": measurement,
            "installation": installation,
            "model": model,
            "validation": validation,
            "estimate": estimate,
            "package": package,
        }

    def run_estimates_for_all(self) -> list[dict[str, Any]]:
        results = []
        for pack in self.list_packs():
            latest = self.latest_measurement(pack["pack_id"])
            if latest is not None:
                results.append(
                    self.run_estimate(
                        pack["pack_id"], int(latest["measurement_id"])
                    )
                )
        return results

    def list_estimates(
        self, pack_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        where = "WHERE e.pack_id = ?" if pack_id else ""
        parameters: tuple[Any, ...] = (pack_id, limit) if pack_id else (limit,)
        return self.db.fetchall(
            f"""
            SELECT
                e.*,
                p.chemistry,
                m.batch_id,
                m.measured_at,
                r.review_id,
                r.disposition,
                r.reviewer,
                r.created_at AS reviewed_at
            FROM estimates e
            JOIN battery_packs p ON p.pack_id = e.pack_id
            JOIN measurements m ON m.measurement_id = e.measurement_id
            LEFT JOIN reviews r
              ON r.review_id = (
                  SELECT review_id FROM reviews
                  WHERE estimate_id = e.estimate_id
                  ORDER BY created_at DESC LIMIT 1
              )
            {where}
            ORDER BY e.created_at DESC, e.estimate_id DESC
            LIMIT ?
            """,
            parameters,
        )

    def get_estimate(
        self, estimate_id: int
    ) -> dict[str, Any] | None:
        row = self.db.fetchone(
            """
            SELECT
                e.*,
                p.manufacturer,
                p.chemistry,
                p.rated_capacity_ah,
                p.baseline_resistance_mohm,
                m.batch_id,
                m.measured_at,
                m.capacity_ah,
                m.resistance_mohm,
                m.min_temp_c,
                m.max_temp_c,
                m.charge_c_rate,
                m.discharge_c_rate,
                m.cycles,
                m.provenance,
                m.source_hash
            FROM estimates e
            JOIN battery_packs p ON p.pack_id = e.pack_id
            JOIN measurements m ON m.measurement_id = e.measurement_id
            WHERE e.estimate_id = ?
            """,
            (estimate_id,),
        )
        if row is None:
            return None
        row["evidence_package"] = json.loads(row["evidence_json"])
        row["evidence_verified"] = verify_package(row["evidence_package"])
        row["latest_review"] = self.db.fetchone(
            """
            SELECT * FROM reviews
            WHERE estimate_id = ?
            ORDER BY created_at DESC, review_id DESC
            LIMIT 1
            """,
            (estimate_id,),
        )
        return row

    def pending_reviews(self) -> list[dict[str, Any]]:
        return self.db.fetchall(
            """
            SELECT
                e.estimate_id,
                e.pack_id,
                e.validation_status,
                e.soh_pct,
                e.uncertainty_pct,
                e.created_at,
                e.advisory,
                m.batch_id
            FROM estimates e
            JOIN measurements m ON m.measurement_id = e.measurement_id
            LEFT JOIN reviews r ON r.estimate_id = e.estimate_id
            WHERE e.validation_status != 'valid' AND r.review_id IS NULL
            ORDER BY e.created_at DESC
            """
        )

    def record_review(
        self,
        estimate_id: int,
        reviewer: str,
        disposition: str,
        rationale: str,
        signature: str,
    ) -> int:
        estimate = self.get_estimate(estimate_id)
        if estimate is None:
            raise ValueError(f"Unknown estimate: {estimate_id}")
        if not reviewer.strip():
            raise ValueError("Reviewer is required")
        if len(rationale.strip()) < 10:
            raise ValueError("Rationale must contain at least 10 characters")
        if not signature.strip():
            raise ValueError("Signature or authorisation reference is required")
        allowed = {
            "accepted",
            "rejected",
            "needs_data",
            "escalated",
        }
        if disposition not in allowed:
            raise ValueError(f"Unsupported disposition: {disposition}")
        if (
            disposition == "accepted"
            and estimate["validation_status"] != "valid"
        ):
            raise ValueError(
                "A blocked or review-required estimate cannot be accepted "
                "without closing the model-domain findings."
            )

        reviewed_at = self._utc_now().isoformat()
        review_id = self.db.execute(
            """
            INSERT INTO reviews (
                estimate_id, reviewer, disposition, rationale,
                signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                estimate_id,
                reviewer.strip(),
                disposition,
                rationale.strip(),
                signature.strip(),
                reviewed_at,
            ),
        )
        self.db.record_event(
            "REVIEW_RECORDED",
            estimate["pack_id"],
            {
                "estimate_id": estimate_id,
                "review_id": review_id,
                "disposition": disposition,
            },
            reviewed_at,
        )
        return review_id

    def dashboard_metrics(self) -> dict[str, Any]:
        estimate_count = int(self.db.scalar("SELECT COUNT(*) FROM estimates"))
        valid_count = int(
            self.db.scalar(
                """
                SELECT COUNT(*) FROM estimates
                WHERE validation_status = 'valid'
                """
            )
        )
        pending_reviews = len(self.pending_reviews())
        mean_evidence = float(
            self.db.scalar(
                "SELECT AVG(evidence_score_pct) FROM estimates", default=0.0
            )
        )
        return {
            "aircraft_count": int(
                self.db.scalar("SELECT COUNT(*) FROM aircraft")
            ),
            "pack_count": int(
                self.db.scalar("SELECT COUNT(*) FROM battery_packs")
            ),
            "estimate_count": estimate_count,
            "valid_estimate_count": valid_count,
            "pending_review_count": pending_reviews,
            "mean_evidence_score_pct": round(mean_evidence, 1),
        }

    def recent_events(self, limit: int = 20) -> list[dict[str, Any]]:
        events = self.db.fetchall(
            """
            SELECT * FROM events
            ORDER BY created_at DESC, event_id DESC
            LIMIT ?
            """,
            (limit,),
        )
        for event in events:
            event["details"] = json.loads(event.pop("details_json"))
        return events

    def pilot_metrics(self) -> dict[str, Any]:
        rows = self.db.fetchall("SELECT * FROM pilot_runs")
        metrics: dict[str, Any] = {}
        for method in ("manual", "cadtf_synthetic"):
            selected = [row for row in rows if row["method"] == method]
            if not selected:
                metrics[method] = {}
                continue
            metrics[method] = {
                "cases": len(selected),
                "mean_traceability_pct": round(
                    sum(row["traceability_pct"] for row in selected)
                    / len(selected),
                    1,
                ),
                "mean_reconstruction_minutes": round(
                    sum(row["reconstruction_minutes"] for row in selected)
                    / len(selected),
                    1,
                ),
                "mean_model_error_pct": round(
                    sum(row["model_error_pct"] for row in selected)
                    / len(selected),
                    1,
                ),
                "mean_alerts": round(
                    sum(row["alert_count"] for row in selected)
                    / len(selected),
                    1,
                ),
                "mean_cost_units": round(
                    sum(row["cost_units"] for row in selected)
                    / len(selected),
                    2,
                ),
            }
        return metrics

    def export_tables(self) -> dict[str, Any]:
        table_names = [
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
            table: self.db.dataframe(f"SELECT * FROM {table}")
            for table in table_names
        }

    @staticmethod
    def evidence_dictionary() -> list[dict[str, str]]:
        return [
            {
                "field": "pack_id",
                "chinese": "电池包编号",
                "unit": "text",
                "purpose": "Links an estimate to the physical battery installation.",
            },
            {
                "field": "aircraft_id",
                "chinese": "飞机编号",
                "unit": "text",
                "purpose": "Identifies the aircraft carrying the pack.",
            },
            {
                "field": "configuration_revision",
                "chinese": "构型修订",
                "unit": "text",
                "purpose": "Detects installation changes that may invalidate evidence.",
            },
            {
                "field": "software_version",
                "chinese": "软件版本",
                "unit": "semantic version",
                "purpose": "Records the software baseline used during data acquisition.",
            },
            {
                "field": "measured_at",
                "chinese": "测量时间",
                "unit": "ISO 8601 UTC",
                "purpose": "Places each record on a shared time basis.",
            },
            {
                "field": "capacity_ah",
                "chinese": "容量",
                "unit": "Ah",
                "purpose": "Constrains the capacity-health component.",
            },
            {
                "field": "resistance_mohm",
                "chinese": "内阻",
                "unit": "mOhm",
                "purpose": "Constrains resistance health and usable-power estimation.",
            },
            {
                "field": "temperature_range_c",
                "chinese": "温度范围",
                "unit": "degrees C",
                "purpose": "Checks the validated thermal envelope.",
            },
            {
                "field": "charge_c_rate",
                "chinese": "充电倍率",
                "unit": "C",
                "purpose": "Checks charge-operation validity.",
            },
            {
                "field": "discharge_c_rate",
                "chinese": "放电倍率",
                "unit": "C",
                "purpose": "Checks discharge-operation validity.",
            },
            {
                "field": "cycles",
                "chinese": "循环次数",
                "unit": "count",
                "purpose": "Checks cycle-life validity and informs uncertainty.",
            },
            {
                "field": "provenance",
                "chinese": "数据来源",
                "unit": "text",
                "purpose": "States where the record came from.",
            },
            {
                "field": "source_hash",
                "chinese": "源数据哈希",
                "unit": "SHA-256",
                "purpose": "Detects changes to source data.",
            },
            {
                "field": "model_id",
                "chinese": "模型编号",
                "unit": "text",
                "purpose": "Identifies the model and validation domain.",
            },
            {
                "field": "validation_status",
                "chinese": "验证状态",
                "unit": "valid/review/blocked",
                "purpose": "Controls whether an advisory can be released.",
            },
            {
                "field": "uncertainty_pct",
                "chinese": "不确定度",
                "unit": "%",
                "purpose": "States the confidence associated with the estimate.",
            },
            {
                "field": "evidence_hash",
                "chinese": "证据包哈希",
                "unit": "SHA-256",
                "purpose": "Detects changes to the evidence package.",
            },
            {
                "field": "reviewer",
                "chinese": "审查人员",
                "unit": "text",
                "purpose": "Records accountable manual review.",
            },
            {
                "field": "disposition",
                "chinese": "审查处置",
                "unit": "text",
                "purpose": "Records the authorised outcome.",
            },
            {
                "field": "signature",
                "chinese": "签署依据",
                "unit": "text",
                "purpose": "Links the disposition to an authorisation reference.",
            },
        ]
