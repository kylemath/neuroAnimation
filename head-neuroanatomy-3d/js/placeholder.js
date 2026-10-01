/**
 * Procedural meshes for the fallback catalog.
 * Geometry is specified in MNI mm and converted to the baked three.js frame.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { mniToWorld, mniRadiiToWorldScale } from './coords.js';

const LOW = typeof window !== 'undefined' && window.innerWidth < 800;

export function createPlaceholderMesh(def, material) {
  const ph = def.placeholder;
  if (!ph) return null;
  const type = ph.type || 'ellipsoid';
  let mesh;

  if (type === 'sphere') {
    const r = ph.radius || 4;
    mesh = new THREE.Mesh(new THREE.SphereGeometry(r, LOW ? 14 : 20, LOW ? 10 : 16), material);
    mesh.position.copy(mniToWorld(ph.center[0], ph.center[1], ph.center[2]));
  } else if (type === 'ellipsoid') {
    const [rx, ry, rz] = ph.radii || [8, 8, 8];
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1, LOW ? 14 : 22, LOW ? 10 : 16), material);
    mesh.position.copy(mniToWorld(ph.center[0], ph.center[1], ph.center[2]));
    mesh.scale.copy(mniRadiiToWorldScale(rx, ry, rz));
  } else if (type === 'box') {
    const [sx, sy, sz] = ph.size || [8, 8, 8];
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.copy(mniToWorld(ph.center[0], ph.center[1], ph.center[2]));
    mesh.scale.copy(mniRadiiToWorldScale(sx, sy, sz));
  } else if (type === 'tube') {
    mesh = createTube(ph.points || [], ph.tubeRadius || 1.2, material);
  } else if (type === 'spiral') {
    mesh = createSpiral(ph, material);
  } else if (type === 'canals') {
    mesh = createCanals(ph, material);
  } else if (type === 'disc') {
    mesh = createDisc(ph, material);
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(ph.radius || 5, 16, 12), material);
    if (ph.center) mesh.position.copy(mniToWorld(ph.center[0], ph.center[1], ph.center[2]));
  }

  if (!mesh) return null;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function createTube(points, radius, material) {
  if (!points || points.length < 2) return null;
  const worldPts = points.map((p) => mniToWorld(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(worldPts);
  const segs = Math.max(8, Math.min(LOW ? 24 : 48, points.length * 8));
  const geo = new THREE.TubeGeometry(curve, segs, radius, LOW ? 6 : 8, false);
  return new THREE.Mesh(geo, material);
}

function createSpiral(ph, material) {
  const center = mniToWorld(ph.center[0], ph.center[1], ph.center[2]);
  const turns = ph.turns || 2.5;
  const radius = ph.radius || 5;
  const height = ph.height || 6;
  const pts = [];
  const n = LOW ? 40 : 70;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2 * turns;
    const r = radius * (1 - t * 0.62);
    pts.push(new THREE.Vector3(Math.cos(a) * r, t * height - height * 0.4, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, n, ph.tubeRadius || 0.8, 6, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(center);
  return mesh;
}

function createCanals(ph, material) {
  const group = new THREE.Group();
  const center = mniToWorld(ph.center[0], ph.center[1], ph.center[2]);
  group.position.copy(center);
  const r = ph.radius || 5.5;
  const tube = ph.tubeRadius || 0.55;
  const rings = [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, 0, Math.PI / 2],
  ];
  for (const [rx, ry, rz] of rings) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, LOW ? 18 : 28), material);
    torus.rotation.set(rx, ry, rz);
    group.add(torus);
  }
  return group;
}

function createDisc(ph, material) {
  const radius = ph.radius || 16;
  const thickness = ph.thickness || 1.4;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, LOW ? 24 : 36), material);
  mesh.position.copy(mniToWorld(ph.center[0], ph.center[1], ph.center[2]));
  const plane = ph.plane || 'axial';
  if (plane === 'axial') {
    // cylinder axis is Y (already superior) — correct for axial plate
  } else if (plane === 'coronal') {
    mesh.rotation.x = Math.PI / 2;
  } else if (plane === 'sagittal') {
    mesh.rotation.z = Math.PI / 2;
  }
  return mesh;
}

export function estimateRadius(def) {
  const ph = def.placeholder;
  if (!ph) return 12;
  if (ph.radius) return ph.radius;
  if (ph.radii) return Math.max(...ph.radii);
  if (ph.size) return Math.max(...ph.size) * 0.5;
  return 12;
}
