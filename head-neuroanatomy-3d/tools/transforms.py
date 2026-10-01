"""MNI152 / three.js transforms, unit detection, and registration helpers."""
from __future__ import annotations

from itertools import permutations, product
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

# three.js world = (x, z, -y). Rotation about +X by -90°. det = +1.
MNI_TO_SCENE = np.array(
    [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, -1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ],
    dtype=np.float64,
)

# Typical MNI152 brain (not full FOV) extents in mm RAS+.
MNI_BRAIN_BBOX = np.array([[-90.0, -126.0, -72.0], [90.0, 90.0, 108.0]])


def as_4x4(matrix: Iterable) -> np.ndarray:
    arr = np.asarray(matrix, dtype=np.float64)
    if arr.shape == (4, 4):
        return arr
    raise ValueError(f"expected 4x4 matrix, got {arr.shape}")


def identity_4x4() -> np.ndarray:
    return np.eye(4, dtype=np.float64)


def compose(*matrices: np.ndarray) -> np.ndarray:
    out = identity_4x4()
    for mat in matrices:
        out = as_4x4(mat) @ out
    return out


def apply_matrix(points: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float64)
    mat = as_4x4(matrix)
    homo = np.ones((len(pts), 4), dtype=np.float64)
    homo[:, :3] = pts
    return (homo @ mat.T)[:, :3]


def mni_to_scene(points: np.ndarray) -> np.ndarray:
    return apply_matrix(points, MNI_TO_SCENE)


def mni_point_to_scene(xyz: Iterable[float]) -> List[float]:
    pt = np.asarray(list(xyz), dtype=np.float64).reshape(1, 3)
    return mni_to_scene(pt)[0].tolist()


def scale_matrix(factor: float) -> np.ndarray:
    mat = identity_4x4()
    mat[0, 0] = mat[1, 1] = mat[2, 2] = float(factor)
    return mat


def translation_matrix(offset: Iterable[float]) -> np.ndarray:
    mat = identity_4x4()
    mat[:3, 3] = np.asarray(offset, dtype=np.float64)
    return mat


def bbox_of(points: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float64)
    return np.vstack([pts.min(axis=0), pts.max(axis=0)])


def extents(bbox: np.ndarray) -> np.ndarray:
    box = np.asarray(bbox, dtype=np.float64)
    return box[1] - box[0]


def detect_unit_scale(points: np.ndarray) -> Tuple[float, str]:
    """Return a multiplier that maps coordinates into millimetres."""
    ext = extents(bbox_of(points))
    longest = float(np.max(ext))
    if longest > 2000.0:
        return 0.001, "divide-by-1000 (µm or print-scaled mm → mm)"
    if longest < 8.0:
        return 1000.0, "multiply-by-1000 (m → mm)"
    return 1.0, "already-mm"


def axis_permutation_matrices(allow_reflection: bool = False) -> List[Tuple[str, np.ndarray]]:
    mats: List[Tuple[str, np.ndarray]] = []
    for perm in permutations(range(3)):
        for signs in product((-1.0, 1.0), repeat=3):
            rot = np.zeros((3, 3), dtype=np.float64)
            for i, axis in enumerate(perm):
                rot[i, axis] = signs[i]
            det = np.linalg.det(rot)
            if not allow_reflection and det < 0:
                continue
            mat = identity_4x4()
            mat[:3, :3] = rot
            label = f"perm={perm} signs={signs} det={det:.0f}"
            mats.append((label, mat))
    return mats


