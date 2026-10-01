"""Map source mesh names onto the viewer's meshNode contract."""
from __future__ import annotations

import re
from typing import Optional

# Viewer meshNode -> list of regexes matched against Allen geometry names (lowercased).
# First matching bucket wins when a name is exclusive; cortex is a residual bucket.
ALLEN_EXACT = {
    "thalamus_lh": r"allen_thalamus_l$",
    "thalamus_rh": r"allen_thalamus_r$",
    "pulvinar_lh": r"pulvinar_of_thalamus_l$",
    "pulvinar_rh": r"pulvinar_of_thalamus_r$",
    "lgn_lh": r"dorsal_lateral_geniculate_nucleus_l$",
    "lgn_rh": r"dorsal_lateral_geniculate_nucleus_r$",
    "mgn_lh": r"medial_geniculate_nuclei_l$",
    "mgn_rh": r"medial_geniculate_nuclei_r$",
    "intralaminar_thalamus_lh": r"(centromedian_nucleus_of_thalamus_l|parafascicular_nucleus_of_thalamus_l)$",
    "intralaminar_thalamus_rh": r"(centromedian_nucleus_of_thalamus_r|parafascicular_nucleus_of_thalamus_r)$",
    "hypothalamus_lh": r"allen_hypothalamus_l$",
    "hypothalamus_rh": r"allen_hypothalamus_r$",
    "tmn": r"tuberal_region_of_hth_",
    "pineal": r"pineal_body_",
    "basal_forebrain_lh": r"basal_forebrain_l$",
    "basal_forebrain_rh": r"basal_forebrain_r$",
    "caudate_lh": r"(head_of_caudate_l|body_of_caudate_l|tail_of_caudate_l)$",
    "caudate_rh": r"(head_of_caudate_r|body_of_caudate_r|tail_of_caudate_r)$",
    "putamen_lh": r"(allen_putamen_l|posteroventral_putamen_l)$",
    "putamen_rh": r"(allen_putamen_r|posteroventral_putamen_r)$",
    "gpe_lh": r"external_segment_of_globus_pallidus_l$",
    "gpe_rh": r"external_segment_of_globus_pallidus_r$",
    "gpi_lh": r"internal_segment_of_globus_pallidus_l$",
    "gpi_rh": r"internal_segment_of_globus_pallidus_r$",
    "nucleus_accumbens_lh": r"nucleus_accumbens_l$",
    "nucleus_accumbens_rh": r"nucleus_accumbens_r$",
    "stn_lh": r"subthalamic_nucleus_l$",
    "stn_rh": r"subthalamic_nucleus_r$",
    "substantia_nigra_lh": r"substantia_nigra_l$",
    "substantia_nigra_rh": r"substantia_nigra_r$",
    "amygdala_lh": r"(amygdaloid_complex_l|amygdalohippocampal_area_l|anterior_amygdaloid_area_l)$",
    "amygdala_rh": r"(amygdaloid_complex_r|amygdalohippocampal_area_r|anterior_amygdaloid_area_r)$",
    "hippocampus_lh": r"(head_of_hippocampus_l|body_of_hippocampus_l|tail_of_hippocampus_l)$",
    "hippocampus_rh": r"(head_of_hippocampus_r|body_of_hippocampus_r|tail_of_hippocampus_r)$",
    "cerebellar_hemisphere_lh": r"(lateral_hemisphere_of_cerebellum_l|paravermis_of_cerebellum_l)$",
    "cerebellar_hemisphere_rh": r"(lateral_hemisphere_of_cerebellum_r|paravermis_of_cerebellum_r)$",
    "vermis": r"cerebellar_vermis_",
    "dentate_lh": r"cerebellar_deep_nuclei_l$",
    "dentate_rh": r"cerebellar_deep_nuclei_r$",
    "lateral_ventricle_lh": r"(anterior_horn_of_lateral_ventricle_l|body_of_lateral_ventricle_l|atrium_of_lateral_ventricle_l|inferior_horn_of_lateral_ventricle_l|posterior_horn_of_lateral_ventricle_l)$",
    "lateral_ventricle_rh": r"(anterior_horn_of_lateral_ventricle_r|body_of_lateral_ventricle_r|atrium_of_lateral_ventricle_r|inferior_horn_of_lateral_ventricle_r|posterior_horn_of_lateral_ventricle_r)$",
    "third_ventricle": r"third_ventricle_",
    "cerebral_aqueduct": r"cerebral_aqueduct_",
    "fourth_ventricle": r"fourth_ventricle_",
    "white_matter_lh": r"white_matter_of_forebrain_l$",
    "white_matter_rh": r"white_matter_of_forebrain_r$",
    "corpus_callosum": r"corpus_callosum_",
    "fornix": r"allen_fornix_",
    "optic_tract_lh": r"(optic_tract_l|optic_radiation_l)$",
    "optic_tract_rh": r"(optic_tract_r|optic_radiation_r)$",
    "optic_chiasm": r"optic_chiasm",
    # Cingulate gyrus (not paracingulate) is its own node so it can be toggled separately from cortex.
    "cingulate_lh": r"(^|_)cingulate_gyrus_.*_l$",
    "cingulate_rh": r"(^|_)cingulate_gyrus_.*_r$",
    "midbrain": r"(midbrain_tegmentum_|pretectal_region_)",
    "superior_colliculus": r"superior_colliculus_",
    "inferior_colliculus": r"inferior_colliculus_",
    "pons": r"(basilar_part_of_pons_|pontine_tegmentum_)",
    "medulla": r"(tegmentum_of_medulla_oblongata_|central_canal_of_medulla)",
    "cerebral_peduncle_lh": r"cerebral_peduncle_crus_cerebri_l$",
    "cerebral_peduncle_rh": r"cerebral_peduncle_crus_cerebri_r$",
    "pyramid_lh": r"pyramidal_part_of_medulla_oblongata_l$",
    "pyramid_rh": r"pyramidal_part_of_medulla_oblongata_r$",
    "inferior_olive_lh": r"inferior_olive_l$",
    "inferior_olive_rh": r"inferior_olive_r$",
    "red_nucleus_lh": r"red_nucleus_l$",
    "red_nucleus_rh": r"red_nucleus_r$",
}

