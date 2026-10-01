/**
 * Orientation gizmo (R/L A/P S/I), AC origin axes, 10 mm grid, scale bar,
 * fiducials, and live MNI readout.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { scene, camera, renderer, controls } from './scene.js';
import { mniToWorld, worldToMni, formatMni } from './coords.js';
import { state } from './state.js';

const gizmoScene = new THREE.Scene();
const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
let scaleBarEl;
let mniEl;
let fiducialGroup;

function makeLabelSprite(text, color, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 78px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function addAxis(parent, dir, color, label, labelPos) {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    dir.clone().multiplyScalar(1.15),
  ]);
  parent.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color, linewidth: 2 })));
  const spr = makeLabelSprite(label, color, 0.55);
  spr.position.copy(labelPos);
  parent.add(spr);
}

export function initFrame() {
  const grid = new THREE.GridHelper(200, 20, 0x2a3b55, 0x1a2436);
  grid.position.y = 0;
  grid.renderOrder = 0;
  scene.add(grid);

  const axes = new THREE.AxesHelper(40);
  axes.renderOrder = 2;
  scene.add(axes);

  const acDot = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  acDot.position.set(0, 0, 0);
  scene.add(acDot);

  const acLabel = makeLabelSprite('AC', '#e6edf3', 8);
  acLabel.position.set(6, 8, 0);
  scene.add(acLabel);

  addWorldAxisLabel('R', 48, 0, 0, '#ff6b6b');
  addWorldAxisLabel('L', -48, 0, 0, '#ff6b6b');
  addWorldAxisLabel('A', 0, 0, -48, '#51cf66');
  addWorldAxisLabel('P', 0, 0, 48, '#51cf66');
  addWorldAxisLabel('S', 0, 48, 0, '#7ae1ff');
  addWorldAxisLabel('I', 0, -48, 0, '#7ae1ff');

  buildGizmo();
  buildFiducials();

  scaleBarEl = document.getElementById('scale-bar');
  mniEl = document.getElementById('mni-readout');
}

function addWorldAxisLabel(text, x, y, z, color) {
  const spr = makeLabelSprite(text, color, 10);
  spr.position.set(x, y, z);
  scene.add(spr);
}

function buildGizmo() {
  addAxis(gizmoScene, new THREE.Vector3(1, 0, 0), '#ff6b6b', 'R', new THREE.Vector3(1.45, 0, 0));
  addAxis(gizmoScene, new THREE.Vector3(-1, 0, 0), '#ff6b6b', 'L', new THREE.Vector3(-1.45, 0, 0));
  addAxis(gizmoScene, new THREE.Vector3(0, 0, -1), '#51cf66', 'A', new THREE.Vector3(0, 0, -1.45));
  addAxis(gizmoScene, new THREE.Vector3(0, 0, 1), '#51cf66', 'P', new THREE.Vector3(0, 0, 1.45));
  addAxis(gizmoScene, new THREE.Vector3(0, 1, 0), '#7ae1ff', 'S', new THREE.Vector3(0, 1.45, 0));
  addAxis(gizmoScene, new THREE.Vector3(0, -1, 0), '#7ae1ff', 'I', new THREE.Vector3(0, -1.45, 0));
}

function buildFiducials() {
  fiducialGroup = new THREE.Group();
  fiducialGroup.name = 'fiducials';
  scene.add(fiducialGroup);
}

export function refreshFiducials() {
  if (!fiducialGroup || !state.manifest) return;
  while (fiducialGroup.children.length) fiducialGroup.remove(fiducialGroup.children[0]);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb86b });
  for (const f of state.manifest.fiducials || []) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), mat);
    ball.position.copy(mniToWorld(f.mni[0], f.mni[1], f.mni[2]));
    ball.userData.fiducial = f;
    fiducialGroup.add(ball);
    const label = makeLabelSprite(f.id.toUpperCase(), '#ffb86b', 10);
    label.position.copy(ball.position).add(new THREE.Vector3(0, 8, 0));
    fiducialGroup.add(label);
  }
}

export function renderGizmo() {
  const size = window.innerWidth < 800 ? 72 : 96;
  const pad = 12;
  const x = pad;
  const y = pad;
  const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(4.2);
  gizmoCamera.position.copy(offset);
  gizmoCamera.up.copy(camera.up);
  gizmoCamera.lookAt(0, 0, 0);
  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, size, size);
  renderer.setScissor(x, y, size, size);
  renderer.render(gizmoScene, gizmoCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}

export function updateScaleBar() {
  if (!scaleBarEl) return;
  const p1 = new THREE.Vector3(-5, 0, 0).project(camera);
  const p2 = new THREE.Vector3(5, 0, 0).project(camera);
  let mm = 10;
  let px = Math.abs(p2.x - p1.x) * 0.5 * window.innerWidth;
  if (px < 36) {
    mm = 50;
    px *= 5;
  }
  px = Math.max(24, Math.min(180, px));
  const fill = scaleBarEl.querySelector('.scale-bar-fill');
  const label = scaleBarEl.querySelector('span');
  if (fill) fill.style.width = `${px}px`;
  if (label) label.textContent = `${mm} mm`;
}

export function setMniReadout(mni, source) {
  if (!mniEl) return;
  if (!mni) {
    mniEl.innerHTML = `MNI <span class="mni-empty">—</span>`;
    return;
  }
  mniEl.innerHTML = `MNI <strong>${formatMni(mni)}</strong> <span class="mni-src">${source || ''}</span>`;
}

export function mniFromWorld(vec) {
  return worldToMni(vec);
}
