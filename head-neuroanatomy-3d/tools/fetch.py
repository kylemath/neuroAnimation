#!/usr/bin/env python3
"""Download raw sources into the gitignored tools/_cache/ directory."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Tuple

import requests

from paths import CACHE, GRAPHCOLOURING_DOCS, TOOLS, ensure_dirs

SOURCES = json.loads((TOOLS / "sources.json").read_text())
UA = {"User-Agent": "neuroAnimation-head-neuroanatomy-3d/0.1 (course build pipeline)"}
DRYAD_FILE = "https://datadryad.org/api/v2/files/{file_id}/download"


def dest_path(rel: str) -> Path:
    path = CACHE / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def download(url: str, dest: Path, timeout: int = 600) -> Tuple[bool, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    existing = dest.stat().st_size if dest.exists() else 0
    headers = dict(UA)
    if existing and not dest.exists():
        existing = 0
    # Resume into .part if present.
    if part.exists():
        existing = part.stat().st_size
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
        target = part
    elif dest.exists() and dest.stat().st_size > 0:
        return True, f"cached {dest.name} ({dest.stat().st_size} bytes)"
    else:
        existing = 0
        mode = "wb"
        target = part

    last_err = "unknown error"
    for attempt in range(3):
        try:
            with requests.get(url, headers=headers, stream=True, timeout=timeout, allow_redirects=True) as resp:
                if resp.status_code == 416 and dest.exists():
                    return True, f"cached {dest.name}"
                resp.raise_for_status()
                total = resp.headers.get("Content-Length")
                written = existing
                with open(target, mode) as handle:
                    for chunk in resp.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            handle.write(chunk)
                            written += len(chunk)
                target.replace(dest)
                size_hint = f"{written} bytes" if not total else f"{written} bytes (len={total})"
                return True, f"downloaded {dest.name} ({size_hint})"
        except Exception as exc:
            last_err = str(exc)
            existing = target.stat().st_size if target.exists() else 0
            headers = dict(UA)
            if existing:
                headers["Range"] = f"bytes={existing}-"
                mode = "ab"
    return False, f"FAIL {url} -> {dest}: {last_err}"


def copy_graphcolouring() -> List[str]:
    notes = []
    if not GRAPHCOLOURING_DOCS.exists():
        return [f"GraphColouring docs missing: {GRAPHCOLOURING_DOCS}"]
    for item in SOURCES["graphcolouring"]:
        src = GRAPHCOLOURING_DOCS / item["src"]
        dest = dest_path(item["dest"])
        if not src.exists():
            notes.append(f"missing local {src}")
            continue
        if dest.exists() and dest.stat().st_size == src.stat().st_size:
            notes.append(f"cached {dest.name}")
            continue
        shutil.copy2(src, dest)
        notes.append(f"copied {src.name} -> {dest}")
    return notes


def fetch_catalog(include_after_audit: bool = False) -> List[Tuple[str, bool, str]]:
    jobs = []
    for item in SOURCES["downloads"]:
        if item.get("afterAudit") and not include_after_audit:
            continue
        jobs.append((item["id"], item["url"], dest_path(item["dest"])))
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(download, url, dest): ident for ident, url, dest in jobs}
        for fut in as_completed(futs):
            ident = futs[fut]
            ok, msg = fut.result()
            print(f"[{ident}] {msg}")
            results.append((ident, ok, msg))
    return results


def fetch_aan() -> List[Tuple[str, bool, str]]:
    results = []
    jobs = []
    for item in SOURCES["aanFiles"]:
        url = DRYAD_FILE.format(file_id=item["fileId"])
        dest = dest_path(f"aan/{item['path']}")
        jobs.append((item["id"], url, dest))
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(download, url, dest): ident for ident, url, dest in jobs}
        for fut in as_completed(futs):
            ident = futs[fut]
            ok, msg = fut.result()
            print(f"[{ident}] {msg}")
            results.append((ident, ok, msg))
    return results


def extract_bp3d(zip_path: Path) -> List[str]:
    notes = []
    if not zip_path.exists():
        return ["BodyParts3D zip not present"]
    out_dir = zip_path.parent / "obj"
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = set()
    for item in SOURCES.get("bp3dWanted", []):
        wanted.add(item.get("representation", "").upper())
        for elem in item.get("elements") or []:
            wanted.add(elem.upper())
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        notes.append(f"zip entries={len(names)} sample={names[:8]}")
        extracted = 0
        for name in names:
            stem = Path(name).stem.upper()
            if stem in wanted:
                dest = out_dir / Path(name).name
                if not dest.exists():
                    dest.write_bytes(zf.read(name))
                extracted += 1
        notes.append(f"extracted {extracted} wanted OBJ(s) to {out_dir}")
        # If representation IDs are compounds, keep a name index for later element lookup.
        (zip_path.parent / "zip_index.json").write_text(json.dumps(names, indent=2))
    return notes


def write_manifest(results: List[Tuple[str, bool, str]]) -> Path:
    payload = {
        "ok": all(ok for _, ok, _ in results),
        "files": [{"id": i, "ok": ok, "message": msg} for i, ok, msg in results],
    }
    path = CACHE / "fetch_manifest.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-bp3d-zip", action="store_true", help="Also download the 62 MB BodyParts3D OBJ archive")
    args = parser.parse_args(argv)
    ensure_dirs()
    results: List[Tuple[str, bool, str]] = []
    print("Copying GraphColouring local assets…")
    for note in copy_graphcolouring():
        print(" ", note)
        results.append(("graphcolouring", "missing" not in note, note))
    print("Fetching catalog downloads…")
    results.extend(fetch_catalog(include_after_audit=args.with_bp3d_zip))
    print("Fetching Harvard AAN v2.0 from Dryad…")
    results.extend(fetch_aan())
    zip_path = dest_path("bodyparts3d/partof_BP3D_4.0_obj_99.zip")
    if zip_path.exists():
        print("Extracting selected BodyParts3D OBJs…")
        for note in extract_bp3d(zip_path):
            print(" ", note)
    path = write_manifest(results)
    failed = [r for r in results if not r[1]]
    print(f"Manifest: {path}")
    if failed:
        print(f"{len(failed)} download(s) failed:")
        for ident, _, msg in failed:
            print(f"  - {ident}: {msg}")
        # GraphColouring notes that are copies still count as ok; required failures matter.
        required_fail = [r for r in failed if r[0] not in {"graphcolouring"}]
        return 1 if required_fail else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
