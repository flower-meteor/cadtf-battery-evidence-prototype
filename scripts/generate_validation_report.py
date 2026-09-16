"""Generate a current-state validation report for the CADTF prototype."""

from __future__ import annotations

import hashlib
import json
import platform
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cadtf.service import CADTFService


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pytest_summary(path: Path) -> dict[str, int]:
    if not path.exists():
        return {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
    root = ET.parse(path).getroot()
    suite = root.find("testsuite")
    if suite is None:
        return {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
    return {
        "tests": int(suite.attrib.get("tests", 0)),
        "failures": int(suite.attrib.get("failures", 0)),
        "errors": int(suite.attrib.get("errors", 0)),
        "skipped": int(suite.attrib.get("skipped", 0)),
    }


def main() -> int:
    docs = ROOT / "docs"
    exports = ROOT / "exports"
    docs.mkdir(exist_ok=True)
    exports.mkdir(exist_ok=True)

    service = CADTFService(ROOT / "data" / "cadtf_demo.db")
    service.ensure_demo_data(run_estimates=True)
    metrics = service.dashboard_metrics()
    estimates = service.list_estimates(limit=1000)
    verified = []
    for item in estimates:
        detail = service.get_estimate(item["estimate_id"])
        verified.append(
            {
                "estimate_id": item["estimate_id"],
                "pack_id": item["pack_id"],
                "validation_status": item["validation_status"],
                "soh_pct": item["soh_pct"],
                "evidence_hash": item["evidence_hash"],
                "verified": detail["evidence_verified"],
            }
        )

    test_summary = pytest_summary(exports / "pytest-results.xml")
    generated_at = datetime.now(timezone.utc).isoformat()
    db_path = ROOT / "data" / "cadtf_demo.db"
    workbook = exports / "cadtf_prototype_export.xlsx"
    manifest = exports / "evidence_manifest.csv"
    summary = {
        "generated_at": generated_at,
        "python": platform.python_version(),
        "test_summary": test_summary,
        "metrics": metrics,
        "evidence": verified,
        "hashes": {
            "database": file_hash(db_path) if db_path.exists() else None,
            "workbook": file_hash(workbook) if workbook.exists() else None,
            "evidence_manifest": (
                file_hash(manifest) if manifest.exists() else None
            ),
        },
    }
    (exports / "validation_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# CADTF Prototype Validation Report",
        "",
        f"Generated: `{generated_at}`",
        f"Python: `{platform.python_version()}`",
        "",
        "## Automated Tests",
        "",
        f"- Tests: {test_summary['tests']}",
        f"- Failures: {test_summary['failures']}",
        f"- Errors: {test_summary['errors']}",
        f"- Skipped: {test_summary['skipped']}",
        "",
        "## System Metrics",
        "",
    ]
    for key, value in metrics.items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(
        [
            "",
            "## Evidence Verification",
            "",
            "| Estimate | Pack | Validation | SOH (%) | Hash verified |",
            "|---:|---|---|---:|---|",
        ]
    )
    for item in verified:
        lines.append(
            f"| {item['estimate_id']} | {item['pack_id']} | "
            f"{item['validation_status']} | {item['soh_pct']:.1f} | "
            f"{'yes' if item['verified'] else 'no'} |"
        )
    lines.extend(
        [
            "",
            "## Artifact Hashes",
            "",
            f"- Database SHA-256: `{summary['hashes']['database']}`",
            f"- Workbook SHA-256: `{summary['hashes']['workbook']}`",
            "- Evidence manifest SHA-256: "
            f"`{summary['hashes']['evidence_manifest']}`",
            "",
            "## Scope",
            "",
            "This report verifies the prototype implementation and its",
            "synthetic workflow. It does not certify aircraft, batteries,",
            "models, maintenance procedures or operational performance.",
        ]
    )
    report_path = docs / "VALIDATION_REPORT.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
