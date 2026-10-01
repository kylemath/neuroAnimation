#!/usr/bin/env python3
"""Normalize units/axes and register sources to MNI152. Write registration.json + QA."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import trimesh

from paths import ASSETS, CACHE, QA, TOOLS, ensure_dirs
from transforms import (
    MNI_BRAIN_BBOX,
    apply_matrix,
    as_4x4,
    best_axis_align,
    bbox_of,
    compose,
    detect_unit_scale,
    identity_4x4,
    matrix_to_list,
    record_transform,
    run_icp,
    sample_points,
    scale_matrix,
    similarity_from_bboxes,
)

SOURCES = json.loads((TOOLS / "sources.json").read_text())


def load_mesh(path: Path):
    if not path.exists():
        raise FileNotFoundError(path)
    loaded = trimesh.load(path, force=None)
    if isinstance(loaded, trimesh.Scene):
        geoms = [g for g in loaded.geometry.values() if hasattr(g, "vertices")]
        if not geoms:
            raise ValueError(f"no geometry in {path}")
        return trimesh.util.concatenate(geoms)
    return loaded


def load_named_scene(path: Path) -> Dict[str, trimesh.Trimesh]:
    loaded = trimesh.load(path, force="scene")
    if isinstance(loaded, trimesh.Scene):
        return {str(k): v for k, v in loaded.geometry.items() if hasattr(v, "vertices")}
    return {path.stem: loaded}


def subset_by_name(geoms: Dict[str, trimesh.Trimesh], needles: List[str]) -> Optional[trimesh.Trimesh]:
    hits = []
    for name, geom in geoms.items():
        low = name.lower()
        if any(n in low for n in needles):
            hits.append(geom)
    if not hits:
        return None
    return trimesh.util.concatenate(hits)


def save_qa(name: str, clouds: Dict[str, np.ndarray]) -> Path:
    QA.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 3, figsize=(12, 4))
    pairs = ((0, 1, "X", "Y"), (0, 2, "X", "Z"), (1, 2, "Y", "Z"))
    colors = ["#4cc9f0", "#e07a5f", "#81b29a", "#ffd166", "#9b5de5"]
    for ax, (i, j, xl, yl) in zip(axes, pairs):
        for idx, (label, pts) in enumerate(clouds.items()):
            sample = pts if len(pts) <= 4000 else pts[np.linspace(0, len(pts) - 1, 4000, dtype=int)]
            ax.scatter(sample[:, i], sample[:, j], s=2, alpha=0.35, c=colors[idx % len(colors)], label=label)
        ax.set_xlabel(xl)
        ax.set_ylabel(yl)
        ax.set_aspect("equal", adjustable="datalim")
        ax.grid(True, alpha=0.2)
    axes[0].legend(markerscale=4, fontsize=8)
    fig.suptitle(f"Registration QA: {name} (MNI mm RAS+)")
    fig.tight_layout()
    out = QA / f"{name}.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    return out


def aan_brainstem_points() -> Optional[np.ndarray]:
    path = CACHE / "aan" / "AAN_Brainstem_MNI152_1mm_v2p0.nii"
    if not path.exists():
        # Union of nuclei.
        import glob

        niis = sorted((CACHE / "aan").glob("AAN_*_MNI152_1mm_v2p0.nii"))
        niis = [p for p in niis if "Brainstem" not in p.name]
        if not niis:
            return None
        path = niis[0]
        pts_all = []
        import nibabel as nib

        for nii in niis:
            img = nib.load(str(nii))
            data = np.asanyarray(img.dataobj)
            nz = np.column_stack(np.nonzero(data > 0))
            if len(nz):
                pts_all.append(nib.affines.apply_affine(img.affine, nz))
        if not pts_all:
            return None
        return np.vstack(pts_all)
    import nibabel as nib

    img = nib.load(str(path))
    data = np.asanyarray(img.dataobj)
    nz = np.column_stack(np.nonzero(data > 0))
    if not len(nz):
        return None
    return nib.affines.apply_affine(img.affine, nz)


def register_source(
    name: str,
    mesh_path: Path,
    target_points: np.ndarray,
    *,
    prefer_scale: Optional[float] = None,
    allow_reflection: bool = False,
    icp_scale: bool = True,
) -> Dict:
    mesh = load_mesh(mesh_path)
    src_pts = sample_points(mesh, 9000)
    unit, unit_note = detect_unit_scale(src_pts if prefer_scale is None else src_pts)
    if prefer_scale is not None:
        unit = prefer_scale
        unit_note = f"forced scale {prefer_scale}"
    scaled = src_pts * unit
    pre = scale_matrix(unit)
    axis_mat, axis_label, axis_score = best_axis_align(
        scaled, target_bbox=np.vstack([target_points.min(0), target_points.max(0)]), allow_reflection=allow_reflection
    )
    after_axis = apply_matrix(scaled, axis_mat)
    if icp_scale:
        similar = similarity_from_bboxes(after_axis, target_points)
        initial = compose(pre, axis_mat, similar)
        method = f"unit({unit_note}) + axis({axis_label}, score={axis_score:.1f}) + similarity + ICP"
    else:
        # Keep native millimetre size (Pitt brainstem+CN is already ~55×53×82 mm).
        initial = compose(pre, axis_mat)
        method = f"unit({unit_note}) + axis({axis_label}, score={axis_score:.1f}) + rigid ICP"
    matrix, residual = run_icp(src_pts, target_points, initial=initial, scale=icp_scale, max_iterations=45)
    fitted = apply_matrix(src_pts, matrix)
    rec = record_transform(
        name,
        matrix,
        method=method,
        residual=residual,
        notes=f"source={mesh_path.name}",
        unit_scale=unit,
    )
    rec["qa"] = str(save_qa(name, {"target": target_points, name: fitted}))
    rec["fittedBBox"] = bbox_of(fitted).tolist()
    rec["targetBBox"] = bbox_of(target_points).tolist()
    print(f"  {name}: residual={residual:.2f} mm  unit={unit}  {axis_label}")
    return rec


def _centroid(geoms, name, matrix):
    mesh = geoms.get(name)
    if mesh is None:
        return None
    return apply_matrix(np.asarray(mesh.vertices).mean(axis=0).reshape(1, 3), matrix)[0]


def _fix_allen_inversion(record: Dict, geoms: Dict, allen_all) -> Dict:
    """Detect a 180° inversion (L/R + A/P + S/I) and flip through the brain centroid."""
    matrix = as_4x4(record["matrix"])
    medulla = _centroid(geoms, "Allen_tegmentum_of_medulla_oblongata_L", matrix)
    occipital = _centroid(geoms, "Allen_occipital_pole_L", matrix)
    frontal = _centroid(geoms, "Allen_superior_frontal_gyrus_L", matrix)
    thalamus_l = _centroid(geoms, "Allen_thalamus_L", matrix)
    bad = False
    reasons = []
    if medulla is not None and medulla[2] > 20:
        bad = True
        reasons.append(f"medulla z={medulla[2]:.1f}")
    if occipital is not None and occipital[1] > 20:
        bad = True
        reasons.append(f"occipital y={occipital[1]:.1f}")
    if frontal is not None and frontal[1] < -20:
        bad = True
        reasons.append(f"frontal y={frontal[1]:.1f}")
    if thalamus_l is not None and thalamus_l[0] > 0:
        bad = True
        reasons.append(f"left thalamus x={thalamus_l[0]:.1f}")
    if not bad:
        return record
    pts = apply_matrix(sample_points(allen_all, 8000), matrix)
    center = pts.mean(axis=0)
    flip = identity_4x4()
    flip[:3, :3] *= -1.0
    flip[:3, 3] = 2.0 * center
    fixed = flip @ matrix
    print(f"  Allen inversion fix ({', '.join(reasons)}); centroid={center}")
    medulla2 = _centroid(geoms, "Allen_tegmentum_of_medulla_oblongata_L", fixed)
    print(f"  medulla after fix: {medulla2}")
    record = dict(record)
    record["matrix"] = matrix_to_list(fixed)
    record["method"] = record.get("method", "") + " + centroid inversion"
    record["notes"] = (record.get("notes") or "") + "; flipped through brain centroid to restore RAS+"
    fitted = apply_matrix(sample_points(allen_all, 8000), fixed)
    record["fittedBBox"] = bbox_of(fitted).tolist()
    record["qa"] = str(save_qa("allen-hra-brain-male-v1.4", {"pitt-whole": pts, "allen-fixed": fitted}))
    return record


def _mean_named(geoms: Dict[str, trimesh.Trimesh], needles: List[str], matrix: np.ndarray) -> Optional[np.ndarray]:
    hits = []
    for name, geom in geoms.items():
        low = name.lower()
        if any(n in low for n in needles):
            hits.append(np.asarray(geom.vertices, dtype=np.float64).mean(axis=0))
    if not hits:
        return None
    return apply_matrix(np.mean(np.vstack(hits), axis=0).reshape(1, 3), matrix)[0]


def register_pitt_brainstem_by_levels(allen_matrix: np.ndarray, allen_geoms: Dict[str, trimesh.Trimesh]) -> Optional[Dict]:
    """Rigid Procrustes from Pitt axial-section centroids to Allen brainstem levels."""
    from trimesh.registration import procrustes

    levels = [
        ("axial_midbrain.stl", ["midbrain_tegmentum", "tegmentum_of_midbrain", "midbrain"]),
        ("axial_pons.stl", ["basilar_part_of_pons", "tegmentum_of_pons", "pons"]),
        ("axial_caudal_medulla.stl", ["tegmentum_of_medulla", "medulla_oblongata"]),
    ]
    src = []
    tgt = []
    used = []
    for fname, needles in levels:
        path = CACHE / "pitt" / fname
        if not path.exists():
            continue
        mesh = load_mesh(path)
        target = _mean_named(allen_geoms, needles, allen_matrix)
        if target is None:
            continue
        src.append(np.asarray(mesh.vertices, dtype=np.float64).mean(axis=0))
        tgt.append(target)
        used.append(fname)
    if len(src) < 3:
        print(f"  pitt brainstem landmarks: only {len(src)} pairs; skip")
        return None
    mat, transformed, _ = procrustes(np.asarray(src), np.asarray(tgt), reflection=False, scale=False)
    residual = float(np.mean(np.linalg.norm(np.asarray(transformed) - np.asarray(tgt), axis=1)))
    rec = record_transform(
        "pitt-brainstem-family",
        as_4x4(mat),
        method="rigid Procrustes (Pitt axial centroids → Allen midbrain/pons/medulla)",
        residual=residual,
        notes=f"landmarks={','.join(used)}; source=brainstem_cranial_nerves.stl",
        unit_scale=1.0,
    )
    rec["fittedBBox"] = bbox_of(apply_matrix(sample_points(load_mesh(CACHE / "pitt" / "brainstem_cranial_nerves.stl"), 4000), as_4x4(mat))).tolist()
    rec["targetBBox"] = bbox_of(np.asarray(tgt)).tolist()
    rec["qa"] = str(
        save_qa(
            "pitt-brainstem-family",
            {
                "allen-levels": np.asarray(tgt),
                "pitt-levels": np.asarray(transformed),
            },
        )
    )
    print(f"  pitt-brainstem-family landmarks residual={residual:.2f} mm  pairs={used}")
    return rec


def main() -> int:
    ensure_dirs()
    records: Dict[str, Dict] = {}
    pitt_whole = CACHE / "pitt" / "whole_brain.stl"
    allen = CACHE / "allen" / "3d-allen-m-brain.glb"
    fs_brain = CACHE / "graphcolouring" / "fsaverage_brain.glb"
    pitt_cn = CACHE / "pitt" / "brainstem_cranial_nerves.stl"
    pitt_thal = CACHE / "pitt" / "thalami.stl"

    # 1) AAN is already MNI.
    aan_pts = aan_brainstem_points()
    records["harvard-aan-v2"] = record_transform(
        "harvard-aan-v2",
        identity_4x4(),
        method="identity (NIfTI affine is MNI152 mm RAS+)",
        residual=0.0,
        notes="Dryad AAN v2.0",
        unit_scale=1.0,
    )

    # 2) Pitt whole brain → MNI-like after /1000. Use as master surface reference.
    if pitt_whole.exists():
        whole = load_mesh(pitt_whole)
        whole_pts = sample_points(whole, 10000)
        unit, note = detect_unit_scale(whole_pts)
        pre = scale_matrix(unit)
        scaled = apply_matrix(whole_pts, pre)
        # Whole-brain README already looks RAS after /1000; keep axes, center on MNI bbox center if far.
        mni_c = MNI_BRAIN_BBOX.mean(axis=0)
        shift = mni_c - scaled.mean(axis=0)
        # If already near AC (centroid close to 0-10 mm), do not force MNI-box center.
        if np.linalg.norm(scaled.mean(axis=0)) < 25:
            shift = np.zeros(3)
        matrix = pre.copy()
        matrix[:3, 3] = shift
        fitted = apply_matrix(whole_pts, matrix)
        records["pitt-whole-brain"] = record_transform(
            "pitt-whole-brain",
            matrix,
            method=f"unit({note}) + optional centroid shift",
            residual=float(np.linalg.norm(shift)),
            notes="MNI152-derived print mesh; scale ~1000",
            unit_scale=unit,
        )
        records["pitt-whole-brain"]["qa"] = str(save_qa("pitt-whole-brain", {"pitt-whole": fitted}))
        ref_pts = fitted
        print(f"  pitt-whole-brain: unit={unit} centroid={fitted.mean(0)}")
    else:
        ref_pts = None
        print("  pitt-whole-brain missing; Allen will register to AAN / MNI bbox")

    # 3) Allen → Pitt whole (or MNI bbox / AAN)
    if allen.exists():
        geoms = load_named_scene(allen)
        allen_all = trimesh.util.concatenate(list(geoms.values()))
        target = ref_pts if ref_pts is not None else (aan_pts if aan_pts is not None else None)
        if target is None:
            # Canonical MNI box corners as a weak target.
            target = np.array(
                [
                    [-80, -110, -60],
                    [80, 80, 90],
                    [0, 0, 0],
                    [-70, 70, 40],
                    [70, -80, 20],
                ],
                dtype=np.float64,
            )
        records["allen-hra-brain-male-v1.4"] = register_source(
            "allen-hra-brain-male-v1.4",
            allen,
            target,
            icp_scale=True,
        )
        records["allen-hra-brain-male-v1.4"] = _fix_allen_inversion(
            records["allen-hra-brain-male-v1.4"], geoms, allen_all
        )
        allen_pts = apply_matrix(sample_points(allen_all, 9000), as_4x4(records["allen-hra-brain-male-v1.4"]["matrix"]))
        stem = subset_by_name(
            geoms,
            ["medulla", "pons", "midbrain", "brain stem", "brainstem", "pyramid", "olive"],
        )
        if stem is not None:
            records["_allen_brainstem_cloud"] = {
                "points": apply_matrix(
                    sample_points(stem, 6000), as_4x4(records["allen-hra-brain-male-v1.4"]["matrix"])
                ).tolist()
            }
        thal = subset_by_name(geoms, ["thalam"])
        if thal is not None:
            records["_allen_thalamus_cloud"] = {
                "points": apply_matrix(
                    sample_points(thal, 4000), as_4x4(records["allen-hra-brain-male-v1.4"]["matrix"])
                ).tolist()
            }
    else:
        allen_pts = ref_pts
        print("  Allen GLB missing")

    # 4) Pitt brainstem family → Allen midbrain/pons/medulla landmarks (rigid).
    # Whole-mesh ICP inverted S/I because cranial-nerve branches dominate the cloud.
    stem_target = None
    if "_allen_brainstem_cloud" in records:
        stem_target = np.asarray(records["_allen_brainstem_cloud"]["points"], dtype=np.float64)
    elif aan_pts is not None:
        stem_target = aan_pts
    elif allen_pts is not None:
        stem_target = allen_pts
    landmark_rec = None
    if "allen-hra-brain-male-v1.4" in records:
        landmark_rec = register_pitt_brainstem_by_levels(
            as_4x4(records["allen-hra-brain-male-v1.4"]["matrix"]),
            geoms if allen.exists() else {},
        )
    if landmark_rec is not None:
        records["pitt-brainstem-family"] = landmark_rec
    elif pitt_cn.exists() and stem_target is not None:
        records["pitt-brainstem-family"] = register_source(
            "pitt-brainstem-family",
            pitt_cn,
            stem_target,
            allow_reflection=True,
            icp_scale=False,
        )
    elif pitt_cn.exists():
        print("  no brainstem target; skipping Pitt brainstem ICP")

    # 5) Pitt vessels share the whole-brain print frame (README extents ~ brain-sized after /1000).
    for ident, fname in (
        ("pitt-arteries", "cerebral_arteries.stl"),
        ("pitt-veins", "cerebral_veins.stl"),
        ("pitt-sinuses", "dural_sinuses.stl"),
    ):
        path = CACHE / "pitt" / fname
        if path.exists() and "pitt-whole-brain" in records:
            records[ident] = {
                **records["pitt-whole-brain"],
                "name": ident,
                "notes": "shares pitt-whole-brain frame (scale ~1000, RAS-like)",
                "inheritedFrom": "pitt-whole-brain",
            }
            # Refine with ICP against registered Allen if available.
            if allen_pts is not None:
                try:
                    records[ident] = register_source(ident, path, allen_pts, icp_scale=True)
                except Exception as exc:
                    print(f"  {ident} ICP failed ({exc}); inheriting whole-brain transform")

    # 6) Pitt thalami are already mm, re-centered.
    if pitt_thal.exists():
        thal_target = None
        if "_allen_thalamus_cloud" in records:
            thal_target = np.asarray(records["_allen_thalamus_cloud"]["points"], dtype=np.float64)
        elif allen_pts is not None:
            thal_target = allen_pts
        if thal_target is not None:
            records["pitt-thalami"] = register_source(
                "pitt-thalami",
                pitt_thal,
                thal_target,
                icp_scale=True,
            )

    # 7) BodyParts3D landmark / ICP fit (shared whole-body frame).
    obj_dir = CACHE / "bodyparts3d" / "obj"
    landmark_ids = {
        "FJ1796": np.array([0.0, 2.0, -16.0]),  # pituitary
        "FJ1795": np.array([0.0, -32.0, 1.0]),  # pineal
        "FJ1337": np.array([32.0, 68.0, -36.0]),  # right eyeball wall
        "FJ1285": np.array([-32.0, 68.0, -36.0]),  # left eyeball wall
    }
    src_c = []
    tgt_c = []
    bp_meshes = []
    if obj_dir.exists():
        for rid, tgt in landmark_ids.items():
            hits = list(obj_dir.glob(f"*{rid}*"))
            if not hits:
                continue
            mesh = trimesh.load(hits[0], force="mesh")
            src_c.append(np.asarray(mesh.vertices).mean(axis=0))
            tgt_c.append(tgt)
            bp_meshes.append(mesh)
        if len(src_c) >= 3:
            from trimesh.registration import procrustes

            mat, _, _ = procrustes(np.asarray(src_c), np.asarray(tgt_c), reflection=False, scale=True)
            records["bodyparts3d"] = record_transform(
                "bodyparts3d",
                as_4x4(mat),
                method="landmark Procrustes (pituitary/pineal/eyeballs → MNI)",
                residual=float(
                    np.mean(
                        np.linalg.norm(apply_matrix(np.asarray(src_c), as_4x4(mat)) - np.asarray(tgt_c), axis=1)
                    )
                ),
                notes="CC BY-SA 2.1 JP gap-fillers",
                unit_scale=1.0,
            )
            print(f"  bodyparts3d landmarks residual={records['bodyparts3d']['residualMm']:.2f} mm")
        elif allen_pts is not None and bp_meshes:
            combined = trimesh.util.concatenate(bp_meshes)
            tmp = CACHE / "bodyparts3d" / "_combined_landmarks.stl"
            combined.export(tmp)
            records["bodyparts3d"] = register_source("bodyparts3d", tmp, allen_pts, icp_scale=True)

    # 8) fsaverage brain → registered Allen / Pitt
    fs_target = allen_pts if allen_pts is not None else ref_pts
    if fs_brain.exists() and fs_target is not None:
        records["graphcolouring-fsaverage"] = register_source(
            "graphcolouring-fsaverage",
            fs_brain,
            fs_target,
            icp_scale=True,
        )

    # Drop bulky helper clouds from the committed file.
    committed = {k: v for k, v in records.items() if not k.startswith("_")}
    payload = {
        "masterSpace": SOURCES["masterSpace"],
        "transforms": committed,
    }
    out = ASSETS / "registration.json"
    out.write_text(json.dumps(payload, indent=2))
    # Keep helper clouds for derive if needed.
    (CACHE / "registration_helpers.json").write_text(
        json.dumps({k: v for k, v in records.items() if k.startswith("_")}, indent=2)
    )
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