def best_axis_align(
    source_points: np.ndarray,
    target_bbox: np.ndarray = MNI_BRAIN_BBOX,
    allow_reflection: bool = False,
) -> Tuple[np.ndarray, str, float]:
    """Pick the signed axis permutation whose extents best match the target bbox."""
    src = np.asarray(source_points, dtype=np.float64)
    tgt_ext = extents(target_bbox)
    tgt_c = target_bbox.mean(axis=0)
    winner_mat = identity_4x4()
    winner_label = "identity"
    winner_score = float("inf")
    for label, mat in axis_permutation_matrices(allow_reflection=allow_reflection):
        pts = apply_matrix(src, mat)
        ext = extents(bbox_of(pts))
        score = float(np.linalg.norm(np.sort(ext) - np.sort(tgt_ext)))
        # Prefer orientations whose longest axis maps toward target Y (A-P).
        if int(np.argmax(ext)) == 1:
            score *= 0.85
        if score < winner_score:
            winner_score = score
            winner_label = label
            winner_mat = mat.copy()
            winner_mat[:3, 3] = tgt_c - pts.mean(axis=0)
    return winner_mat, winner_label, winner_score


def similarity_from_bboxes(source_points: np.ndarray, target_points: np.ndarray) -> np.ndarray:
    src = np.asarray(source_points, dtype=np.float64)
    tgt = np.asarray(target_points, dtype=np.float64)
    src_c = src.mean(axis=0)
    tgt_c = tgt.mean(axis=0)
    src_ext = extents(bbox_of(src))
    tgt_ext = extents(bbox_of(tgt))
    scales = tgt_ext / np.maximum(src_ext, 1e-6)
    scale = float(np.median(scales))
    mat = identity_4x4()
    mat[:3, :3] *= scale
    mat[:3, 3] = tgt_c - scale * src_c
    return mat


def sample_points(mesh, count: int = 8000, seed: int = 0) -> np.ndarray:
    if hasattr(mesh, "sample"):
        _ = seed
        return np.asarray(mesh.sample(count), dtype=np.float64)
    verts = np.asarray(mesh.vertices, dtype=np.float64)
    if len(verts) <= count:
        return verts
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(verts), size=count, replace=False)
    return verts[idx]


def run_icp(
    source_points: np.ndarray,
    target_points: np.ndarray,
    initial: Optional[np.ndarray] = None,
    scale: bool = False,
    max_iterations: int = 40,
) -> Tuple[np.ndarray, float]:
    """Rigid (or similarity) ICP. Returns (4x4, mean residual)."""
    from trimesh.registration import icp

    src = np.asarray(source_points, dtype=np.float64)
    tgt = np.asarray(target_points, dtype=np.float64)
    init = identity_4x4() if initial is None else as_4x4(initial)
    kwargs = {
        "initial": init,
        "max_iterations": max_iterations,
        "threshold": 1e-5,
    }
    # trimesh>=4 accepts scale= via kwargs for some versions; fall back if not.
    try:
        matrix, transformed, cost = icp(src, tgt, scale=scale, reflection=False, **kwargs)
    except TypeError:
        matrix, transformed, cost = icp(src, tgt, **kwargs)
    residual = float(np.mean(np.linalg.norm(np.asarray(transformed) - _nearest(tgt, transformed), axis=1)))
    _ = cost
    return as_4x4(matrix), residual


def _nearest(target: np.ndarray, query: np.ndarray) -> np.ndarray:
    try:
        from scipy.spatial import cKDTree

        tree = cKDTree(target)
        _, idx = tree.query(query, k=1)
        return target[idx]
    except Exception:
        # Tiny fallback for very small clouds.
        d = ((query[:, None, :] - target[None, :, :]) ** 2).sum(axis=2)
        return target[d.argmin(axis=1)]


def matrix_to_list(matrix: np.ndarray) -> List[List[float]]:
    return as_4x4(matrix).tolist()


def record_transform(
    name: str,
    matrix: np.ndarray,
    *,
    method: str,
    residual: Optional[float] = None,
    notes: str = "",
    unit_scale: float = 1.0,
) -> Dict:
    return {
        "name": name,
        "matrix": matrix_to_list(matrix),
        "method": method,
        "residualMm": residual,
        "unitScale": unit_scale,
        "notes": notes,
        "sceneFromMNI": matrix_to_list(MNI_TO_SCENE),
    }
