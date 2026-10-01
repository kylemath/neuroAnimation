#!/usr/bin/env python3
"""Licence + sensory-organ source audit (BodyParts3D, Dryad, Pitt, NIH 3D notes)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Dict, List

import requests

from paths import CACHE, CACHE_BP3D, TOOLS, ensure_dirs

SOURCES = json.loads((TOOLS / "sources.json").read_text())
UA = {"User-Agent": "neuroAnimation-head-neuroanatomy-3d/0.1"}

SENSORY_TERMS = [
    "eye",
    "eyeball",
    "ear",
    "tongue",
    "pituitary",
    "pineal",
    "colliculus",
    "tectum",
    "cochlea",
    "semicircular",
    "labyrinth",
    "lens",
    "retina",
    "olfactory",
    "optic nerve",
    "optic chiasm",
]


def parse_bp3d_list(path: Path) -> List[Dict]:
    rows = []
    if not path.exists():
        return rows
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.lower().startswith(("concept", "#")):
            continue
        parts = re.split(r"\t+", line)
        if len(parts) < 2:
            parts = re.split(r"\s{2,}", line)
        if len(parts) == 1:
            m = re.match(r"(FMA\d+)\s+(.+)", line)
            if not m:
                continue
            concept, name = m.group(1), m.group(2)
            rows.append({"concept": concept, "representation": None, "name": name})
            continue
        concept = parts[0].strip()
        if not concept.upper().startswith("FMA"):
            continue
        if len(parts) >= 3:
            rows.append(
                {
                    "concept": concept,
                    "representation": parts[1].strip(),
                    "name": parts[2].strip(),
                }
            )
        else:
            rows.append({"concept": concept, "representation": None, "name": parts[1].strip()})
    return rows


def match_terms(rows: List[Dict], terms: List[str]) -> Dict[str, List[Dict]]:
    found = {term: [] for term in terms}
    for row in rows:
        name = row["name"].lower()
        for term in terms:
            if re.search(rf"\b{re.escape(term)}\b", name):
                found[term].append(row)
    return found


def check_dryad() -> Dict:
    url = "https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.zw3r228d2"
    try:
        resp = requests.get(url, headers=UA, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return {
            "ok": True,
            "title": data.get("title"),
            "license": data.get("license"),
            "publicationDate": data.get("publicationDate"),
            "versionNumber": data.get("versionNumber"),
            "download": "https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.zw3r228d2/download",
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def check_allen() -> Dict:
    url = SOURCES["sources"]["allen-hra-brain-male-v1.4"]["url"]
    try:
        resp = requests.head(url, headers=UA, timeout=20, allow_redirects=True)
        return {
            "ok": resp.status_code == 200,
            "url": url,
            "status": resp.status_code,
            "bytes": int(resp.headers.get("Content-Length") or 0),
            "licence": "CC BY 4.0",
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "url": url}


def check_pitt_license() -> Dict:
    path = CACHE / "pitt" / "LICENSE.md"
    text = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    return {
        "ok": "Attribution-ShareAlike 4.0" in text or "CC BY-SA 4.0" in text or "ShareAlike" in text,
        "licence": "CC BY-SA 4.0",
        "text": text.strip(),
        "shareAlikeAppliesToDerivatives": True,
    }


def nih3d_note() -> Dict:
    return {
        "ok": True,
        "note": (
            "NIH 3D hosts the same HRA brain-male GLB (3DPX-020960, CC BY 4.0) "
            "and assorted anatomy entries. BodyParts3D is the structured gap-filler "
            "for pituitary/pineal/colliculi/eye/ear. No NIH 3D inner-ear or tongue "
            "mesh is treated as a required source."
        ),
        "hraEntry": "https://3d.nih.gov/entries/3DPX-020960",
    }


def main() -> int:
    ensure_dirs()
    isa_path = CACHE_BP3D / "isa_parts_list_e.txt"
    partof_path = CACHE_BP3D / "partof_parts_list_e.txt"
    # Lists are tiny; fetch here so audit can run before the full fetch.
    for rel, dest in (
        ("https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt", isa_path),
        ("https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt", partof_path),
    ):
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            resp = requests.get(rel, headers=UA, timeout=60)
            resp.raise_for_status()
            dest.write_bytes(resp.content)

    isa = parse_bp3d_list(isa_path)
    partof = parse_bp3d_list(partof_path)
    isa_hits = match_terms(isa, SENSORY_TERMS)
    partof_hits = match_terms(partof, SENSORY_TERMS)

    real_meshes = []
    schematics = []
    for term in SENSORY_TERMS:
        hits = isa_hits[term] + partof_hits[term]
        if hits:
            real_meshes.append({"term": term, "hits": hits[:12], "count": len(hits)})
        else:
            schematics.append(term)

    report = {
        "allen": check_allen(),
        "dryadAan": check_dryad(),
        "pitt": check_pitt_license(),
        "nih3d": nih3d_note(),
        "bodyparts3d": {
            "licence": "CC BY-SA 2.1 JP",
            "isaRows": len(isa),
            "partofRows": len(partof),
            "isaList": str(isa_path),
            "partofList": str(partof_path),
            "matches": {
                term: {
                    "isa": isa_hits[term][:8],
                    "partof": partof_hits[term][:8],
                    "present": bool(isa_hits[term] or partof_hits[term]),
                }
                for term in SENSORY_TERMS
            },
        },
        "sensoryDecision": {
            "useRealMeshIfRegistered": [m["term"] for m in real_meshes],
            "useSchematic": [
                t
                for t in schematics
                if t in {"tongue", "cochlea", "semicircular", "labyrinth", "lens", "retina"}
            ],
            "notes": (
                "LATEST BodyParts3D lists real meshes for eyeball, lens, tongue, "
                "pituitary, pineal, superior/inferior colliculus, midbrain tectum, "
                "optic nerve/chiasm, and external ear. No cochlea, semicircular canals, "
                "or bony labyrinth. Red nucleus is absent from the open sets and is a "
                "labelled schematic ellipsoid. Ear hits must use word boundaries "
                "(avoid forearm/heart false positives)."
            ),
        },
        "graphcolouring": {
            "localDir": "/Users/fulkanjou/GraphColouring/docs",
            "files": ["fsaverage_head.glb", "10_20_positions.json", "mne_anatomy.json"],
            "licenceNote": "fsaverage is distributed with FreeSurfer/MNE; confirm attribution on the credits panel.",
        },
    }
    out = CACHE / "audit_report.json"
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] if k != "bodyparts3d" else {
        "isaRows": report["bodyparts3d"]["isaRows"],
        "partofRows": report["bodyparts3d"]["partofRows"],
        "present": {t: v["present"] for t, v in report["bodyparts3d"]["matches"].items()},
    } for k in report}, indent=2))
    print(f"Wrote {out}")
    return 0 if report["allen"].get("ok") and report["dryadAan"].get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
