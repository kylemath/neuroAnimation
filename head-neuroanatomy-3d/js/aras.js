/**
 * Schematic ARAS: AAN nuclei glow, dorsal / ventral pathway tubes, pulse particles,
 * arousal slider (sleep → awake).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { scene } from './scene.js';
import { state, emit } from './state.js';
import { applyAppearance } from './structures.js';
import { mniToWorld } from './coords.js';

// Shift from published MNI AAN coordinates into the rendered brainstem mesh.
// Keep in sync with AAN_OFFSET_MNI and aan_anterior_tuck() in tools/viewer_map.py.
const ARAS_OFFSET_MNI = [3, 21, 0];

// Pontine nodes still sit behind the Allen tegmentum after the offset above.
// Tuck them anterior into the brainstem; fade the tuck out by the rostral midbrain.
function arasAnteriorTuck(y) {
  if (y >= -1) return 0;
  return Math.min(8, -0.5 * (y + 1));
}

function adjustedMni(p) {
  const x = p[0] + ARAS_OFFSET_MNI[0];
  const y0 = p[1] + ARAS_OFFSET_MNI[1];
  const z = p[2] + ARAS_OFFSET_MNI[2];
  return [x, y0 + arasAnteriorTuck(y0), z];
}

const DORSAL = [
  [0, -36, -42],
  [0, -28, -20],
  [0, -26, -12],
  [0, -29, -8],
  [0, -20, 2],
  [0, -8, 28],
  [0, -4, 52],
];

const VENTRAL = [
  [0, -36, -44],
  [0, -26, -20],
  [0, -16, -12],
  [0, -2, -12],
  [0, 10, -8],
  [0, 16, 8],
  [0, 8, 36],
];

let root;
let pulses = [];
let dorsalTube;
let ventralTube;

export function initAras() {
  root = new THREE.Group();
  root.name = 'aras-schematic';
  scene.add(root);
  dorsalTube = addPath(DORSAL, 0x3a86ff, 'dorsal');
  ventralTube = addPath(VENTRAL, 0xff9f1c, 'ventral');
  spawnPulses(dorsalTube.userData.curve, 0x7ae1ff, 10);
  spawnPulses(ventralTube.userData.curve, 0xffb86b, 10);
  bindUi();
  setEnabled(state.arasEnabled);
}

function addPath(mniPts, color, name) {
  const pts = mniPts.map((p) => {
    const [x, y, z] = adjustedMni(p);
    return mniToWorld(x, y, z);
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 64, 1.05, 8, false);
  const mat = new THREE.MeshPhongMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.35),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `aras-${name}`;
  mesh.userData.curve = curve;
  mesh.userData.kind = 'aras-path';
  mesh.userData.schematic = true;
  root.add(mesh);
  return mesh;
}

function spawnPulses(curve, color, count) {
  const geo = new THREE.SphereGeometry(1.5, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.t = i / count;
    mesh.userData.curve = curve;
    root.add(mesh);
    pulses.push(mesh);
  }
}

function bindUi() {
  const toggle = document.getElementById('aras-toggle');
  const slider = document.getElementById('arousal-slider');
  const val = document.getElementById('arousal-val');
  toggle.addEventListener('change', () => {
    setEnabled(toggle.checked);
  });
  slider.addEventListener('input', () => {
    state.arousal = Number(slider.value) / 100;
    val.textContent = arousalLabel(state.arousal);
    applyAppearance();
    emit('aras');
  });
}

export function setEnabled(on) {
  state.arasEnabled = on;
  if (root) root.visible = on;
  const toggle = document.getElementById('aras-toggle');
  if (toggle) toggle.checked = on;
  applyAppearance();
  emit('aras');
}

export function setArousal(value) {
  state.arousal = value;
  const slider = document.getElementById('arousal-slider');
  const val = document.getElementById('arousal-val');
  if (slider) slider.value = String(Math.round(value * 100));
  if (val) val.textContent = arousalLabel(value);
  applyAppearance();
}

function arousalLabel(v) {
  if (v < 0.25) return 'Sleep';
  if (v < 0.5) return 'Drowsy';
  if (v < 0.8) return 'Awake';
  return 'Alert';
}

export function updateAras(dt) {
  if (!root || !root.visible) return;
  const speed = 0.08 + state.arousal * 0.55;
  for (const p of pulses) {
    p.userData.t = (p.userData.t + dt * speed) % 1;
    p.position.copy(p.userData.curve.getPointAt(p.userData.t));
    const s = 0.7 + state.arousal * 0.9;
    p.scale.setScalar(s);
  }
  if (dorsalTube) dorsalTube.material.opacity = 0.28 + state.arousal * 0.45;
  if (ventralTube) ventralTube.material.opacity = 0.28 + state.arousal * 0.45;
}

export function syncArasUi() {
  const toggle = document.getElementById('aras-toggle');
  const slider = document.getElementById('arousal-slider');
  const val = document.getElementById('arousal-val');
  if (toggle) toggle.checked = state.arasEnabled;
  if (slider) slider.value = String(Math.round(state.arousal * 100));
  if (val) val.textContent = arousalLabel(state.arousal);
}
