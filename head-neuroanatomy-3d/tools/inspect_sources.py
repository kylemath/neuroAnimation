#!/usr/bin/env python3
"""Inspect cached sources: units, axes, bounding boxes, node names."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict

import numpy as np
import trimesh

from paths import CACHE, CACHE_INSPECT, ensure_dirs
from transforms import bbox_of, detect_unit_scale, extents

MESH_GLOBS = [
    "allen/*.glb",
    "pitt/*.stl",
    "graphcolouring/*.glb",
]


def mesh_report(path: Path) -> Dict:
    print(f"inspect {path}")
    loaded = trimesh.load(path, force=None, skip_materials=False)
    geoms = []
    if isinstance(loaded, trimesh.Scene):
        items = list(loaded.geometry.items())
        if not items:
            items = [("scene", trimesh.util.concatenate(loaded.dump()))]
        all_pts = []
        for name, geom in items:
            if not hasattr(geom, "vertices"):
                continue
            pts = np.asarray(geom.vertices, dtype=np.float64)
            box = bbox_of(pts)
            geoms.append(
                {
                    "name": str(name),
                    "vertices": int(len(geom.vertices)),
                    "faces": int(len(geom.faces)) if hasattr(geom, "faces") else 0,
                    "bbox": box.tolist(),
                    "extents": extents(box).tolist(),
                    "centroid": pts.mean(axis=0).tolist(),
                }
            )
            all_pts.append(pts)
        pts = np.vstack(all_pts) if all_pts else np.zeros((1, 3))
        graph_names = []
        try:
            graph_names = [str(n) for n in loaded.graph.nodes]
        except Exception:
            graph_names = []
    else:
        geom = loaded
        pts = np.asarray(geom.vertices, dtype=np.float64)
        box = bbox_of(pts)
        geoms.append(
            {
                "name": path.stem,
                "vertices": int(len(geom.vertices)),
                "faces": int(len(geom.faces)) if hasattr(geom, "faces") else 0,
                "bbox": box.tolist(),
                "extents": extents(box).tolist(),
                "centroid": pts.mean(axis=0).tolist(),
            }
        )
        graph_names = [path.stem]

    scale, scale_note = detect_unit_scale(pts)
    box = bbox_of(pts)
    return {
        "path": str(path.relative_to(CACHE)),
        "bytes": path.stat().st_size,
        "geometryCount": len(geoms),
        "nodeNames": [g["name"] for g in geoms],
        "graphNodes": graph_names[:400],
        "bbox": box.tolist(),
        "extents": extents(box).tolist(),
        "centroid": pts.mean(axis=0).tolist(),
        "unitScale": scale,
        "unitNote": scale_note,
        "scaledMmExtents": (extents(box) * scale).tolist(),
        "geometries": geoms if len(geoms) <= 400 else geoms[:400],
    }


def nifti_report(path: Path) -> Dict:
    import nibabel as nib

    img = nib.load(str(path))
    data = np.asanyarray(img.dataobj)
    affine = np.asarray(img.affine, dtype=np.float64)
    nz = np.column_stack(np.nonzero(data > 0)) if data.ndim == 3 else np.zeros((0, 3))
    if len(nz):
        xyz = nib.affines.apply_affine(affine, nz)
        box = bbox_of(xyz)
        centroid = xyz.mean(axis=0).tolist()
    else:
        box = np.zeros((2, 3))
        centroid = [0, 0, 0]
    return {
        "path": str(path.relative_to(CACHE)),
        "bytes": path.stat().st_size,
        "shape": list(data.shape),
        "zooms": [float(z) for z in img.header.get_zooms()[:3]],
        "affine": affine.tolist(),
        "nonzero": int(len(nz)),
        "bbox": np.asarray(box).tolist(),
        "centroid": centroid,
        "unitScale": 1.0,
        "unitNote": "NIfTI world via affine (expected MNI mm)",
    }


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-over-mb", type=float, default=50.0)
    args = parser.parse_args()
    ensure_dirs()
    reports = []
    for pattern in MESH_GLOBS:
        for path in sorted(CACHE.glob(pattern)):
            mb = path.stat().st_size / 1e6
            if args.skip_over_mb and mb > args.skip_over_mb:
                note = {
                    "whole_brain.stl": "README after /1000: X -73..74, Y -102..95, Z -63..94 mm RAS-like",
                    "brainstem_cranial_nerves.stl": "README after /1000: ~55 x 53 x 82 mm, origin-centered print frame",
                    "cerebral_arteries.stl": "README after /1000: X -66..65, Y -94..63, Z -96..55 mm",
                    "axial_pons.stl": "brainstem family; same frame as brainstem+cranial nerves",
                    "axial_midbrain.stl": "brainstem family",
                    "axial_rostral_medulla.stl": "brainstem family",
                    "axial_caudal_medulla.stl": "brainstem family",
                }.get(path.name, "large mesh; full load deferred to register/derive")
                reports.append(
                    {
                        "path": str(path.relative_to(CACHE)),
                        "bytes": path.stat().st_size,
                        "skipped": f">{args.skip_over_mb} MB",
                        "fromReadme": note,
                        "unitScale": 0.001 if "axial" in path.name or path.name in {
                            "whole_brain.stl",
                            "brainstem_cranial_nerves.stl",
                            "cerebral_arteries.stl",
                        } else 1.0,
                    }
                )
                print(f"skip {path.name} ({mb:.1f} MB)")
                continue
            try:
                reports.append(mesh_report(path))
            except Exception as exc:
                reports.append({"path": str(path), "error": str(exc)})
    for path in sorted((CACHE / "aan").glob("*.nii")):
        try:
            reports.append(nifti_report(path))
        except Exception as exc:
            reports.append({"path": str(path), "error": str(exc)})

    out = CACHE_INSPECT / "inspect_report.json"
    out.write_text(json.dumps({"files": reports}, indent=2))
    print(f"Wrote {out} ({len(reports)} files)")
    for item in reports:
        if "error" in item:
            print(f"  ERR {item.get('path')}: {item['error']}")
            continue
        if item.get("skipped"):
            print(f"  {item['path']}: skipped {item['skipped']}")
            continue
        ext = item.get("scaledMmExtents") or item.get("extents")
        print(
            f"  {item['path']}: scale={item.get('unitScale')} mm-ext={ext} "
            f"n={item.get('geometryCount', item.get('nonzero'))}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
