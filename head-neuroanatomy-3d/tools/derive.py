#!/usr/bin/env python3
"""Derive MNI-space meshes: apply registration, AAN cubes, sensory schematics."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import trimesh

from groupings import classify, color_for, slug
from paths import ASSETS, CACHE, INTERMEDIATE, TOOLS, ensure_dirs
from transforms import apply_matrix, as_4x4, identity_4x4, sample_points

SOURCES = json.loads((TOOLS / "sources.json").read_text())


def paint(mesh: trimesh.Trimesh, hex_color: str, opacity: float = 1.0) -> trimesh.Trimesh:
    rgb = tuple(int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    rgba = np.array([*rgb, int(max(0, min(1, opacity)) * 255)], dtype=np.uint8)
    mesh = mesh.copy()
    mesh.visual.face_colors = np.tile(rgba, (len(mesh.faces), 1))
    return mesh


def clean_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.remove_unreferenced_vertices()
    mesh.remove_duplicate_faces()
    mesh.remove_degenerate_faces()
    try:
        mesh.fix_normals()
    except Exception:
        pass
    return mesh


def decimate(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    if mesh.faces is None or len(mesh.faces) <= target_faces:
        return mesh
    try:
        simplified = mesh.simplify_quadric_decimation(face_count=int(target_faces))
        if simplified is not None and len(simplified.faces) > 0:
            return simplified
    except Exception:
        pass
    return mesh


def save_item(item: Dict, mesh: trimesh.Trimesh) -> Dict:
    INTERMEDIATE.mkdir(parents=True, exist_ok=True)
    mesh = clean_mesh(mesh)
    if len(mesh.faces) > 120000:
        mesh = decimate(mesh, 80000)
    path = INTERMEDIATE / f"{item['id']}.ply"
    mesh.export(path)
    centroid = mesh.vertices.mean(axis=0).tolist()
    item = dict(item)
    item["ply"] = str(path)
    item["centroidMNI"] = centroid
    item["faces"] = int(len(mesh.faces))
    item["vertices"] = int(len(mesh.vertices))
    return item


def transform_of(reg: Dict, key: str) -> np.ndarray:
    rec = reg.get("transforms", {}).get(key)
    if not rec:
        return identity_4x4()
    return as_4x4(rec["matrix"])


def sample_color(mesh: trimesh.Trimesh) -> Optional[Tuple[int, int, int]]:
    try:
        cols = np.asarray(mesh.visual.face_colors)
        if cols.size and cols.ndim == 2:
            mean = cols[:, :3].mean(axis=0)
            return int(mean[0]), int(mean[1]), int(mean[2])
    except Exception:
        return None
    return None


def derive_allen(reg: Dict) -> List[Dict]:
    path = CACHE / "allen" / "3d-allen-m-brain.glb"
    if not path.exists():
        print("Allen GLB missing")
        return []
    matrix = transform_of(reg, "allen-hra-brain-male-v1.4")
    scene = trimesh.load(path, force="scene")
    items = []
    geoms = scene.geometry.items() if isinstance(scene, trimesh.Scene) else [(path.stem, scene)]
    print(f"Allen geometries: {len(list(scene.geometry)) if isinstance(scene, trimesh.Scene) else 1}")
    for name, geom in geoms:
        if not hasattr(geom, "vertices") or len(geom.vertices) < 3:
            continue
        mesh = geom.copy()
        mesh.vertices = apply_matrix(mesh.vertices, matrix)
        meta = classify(str(name))
        sampled = sample_color(geom)
        if sampled:
            meta["color"] = color_for(meta["group"], meta["side"], meta["name"], sampled)
        mesh = paint(mesh, meta["color"], 1.0)
        rec = {
            **meta,
            "asset": f"{meta['group']}.glb",
            "opacity": 0.88 if meta["group"] in {"core", "cerebellum"} else 0.7,
            "function": "",
            "clinical": "",
            "chapter6": "",
            "connected": [],
            "links": [],
            "source": "allen-hra-brain-male-v1.4",
            "licence": "CC BY 4.0",
            "kind": "mesh",
            "sourceName": str(name),
        }
        items.append(save_item(rec, mesh))
    print(f"  derived {len(items)} Allen meshes")
    return items


def split_components(mesh: trimesh.Trimesh, min_faces: int = 80) -> List[trimesh.Trimesh]:
    try:
        parts = mesh.split(only_watertight=False)
    except Exception:
        return [mesh]
    kept = [p for p in parts if hasattr(p, "faces") and len(p.faces) >= min_faces]
    return kept or [mesh]


def derive_pitt(reg: Dict) -> List[Dict]:
    specs = [
        {
            "file": "brainstem_cranial_nerves.stl",
            "key": "pitt-brainstem-family",
            "group": "cranial-nerves",
            "base": "cranial-nerve",
            "split": True,
            "largestIs": ("brainstem-with-nerve-roots", "core"),
        },
        {
            "file": "cerebral_arteries.stl",
            "key": "pitt-arteries",
            "group": "vasculature",
            "base": "cerebral-artery",
            "split": True,
        },
        {
            "file": "cerebral_veins.stl",
            "key": "pitt-veins",
            "group": "vasculature",
            "base": "cerebral-vein",
            "split": True,
        },
        {
            "file": "dural_sinuses.stl",
            "key": "pitt-sinuses",
            "group": "vasculature",
            "base": "dural-sinus",
            "split": True,
        },
        {
            "file": "axial_midbrain.stl",
            "key": "pitt-brainstem-family",
            "group": "cranial-nerves",
            "base": "brainstem-axial-midbrain",
            "split": False,
        },
        {
            "file": "axial_pons.stl",
            "key": "pitt-brainstem-family",
            "group": "cranial-nerves",
            "base": "brainstem-axial-pons",
            "split": False,
        },
        {
            "file": "axial_rostral_medulla.stl",
            "key": "pitt-brainstem-family",
            "group": "cranial-nerves",
            "base": "brainstem-axial-rostral-medulla",
            "split": False,
        },
        {
            "file": "axial_caudal_medulla.stl",
            "key": "pitt-brainstem-family",
            "group": "cranial-nerves",
            "base": "brainstem-axial-caudal-medulla",
            "split": False,
        },
    ]
    items = []
    for spec in specs:
        path = CACHE / "pitt" / spec["file"]
        if not path.exists():
            print(f"  skip missing {path.name}")
            continue
        print(f"  Pitt {path.name}")
        mesh = trimesh.load(path, force="mesh")
        mesh.vertices = apply_matrix(mesh.vertices, transform_of(reg, spec["key"]))
        parts = split_components(mesh) if spec["split"] else [mesh]
        parts = sorted(parts, key=lambda m: len(m.faces), reverse=True)
        for i, part in enumerate(parts[:36]):
            if spec.get("largestIs") and i == 0:
                ident, group = spec["largestIs"]
            else:
                ident = spec["base"] if not spec["split"] else f"{spec['base']}-{i+1:02d}"
                group = spec["group"]
            meta = classify(ident, forced_group=group)
            meta["id"] = slug(ident)
            meta["mesh"] = meta["id"]
            meta["group"] = group
            part = paint(decimate(part, 40000), meta["color"], 1.0)
            rec = {
                **meta,
                "asset": f"{group}.glb",
                "opacity": 1.0,
                "function": "",
                "clinical": "",
                "chapter6": "cranial-nerves" if group == "cranial-nerves" else "blood-supply",
                "connected": [],
                "links": [],
                "source": "pittbrains3d",
                "licence": "CC BY-SA 4.0",
                "kind": "mesh",
                "sourceName": path.name,
            }
            items.append(save_item(rec, part))
    print(f"  derived {len(items)} Pitt meshes")
    return items


def marching_cubes_nii(path: Path) -> Optional[trimesh.Trimesh]:
    import nibabel as nib
    from skimage import measure

    img = nib.load(str(path))
    data = np.asanyarray(img.dataobj)
    if data.ndim > 3:
        data = data[..., 0]
    mask = np.asarray(data > 0, dtype=np.float32)
    if mask.sum() < 5:
        return None
    try:
        verts, faces, *_ = measure.marching_cubes(mask, level=0.5)
    except Exception as exc:
        print(f"  marching cubes failed {path.name}: {exc}")
        return None
    verts = nib.affines.apply_affine(img.affine, verts)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    return clean_mesh(mesh)


def derive_aan(reg: Dict) -> List[Dict]:
    items = []
    matrix = transform_of(reg, "harvard-aan-v2")
    for spec in SOURCES["aanFiles"]:
        if spec["id"] in {"AAN_Brainstem", "AAN_LUT", "AAN_README"}:
            continue
        path = CACHE / "aan" / spec["path"]
        if not path.exists():
            print(f"  AAN missing {spec['path']}")
            continue
        mesh = marching_cubes_nii(path)
        if mesh is None:
            continue
        mesh.vertices = apply_matrix(mesh.vertices, matrix)
        ident = slug(spec["id"] + "-" + spec.get("name", ""))
        meta = classify(spec["name"], forced_group="aras")
        meta["id"] = slug(spec["id"].replace("_", "-").lower())
        meta["name"] = spec["name"]
        meta["side"] = spec.get("side", "midline")
        meta["mesh"] = meta["id"]
        meta["group"] = "aras"
        mesh = paint(decimate(mesh, 12000), meta["color"], 1.0)
        rec = {
            **meta,
            "asset": "aras.glb",
            "opacity": 1.0,
            "function": f"Ascending arousal; transmitter={spec.get('transmitter')}",
            "clinical": "",
            "chapter6": "aras",
            "connected": ["thalamus", "hypothalamus"],
            "links": ["https://doi.org/10.5061/dryad.zw3r228d2"],
            "source": "harvard-aan-v2",
            "licence": "CC0-1.0",
            "kind": "mesh",
            "transmitter": spec.get("transmitter"),
            "sourceName": spec["path"],
        }
        items.append(save_item(rec, mesh))
    print(f"  derived {len(items)} AAN nuclei")
    return items


def tube(points: np.ndarray, radius: float, sections: int = 8) -> trimesh.Trimesh:
    path = trimesh.path.Path3D(entities=[trimesh.path.entities.Line(np.arange(len(points)))], vertices=points)
    try:
        return path.to_trimesh()
    except Exception:
        pass
    # Fallback: concatenated capsules along the polyline.
    meshes = []
    for a, b in zip(points[:-1], points[1:]):
        vec = b - a
        height = float(np.linalg.norm(vec))
        if height < 1e-4:
            continue
        cyl = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
        cyl.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], vec))
        cyl.apply_translation((a + b) / 2.0)
        meshes.append(cyl)
    return trimesh.util.concatenate(meshes) if meshes else trimesh.creation.icosphere(radius=radius)


def spiral_cochlea(center: np.ndarray, handed: int = 1) -> trimesh.Trimesh:
    turns = 2.6
    n = 160
    t = np.linspace(0, turns * 2 * np.pi, n)
    r = np.linspace(4.8, 1.4, n)
    pts = np.column_stack(
        [
            handed * r * np.cos(t),
            r * np.sin(t) * 0.35,
            np.linspace(-1.2, 3.2, n),
        ]
    )
    pts = pts + center
    return tube(pts, radius=0.7, sections=7)


def canals(center: np.ndarray) -> trimesh.Trimesh:
    meshes = []
    radii = (5.2, 4.8, 4.6)
    normals = (
        np.array([1.0, 0.1, 0.05]),
        np.array([0.1, 1.0, 0.05]),
        np.array([0.1, 0.1, 1.0]),
    )
    for rad, normal in zip(radii, normals):
        torus = trimesh.creation.torus(major_radius=rad, minor_radius=0.45, major_sections=48, minor_sections=8)
        torus.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], normal))
        torus.apply_translation(center)
        meshes.append(torus)
    return trimesh.util.concatenate(meshes)


def derive_sensory() -> List[Dict]:
    items = []

    def add(ident: str, name: str, mesh: trimesh.Trimesh, side: str, note: str, color: Optional[str] = None):
        meta = classify(name, forced_group="sensory")
        meta["id"] = ident
        meta["name"] = name
        meta["side"] = side
        meta["mesh"] = ident
        meta["group"] = "sensory"
        if color:
            meta["color"] = color
        mesh = paint(mesh, meta["color"], 1.0)
        rec = {
            **meta,
            "asset": "sensory.glb",
            "opacity": 0.92,
            "function": note,
            "clinical": "",
            "chapter6": "sensory",
            "connected": [],
            "links": [],
            "source": "schematic",
            "licence": "CC BY 4.0",
            "kind": "schematic",
            "sourceName": "procedural",
        }
        items.append(save_item(rec, mesh))

    for side, xsign, ident in (("left", -1, "lh"), ("right", 1, "rh")):
        eye_c = np.array([xsign * 32.0, 68.0, -36.0])
        globe = trimesh.creation.icosphere(subdivisions=3, radius=12.0)
        globe.apply_translation(eye_c)
        add(f"{ident}-eyeball-schematic", f"{side.title()} eyeball (schematic)", globe, side, "Schematic globe at an MNI-consistent orbit.")
        lens = trimesh.creation.icosphere(subdivisions=2, radius=3.6)
        lens.apply_scale([0.7, 0.45, 0.7])
        lens.apply_translation(eye_c + np.array([0.0, 7.5, 0.2]))
        add(f"{ident}-lens-schematic", f"{side.title()} lens (schematic)", lens, side, "Schematic lens.")
        chiasm = np.array([0.0, 3.0, -10.0])
        nerve = tube(np.linspace(eye_c + np.array([0, -8, 0]), chiasm, 12), radius=1.2)
        add(f"{ident}-optic-nerve-schematic", f"{side.title()} optic nerve (schematic)", nerve, side, "Schematic optic nerve to chiasm.")
        coch_c = np.array([xsign * 46.0, -22.0, -34.0])
        add(f"{ident}-cochlea-schematic", f"{side.title()} cochlea (schematic)", spiral_cochlea(coch_c, handed=xsign), side, "Schematic spiral cochlea; not a subject mesh.")
        add(
            f"{ident}-semicircular-canals-schematic",
            f"{side.title()} semicircular canals (schematic)",
            canals(coch_c + np.array([0.0, 0.0, 4.0])),
            side,
            "Schematic canals; not a subject mesh.",
        )
        epi = trimesh.creation.box(extents=[8.0, 10.0, 1.2])
        epi.apply_translation(np.array([xsign * 7.0, 38.0, -26.0]))
        add(f"{ident}-olfactory-epithelium-schematic", f"{side.title()} olfactory epithelium (schematic)", epi, side, "Schematic olfactory epithelium.")

    tongue = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    tongue.apply_scale([18.0, 28.0, 10.0])
    tongue.apply_translation(np.array([0.0, 42.0, -68.0]))
    add("tongue-schematic", "Tongue (schematic)", tongue, "midline", "Schematic tongue; BodyParts3D lists had no tongue mesh.")

    for side, xsign, ident in (("left", -1, "lh"), ("right", 1, "rh")):
        rn = trimesh.creation.icosphere(subdivisions=2, radius=4.0)
        rn.apply_scale([1.0, 1.15, 0.85])
        rn.apply_translation(np.array([xsign * 5.5, -16.0, -8.0]))
        add(f"{ident}-red-nucleus-schematic", f"{side.title()} red nucleus (schematic)", rn, side, "Labelled schematic; red nucleus is not in the open mesh sets.")

    print(f"  derived {len(items)} sensory/schematic meshes")
    return items


def derive_bp3d(reg: Dict) -> List[Dict]:
    obj_dir = CACHE / "bodyparts3d" / "obj"
    if not obj_dir.exists():
        print("  BodyParts3D OBJs not extracted")
        return []
    items = []
    meshes = []
    specs_loaded = []
    for spec in SOURCES.get("bp3dWanted", []):
        path = obj_dir / f"{spec['representation']}.obj"
        if not path.exists():
            matches = list(obj_dir.glob(f"*{spec['representation']}*"))
            path = matches[0] if matches else None
        if path is None or not path.exists():
            print(f"  BP3D missing {spec['representation']} {spec['name']}")
            continue
        mesh = trimesh.load(path, force="mesh")
        meshes.append(mesh)
        specs_loaded.append((spec, mesh))
    if not meshes:
        return []
    matrix = transform_of(reg, "bodyparts3d")
    if (matrix == identity_4x4()).all():
        # Weak landmark fit: move BP3D pituitary/eyeballs toward MNI if present.
        print("  BodyParts3D has no ICP record yet; applying identity (inspect bbox in QA)")
    for spec, mesh in specs_loaded:
        mesh = mesh.copy()
        mesh.vertices = apply_matrix(mesh.vertices, matrix)
        meta = classify(spec["name"], forced_group=spec["group"])
        meta["id"] = spec["id"]
        meta["name"] = spec["name"]
        meta["side"] = spec.get("side", "midline")
        meta["mesh"] = spec["id"]
        meta["group"] = spec["group"]
        mesh = paint(decimate(mesh, 20000), meta["color"], 1.0)
        rec = {
            **meta,
            "asset": f"{spec['group']}.glb",
            "opacity": 0.95,
            "function": "",
            "clinical": "",
            "chapter6": spec["group"],
            "connected": [],
            "links": [],
            "source": "bodyparts3d",
            "licence": "CC BY-SA 2.1 JP",
            "kind": "mesh",
            "sourceName": spec["representation"],
        }
        items.append(save_item(rec, mesh))
    print(f"  derived {len(items)} BodyParts3D meshes")
    return items


def derive_head(reg: Dict) -> List[Dict]:
    path = CACHE / "graphcolouring" / "fsaverage_head.glb"
    if not path.exists():
        print("  fsaverage head missing")
        return []
    mesh = trimesh.load(path, force="mesh")
    mesh.vertices = apply_matrix(mesh.vertices, transform_of(reg, "graphcolouring-fsaverage"))
    mesh = paint(decimate(mesh, 18000), "#f4d6c6", 0.35)
    rec = {
        "id": "scalp",
        "name": "Scalp (fsaverage)",
        "side": "midline",
        "group": "head",
        "parent": None,
        "mesh": "scalp",
        "asset": "head.glb",
        "color": "#f4d6c6",
        "opacity": 0.18,
        "function": "Translucent scalp for coordinate-frame context.",
        "clinical": "",
        "chapter6": "",
        "connected": [],
        "links": [],
        "source": "graphcolouring-fsaverage",
        "licence": "FreeSurfer / MNE fsaverage",
        "kind": "mesh",
        "sourceName": "fsaverage_head.glb",
    }
    print("  derived scalp")
    return [save_item(rec, mesh)]


def transform_fiducials(reg: Dict) -> List[Dict]:
    anatomy = CACHE / "graphcolouring" / "mne_anatomy.json"
    if not anatomy.exists():
        return []
    data = json.loads(anatomy.read_text())
    matrix = transform_of(reg, "graphcolouring-fsaverage")
    out = []
    fids = data.get("fiducials") or {}
    mapping = {"nasion": "Nasion", "lpa": "Left preauricular (LPA)", "rpa": "Right preauricular (RPA)"}
    for key, name in mapping.items():
        if key not in fids:
            continue
        mni = apply_matrix(np.asarray(fids[key], dtype=np.float64).reshape(1, 3), matrix)[0]
        out.append({"id": key, "name": name, "mni": mni.tolist(), "source": "graphcolouring-fsaverage"})
    cz = (data.get("electrodes_1020") or {}).get("Cz")
    if cz:
        mni = apply_matrix(np.array([[cz["x"], cz["y"], cz["z"]]], dtype=np.float64), matrix)[0]
        out.append({"id": "cz", "name": "Cz", "mni": mni.tolist(), "source": "graphcolouring-fsaverage"})
    return out


def main() -> int:
    ensure_dirs()
    reg_path = ASSETS / "registration.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"transforms": {}}
    items: List[Dict] = []
    items.extend(derive_allen(reg))
    items.extend(derive_pitt(reg))
    items.extend(derive_aan(reg))
    bp3d_items = derive_bp3d(reg)
    sensory_items = derive_sensory()
    if bp3d_items:
        skip = set()
        for it in bp3d_items:
            name = it["name"].lower()
            if "eyeball" in name:
                skip.add(f"{'lh' if it['side']=='left' else 'rh'}-eyeball-schematic")
            if name.endswith("lens") or " lens" in name:
                skip.add(f"{'lh' if it['side']=='left' else 'rh'}-lens-schematic")
            if "tongue" in name:
                skip.add("tongue-schematic")
        sensory_items = [it for it in sensory_items if it["id"] not in skip]
    items.extend(sensory_items)
    items.extend(bp3d_items)
    items.extend(derive_head(reg))
    manifest = {
        "count": len(items),
        "items": items,
        "fiducials": transform_fiducials(reg),
    }
    out = INTERMEDIATE / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {out} ({len(items)} meshes)")
    return 0 if items else 1


if __name__ == "__main__":
    sys.exit(main())
