/**
 * Visibility, opacity, ghost, solo / isolate, and material appearance.
 */

import { state, emit, descendantsOf, isIdVisible, resetAppearanceState } from './state.js';
import { structureObjects } from './loader.js';

export function effectiveOpacity(def) {
  if (!def || def.kind === 'folder') return 1;
  const base = state.opacityOverride.has(def.id)
    ? state.opacityOverride.get(def.id)
    : (def.opacity ?? 0.9);
  let opacity = base * state.ghost;
  if (state.dimUnselected && state.selected.length && state.selected.indexOf(def.id) === -1) {
    opacity *= 0.18;
  }
  return Math.max(0, Math.min(1, opacity));
}

export function initVisibilityFromManifest() {
  if (!state.manifest) return;
  state.hidden.clear();
  state.layerHidden.clear();
  for (const group of state.manifest.groups || []) {
    if (group.defaultVisible === false && group.layer) {
      state.layerHidden.add(group.layer);
    }
  }
  const layers = new Set(state.manifest.structures.map((s) => s.layer).filter(Boolean));
  for (const layer of layers) {
    const members = state.manifest.structures.filter((s) => s.layer === layer && s.kind !== 'folder');
    if (members.length && members.every((s) => s.defaultVisible === false)) {
      state.layerHidden.add(layer);
    }
  }
}

export function applyAppearance() {
  const manifest = state.manifest;
  if (!manifest) return;

  for (const [id, rec] of structureObjects) {
    const def = rec.def;
    if (!rec.object) continue;
    const visible = isIdVisible(id, def) && def.kind !== 'folder';
    rec.object.visible = visible;
    rec.object.traverse((child) => {
      if (child.isMesh) child.visible = visible;
    });
    if (!visible || !rec.material) continue;

    const opacity = effectiveOpacity(def);
    const selected = state.selected.indexOf(id) !== -1;
    const hovered = state.hover === id;
    rec.material.opacity = opacity;
    rec.material.transparent = opacity < 0.999;
    rec.material.depthWrite = opacity >= 0.85;
    rec.material.visible = opacity > 0.02;
    const glow = selected
      ? 0.42
      : hovered
        ? 0.24
        : (def.layer === 'aras' && state.arasEnabled)
          ? 0.18 + state.arousal * 0.28
          : (def.layer === 'cortex' && state.arasEnabled)
            ? 0.10 + state.arousal * 0.12
            : 0.12;
    if (rec.material.color && rec.material.emissive) {
      rec.material.emissive.copy(rec.material.color).multiplyScalar(glow);
    }
    rec.material.emissiveIntensity = 1;
  }
  emit('appearance');
}

export function setHidden(id, hidden) {
  if (hidden) state.hidden.add(id);
  else state.hidden.delete(id);
  const kids = descendantsOf(id);
  for (const k of kids) {
    if (hidden) state.hidden.add(k.id);
    else state.hidden.delete(k.id);
  }
  applyAppearance();
  emit('visibility');
}

export function setOpacity(id, opacity) {
  state.opacityOverride.set(id, opacity);
  applyAppearance();
}

export function setGhost(value) {
  state.ghost = value;
  applyAppearance();
  emit('ghost', value);
}

export function setSolo(id) {
  state.solo = id || null;
  state.isolate = null;
  applyAppearance();
  emit('visibility');
}

export function setIsolate(id) {
  state.solo = null;
  if (!id) {
    state.isolate = null;
  } else {
    const ids = new Set([id, ...descendantsOf(id).map((s) => s.id)]);
    state.isolate = ids;
  }
  applyAppearance();
  emit('visibility');
}

export function showAll() {
  state.hidden.clear();
  state.layerHidden.clear();
  state.solo = null;
  state.isolate = null;
  applyAppearance();
  emit('visibility');
}

export function hideAll() {
  if (!state.manifest) return;
  for (const s of state.manifest.structures) {
    if (s.kind !== 'folder') state.hidden.add(s.id);
  }
  state.solo = null;
  state.isolate = null;
  applyAppearance();
  emit('visibility');
}

export function resetViewState() {
  resetAppearanceState();
  applyAppearance();
  emit('visibility');
}

export function toggleLayer(layer, visible) {
  if (visible) state.layerHidden.delete(layer);
  else state.layerHidden.add(layer);
  applyAppearance();
  emit('visibility');
}

export function setLayer(layer, visible) {
  toggleLayer(layer, visible);
}

export function isLayerVisible(layer) {
  return !state.layerHidden.has(layer);
}

export function setClippingPlanes(planes) {
  for (const rec of structureObjects.values()) {
    if (!rec.material) continue;
    rec.material.clippingPlanes = planes;
    rec.material.needsUpdate = true;
    rec.object && rec.object.traverse((child) => {
      if (child.isMesh && child.material && child.material !== rec.material) {
        child.material.clippingPlanes = planes;
        child.material.needsUpdate = true;
      }
    });
  }
}

export function setSideVisibility(parentId, side, visible) {
  if (!state.manifest) return;
  const nodes = [state.manifest.structures.find((s) => s.id === parentId), ...descendantsOf(parentId)].filter(Boolean);
  for (const s of nodes) {
    if (s.side === side || (side === 'mid' && s.side === 'mid')) {
      if (visible) state.hidden.delete(s.id);
      else state.hidden.add(s.id);
    }
  }
  applyAppearance();
  emit('visibility');
}
