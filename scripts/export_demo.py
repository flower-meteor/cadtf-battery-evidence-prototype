"""Export the CADTF prototype database and evidence packages."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cadtf.service import CADTFService


def main() -> int:
    exports = ROOT / "exports"
    evidence_dir = exports / "evidence"
    exports.mkdir(exist_ok=True)
    evidence_dir.mkdir(exist_ok=True)

    service = CADTFService(ROOT / "data" / "cadtf_demo.db")
    service.ensure_demo_data(run_estimates=True)

    tables = service.export_tables()
    workbook = exports / "cadtf_prototype_export.xlsx"
    with pd.ExcelWriter(workbook, engine="openpyxl") as writer:
        summary = pd.DataFrame(
            [
                {"metric": key, "value": value}
                for key, value in service.dashboard_metrics().items()
            ]
        )
        summary.to_excel(writer, sheet_name="summary", index=False)
        for name, frame in tables.items():
            frame.to_excel(writer, sheet_name=name[:31], index=False)

    manifest = []
    for estimate in service.list_estimates(limit=1000):
        detail = service.get_estimate(estimate["estimate_id"])
        package = detail["evidence_package"]
        package_path = evidence_dir / f"{package['package_id']}.json"
        package_path.write_text(
            json.dumps(package, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        manifest.append(
            {
                "estimate_id": detail["estimate_id"],
                "pack_id": detail["pack_id"],
                "package_id": package["package_id"],
                "package_hash": package["package_hash"],
                "verified": detail["evidence_verified"],
                "file": str(package_path.relative_to(exports)),
            }
        )

    manifest_frame = pd.DataFrame(manifest)
    manifest_frame.to_csv(exports / "evidence_manifest.csv", index=False)
    print(workbook)
    print(exports / "evidence_manifest.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
