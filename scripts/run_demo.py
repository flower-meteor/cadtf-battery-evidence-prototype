"""Run and report the deterministic CADTF end-to-end demonstration."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cadtf.service import CADTFService


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Rebuild the local synthetic demonstration database.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable output.",
    )
    args = parser.parse_args()

    service = CADTFService(ROOT / "data" / "cadtf_demo.db")
    if args.reset:
        service.reset_demo()
    else:
        service.ensure_demo_data(run_estimates=True)

    estimates = service.list_estimates(limit=20)
    payload = {
        "metrics": service.dashboard_metrics(),
        "estimates": [
            {
                "estimate_id": item["estimate_id"],
                "pack_id": item["pack_id"],
                "status": item["validation_status"],
                "soh_pct": item["soh_pct"],
                "evidence_score_pct": item["evidence_score_pct"],
            }
            for item in estimates
        ],
        "pilot_metrics": service.pilot_metrics(),
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        metrics = payload["metrics"]
        print("CADTF demonstration")
        print(f"Aircraft: {metrics['aircraft_count']}")
        print(f"Battery packs: {metrics['pack_count']}")
        print(f"Estimates: {metrics['estimate_count']}")
        print(f"Pending reviews: {metrics['pending_review_count']}")
        print(f"Mean evidence score: {metrics['mean_evidence_score_pct']:.1f}%")
        print("")
        for item in payload["estimates"]:
            print(
                f"{item['pack_id']}: {item['status']}, "
                f"SOH {item['soh_pct']:.1f}%, "
                f"evidence {item['evidence_score_pct']:.1f}%"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
