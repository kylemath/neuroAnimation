/**
 * Shared viewer state and a tiny event bus.
 */

const listeners = new Map();

export const state = {
  manifest: null,
  usingPlaceholders: true,
  loadedFromAssets: false,
  loadedGroups: new Set(),
  missingAssets: [],

  ghost: 1,
  dimUnselected: true,
  solo: null,
  isolate: null,
  hidden: new Set(),
  opacityOverride: new Map(),
  layerHidden: new Set(),

  selected: [],
  hover: null,

  clipping: {
    sagittal: { enabled: false, value: 0, flip: false },
    coronal: { enabled: false, value: 0, flip: false },
    axial: { enabled: false, value: 0, flip: false },
  },
  explodedSlices: false,

  arasEnabled: true,
  arousal: 0.55,

  preset: null,
  viewName: 'oblique',

  pickMni: null,
  fps: 0,
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  set.forEach((fn) => fn(payload, state));
}

export function resetAppearanceState() {
  state.ghost = 1;
  state.dimUnselected = true;
  state.solo = null;
  state.isolate = null;
  state.hidden.clear();
  state.opacityOverride.clear();
  state.layerHidden.clear();
}

/** Own layer, or any layer listed in def.showWith (pathways that travel with the organs). */
export function layerAllows(def) {
  if (!def || !def.layer) return true;
  if (!state.layerHidden.has(def.layer)) return true;
  const also = def.showWith || [];
  return also.some((layer) => !state.layerHidden.has(layer));
}

export function isIdVisible(id, def) {
  if (state.hidden.has(id)) return false;
  if (def && !layerAllows(def)) return false;
  if (state.solo) return id === state.solo || isDescendantOf(id, state.solo);
  if (state.isolate) {
    return state.isolate.has(id) || [...state.isolate].some((root) => isDescendantOf(id, root));
  }
  return true;
}

export function isDescendantOf(id, ancestorId) {
  const manifest = state.manifest;
  if (!manifest) return false;
  let cur = manifest.structures.find((s) => s.id === id);
  while (cur && cur.parent) {
    if (cur.parent === ancestorId) return true;
    cur = manifest.structures.find((s) => s.id === cur.parent);
  }
  return false;
}

export function descendantsOf(id) {
  const manifest = state.manifest;
  if (!manifest) return [];
  const out = [];
  const walk = (parentId) => {
    for (const s of manifest.structures) {
      if (s.parent === parentId) {
        out.push(s);
        walk(s.id);
      }
    }
  };
  walk(id);
  return out;
}

export function structureById(id) {
  return state.manifest?.structures.find((s) => s.id === id) || null;
}
