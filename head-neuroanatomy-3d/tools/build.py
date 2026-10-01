#!/usr/bin/env python3
"""Run the data pipeline: audit → fetch → inspect → register → derive → optimize."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from paths import TOOLS, ensure_dirs

STEPS = ("audit", "fetch", "inspect_sources", "register", "derive", "optimize", "vessel_split")


def run_step(name: str, extra: list[str] | None = None) -> None:
    script = TOOLS / f"{name}.py"
    cmd = [sys.executable, str(script)]
    if extra:
        cmd.extend(extra)
    print(f"\n=== {name} ===")
    subprocess.run(cmd, check=True, cwd=str(TOOLS))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", choices=STEPS, default="audit")
    parser.add_argument("--only", choices=STEPS, default=None)
    parser.add_argument("--with-bp3d-zip", action="store_true")
    args = parser.parse_args()
    ensure_dirs()
    steps = list(STEPS)
    if args.only:
        steps = [args.only]
    else:
        steps = steps[steps.index(args.start) :]
    for name in steps:
        extra = ["--with-bp3d-zip"] if name == "fetch" and args.with_bp3d_zip else None
        run_step(name, extra)
    return 0


if __name__ == "__main__":
    sys.exit(main())
