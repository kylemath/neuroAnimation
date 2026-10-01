/**
 * Orthogonal clipping planes with simple coloured caps,
 * midbrain / pons / medulla slice presets, and exploded axial sections.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { scene } from './scene.js';
import { state, emit } from './state.js';
import { setClippingPlanes, applyAppearance } from './structures.js';
import { structureObjects } from './loader.js';
import { mniToWorld } from './coords.js';

const planes = {
  sagittal: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  coronal: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  axial: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
};

const capGroup = new THREE.Group();
capGroup.name = 'clip-caps';
const plateGroup = new THREE.Group();
plateGroup.name = 'clip-plates';

const sectionHome = new Map();

export function initClipping() {
  scene.add(capGroup);
  scene.add(plateGroup);
  bindUi();
  updateClipping();
}

function bindUi() {
  for (const axis of ['sagittal', 'coronal', 'axial']) {
    const enable = document.getElementById(`clip-${axis}-on`);
    const slider = document.getElementById(`clip-${axis}`);
    const flip = document.getElementById(`clip-${axis}-flip`);
    const val = document.getElementById(`clip-${axis}-val`);
    enable.addEventListener('change', () => {
      state.clipping[axis].enabled = enable.checked;
      updateClipping();
    });
    slider.addEventListener('input', () => {
      state.clipping[axis].value = Number(slider.value);
      val.textContent = `${slider.value} mm`;
      updateClipping();
    });
    flip.addEventListener('change', () => {
      state.clipping[axis].flip = flip.checked;
      updateClipping();
    });
  }

  document.getElementById('btn-clips-off').addEventListener('click', () => {
    clearClips();
  });

  document.getElementById('slice-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-slice]');
    if (!btn) return;
    applySlicePreset(btn.dataset.slice);
  });

  document.getElementById('toggle-exploded').addEventListener('change', (e) => {
    setExploded(e.target.checked);
  });
}

export function clearClips() {
  for (const axis of ['sagittal', 'coronal', 'axial']) {
    state.clipping[axis].enabled = false;
    const enable = document.getElementById(`clip-${axis}-on`);
    if (enable) enable.checked = false;
  }
  updateClipping();
}

export function applySlicePreset(id) {
  const preset = (state.manifest.slicePresets || []).find((p) => p.id === id);
  if (!preset) return;
  const axis = preset.plane;
  for (const key of ['sagittal', 'coronal', 'axial']) {
    state.clipping[key].enabled = key === axis;
    const enable = document.getElementById(`clip-${key}-on`);
    if (enable) enable.checked = key === axis;
  }
  state.clipping[axis].value = preset.value;
  const slider = document.getElementById(`clip-${axis}`);
  const val = document.getElementById(`clip-${axis}-val`);
  if (slider) slider.value = String(preset.value);
  if (val) val.textContent = `${preset.value} mm`;
  updateClipping();
  emit('clipping');
}

export function setExploded(on) {
  state.explodedSlices = on;
  const offsets = {
    'section-midbrain': 0,
    'section-pons': 18,
    'section-medulla-rostral': 36,
    'section-medulla-caudal': 54,
  };
  for (const id of Object.keys(offsets)) {
    const rec = structureObjects.get(id);
    if (!rec || !rec.object) continue;
    if (!sectionHome.has(id)) {
      sectionHome.set(id, rec.object.position.clone());
    }
    const home = sectionHome.get(id);
    rec.object.position.copy(home);
    if (on) rec.object.position.z += offsets[id];
    rec.object.visible = on ? true : rec.object.visible;
  }
  if (on) {
    state.layerHidden.delete('slices');
    for (const id of Object.keys(offsets)) state.hidden.delete(id);
    applyAppearance();
  }
  emit('clipping');
}

export function updateClipping() {
  syncPlanes();
  const active = [];
  for (const key of ['sagittal', 'coronal', 'axial']) {
    if (state.clipping[key].enabled) active.push(planes[key]);
  }
  setClippingPlanes(active);
  rebuildCaps(active);
  emit('clipping');
}

function syncPlanes() {
  const sag = state.clipping.sagittal;
  if (sag.flip) {
    planes.sagittal.set(new THREE.Vector3(1, 0, 0), -sag.value);
  } else {
    planes.sagittal.set(new THREE.Vector3(-1, 0, 0), sag.value);
  }

  const cor = state.clipping.coronal;
  if (cor.flip) {
    planes.coronal.set(new THREE.Vector3(0, 0, -1), -cor.value);
  } else {
    planes.coronal.set(new THREE.Vector3(0, 0, 1), cor.value);
  }

  const ax = state.clipping.axial;
  if (ax.flip) {
    planes.axial.set(new THREE.Vector3(0, 1, 0), -ax.value);
  } else {
    planes.axial.set(new THREE.Vector3(0, -1, 0), ax.value);
  }
}

function rebuildCaps() {
  while (capGroup.children.length) {
    const child = capGroup.children[0];
    capGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  while (plateGroup.children.length) {
    const child = plateGroup.children[0];
    plateGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }

  for (const key of ['sagittal', 'coronal', 'axial']) {
    const clip = state.clipping[key];
    if (!clip.enabled) continue;
    addGuidePlate(key, clip.value);
    addStructureCaps(key, clip.value);
  }
}

function addGuidePlate(axis, value) {
  const geo = new THREE.PlaneGeometry(180, 180);
  const mat = new THREE.MeshBasicMaterial({
    color: axis === 'sagittal' ? 0xff6b6b : axis === 'coronal' ? 0x51cf66 : 0x7ae1ff,
    transparent: true,
    opacity: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  if (axis === 'sagittal') {
    mesh.position.copy(mniToWorld(value, 0, 0));
    mesh.rotation.y = Math.PI / 2;
  } else if (axis === 'coronal') {
    mesh.position.copy(mniToWorld(0, value, 0));
  } else {
    mesh.position.copy(mniToWorld(0, 0, value));
    mesh.rotation.x = -Math.PI / 2;
  }
  mesh.renderOrder = 3;
  plateGroup.add(mesh);
}

function addStructureCaps(axis, value) {
  if (!state.manifest) return;
  for (const def of state.manifest.structures) {
    if (def.kind === 'folder' || !def.centroid) continue;
    const rec = structureObjects.get(def.id);
    if (!rec || !rec.object || !rec.object.visible) continue;
    const [cx, cy, cz] = def.centroid;
    const ph = def.placeholder || {};
    const radii = ph.radii || [ph.radius || 8, ph.radius || 8, ph.radius || 8];
    let dist = 0;
    let radius = 8;
    if (axis === 'sagittal') {
      dist = Math.abs(cx - value);
      radius = Math.max(3, Math.sqrt(Math.max(0, radii[1] ** 2 + radii[2] ** 2)) * 0.45);
      if (dist > (radii[0] || 8)) continue;
    } else if (axis === 'coronal') {
      dist = Math.abs(cy - value);
      radius = Math.max(3, Math.sqrt(Math.max(0, radii[0] ** 2 + radii[2] ** 2)) * 0.45);
      if (dist > (radii[1] || 8)) continue;
    } else {
      dist = Math.abs(cz - value);
      radius = Math.max(3, Math.sqrt(Math.max(0, radii[0] ** 2 + radii[1] ** 2)) * 0.45);
      if (dist > (radii[2] || 8)) continue;
    }
    const geo = new THREE.CircleGeometry(radius, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: def.colour || '#88aacc',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(geo, mat);
    if (axis === 'sagittal') {
      disc.position.copy(mniToWorld(value, cy, cz));
      disc.rotation.y = Math.PI / 2;
    } else if (axis === 'coronal') {
      disc.position.copy(mniToWorld(cx, value, cz));
    } else {
      disc.position.copy(mniToWorld(cx, cy, value));
      disc.rotation.x = -Math.PI / 2;
    }
    disc.renderOrder = 40;
    disc.userData.structureId = def.id;
    capGroup.add(disc);
  }
}

export function syncClippingUi() {
  for (const axis of ['sagittal', 'coronal', 'axial']) {
    const clip = state.clipping[axis];
    const enable = document.getElementById(`clip-${axis}-on`);
    const slider = document.getElementById(`clip-${axis}`);
    const flip = document.getElementById(`clip-${axis}-flip`);
    const val = document.getElementById(`clip-${axis}-val`);
    if (enable) enable.checked = clip.enabled;
    if (slider) slider.value = String(clip.value);
    if (flip) flip.checked = clip.flip;
    if (val) val.textContent = `${clip.value} mm`;
  }
  const exp = document.getElementById('toggle-exploded');
  if (exp) exp.checked = state.explodedSlices;
}

export function populateSliceButtons() {
  const host = document.getElementById('slice-presets');
  if (!host || !state.manifest) return;
  host.innerHTML = '';
  for (const p of state.manifest.slicePresets || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.slice = p.id;
    btn.textContent = p.name;
    host.appendChild(btn);
  }
}
