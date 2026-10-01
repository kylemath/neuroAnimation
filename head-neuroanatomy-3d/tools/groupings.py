"""Map mesh names to viewer groups, sides, colours, and parents."""
from __future__ import annotations

import hashlib
import re
from typing import Dict, List, Optional, Tuple

GROUP_META = [
    {
        "id": "core",
        "name": "Cortex and brainstem",
        "asset": "core.glb",
        "defaultOpacity": 0.88,
        "color": "#d4a574",
    },
    {
        "id": "white-matter",
        "name": "White matter",
        "asset": "white-matter.glb",
        "defaultOpacity": 0.55,
        "color": "#f2efe9",
    },
    {
        "id": "subcortical",
        "name": "Subcortical (thalamus, hypothalamus, basal ganglia, limbic)",
        "asset": "subcortical.glb",
        "defaultOpacity": 0.95,
        "color": "#e07a5f",
    },
    {
        "id": "cerebellum",
        "name": "Cerebellum",
        "asset": "cerebellum.glb",
        "defaultOpacity": 0.85,
        "color": "#81b29a",
    },
    {
        "id": "ventricles",
        "name": "Ventricles",
        "asset": "ventricles.glb",
        "defaultOpacity": 0.45,
        "color": "#4cc9f0",
    },
    {
        "id": "vasculature",
        "name": "Vasculature and dural sinuses",
        "asset": "vasculature.glb",
        "defaultOpacity": 0.95,
        "color": "#c1121f",
    },
    {
        "id": "cranial-nerves",
        "name": "Cranial nerves and brainstem sections",
        "asset": "cranial-nerves.glb",
        "defaultOpacity": 1.0,
        "color": "#ffd166",
    },
    {
        "id": "aras",
        "name": "Ascending arousal network",
        "asset": "aras.glb",
        "defaultOpacity": 1.0,
        "color": "#9b5de5",
    },
    {
        "id": "sensory",
        "name": "Sensory organs",
        "asset": "sensory.glb",
        "defaultOpacity": 0.9,
        "color": "#00bbf9",
    },
    {
        "id": "head",
        "name": "Scalp and fiducials",
        "asset": "head.glb",
        "defaultOpacity": 0.18,
        "color": "#f4d6c6",
    },
]

_VENT = re.compile(r"ventricle|aqueduct|choroid|central canal", re.I)
_CBL = re.compile(
    r"cerebell|vermis|dentate|emboliform|globose|fastigial|culmen|declive|uvula|tonsil of cerebellum|floccul",
    re.I,
)
_WM = re.compile(
    r"white matter|corpus callosum|fornix|capsule|peduncle|lemniscus|fasciculus|"
    r"cingulum|uncinate|arcuate|radiation|commissure|tapetum|optic tract|"
    r"internal capsule|external capsule|extreme capsule|cerebral peduncle|"
    r"corticospinal|pyramidal tract|medial longitudinal",
    re.I,
)
_SUB = re.compile(
    r"thalam|hypothal|caudate|putamen|pallid|accumbens|striatum|amygdal|"
    r"hippocamp|subthalamic|claustrum|septal|basal forebrain|substantia innominata|"
    r"mammillar|pituitary|pineal|habenula|nucleus accumbens|globus pallidus|"
    r"substantia nigra|ventral tegmental(?! area mesh skip)|bed nucleus",
    re.I,
)
_STEM = re.compile(
    r"midbrain|pons|medulla|colliculus|olive|pyramid|tegmentum|tectum|"
    r"red nucleus|periaqueductal|locus|raphe|pedunculopontine|olive|"
    r"inferior olivary|superior olivary|cuneate|gracile|brainstem|brain stem",
    re.I,
)
_CTX = re.compile(
    r"gyrus|lobule|cortex|pole|operculum|cuneus|precuneus|insula|planum|"
    r"orbital|frontal|parietal|temporal|occipital|cingulate|parahippocamp|"
    r"entorhinal|perirhinal|fusiform|lingual|calcarine|supramarginal|"
    r"angular|heschl|transverse temporal|paracentral|precentral|postcentral|"
    r"olfactory bulb|olfactory tract",
    re.I,
)
_ARAS_HINT = re.compile(
    r"intralaminar|centromedian|parafascicular|tuberomammillary|basal nucleus of meynert",
    re.I,
)

