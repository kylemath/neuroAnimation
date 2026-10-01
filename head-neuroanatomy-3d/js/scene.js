/**
 * Renderer, camera, lights, OrbitControls, view buttons, fly-to.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js';
import { state, emit } from './state.js';

export let renderer;
export let scene;
export let camera;
export let controls;
export const clock = new THREE.Clock();

let container;
let flying = false;
let headlight = null;

const VIEW_DISTANCE = 260;

export const VIEWS = {
  left: { name: 'left', position: [-VIEW_DISTANCE, 10, 0], target: [0, 0, 0] },
  right: { name: 'right', position: [VIEW_DISTANCE, 10, 0], target: [0, 0, 0] },
  anterior: { name: 'anterior', position: [0, 10, -VIEW_DISTANCE], target: [0, 0, 0] },
  posterior: { name: 'posterior', position: [0, 10, VIEW_DISTANCE], target: [0, 0, 0] },
  superior: { name: 'superior', position: [0, VIEW_DISTANCE, 0], target: [0, 0, 0] },
  inferior: { name: 'inferior', position: [0, -VIEW_DISTANCE, 0], target: [0, 0, 0] },
  oblique: { name: 'oblique', position: [170, 110, 190], target: [0, 0, 0] },
};

export function initScene() {
  container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);
  scene.fog = new THREE.Fog(0x0b0f17, 420, 900);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.set(170, 110, 190);
  camera.up.set(0, 1, 0);

  const mobile = window.innerWidth < 800;
  renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2));
  renderer.localClippingEnabled = true;
  renderer.sortObjects = true;
  renderer.physicallyCorrectLights = false;
  // Linear output (same as the other demos). sRGB output on top of sRGB hex colours
  // washes everything towards white and flattens the structures.
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.setClearColor(0x0b0f17, 1);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 40;
  controls.maxDistance = 700;
  controls.target.set(0, 0, 0);
  controls.update();

  // Phong lighting, same recipe as action-potential-3d: ambient + key + fill.
  // Hemisphere keeps the underside readable; rim separates the silhouette.
  // Lower ambient + a headlight that follows the camera give every surface a clear
  // light-to-dark gradient from the viewer's side, so neighbouring structures separate.
  const ambient = new THREE.AmbientLight(0xffffff, 0.34);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x1c1812, 0.32);
  scene.add(hemi);
  headlight = new THREE.DirectionalLight(0xffffff, 0.82);
  scene.add(headlight);
  scene.add(headlight.target);
  const key = new THREE.DirectionalLight(0xfff4e0, 0.38);
  key.position.set(80, 140, 60);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.2);
  fill.position.set(-90, 40, -70);
  scene.add(fill);

  window.addEventListener('resize', onResize);
  return { scene, camera, renderer, controls };
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  emit('resize');
}

export function renderScene(extra) {
  controls.update();
  if (headlight) {
    // Slightly above and to the left of the viewing direction for a natural 3/4 light.
    const dir = camera.position.clone().sub(controls.target);
    const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize().multiplyScalar(-dir.length() * 0.25);
    const lift = camera.up.clone().multiplyScalar(dir.length() * 0.35);
    headlight.position.copy(camera.position).add(side).add(lift);
    headlight.target.position.copy(controls.target);
    headlight.target.updateMatrixWorld();
  }
  renderer.autoClear = true;
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);
  renderer.autoClear = false;
  if (extra) extra();
  renderer.autoClear = true;
}

export function setView(name, duration = 700) {
  const view = VIEWS[name];
  if (!view) return;
  state.viewName = name;
  flyCamera(
    new THREE.Vector3().fromArray(view.position),
    new THREE.Vector3().fromArray(view.target),
    duration,
  );
  emit('view', name);
}

export function flyToWorld(target, distance = 110, duration = 700) {
  const offset = camera.position.clone().sub(controls.target);
  if (offset.length() < 1) offset.set(80, 50, 90);
  offset.setLength(distance);
  flyCamera(target.clone().add(offset), target.clone(), duration);
}

function flyCamera(endPos, endTarget, duration) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const t0 = performance.now();
  flying = true;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const e = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
    else flying = false;
  };
  requestAnimationFrame(step);
}

export function isFlying() {
  return flying;
}

export function getCanvas() {
  return renderer.domElement;
}