CORTEX_RE = re.compile(
    r"gyrus|cortex|pole|operculum|cuneus|precuneus|insula|planum|lobule|"
    r"orbital|heschl|lingual|fusiform|rectus|frontomarginal|limen|"
    r"primary_motor|piriform|olfactory_bulb|olfactory_tract|olfactory_gyrus",
    re.I,
)

NODE_GROUP = {
    "scalp": "head",
    "cortex_lh": "core",
    "cortex_rh": "core",
    "cingulate_lh": "core",
    "cingulate_rh": "core",
    "midbrain": "core",
    "superior_colliculus": "core",
    "inferior_colliculus": "core",
    "pons": "core",
    "medulla": "core",
    "cerebral_peduncle_lh": "core",
    "cerebral_peduncle_rh": "core",
    "pyramid_lh": "core",
    "pyramid_rh": "core",
    "inferior_olive_lh": "core",
    "inferior_olive_rh": "core",
    "red_nucleus_lh": "core",
    "red_nucleus_rh": "core",
    "white_matter_lh": "white-matter",
    "white_matter_rh": "white-matter",
    "corpus_callosum": "white-matter",
    "fornix": "white-matter",
    "internal_capsule_lh": "white-matter",
    "internal_capsule_rh": "white-matter",
    "optic_tract_lh": "white-matter",
    "optic_tract_rh": "white-matter",
    "section_midbrain": "slices",
    "section_pons": "slices",
    "section_medulla_rostral": "slices",
    "section_medulla_caudal": "slices",
}