LEFT = re.compile(r"(^|[\s_\-])(left|lh|l)([\s_\-]|$)", re.I)
RIGHT = re.compile(r"(^|[\s_\-])(right|rh|r)([\s_\-]|$)", re.I)


def slug(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "structure"


def detect_side(name: str) -> str:
    low = name.lower()
    has_l = bool(re.search(r"\bleft\b|\blh\b", low))
    has_r = bool(re.search(r"\bright\b|\brh\b", low))
    if has_l and not has_r:
        return "left"
    if has_r and not has_l:
        return "right"
    if re.search(r"(^|[\s_\-])l([\s_\-]|$)", low) and "lateral" not in low:
        if re.search(r"(^|[\s_\-])r([\s_\-]|$)", low):
            return "bilateral"
    return "midline"


def detect_group(name: str, forced: Optional[str] = None) -> str:
    if forced:
        return forced
    if _VENT.search(name):
        return "ventricles"
    if _CBL.search(name):
        return "cerebellum"
    if _ARAS_HINT.search(name):
        return "subcortical"
    if _SUB.search(name):
        return "subcortical"
    if _WM.search(name) and not _CTX.search(name):
        return "white-matter"
    if _STEM.search(name) and not _CTX.search(name):
        return "core"
    if _CTX.search(name):
        return "core"
    return "core"


def parent_for(name: str, group: str, side: str) -> Optional[str]:
    if group == "core":
        if _STEM.search(name):
            return "brainstem"
        if re.search(r"olfactory", name, re.I):
            return "olfactory"
        if side == "left":
            return "left-cortex"
        if side == "right":
            return "right-cortex"
        return "cortex"
    if group == "subcortical":
        if re.search(r"thalam", name, re.I):
            return "thalamus"
        if re.search(r"hypothal|mammillar|pituitary", name, re.I):
            return "hypothalamus"
        if re.search(r"caudate|putamen|pallid|accumbens|striatum|nigra|subthalamic", name, re.I):
            return "basal-ganglia"
        if re.search(r"amygdal|hippocamp|entorhinal", name, re.I):
            return "limbic"
        return "subcortical"
    return group


def color_for(group: str, side: str, name: str, sampled: Optional[Tuple[int, int, int]] = None) -> str:
    if sampled is not None:
        r, g, b = sampled
        return f"#{r:02x}{g:02x}{b:02x}"
    base = next((g["color"] for g in GROUP_META if g["id"] == group), "#888888")
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    tweak = int(digest[:2], 16) - 128
    rgb = _hex_to_rgb(base)
    if side == "left":
        rgb = (max(0, rgb[0] - 12), min(255, rgb[1] + 8), min(255, rgb[2] + 18))
    elif side == "right":
        rgb = (min(255, rgb[0] + 18), max(0, rgb[1] - 8), max(0, rgb[2] - 12))
    rgb = tuple(max(0, min(255, c + tweak // 8)) for c in rgb)
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def classify(name: str, forced_group: Optional[str] = None) -> Dict:
    group = detect_group(name, forced_group)
    side = detect_side(name)
    ident = slug(name)
    return {
        "id": ident,
        "name": _pretty(name),
        "side": side,
        "group": group,
        "parent": parent_for(name, group, side),
        "mesh": ident,
        "color": color_for(group, side, name),
    }


def _pretty(name: str) -> str:
    cleaned = re.sub(r"[_]+", " ", name).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned.isupper() or cleaned.islower():
        return cleaned.title()
    return cleaned


VIRTUAL_PARENTS: List[Dict] = [
    {"id": "cortex", "name": "Cerebral cortex", "group": "core", "parent": None},
    {"id": "left-cortex", "name": "Left cortex", "group": "core", "parent": "cortex"},
    {"id": "right-cortex", "name": "Right cortex", "group": "core", "parent": "cortex"},
    {"id": "brainstem", "name": "Brainstem", "group": "core", "parent": None},
    {"id": "olfactory", "name": "Olfactory system", "group": "core", "parent": None},
    {"id": "thalamus", "name": "Thalamus", "group": "subcortical", "parent": "subcortical"},
    {"id": "hypothalamus", "name": "Hypothalamus", "group": "subcortical", "parent": "subcortical"},
    {"id": "basal-ganglia", "name": "Basal ganglia", "group": "subcortical", "parent": "subcortical"},
    {"id": "limbic", "name": "Limbic system", "group": "subcortical", "parent": "subcortical"},
]
