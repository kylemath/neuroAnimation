#!/usr/bin/env python3
"""Bake group GLBs (viewer meshNode names) and merge assets/structures.json."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import trimesh

from groupings import color_for
from paths import ASSETS, CACHE, INTERMEDIATE, TOOLS, ensure_dirs
from transforms import MNI_TO_SCENE, apply_matrix, as_4x4, identity_4x4
from viewer_map import AAN_SCHEMATICS, map_allen_name

FACE_BUDGET = {
    "core": 220000,
    "white-matter": 80000,
    "subcortical": 90000,
    "cerebellum": 55000,
    "ventricles": 28000,
    "vasculature": 90000,
    "cranial-nerves": 90000,
    "aras": 12000,
    "sensory": 28000,
    "head": 16000,
    "slices": 100000,
}

# Small named nuclei were starved when cortex took the proportional share.
MIN_NODE_FACES = {
    "cortex_lh": 48000,
    "cortex_rh": 48000,
    "cingulate_lh": 6000,
    "cingulate_rh": 6000,
    "midbrain": 6000,
    "pons": 7000,
    "medulla": 6000,
    "superior_colliculus": 1200,
    "inferior_colliculus": 1200,
    "cerebral_peduncle_lh": 2000,
    "cerebral_peduncle_rh": 2000,
    "pyramid_lh": 800,
    "pyramid_rh": 800,
    "inferior_olive_lh": 800,
    "inferior_olive_rh": 800,
    "red_nucleus_lh": 800,
    "red_nucleus_rh": 800,
    "cranial_nerves": 80000,
    "cerebral_arteries": 25000,
    "cerebral_veins": 25000,
    "dural_sinuses": 25000,
    "section_midbrain": 26000,
    "section_pons": 26000,
    "section_medulla_rostral": 20000,
    "section_medulla_caudal": 20000,
    "white_matter_lh": 16000,
    "white_matter_rh": 16000,
    "scalp": 14000,
}


def transform_of(reg: Dict, key: str) -> np.ndarray:
    rec = (reg.get("transforms") or {}).get(key)
    if not rec:
        return identity_4x4()
    return as_4x4(rec["matrix"])


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    if mesh.faces is None or len(mesh.faces) <= target:
        return mesh
    try:
        out = mesh.simplify_quadric_decimation(face_count=int(max(32, target)))
        if out is not None and len(out.faces) <= target * 1.4:
            return out
    except Exception:
        pass
    return _cluster_simplify(mesh, target)


def smooth_mesh(mesh: trimesh.Trimesh, iterations: int = 12, lamb: float = 0.5, nu: float = -0.53) -> trimesh.Trimesh:
    """Taubin smoothing on a sparse vertex adjacency (trimesh.smoothing diverges on these non-manifold plates).

    Vertices are clamped to stay within 2 mm of where they started, so no outlier can fly away.
    """
    import scipy.sparse as sp

    mesh = mesh.copy()
    v0 = np.asarray(mesh.vertices, dtype=np.float64)
    n = len(v0)
    edges = mesh.edges_unique
    rows = np.concatenate([edges[:, 0], edges[:, 1]])
    cols = np.concatenate([edges[:, 1], edges[:, 0]])
    adj = sp.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    deg = np.asarray(adj.sum(axis=1)).ravel()
    inv = np.where(deg > 0, 1.0 / np.maximum(deg, 1), 0.0)
    v = v0.copy()
    for _ in range(iterations):
        for factor in (lamb, nu):
            avg = (adj @ v) * inv[:, None]
            step = np.where(deg[:, None] > 0, avg - v, 0.0)
            v = v + factor * step
    delta = v - v0
    norm = np.linalg.norm(delta, axis=1, keepdims=True)
    delta = np.where(norm > 2.0, delta * (2.0 / np.maximum(norm, 1e-9)), delta)
    mesh.vertices = v0 + delta
    return mesh


def _cluster_simplify(mesh: trimesh.Trimesh, target: int, depth: int = 0) -> trimesh.Trimesh:
    """Vertex-clustering fallback (Python 3.9 cannot import fast_simplification)."""
    verts = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    if len(faces) <= target or depth > 5:
        return mesh
    extents = np.maximum(verts.max(0) - verts.min(0), 1e-6)
    # Edge-length pitch keeps thin vessels/nerves from collapsing; volume pitch
    # is only a fallback when the mesh has no usable edges.
    try:
        edges = mesh.edges_unique
        med = float(np.median(np.linalg.norm(verts[edges[:, 0]] - verts[edges[:, 1]], axis=1)))
        reduction = max(1.0, len(faces) / float(target))
        pitch = med * (reduction ** 0.42) * (1.12 ** depth)
    except Exception:
        n_vert_target = max(24, int(target * 0.55))
        pitch = float(np.prod(extents) / n_vert_target) ** (1.0 / 3.0)
        pitch *= 1.15 ** depth
    pitch = max(float(pitch), 1e-4)
    quant = np.round((verts - verts.min(0)) / pitch)
    keys, inverse = np.unique(quant, axis=0, return_inverse=True)
    weights = np.bincount(inverse).astype(np.float64)
    new_verts = np.zeros((len(keys), 3), dtype=np.float64)
    for axis in range(3):
        new_verts[:, axis] = np.bincount(inverse, verts[:, axis]) / weights
    new_faces = inverse[faces]
    keep = (
        (new_faces[:, 0] != new_faces[:, 1])
        & (new_faces[:, 1] != new_faces[:, 2])
        & (new_faces[:, 0] != new_faces[:, 2])
    )
    simplified = trimesh.Trimesh(vertices=new_verts, faces=new_faces[keep], process=True)
    if len(simplified.faces) > target * 1.6:
        return _cluster_simplify(simplified, target, depth + 1)
    return simplified if len(simplified.faces) >= 12 else mesh


def node_face_target(node: str, face_count: int, group_budget: int, total_faces: int) -> int:
    minimum = MIN_NODE_FACES.get(node, 400)
    share = int(group_budget * (face_count / max(total_faces, 1)))
    return min(face_count, max(minimum, share))


def concat(meshes: List[trimesh.Trimesh]) -> Optional[trimesh.Trimesh]:
    meshes = [m for m in meshes if m is not None and hasattr(m, "faces") and len(m.faces)]
    if not meshes:
        return None
    if len(meshes) == 1:
        return meshes[0].copy()
    return trimesh.util.concatenate(meshes)


# Allen brainstem structures arrive as very coarse meshes (hundreds to ~3k faces) and read as
# faceted polygons once lit. One Loop subdivision + a light smooth gives a rounded, anatomical surface.
SMOOTH_NODES = {
    "midbrain", "pons", "medulla", "superior_colliculus", "inferior_colliculus",
    "cerebral_peduncle_lh", "cerebral_peduncle_rh", "pyramid_lh", "pyramid_rh",
    "inferior_olive_lh", "inferior_olive_rh", "red_nucleus_lh", "red_nucleus_rh",
}


def refine_coarse(mesh: trimesh.Trimesh, max_faces: int = 6000) -> trimesh.Trimesh:
    if len(mesh.faces) > max_faces:
        return mesh
    try:
        sub = mesh.subdivide_loop(iterations=1) if hasattr(mesh, "subdivide_loop") else mesh.subdivide()
    except Exception:
        sub = mesh.subdivide()
    return smooth_mesh(sub, iterations=4)


def bake(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.vertices = apply_matrix(np.asarray(mesh.vertices, dtype=np.float64), MNI_TO_SCENE)
    try:
        mesh.fix_normals()
    except Exception:
        pass
    return mesh


def load_mesh(path: Path):
    loaded = trimesh.load(path, force=None)
    if isinstance(loaded, trimesh.Scene):
        geoms = [g for g in loaded.geometry.values() if hasattr(g, "vertices")]
        return trimesh.util.concatenate(geoms)
    return loaded


def apply_tf(mesh: trimesh.Trimesh, matrix: np.ndarray) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.vertices = apply_matrix(np.asarray(mesh.vertices, dtype=np.float64), matrix)
    return mesh


def collect_allen(reg: Dict) -> Dict[str, List[trimesh.Trimesh]]:
    path = CACHE / "allen" / "3d-allen-m-brain.glb"
    buckets: Dict[str, List[trimesh.Trimesh]] = defaultdict(list)
    if not path.exists():
        return buckets
    matrix = transform_of(reg, "allen-hra-brain-male-v1.4")
    scene = trimesh.load(path, force="scene")
    mapped = 0
    for name, geom in scene.geometry.items():
        node = map_allen_name(str(name))
        if not node:
            continue
        mesh = apply_tf(geom, matrix)
        buckets[node].append(mesh)
        mapped += 1
    print(f"Allen mapped {mapped} geoms -> {len(buckets)} viewer nodes")
    return buckets


def add_pitt(buckets: Dict[str, List[trimesh.Trimesh]], reg: Dict) -> None:
    whole = transform_of(reg, "pitt-whole-brain")
    stem = transform_of(reg, "pitt-brainstem-family")
    specs = [
        ("cerebral_arteries.stl", "pitt-arteries", "cerebral_arteries", whole),
        ("cerebral_veins.stl", "pitt-veins", "cerebral_veins", whole),
        ("dural_sinuses.stl", "pitt-sinuses", "dural_sinuses", whole),
        ("axial_midbrain.stl", "pitt-plate-midbrain", "section_midbrain", stem),
        ("axial_pons.stl", "pitt-plate-pons", "section_pons", stem),
        ("axial_rostral_medulla.stl", "pitt-plate-medulla-rostral", "section_medulla_rostral", stem),
        ("axial_caudal_medulla.stl", "pitt-plate-medulla-caudal", "section_medulla_caudal", stem),
    ]
    for fname, key, node, fallback in specs:
        path = CACHE / "pitt" / fname
        if not path.exists():
            continue
        print(f"  Pitt {fname} -> {node}")
        matrix = transform_of(reg, key)
        if (matrix == identity_4x4()).all():
            matrix = fallback
        mesh = apply_tf(load_mesh(path), matrix)
        mesh = decimate(mesh, MIN_NODE_FACES.get(node, 14000))
        if node.startswith("section_"):
            # Vertex clustering leaves a faceted, blocky surface; smooth it so the plates read as anatomy.
            try:
                mesh = smooth_mesh(mesh)
            except Exception:
                pass
        buckets[node].append(mesh)

    cn_path = CACHE / "pitt" / "brainstem_cranial_nerves.stl"
    if cn_path.exists():
        print("  Pitt cranial nerves (combined)")
        matrix = transform_of(reg, "pitt-brainstem-family")
        # Split the ORIGINAL mesh (not a pre-decimated one: vertex clustering shatters thin
        # nerve roots into thousands of floating shards), drop the brainstem blob, decimate each
        # nerve on its own, then discard the leftover dust components.
        raw_parts = sorted(load_mesh(cn_path).split(only_watertight=False), key=lambda m: len(m.faces), reverse=True)
        nerves = []
        for part in raw_parts[1:]:
            target = max(400, int(len(part.faces) * 0.07))
            nerves.append(decimate(part, target) if len(part.faces) > target else part)
        pieces = []
        for m in nerves:
            pieces.extend(c for c in m.split(only_watertight=False) if len(c.faces) >= 60)
        if pieces:
            buckets["cranial_nerves"].append(apply_tf(concat(pieces), matrix))


def add_bp3d(buckets: Dict[str, List[trimesh.Trimesh]], reg: Dict) -> None:
    obj_dir = CACHE / "bodyparts3d" / "obj"
    matrix = transform_of(reg, "bodyparts3d")
    wanted = {
        "pituitary": ["FJ1796"],
        "pineal": ["FJ1795"],
        "tongue": ["FJ2761"],
        "eye_rh": ["FJ1336", "FJ1337", "FJ1340", "FJ1348", "FJ1368", "FJ1371", "FJ1382"],
        "eye_lh": ["FJ1282", "FJ1285", "FJ1286", "FJ1289", "FJ1297", "FJ1317", "FJ1320", "FJ1331"],
        "lens_rh": ["FJ1356"],
        "lens_lh": ["FJ1305"],
    }
    for node, elems in wanted.items():
        meshes = []
        for elem in elems:
            path = obj_dir / f"{elem}.obj"
            if path.exists():
                meshes.append(trimesh.load(path, force="mesh"))
        if not meshes:
            continue
        mesh = apply_tf(concat(meshes), matrix)
        mesh = decimate(mesh, 20000)
        if node in {"pineal", "pituitary"}:
            buckets[node] = [mesh]
        else:
            buckets[node].append(mesh)
        print(f"  BP3D {node}")


def add_head(buckets: Dict[str, List[trimesh.Trimesh]], reg: Dict) -> None:
    path = CACHE / "graphcolouring" / "fsaverage_head.glb"
    if not path.exists():
        return
    mesh = apply_tf(load_mesh(path), transform_of(reg, "graphcolouring-fsaverage"))
    buckets["scalp"].append(decimate(mesh, 16000))
    print("  scalp")


def add_sensory_schematics(buckets: Dict[str, List[trimesh.Trimesh]]) -> None:
    from derive import canals, spiral_cochlea, tube

    for side, xsign, suffix in (("L", -1, "lh"), ("R", 1, "rh")):
        if f"eye_{suffix}" not in buckets:
            globe = trimesh.creation.icosphere(subdivisions=3, radius=12.0)
            globe.apply_translation([xsign * 32.0, 68.0, -36.0])
            buckets[f"eye_{suffix}"].append(globe)
        if f"lens_{suffix}" not in buckets:
            lens = trimesh.creation.icosphere(subdivisions=2, radius=3.6)
            lens.apply_scale([0.7, 0.45, 0.7])
            lens.apply_translation([xsign * 32.0, 75.5, -35.8])
            buckets[f"lens_{suffix}"].append(lens)
        coch_c = np.array([xsign * 46.0, -22.0, -34.0])
        buckets[f"cochlea_{suffix}"].append(spiral_cochlea(coch_c, handed=xsign))
        buckets[f"scc_{suffix}"].append(canals(coch_c + np.array([0.0, 0.0, 4.0])))
        epi = trimesh.creation.box(extents=[8.0, 10.0, 1.2])
        epi.apply_translation([xsign * 7.0, 38.0, -26.0])
        buckets[f"olfactory_epithelium_{suffix}"].append(epi)
    print("  sensory schematics (inner ear / epithelium; eyes if BP3D missing)")


def add_aan_schematics(buckets: Dict[str, List[trimesh.Trimesh]]) -> None:
    have_nii = list((CACHE / "aan").glob("AAN_*.nii"))
    if have_nii:
        print(f"  AAN NIfTIs present ({len(have_nii)}); schematics skipped for those nodes")
        return
    for spec in AAN_SCHEMATICS:
        sph = trimesh.creation.icosphere(subdivisions=2, radius=spec["radius"])
        sph.apply_translation(spec["center"])
        buckets[spec["node"]].append(sph)
    print("  AAN schematic nuclei (Dryad NIfTI download unauthorized)")


def node_group(node: str) -> str:
    if node == "scalp":
        return "head"
    if node.startswith("section_"):
        return "slices"
    if node in {
        "cortex_lh",
        "cortex_rh",
        "cingulate_lh",
        "cingulate_rh",
        "midbrain",
        "superior_colliculus",
        "inferior_colliculus",
        "pons",
        "medulla",
        "cerebral_peduncle_lh",
        "cerebral_peduncle_rh",
        "pyramid_lh",
        "pyramid_rh",
        "inferior_olive_lh",
        "inferior_olive_rh",
        "red_nucleus_lh",
        "red_nucleus_rh",
    }:
        return "core"
    if node in {
        "white_matter_lh",
        "white_matter_rh",
        "corpus_callosum",
        "fornix",
        "internal_capsule_lh",
        "internal_capsule_rh",
        "optic_tract_lh",
        "optic_tract_rh",
        "optic_chiasm",
    }:
        return "white-matter"
    if node in {
        "cerebellar_hemisphere_lh",
        "cerebellar_hemisphere_rh",
        "vermis",
        "dentate_lh",
        "dentate_rh",
    }:
        return "cerebellum"
    if "ventricle" in node or node == "cerebral_aqueduct":
        return "ventricles"
    if node in {"cerebral_arteries", "cerebral_veins", "dural_sinuses"} or node.endswith("_sinus") or node in {
        "ica_lh",
        "sss",
        "basilar",
        "acom",
    }:
        return "vasculature"
    if node.startswith("cn") or node == "cranial_nerves":
        return "cranial-nerves"
    if node in {s["node"] for s in AAN_SCHEMATICS}:
        return "aras"
    if node.startswith(("eye_", "lens_", "cochlea_", "scc_", "olfactory_", "tongue")):
        return "sensory"
    return "subcortical"


def gltf_transform(src: Path, dest: Path) -> bool:
    """Copy a standard GLB. meshopt is skipped: three.js r128 loader has no meshopt decoder,
    and gltf-transform optimize was merging named nodes."""
    shutil.copy2(src, dest)
    return False


def merge_structures(centroids: Dict[str, List[float]], asset_sizes: Dict[str, int]) -> Path:
    path = ASSETS / "structures.json"
    data = json.loads(path.read_text())
    data["placeholder"] = False
    data["assetsReady"] = True
    data["version"] = 1
    exported = set(centroids)
    for group in data.get("groups") or []:
        asset = Path(group.get("asset") or f"{group['id']}.glb").name
        group["bytes"] = asset_sizes.get(asset)
        if not str(group.get("asset", "")).startswith("assets/"):
            group["asset"] = f"assets/{asset}"

    # Folder-ize detailed vessel/nerve entries when only combined meshes exist.
    combined_vessel = {"cerebral_arteries", "cerebral_veins", "dural_sinuses"}
    if combined_vessel & exported:
        for s in data["structures"]:
            if s.get("group") == "vasculature" and s.get("kind") != "folder":
                if s.get("meshNode") not in exported:
                    s["kind"] = "folder"
                    s["meshNode"] = None
    if "cranial_nerves" in exported:
        for s in data["structures"]:
            if s.get("group") == "cranial-nerves" and s.get("kind") != "folder":
                # Authored schematic courses (optic, olfactory, auditory) keep their tubes.
                if s.get("placeholder"):
                    continue
                if s.get("meshNode") not in exported:
                    s["kind"] = "folder"
                    s["meshNode"] = None

    existing_nodes = {s.get("meshNode") for s in data["structures"]}
    existing_ids = {s.get("id") for s in data["structures"]}

    extras = [
        (
            "cerebral-arteries",
            "cerebral_arteries",
            "Cerebral arteries",
            "vasculature",
            "vessels",
            "pittbrains3d",
            "CC BY-SA 4.0",
            "Combined anterior and posterior cerebral arterial tree (Pitt print mesh).",
            "Useful for circle-of-Willis context; named branches are not separated in this build.",
            "blood-supply",
        ),
        (
            "cerebral-veins",
            "cerebral_veins",
            "Cerebral veins",
            "vasculature",
            "vessels",
            "pittbrains3d",
            "CC BY-SA 4.0",
            "Superficial and deep cerebral veins as a single mesh.",
            "Vein of Galen / internal cerebral veins are not labelled separately.",
            "blood-supply",
        ),
        (
            "dural-sinuses",
            "dural_sinuses",
            "Dural sinuses and reflections",
            "vasculature",
            "vessels",
            "pittbrains3d",
            "CC BY-SA 4.0",
            "Dural venous sinuses and falx/tentorium reflections.",
            "Individual sinus names stay in the tree as folders until split meshes exist.",
            "blood-supply",
        ),
        (
            "cranial-nerves-bundle",
            "cranial_nerves",
            "Cranial nerves (Pitt bundle)",
            "cranial-nerves",
            "nerves",
            "pittbrains3d",
            "CC BY-SA 4.0",
            "Combined cranial-nerve rootlets after the brainstem component was removed.",
            "Named CN I–XII are not separable in the source STL.",
            "cranial-nerves",
        ),
        (
            "tongue",
            "tongue",
            "Tongue",
            "sensory",
            "sensory",
            "bodyparts3d",
            "CC BY-SA 2.1 JP",
            "Oral tongue for spatial context with the oral cavity and lower cranial nerves.",
            "Not a surgical mucosa model.",
            "brainstem",
        ),
        (
            "optic-chiasm",
            "optic_chiasm",
            "Optic chiasm",
            "white-matter",
            "white-matter",
            "allen-hra-brain-male-v1.4",
            "CC BY 4.0",
            "Decussation of nasal retinal fibres; sits above the pituitary.",
            "Compression here produces bitemporal hemianopia.",
            "visual-system",
        ),
    ]
    for ident, node, name, group, layer, source, licence, function, clinical, chapter6 in extras:
        if node in exported and node not in existing_nodes and ident not in existing_ids:
            data["structures"].append(
                {
                    "id": ident,
                    "name": name,
                    "side": "mid",
                    "group": group,
                    "parent": None,
                    "kind": "mesh",
                    "layer": layer,
                    "meshNode": node,
                    "colour": color_for(group, "midline", name),
                    "opacity": 0.95,
                    "centroid": centroids[node],
                    "schematic": False,
                    "defaultVisible": group in {"vasculature", "cranial-nerves", "sensory"},
                    "source": source,
                    "licence": licence,
                    "function": function,
                    "clinical": clinical,
                    "chapter6": chapter6,
                    "connected": [],
                    "links": [],
                }
            )
            existing_nodes.add(node)

    aan_nodes = {spec["node"] for spec in AAN_SCHEMATICS}
    for s in data["structures"]:
        node = s.get("meshNode")
        if node and node in centroids:
            s["centroid"] = centroids[node]
            if "placeholder" in s:
                del s["placeholder"]
            if node in aan_nodes:
                s["schematic"] = True
                s["source"] = "harvard-aan-v2"
                s["licence"] = "CC0-1.0"
            elif node.startswith(("cochlea_", "scc_", "olfactory_")):
                s["schematic"] = True
                s["source"] = "schematic"
                s["licence"] = "CC BY 4.0"
            else:
                s["schematic"] = False
                src = str(s.get("source") or "")
                if node.startswith(("eye_", "lens_")) or node in {"pineal", "pituitary", "tongue"}:
                    s["source"] = "bodyparts3d"
                    s["licence"] = "CC BY-SA 2.1 JP"
                elif node.startswith("section_") or node in {
                    "cerebral_arteries",
                    "cerebral_veins",
                    "dural_sinuses",
                    "cranial_nerves",
                }:
                    s["source"] = "pittbrains3d"
                    s["licence"] = "CC BY-SA 4.0"
                elif node == "scalp":
                    s["source"] = "graphcolouring-fsaverage"
                    s["licence"] = "FreeSurfer / MNE fsaverage"
                elif "placeholder" in src.lower() or "procedural" in src.lower() or src == "schematic":
                    s["source"] = "allen-hra-brain-male-v1.4"
                    s["licence"] = s.get("licence") or "CC BY 4.0"
            if node.startswith("section_"):
                s["kind"] = "section"

    data["exportedMeshNodes"] = sorted(exported)
    data["assetBytes"] = asset_sizes
    path.write_text(json.dumps(data, indent=2))
    return path


def main() -> int:
    ensure_dirs()
    reg_path = ASSETS / "registration.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"transforms": {}}

    buckets: Dict[str, List[trimesh.Trimesh]] = defaultdict(list)
    for k, v in collect_allen(reg).items():
        buckets[k].extend(v)
    add_pitt(buckets, reg)
    add_bp3d(buckets, reg)
    add_head(buckets, reg)
    add_sensory_schematics(buckets)
    add_aan_schematics(buckets)

    # Merge split L/R hypothalamus / basal forebrain / pineal into viewer midline nodes.
    if "hypothalamus" not in buckets:
        buckets["hypothalamus"].extend(buckets.pop("hypothalamus_lh", []) + buckets.pop("hypothalamus_rh", []))
    if "basal_forebrain" not in buckets:
        buckets["basal_forebrain"].extend(buckets.pop("basal_forebrain_lh", []) + buckets.pop("basal_forebrain_rh", []))

    grouped: Dict[str, Dict[str, trimesh.Trimesh]] = defaultdict(dict)
    centroids: Dict[str, List[float]] = {}
    for node, meshes in buckets.items():
        mesh = concat(meshes)
        if mesh is None:
            continue
        centroids[node] = np.asarray(mesh.vertices).mean(axis=0).tolist()
        grouped[node_group(node)][node] = mesh

    raw_dir = INTERMEDIATE / "glb_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    asset_sizes: Dict[str, int] = {}
    for group, nodes in grouped.items():
        budget = FACE_BUDGET.get(group, 60000)
        total_faces = sum(max(1, len(m.faces)) for m in nodes.values())
        scene = trimesh.Scene()
        print(f"Export {group}: {len(nodes)} nodes, budget {budget}")
        for node, mesh in nodes.items():
            share = node_face_target(node, len(mesh.faces), budget, total_faces)
            mesh = decimate(mesh, share)
            if node in SMOOTH_NODES:
                mesh = refine_coarse(mesh)
            mesh = bake(mesh)
            # Name the mesh object so three.js obj.name matches meshNode.
            mesh.metadata = dict(mesh.metadata or {})
            scene.add_geometry(mesh, node_name=node, geom_name=node)
        raw = raw_dir / f"{group}.glb"
        dest = ASSETS / f"{group}.glb"
        scene.export(raw)
        gltf_transform(raw, dest)
        asset_sizes[dest.name] = dest.stat().st_size
        print(f"  {dest.name} {dest.stat().st_size/1e6:.2f} MB")

    src_1020 = CACHE / "graphcolouring" / "10_20_positions.json"
    if src_1020.exists():
        shutil.copy2(src_1020, ASSETS / "10_20_positions.json")

    out = merge_structures(centroids, asset_sizes)
    total = sum(asset_sizes.values()) + out.stat().st_size
    print(f"Wrote {out}")
    print(f"Total committed assets: {total/1e6:.2f} MB")
    print("Exported nodes:", ", ".join(sorted(centroids)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
