"""Generate a hash manifest for the prototype deliverables."""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INCLUDED_ROOTS = [
    ROOT / "app.py",
    ROOT / "check_environment.py",
    ROOT / "requirements.txt",
    ROOT / "README.md",
    ROOT / "项目完成说明.md",
    ROOT / "start_app.cmd",
    ROOT / "run_validation.cmd",
    ROOT / "check_environment.cmd",
    ROOT / "pyproject.toml",
    ROOT / ".streamlit",
    ROOT / "cadtf",
    ROOT / "tests",
    ROOT / "scripts",
    ROOT / "docs",
    ROOT / "data",
    ROOT / "exports",
]
EXCLUDED_PARTS = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    "streamlit_startup.stdout.log",
    "streamlit_startup.stderr.log",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def files() -> list[Path]:
    output: list[Path] = []
    for item in INCLUDED_ROOTS:
        if item.is_file():
            output.append(item)
        elif item.is_dir():
            output.extend(
                path
                for path in item.rglob("*")
                if path.is_file()
                and not any(part in EXCLUDED_PARTS for part in path.parts)
            )
    return sorted(set(output))


def main() -> int:
    manifest = ROOT / "DELIVERABLE_MANIFEST.csv"
    with manifest.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(["path", "size_bytes", "sha256"])
        for path in files():
            writer.writerow(
                [
                    str(path.relative_to(ROOT)).replace("\\", "/"),
                    path.stat().st_size,
                    sha256(path),
                ]
            )
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
