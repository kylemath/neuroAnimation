"""Shared filesystem locations for the build pipeline."""
from __future__ import annotations

from pathlib import Path

TOOLS = Path(__file__).resolve().parent
PAGE = TOOLS.parent
REPO = PAGE.parent
CACHE = TOOLS / "_cache"
QA = CACHE / "qa"
INTERMEDIATE = CACHE / "intermediate"
ASSETS = PAGE / "assets"
GRAPHCOLOURING_DOCS = Path("/Users/fulkanjou/GraphColouring/docs")

CACHE_ALLEN = CACHE / "allen"
CACHE_PITT = CACHE / "pitt"
CACHE_AAN = CACHE / "aan"
CACHE_BP3D = CACHE / "bodyparts3d"
CACHE_GC = CACHE / "graphcolouring"
CACHE_INSPECT = CACHE / "inspect"


def ensure_dirs() -> None:
    for path in (
        CACHE,
        QA,
        INTERMEDIATE,
        ASSETS,
        CACHE_ALLEN,
        CACHE_PITT,
        CACHE_AAN,
        CACHE_BP3D,
        CACHE_GC,
        CACHE_INSPECT,
    ):
        path.mkdir(parents=True, exist_ok=True)
