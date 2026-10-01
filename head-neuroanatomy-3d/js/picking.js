/**
 * Raycast hover + click highlight. Shift-click multi-selects. Double-click flies to.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { camera, getCanvas, flyToWorld } from './scene.js';
import { pickables, getWorldCentroid, getStructureObject } from './loader.js';
import { applyAppearance } from './structures.js';
import { state, emit, structureById } from './state.js';
import { worldToMni } from './coords.js';
import { estimateRadius } from './placeholder.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let tooltip;
let handlers = {};

export function initPicking(opts) {
  handlers = opts || {};
  tooltip = document.getElementById('hover-tooltip');
  const canvas = getCanvas();
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('pointerleave', () => {
    state.hover = null;
    hideTooltip();
    applyAppearance();
  });
}

function ndcFromEvent(event) {
  const rect = getCanvas().getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function visiblePickables() {
  return pickables.filter((mesh) => {
    if (!mesh.visible) return false;
    const id = mesh.userData.structureId;
    if (!id) return false;
    const rec = getStructureObject(id);
    if (!rec || !rec.material) return false;
    if (rec.material.opacity < 0.05) return false;
    return true;
  });
}

function firstHit(event) {
  ndcFromEvent(event);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(visiblePickables(), true);
  if (!hits.length) return null;
  const hit = hits[0];
  let obj = hit.object;
  while (obj && !obj.userData.structureId) obj = obj.parent;
  if (!obj) return null;
  return { hit, id: obj.userData.structureId, point: hit.point };
}

function onMove(event) {
  const found = firstHit(event);
  const id = found ? found.id : null;
  if (state.hover !== id) {
    state.hover = id;
    applyAppearance();
    emit('hover', id);
  }
  if (found) {
    const def = structureById(found.id);
    showTooltip(event, def);
    const mni = worldToMni(found.point);
    state.pickMni = mni;
    if (handlers.onMni) handlers.onMni(mni, 'cursor');
  } else {
    hideTooltip();
    if (handlers.onMni) handlers.onMni(null);
  }
}

function onClick(event) {
  const found = firstHit(event);
  if (!found) {
    if (!event.shiftKey) {
      state.selected = [];
      applyAppearance();
      emit('selection', state.selected);
      if (handlers.onSelect) handlers.onSelect(null, event);
    }
    return;
  }
  if (event.shiftKey) {
    const idx = state.selected.indexOf(found.id);
    if (idx === -1) state.selected = state.selected.concat(found.id);
    else state.selected = state.selected.filter((x) => x !== found.id);
  } else {
    state.selected = [found.id];
  }
  const mni = worldToMni(found.point);
  state.pickMni = mni;
  applyAppearance();
  emit('selection', state.selected);
  if (handlers.onSelect) handlers.onSelect(found.id, event);
  if (handlers.onMni) handlers.onMni(mni, 'picked');
}

function onDblClick(event) {
  const found = firstHit(event);
  if (!found) return;
  const def = structureById(found.id);
  const rec = getStructureObject(found.id);
  const center = rec && rec.object ? getWorldCentroid(def) : found.point;
  const radius = estimateRadius(def);
  flyToWorld(center, Math.max(60, radius * 4.5));
  state.selected = [found.id];
  applyAppearance();
  emit('selection', state.selected);
  if (handlers.onSelect) handlers.onSelect(found.id, event);
}

function showTooltip(event, def) {
  if (!tooltip || !def) return;
  tooltip.hidden = false;
  tooltip.textContent = def.schematic ? `${def.name} · schematic` : def.name;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
}

export function selectById(id, additive) {
  if (!id) {
    state.selected = [];
  } else if (additive) {
    if (state.selected.indexOf(id) === -1) state.selected = state.selected.concat(id);
  } else {
    state.selected = [id];
  }
  applyAppearance();
  emit('selection', state.selected);
}

export function flyToId(id) {
  const def = structureById(id);
  if (!def) return;
  const center = getWorldCentroid(def);
  flyToWorld(center, Math.max(70, estimateRadius(def) * 4.5));
}