def allen_side(name: str) -> str:
    if name.endswith("_L") or name.lower().endswith("_l"):
        return "L"
    if name.endswith("_R") or name.lower().endswith("_r"):
        return "R"
    return "mid"


def map_allen_name(name: str) -> Optional[str]:
    low = name.lower()
    for node, pattern in ALLEN_EXACT.items():
        if re.search(pattern, low):
            return node
    if CORTEX_RE.search(low) and "white_matter" not in low and "cerebell" not in low:
        side = allen_side(name)
        if side == "L":
            return "cortex_lh"
        if side == "R":
            return "cortex_rh"
    if "white_matter_of_hindbrain" in low:
        return "white_matter_lh" if allen_side(name) == "L" else "white_matter_rh"
    return None


AAN_SCHEMATICS = [
    {"node": "locus_coeruleus_lh", "center": [-4.2, -37.5, -26.0], "radius": 2.2, "side": "L", "transmitter": "NE"},
    {"node": "locus_coeruleus_rh", "center": [4.2, -37.5, -26.0], "radius": 2.2, "side": "R", "transmitter": "NE"},
    {"node": "dorsal_raphe", "center": [0.0, -32.0, -16.0], "radius": 2.6, "side": "mid", "transmitter": "5-HT"},
    {"node": "median_raphe", "center": [0.0, -36.0, -24.0], "radius": 2.4, "side": "mid", "transmitter": "5-HT"},
    {"node": "pag", "center": [0.0, -28.0, -8.0], "radius": 3.4, "side": "mid", "transmitter": None},
    {"node": "parabrachial_lh", "center": [-7.5, -36.0, -32.0], "radius": 2.4, "side": "L", "transmitter": None},
    {"node": "parabrachial_rh", "center": [7.5, -36.0, -32.0], "radius": 2.4, "side": "R", "transmitter": None},
    {"node": "ppn_lh", "center": [-7.5, -28.0, -12.0], "radius": 2.5, "side": "L", "transmitter": "ACh"},
    {"node": "ppn_rh", "center": [7.5, -28.0, -12.0], "radius": 2.5, "side": "R", "transmitter": "ACh"},
    {"node": "ldtg_lh", "center": [-3.8, -36.0, -28.0], "radius": 2.1, "side": "L", "transmitter": "ACh"},
    {"node": "ldtg_rh", "center": [3.8, -36.0, -28.0], "radius": 2.1, "side": "R", "transmitter": "ACh"},
    {"node": "mrf", "center": [0.0, -24.0, -8.0], "radius": 4.0, "side": "mid", "transmitter": None},
    {"node": "pontis_oralis", "center": [0.0, -32.0, -24.0], "radius": 3.2, "side": "mid", "transmitter": None},
    {"node": "vta", "center": [0.0, -16.0, -12.0], "radius": 3.0, "side": "mid", "transmitter": "DA"},
]

# The published AAN centres are true MNI152, but the brainstem meshes in this scene
# (Allen-derived) sit ~21 mm more anterior (aqueduct y≈-6.6, not ≈-28). Shift the
# schematic nuclei into the rendered brainstem. Keep in sync with ARAS_OFFSET_MNI in js/aras.js.
AAN_OFFSET_MNI = [3.0, 21.0, 0.0]


def aan_anterior_tuck(y: float) -> float:
    """Extra +Y millimetres (anterior) after AAN_OFFSET_MNI.

    Aqueduct alignment still leaves the pontine nodes behind the Allen tegmentum,
    in the fourth ventricle. Pull those caudal centres forward; the tuck fades out
    by the rostral midbrain so VTA stays on the ventral surface.
    Keep in sync with arasAnteriorTuck() in js/aras.js.
    """
    if y >= -1.0:
        return 0.0
    return min(8.0, -0.5 * (y + 1.0))


for _spec in AAN_SCHEMATICS:
    _center = [c + o for c, o in zip(_spec["center"], AAN_OFFSET_MNI)]
    _center[1] += aan_anterior_tuck(_center[1])
    _spec["center"] = _center
