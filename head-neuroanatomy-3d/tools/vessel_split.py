#!/usr/bin/env python3
"""Split vasculature into arterial and venous groups and add named dural sinuses.

Run AFTER optimize.py (and again any time; it is idempotent):

    .venv/bin/python vessel_split.py

Inputs : assets/vasculature.glb   (combined arteries + veins + dural mesh; first run
         is backed up to _cache/intermediate/vasculature_combined.glb)
Outputs: assets/vasculature.glb   (arteries only)
         assets/venous.glb        (cerebral veins, dural reflections, named sinus tubes,
                                   schematic meningeal lymphatics)
         assets/structures.json   (patched: groups, layers, colours, new structures)

The named sinuses are tubes swept along centrelines measured from the registered Pitt
dural mesh (top midline envelope for the superior sagittal sinus, free lower edge of the
falx for the inferior sagittal / straight sinuses, posterior rim of the tentorium for the
transverse sinuses). They are schematic in course and calibre and are flagged as such.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import trimesh

from paths import ASSETS, CACHE

COMBINED_BACKUP = CACHE / "intermediate" / "vasculature_combined.glb"
VASC = ASSETS / "vasculature.glb"
VENOUS = ASSETS / "venous.glb"
MANIFEST = ASSETS / "structures.json"

COL_ARTERY = "#e5383b"
COL_VEIN = "#3f7cff"
COL_SINUS = "#6f5bf0"
COL_DURA = "#b9b4d6"
COL_LYMPH = "#2ec4b6"


# ---------------------------------------------------------------- coordinates
def mni_to_world(p: np.ndarray) -> np.ndarray:
    """MNI-like (x right, y anterior, z superior) -> three.js world (x, z, -y)."""
    p = np.atleast_2d(p)
    return np.c_[p[:, 0], p[:, 2], -p[:, 1]]


def world_to_mni(w: np.ndarray) -> np.ndarray:
    w = np.atleast_2d(w)
    return np.c_[w[:, 0], -w[:, 2], w[:, 1]]


# ------------------------------------------------------------------ tube mesh
def catmull(points: np.ndarray, samples: int = 80) -> np.ndarray:
    pts = np.asarray(points, float)
    if len(pts) < 3:
        return pts
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out = []
    per = max(4, samples // (len(pts) - 1))
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            out.append(
                0.5
                * (
                    2 * p1
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t**2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3
                )
            )
    out.append(pts[-1])
    return np.array(out)


def tube(points_mni: np.ndarray, radius, sides: int = 14, samples: int = 90) -> trimesh.Trimesh:
    """Smooth tube (world coordinates) along an MNI polyline; radius is scalar or per-point."""
    path = catmull(points_mni, samples)
    n = len(path)
    if np.isscalar(radius):
        rad = np.full(n, float(radius))
    else:
        r = np.asarray(radius, float)
        rad = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(r)), r)
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    ref = np.array([0.0, 0.0, 1.0])
    verts, faces = [], []
    prev_n = None
    for i in range(n):
        t = tang[i]
        if prev_n is None:
            nrm = np.cross(t, ref)
            if np.linalg.norm(nrm) < 1e-3:
                nrm = np.cross(t, np.array([0.0, 1.0, 0.0]))
        else:
            nrm = prev_n - t * np.dot(prev_n, t)
        nrm /= np.linalg.norm(nrm) + 1e-9
        prev_n = nrm
        bin_ = np.cross(t, nrm)
        for k in range(sides):
            a = 2 * np.pi * k / sides
            verts.append(path[i] + rad[i] * (np.cos(a) * nrm + np.sin(a) * bin_))
    for i in range(n - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + k
            d = (i + 1) * sides + (k + 1) % sides
            faces += [[a, b, c], [b, d, c]]
    # end caps
    for end, idx in ((0, 0), (1, n - 1)):
        centre = len(verts)
        verts.append(path[idx])
        for k in range(sides):
            a = idx * sides + k
            b = idx * sides + (k + 1) % sides
            faces.append([centre, b, a] if end == 0 else [centre, a, b])
    mesh = trimesh.Trimesh(mni_to_world(np.array(verts)), np.array(faces), process=False)
    mesh.fix_normals()
    return mesh


def sphere(centre_mni, radius: float) -> trimesh.Trimesh:
    s = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    s.apply_translation(mni_to_world(np.array(centre_mni))[0])
    return s


# ------------------------------------------------------------ measured paths
def smooth(v: np.ndarray, k: int = 3) -> np.ndarray:
    pad = np.pad(v, k, mode="edge")
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="valid")


def measure_centrelines(dural_world: trimesh.Trimesh) -> dict:
    c = world_to_mni(dural_world.triangles_center)
    mid = np.abs(c[:, 0]) < 6
    ys = np.arange(-80, 100, 4.0)
    zmax, zmin, xtop, ok = [], [], [], []
    for y0 in ys:
        q = mid & (c[:, 1] >= y0) & (c[:, 1] < y0 + 4)
        if q.sum() < 4:
            zmax.append(np.nan); zmin.append(np.nan); xtop.append(np.nan); ok.append(False)
            continue
        sel = c[q]
        top = sel[sel[:, 2] >= np.percentile(sel[:, 2], 90)]
        zmax.append(sel[:, 2].max()); zmin.append(sel[:, 2].min()); xtop.append(top[:, 0].mean()); ok.append(True)
    ys_c = ys + 2
    ok = np.array(ok)
    zmax = np.interp(ys_c, ys_c[ok], np.array(zmax)[ok])
    zmin = np.interp(ys_c, ys_c[ok], np.array(zmin)[ok])
    xtop = np.interp(ys_c, ys_c[ok], np.array(xtop)[ok])
    zmax_s, zmin_s, x_s = smooth(zmax), smooth(zmin), smooth(xtop)

    def at(y, arr):
        return float(np.interp(y, ys_c, arr))

    # superior sagittal sinus: along the top envelope, then down the posterior wall.
    sss = []
    for y in np.arange(94, -78, -8.0):
        sss.append([at(y, x_s), y, at(y, zmax_s) - 3.4])
    sss += [[x_s[0], -80.0, 22.0], [x_s[0], -79.0, 15.0]]
    sss = np.array(sss)

    # confluence of sinuses (torcular)
    conf = np.array([float(x_s[0]), -78.0, 11.0])

    # inferior sagittal sinus + vein of Galen -> straight sinus along the falx lower edge
    gal = np.array([float(x_s[0]), -28.0, at(-28.0, zmin_s) + 3.0])
    iss = [[at(y, x_s), y, at(y, zmin_s) + 2.0] for y in np.arange(34, -26, -8.0)] + [gal.tolist()]
    straight = [gal.tolist()] + [[at(y, x_s), y, at(y, zmin_s) + 3.0] for y in np.arange(-36, -74, -9.0)] + [conf.tolist()]

    # transverse sinus: posterior-lateral rim of tentorium (right side; mirror for left)
    trans_r = [conf.tolist(), [12, -75, 14], [22, -72, 13], [32, -67, 10], [42, -61, 8], [51, -53, 7], [58, -44, 5]]
    sig_r = [[58, -44, 5], [54, -37, -6], [46, -29, -20], [37, -22, -36], [29, -17, -52], [23, -14, -72]]

    return {
        "sss": np.array(sss),
        "confluence": conf,
        "iss": np.array(iss),
        "straight": np.array(straight),
        "transverse_r": np.array(trans_r, float),
        "sigmoid_r": np.array(sig_r, float),
    }


def mirror(p: np.ndarray) -> np.ndarray:
    q = np.array(p, float).copy()
    q[..., 0] *= -1
    return q


def offset(p: np.ndarray, dx=0.0, dz=0.0) -> np.ndarray:
    q = np.array(p, float).copy()
    q[:, 0] += dx
    q[:, 2] += dz
    return q


# ------------------------------------------------------------------- manifest
SINUS_TEXT = {
    "sss": (
        "Superior sagittal sinus",
        "Large unpaired dural venous channel running in the top edge of the falx cerebri from the frontal crista galli to the confluence of sinuses. It collects blood from the superior cerebral veins and returns CSF through arachnoid granulations.",
        "Thrombosis causes raised intracranial pressure, headache and venous infarcts; trauma to the vertex can tear bridging veins that drain into it.",
    ),
    "inferior-sagittal-sinus": (
        "Inferior sagittal sinus",
        "Small midline channel in the free lower edge of the falx cerebri, above the corpus callosum. It joins the great cerebral vein (of Galen) to form the straight sinus.",
        "Rarely the site of isolated thrombosis; important landmark for the midline venous system.",
    ),
    "straight-sinus": (
        "Straight sinus (with vein of Galen)",
        "Runs along the junction of the falx cerebri and the tentorium cerebelli and carries deep venous blood (great cerebral vein plus inferior sagittal sinus) back to the confluence of sinuses.",
        "Deep venous thrombosis here can infarct the thalami and basal ganglia bilaterally.",
    ),
    "confluence-of-sinuses": (
        "Confluence of sinuses (torcular Herophili)",
        "Midline junction near the internal occipital protuberance where the superior sagittal and straight sinuses meet and split into the two transverse sinuses.",
        "A common site for venous thrombosis; asymmetry of the two transverse sinuses (usually right-dominant) is normal.",
    ),
    "transverse-lh": (
        "Left transverse sinus",
        "Paired sinus running in the attached margin of the tentorium cerebelli around the back and side of the cerebellum, carrying blood from the confluence towards the sigmoid sinus.",
        "Thrombosis or hypoplasia causes venous congestion and raised pressure (pseudotumour-like picture); often the left is smaller.",
    ),
    "transverse-rh": (
        "Right transverse sinus",
        "Paired sinus running in the attached margin of the tentorium cerebelli around the back and side of the cerebellum, carrying blood from the confluence towards the sigmoid sinus. It is usually the dominant side.",
        "Thrombosis or hypoplasia causes venous congestion and raised pressure; mastoid infection can spread to the adjacent sigmoid portion.",
    ),
    "sigmoid-lh": (
        "Left sigmoid sinus",
        "S-shaped continuation of the transverse sinus grooving the mastoid part of the temporal bone and ending at the jugular foramen, where it becomes the internal jugular vein.",
        "Lies next to the mastoid air cells and middle ear; otitis media can cause sigmoid sinus thrombosis.",
    ),
    "sigmoid-rh": (
        "Right sigmoid sinus",
        "S-shaped continuation of the transverse sinus grooving the mastoid part of the temporal bone and ending at the jugular foramen, where it becomes the internal jugular vein.",
        "Lies next to the mastoid air cells and middle ear; otitis media can cause sigmoid sinus thrombosis.",
    ),
    "meningeal-lymphatics": (
        "Meningeal lymphatics / glymphatic outflow (schematic)",
        "The glymphatic system flushes interstitial fluid along perivascular spaces; its outflow reaches dural lymphatic vessels that run alongside the superior sagittal and transverse sinuses and drain to deep cervical lymph nodes. These are NOT the venous sinuses themselves; they are drawn as thin teal channels beside them for orientation only.",
        "Impaired meningeal lymphatic and glymphatic clearance is being studied in Alzheimer disease, ageing and after brain injury. Position and calibre here are schematic.",
    ),
}


def struct(sid, name, node, colour, opacity, centroid, side, text, connected, schematic=True,
           kind="mesh", parent=None):
    return {
        "id": sid, "name": name, "group": "venous", "parent": parent, "layer": "veins",
        "kind": kind, "meshNode": node, "side": side, "opacity": opacity, "colour": colour,
        "centroid": [round(float(v), 1) for v in centroid], "schematic": schematic,
        "defaultVisible": True, "connected": connected, "chapter6": "blood-supply",
        "function": text[1], "clinical": text[2],
        "source": "Course-derived centreline traced on Pitt dural mesh (schematic course and calibre)",
        "licence": "CC BY-SA 4.0 (derived)", "links": [],
    }


def patch_manifest(centres: dict) -> None:
    d = json.loads(MANIFEST.read_text())
    groups = [g for g in d["groups"] if g["id"] not in ("venous",)]
    for g in groups:
        if g["id"] == "vasculature":
            g.update({"name": "Arteries", "layer": "arteries", "defaultVisible": False})
    idx = next(i for i, g in enumerate(groups) if g["id"] == "vasculature")
    groups.insert(idx + 1, {
        "id": "venous", "name": "Veins and dural sinuses", "asset": "assets/venous.glb",
        "layer": "veins", "defaultVisible": False, "renderOrder": 29,
        "bytes": VENOUS.stat().st_size,
    })
    for g in groups:
        if g["id"] == "vasculature":
            g["bytes"] = VASC.stat().st_size
    d["groups"] = groups

    drop = {"sss", "transverse-lh", "transverse-rh", "inferior-sagittal-sinus", "straight-sinus",
            "confluence-of-sinuses", "sigmoid-lh", "sigmoid-rh", "meningeal-lymphatics", "venous-sinuses"}
    structs = [s for s in d["structures"] if s["id"] not in drop]
    for s in structs:
        if s["group"] == "vasculature":
            s["layer"] = "arteries"
            if s["id"] == "cerebral-arteries":
                s.update({"colour": COL_ARTERY, "opacity": 0.95, "name": "Cerebral arteries (Circle of Willis and branches)"})
            elif s.get("kind") == "folder":
                s["colour"] = COL_ARTERY
        if s["id"] == "cerebral-veins":
            s.update({"group": "venous", "layer": "veins", "colour": COL_VEIN, "opacity": 0.95,
                      "name": "Cerebral veins (cortical and deep)",
                      "meshNode": "cerebral_veins", "connected": ["sss", "straight-sinus"]})
        if s["id"] == "dural-sinuses":
            s.update({"group": "venous", "layer": "veins", "colour": COL_DURA, "opacity": 0.16,
                      "name": "Dural reflections (falx cerebri, tentorium cerebelli)",
                      "schematic": False,
                      "function": "Folds of dura mater: the falx cerebri separates the hemispheres and the tentorium cerebelli roofs the cerebellum. The venous sinuses run inside their attached margins.",
                      "clinical": "Raised supratentorial pressure can push the temporal uncus past the tentorial edge (herniation) compressing CN III and the midbrain."})

    c = centres
    parent = struct("venous-sinuses", "Large dural venous sinuses", None, COL_SINUS, 1, [0, -10, 60], "mid",
                    ("", "Midline and cerebellar-margin channels in the dura that collect cerebral venous blood and drain to the internal jugular veins.", ""),
                    [], kind="folder")
    kids = [
        struct("sss", SINUS_TEXT["sss"][0], "sinus_sss", COL_SINUS, 0.95, c["sss"][len(c["sss"]) // 2], "mid", SINUS_TEXT["sss"], ["inferior-sagittal-sinus", "confluence-of-sinuses"], parent="venous-sinuses"),
        struct("inferior-sagittal-sinus", SINUS_TEXT["inferior-sagittal-sinus"][0], "sinus_iss", "#8b7cff", 0.95, c["iss"][len(c["iss"]) // 2], "mid", SINUS_TEXT["inferior-sagittal-sinus"], ["straight-sinus", "sss"], parent="venous-sinuses"),
        struct("straight-sinus", SINUS_TEXT["straight-sinus"][0], "sinus_straight", "#a48bff", 0.95, c["straight"][len(c["straight"]) // 2], "mid", SINUS_TEXT["straight-sinus"], ["confluence-of-sinuses", "inferior-sagittal-sinus"], parent="venous-sinuses"),
        struct("confluence-of-sinuses", SINUS_TEXT["confluence-of-sinuses"][0], "sinus_confluence", "#ff9f1c", 1.0, c["confluence"], "mid", SINUS_TEXT["confluence-of-sinuses"], ["sss", "straight-sinus", "transverse-lh", "transverse-rh"], parent="venous-sinuses"),
        struct("transverse-lh", SINUS_TEXT["transverse-lh"][0], "sinus_transverse_lh", "#4cc9f0", 0.95, mirror(c["transverse_r"][3]), "L", SINUS_TEXT["transverse-lh"], ["confluence-of-sinuses", "sigmoid-lh"], parent="venous-sinuses"),
        struct("transverse-rh", SINUS_TEXT["transverse-rh"][0], "sinus_transverse_rh", "#4cc9f0", 0.95, c["transverse_r"][3], "R", SINUS_TEXT["transverse-rh"], ["confluence-of-sinuses", "sigmoid-rh"], parent="venous-sinuses"),
        struct("sigmoid-lh", SINUS_TEXT["sigmoid-lh"][0], "sinus_sigmoid_lh", "#3a86ff", 0.95, mirror(c["sigmoid_r"][3]), "L", SINUS_TEXT["sigmoid-lh"], ["transverse-lh"], parent="venous-sinuses"),
        struct("sigmoid-rh", SINUS_TEXT["sigmoid-rh"][0], "sinus_sigmoid_rh", "#3a86ff", 0.95, c["sigmoid_r"][3], "R", SINUS_TEXT["sigmoid-rh"], ["transverse-rh"], parent="venous-sinuses"),
    ]
    lymph = struct("meningeal-lymphatics", SINUS_TEXT["meningeal-lymphatics"][0], "lymph_meningeal", COL_LYMPH, 0.9,
                   c["sss"][len(c["sss"]) // 2] + np.array([7, 0, -2]), "mid", SINUS_TEXT["meningeal-lymphatics"], ["sss", "transverse-lh", "transverse-rh"])
    lymph["defaultVisible"] = False
    for s in kids:
        s["defaultVisible"] = True
    structs += [parent] + kids + [lymph]

    # Keep other-layer fixes: arterial folder children stay in vasculature group
    d["structures"] = structs
    d["assetBytes"] = {**d.get("assetBytes", {}), "vasculature.glb": VASC.stat().st_size, "venous.glb": VENOUS.stat().st_size} \
        if isinstance(d.get("assetBytes"), dict) else d.get("assetBytes")
    exported = list(d.get("exportedMeshNodes", []))
    for n in ["sinus_sss", "sinus_iss", "sinus_straight", "sinus_confluence", "sinus_transverse_lh",
              "sinus_transverse_rh", "sinus_sigmoid_lh", "sinus_sigmoid_rh", "lymph_meningeal"]:
        if n not in exported:
            exported.append(n)
    d["exportedMeshNodes"] = exported
    MANIFEST.write_text(json.dumps(d, indent=2))


# ----------------------------------------------------------------------- main
def main() -> int:
    if not COMBINED_BACKUP.exists():
        COMBINED_BACKUP.parent.mkdir(parents=True, exist_ok=True)
        src = trimesh.load(VASC)
        if not {"cerebral_arteries", "cerebral_veins", "dural_sinuses"} <= set(src.geometry.keys()):
            raise SystemExit("assets/vasculature.glb is not the combined mesh and no backup exists; re-run optimize.py")
        shutil.copy(VASC, COMBINED_BACKUP)
    combined = trimesh.load(COMBINED_BACKUP)
    arteries = combined.geometry["cerebral_arteries"]
    veins = combined.geometry["cerebral_veins"]
    dura = combined.geometry["dural_sinuses"]

    cl = measure_centrelines(dura)

    art_scene = trimesh.Scene()
    art_scene.add_geometry(arteries, node_name="cerebral_arteries", geom_name="cerebral_arteries")
    art_scene.export(VASC)

    ven = trimesh.Scene()
    ven.add_geometry(veins, node_name="cerebral_veins", geom_name="cerebral_veins")
    ven.add_geometry(dura, node_name="dural_sinuses", geom_name="dural_sinuses")

    sss_r = np.linspace(2.6, 4.2, len(cl["sss"]))
    ven.add_geometry(tube(cl["sss"], np.r_[sss_r[:-2], 4.4, 4.8]), node_name="sinus_sss", geom_name="sinus_sss")
    ven.add_geometry(tube(cl["iss"], 1.8), node_name="sinus_iss", geom_name="sinus_iss")
    ven.add_geometry(tube(cl["straight"], [2.4, 3.0, 3.3, 3.6]), node_name="sinus_straight", geom_name="sinus_straight")
    ven.add_geometry(sphere(cl["confluence"], 7.0), node_name="sinus_confluence", geom_name="sinus_confluence")
    ven.add_geometry(tube(cl["transverse_r"], [6.0, 5.4, 5.0, 4.8]), node_name="sinus_transverse_rh", geom_name="sinus_transverse_rh")
    ven.add_geometry(tube(mirror(cl["transverse_r"]), [5.4, 5.0, 4.6, 4.4]), node_name="sinus_transverse_lh", geom_name="sinus_transverse_lh")
    ven.add_geometry(tube(cl["sigmoid_r"], [4.8, 5.0, 5.4]), node_name="sinus_sigmoid_rh", geom_name="sinus_sigmoid_rh")
    ven.add_geometry(tube(mirror(cl["sigmoid_r"]), [4.4, 4.6, 5.0]), node_name="sinus_sigmoid_lh", geom_name="sinus_sigmoid_lh")

    # schematic meningeal lymphatics: thin pair of channels beside the SSS and along the transverse sinuses
    lym = [
        tube(offset(cl["sss"][:-2], dx=7.5, dz=-1.0), 1.1, sides=8),
        tube(offset(cl["sss"][:-2], dx=-7.5, dz=-1.0), 1.1, sides=8),
        tube(offset(cl["transverse_r"], dz=-6.5), 1.0, sides=8),
        tube(offset(mirror(cl["transverse_r"]), dz=-6.5), 1.0, sides=8),
    ]
    ven.add_geometry(trimesh.util.concatenate(lym), node_name="lymph_meningeal", geom_name="lymph_meningeal")
    ven.export(VENOUS)

    patch_manifest(cl)
    print("vasculature.glb", VASC.stat().st_size, "venous.glb", VENOUS.stat().st_size)
    for name, pts in cl.items():
        print(name, np.round(np.atleast_2d(pts)[:3], 1).tolist(), "...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
