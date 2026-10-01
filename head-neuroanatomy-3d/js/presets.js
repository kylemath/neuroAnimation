/**
 * Chapter-6 guided views and shareable camera / visibility presets.
 */

import { state, emit } from './state.js';
import { setView } from './scene.js';
import {
  resetViewState, setIsolate, applyAppearance, showAll,
} from './structures.js';
import { selectById, flyToId } from './picking.js';
import { applySlicePreset, clearClips, setExploded } from './clipping.js';
import { setEnabled as setArasEnabled, setArousal } from './aras.js';

// The former single 'subcortical' layer is now split into separately toggled layers.
const SUBCORTICAL_LAYERS = ['subcortical', 'thalamus', 'basal-ganglia', 'hippocampus', 'amygdala', 'fornix', 'cingulate'];

export const PRESETS = [
  {
    id: 'ventricles',
    name: 'Ventricular system',
    view: 'oblique',
    layers: ['ventricles', 'brainstem', ...SUBCORTICAL_LAYERS],
    isolate: null,
    select: 'third-ventricle',
    ghost: 0.35,
    aras: false,
    clip: null,
    explode: false,
    note: 'Lateral, third and fourth ventricles plus the aqueduct.',
  },
  {
    id: 'willis',
    name: 'Arterial supply',
    view: 'inferior',
    layers: ['arteries', 'brainstem', 'ventricles'],
    isolate: null,
    select: 'cerebral-arteries',
    ghost: 0.25,
    aras: false,
    clip: null,
    explode: false,
    note: 'Circle of Willis and cerebral arteries in red.',
  },
  {
    id: 'venous',
    name: 'Veins & dural sinuses',
    view: 'posterior',
    layers: ['veins', 'cerebellum', 'brainstem'],
    isolate: null,
    select: 'confluence-of-sinuses',
    ghost: 0.35,
    aras: false,
    clip: null,
    explode: false,
    note: 'Superior sagittal, straight, transverse and sigmoid sinuses (violet/blue) and cerebral veins; teal = schematic meningeal lymphatics.',
  },
  {
    id: 'nerves',
    name: 'Cranial nerves',
    view: 'anterior',
    layers: ['nerves', 'brainstem', 'sensory'],
    isolate: null,
    select: 'cn2-lh',
    ghost: 0.55,
    aras: false,
    clip: null,
    extraVisible: null,
    note: 'Optic nerves from the globes through the chiasm and tracts, olfactory tracts from the nasal epithelium, and auditory nerves from the cochleae.',
  },
  {
    id: 'aras',
    name: 'Brainstem & ARAS',
    view: 'right',
    layers: ['brainstem', 'aras', ...SUBCORTICAL_LAYERS],
    isolate: null,
    select: 'pag',
    ghost: 0.4,
    aras: true,
    arousal: 0.75,
    clip: null,
    note: 'AAN nuclei with schematic dorsal (thalamic) and ventral (hypothalamic / basal-forebrain) routes.',
  },
  {
    id: 'midbrain',
    name: 'Midbrain slices',
    view: 'superior',
    layers: ['brainstem', 'slices', 'aras'],
    isolate: null,
    select: 'superior-colliculus',
    ghost: 0.45,
    aras: false,
    clip: 'midbrain-sc',
    explode: true,
    note: 'Axial clip at the superior colliculus plus exploded brainstem plates.',
  },
  {
    id: 'diencephalon',
    name: 'Diencephalon',
    view: 'oblique',
    layers: [...SUBCORTICAL_LAYERS, 'ventricles', 'white-matter'],
    isolate: 'diencephalon',
    select: 'thalamus-lh',
    ghost: 0.5,
    aras: false,
    note: 'Thalamus, hypothalamus, pituitary and pineal.',
  },
  {
    id: 'basal-ganglia',
    name: 'Basal ganglia',
    view: 'anterior',
    layers: [...SUBCORTICAL_LAYERS, 'white-matter'],
    isolate: 'basal-ganglia',
    select: 'putamen-lh',
    ghost: 0.45,
    aras: false,
    note: 'Striatum, pallidum, STN and substantia nigra.',
  },
  {
    id: 'limbic',
    name: 'Limbic system',
    view: 'left',
    layers: [...SUBCORTICAL_LAYERS, 'white-matter'],
    isolate: 'limbic',
    select: 'hippocampus-lh',
    ghost: 0.4,
    aras: false,
    extraVisible: ['fornix'],
    note: 'Hippocampus, amygdala, fornix and basal forebrain.',
  },
  {
    id: 'cortex-wm',
    name: 'Cortex over white matter',
    view: 'oblique',
    layers: ['cortex', 'white-matter', 'ventricles'],
    isolate: null,
    select: 'cortex-lh',
    ghost: 0.55,
    aras: false,
    note: 'Ghosted hemispheres over white-matter cores and the callosum.',
  },
];

export function initPresets(onChange) {
  const host = document.getElementById('preset-list');
  host.innerHTML = '';
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.dataset.preset = p.id;
    btn.innerHTML = `<strong>${p.name}</strong><span>${p.note}</span>`;
    btn.addEventListener('click', () => {
      applyPreset(p.id);
      if (onChange) onChange();
    });
    host.appendChild(btn);
  }
}

export function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  resetViewState();
  showAll();

  const keep = new Set(preset.layers);
  if (state.manifest) {
    const layers = new Set(state.manifest.structures.map((s) => s.layer));
    for (const layer of layers) {
      if (!keep.has(layer)) state.layerHidden.add(layer);
    }
    if (preset.extraVisible) {
      for (const sid of preset.extraVisible) {
        state.hidden.delete(sid);
        const def = state.manifest.structures.find((s) => s.id === sid);
        if (def) state.layerHidden.delete(def.layer);
      }
    }
  }

  if (preset.isolate) setIsolate(preset.isolate);
  state.ghost = preset.ghost ?? 1;
  const ghost = document.getElementById('ghost-slider');
  const ghostVal = document.getElementById('ghost-val');
  if (ghost) ghost.value = String(Math.round(state.ghost * 100));
  if (ghostVal) ghostVal.textContent = `${Math.round(state.ghost * 100)}%`;

  setArasEnabled(Boolean(preset.aras));
  setArousal(preset.arousal ?? (preset.aras ? 0.7 : 0.4));

  if (preset.clip) applySlicePreset(preset.clip);
  else clearClips();
  setExploded(Boolean(preset.explode));
  const exp = document.getElementById('toggle-exploded');
  if (exp) exp.checked = Boolean(preset.explode);

  if (preset.view) setView(preset.view, 0);
  if (preset.select) {
    selectById(preset.select, false);
    flyToId(preset.select);
  }

  applyAppearance();
  state.preset = preset.id;
  markActive(preset.id);
  emit('preset', preset.id);
}

function markActive(id) {
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === id);
  });
}

export function syncPresetActive() {
  markActive(state.preset);
}
