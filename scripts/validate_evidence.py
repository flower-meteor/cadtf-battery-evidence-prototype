"""Verify every stored CADTF evidence package."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cadtf.service import CADTFService


def main() -> int:
    service = CADTFService(ROOT / "data" / "cadtf_demo.db")
    service.ensure_demo_data(run_estimates=True)
    failures = []
    estimates = service.list_estimates(limit=1000)
    for estimate in estimates:
        detail = service.get_estimate(estimate["estimate_id"])
        if not detail["evidence_verified"]:
            failures.append(estimate["estimate_id"])
        print(
            f"estimate {estimate['estimate_id']}: "
            f"{'verified' if detail['evidence_verified'] else 'failed'}"
        )
    if failures:
        print(f"Failed evidence packages: {failures}")
        return 1
    print(f"All {len(estimates)} evidence packages verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
