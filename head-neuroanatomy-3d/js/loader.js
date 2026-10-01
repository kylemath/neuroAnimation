/**
 * Load assets/structures.json and group GLBs.
 * Missing files fall back to the bundled schematic catalog and procedural meshes.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { createFallbackManifest } from './fallback-catalog.js';
import { createPlaceholderMesh } from './placeholder.js';
import { state, emit } from './state.js';

const STRUCTURES_URL = new URL('../assets/structures.json', import.meta.url).href;

export const structureObjects = new Map();
export const groupRoots = new Map();
export const pickables = [];

let gltfLoader = null;

function getLoader() {
  if (gltfLoader) return gltfLoader;
  gltfLoader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    gltfLoader.setDRACOLoader(draco);
  } catch (err) {
    console.warn('DRACO loader not available', err);
  }
  return gltfLoader;
}

function setProgress(label, fraction, onProgress) {
  if (onProgress) onProgress(label, fraction);
}

export async function loadManifest(onProgress) {
  setProgress('Reading structures.json…', 0.02, onProgress);
  let manifest = null;
  let fromAssets = false;
  try {
    const res = await fetch(STRUCTURES_URL, { cache: 'no-cache' });
    if (res.ok) {
      manifest = await res.json();
      fromAssets = true;
    }
  } catch (err) {
    console.warn('assets/structures.json not fetched; using bundled catalog', err);
  }

  if (!manifest || !Array.isArray(manifest.structures) || !manifest.structures.length) {
    manifest = createFallbackManifest();
    fromAssets = false;
  }

  normalizeManifest(manifest);
  state.manifest = manifest;
  state.loadedFromAssets = fromAssets;
  emit('manifest', manifest);
  return manifest;
}

function normalizeSide(side) {
  const s = String(side || 'mid').toLowerCase();
  if (s === 'l' || s === 'left' || s === 'lh') return 'L';
  if (s === 'r' || s === 'right' || s === 'rh') return 'R';
  return 'mid';
}

function resolveAssetPath(asset) {
  if (!asset) return null;
  if (/^https?:/i.test(asset)) return asset;
  const cleaned = String(asset).replace(/^\.\//, '');
  return cleaned.startsWith('assets/') ? cleaned : `assets/${cleaned}`;
}

function mergeAuthoredText(manifest) {
  const fallback = createFallbackManifest();
  if (!manifest.credits) manifest.credits = fallback.credits;
  if (!manifest.fiducials || !manifest.fiducials.length) manifest.fiducials = fallback.fiducials;
  if (!manifest.slicePresets || !manifest.slicePresets.length) manifest.slicePresets = fallback.slicePresets;

  const byId = new Map(fallback.structures.map((s) => [s.id, s]));
  const byNode = new Map();
  const byName = new Map();
  for (const s of fallback.structures) {
    if (s.meshNode) byNode.set(s.meshNode, s);
    if (s.name) byName.set(s.name.toLowerCase(), s);
  }

  const knownGroups = new Set((manifest.groups || []).map((g) => g.id));
  for (const g of fallback.groups) {
    if (!knownGroups.has(g.id)) {
      manifest.groups.push(g);
      knownGroups.add(g.id);
    }
  }

  for (const s of manifest.structures) {
    const src = byId.get(s.id) || byNode.get(s.meshNode) || byName.get((s.name || '').toLowerCase());
    if (!src) continue;
    if (!s.function) s.function = src.function;
    if (!s.clinical) s.clinical = src.clinical;
    if (!s.chapter6) s.chapter6 = src.chapter6;
    if (!s.connected || !s.connected.length) s.connected = src.connected;
    if (!s.source) s.source = src.source;
    if (!s.licence && !s.license) s.licence = src.licence;
    if (!s.transmitter) s.transmitter = src.transmitter;
    if (!s.cn) s.cn = src.cn;
    if (!s.placeholder && src.placeholder) s.placeholder = src.placeholder;
    if (!s.layer && src.layer) s.layer = src.layer;
    if (s.opacity === undefined && src.opacity !== undefined) s.opacity = src.opacity;
  }
}

function normalizeManifest(manifest) {
  if (!manifest.groups) manifest.groups = [];
  if (!manifest.structures) manifest.structures = [];
  if (!manifest.fiducials) manifest.fiducials = [];
  if (!manifest.slicePresets) manifest.slicePresets = [];

  for (const g of manifest.groups) {
    g.asset = resolveAssetPath(g.asset);
    if (!g.layer) g.layer = g.id;
    if (g.defaultVisible === undefined) g.defaultVisible = true;
  }

  mergeAuthoredText(manifest);

  for (const s of manifest.structures) {
    s.meshNode = s.meshNode || s.mesh || null;
    s.colour = s.colour || s.color || '#88aacc';
    s.licence = s.licence || s.license || '';
    s.side = normalizeSide(s.side);
    if (!s.kind) {
      s.kind = s.meshNode || s.placeholder ? 'mesh' : 'folder';
    }
    if (!s.layer) {
      const g = manifest.groups.find((gr) => gr.id === s.group);
      s.layer = s.layer || (g && g.layer) || s.group || 'core';
    }
    if (s.defaultVisible === undefined) {
      const g = manifest.groups.find((gr) => gr.id === s.group);
      s.defaultVisible = g ? g.defaultVisible !== false : true;
    }
    if (s.opacity === undefined) s.opacity = 0.9;
    if (!s.connected) s.connected = [];
  }

  const ids = new Set(manifest.structures.map((s) => s.id));
  for (const s of manifest.structures) {
    if (s.parent && !ids.has(s.parent)) s.parent = null;
  }
}

function parseColor(value) {
  const color = new THREE.Color();
  try {
    if (value) color.set(value);
  } catch (err) {
    color.set('#88aacc');
  }
  if (color.r + color.g + color.b < 0.05) color.set('#88aacc');
  return color;
}

function prepareGeometry(geo) {
  if (!geo || !geo.attributes) return;
  if (geo.attributes.color) geo.deleteAttribute('color');
  if (!geo.attributes.normal) geo.computeVertexNormals();
}

function makeMaterial(def) {
  const color = parseColor(def && def.colour);
  const opacity = def && def.opacity != null ? def.opacity : 0.9;
  return new THREE.MeshPhongMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.14),
    specular: new THREE.Color(0x668899),
    shininess: 22,
    transparent: opacity < 0.999,
    opacity,
    depthWrite: opacity >= 0.85,
    side: THREE.DoubleSide,
    vertexColors: false,
    clippingPlanes: [],
    clipShadows: true,
    flatShading: false,
  });
}

function ancestorNames(obj) {
  const names = [];
  let cur = obj;
  while (cur) {
    if (cur.name) names.push(cur.name);
    cur = cur.parent;
  }
  return names;
}

function collectMeshes(root) {
  const byName = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    prepareGeometry(obj.geometry);
    for (const name of ancestorNames(obj)) {
      byName.set(name, obj);
      byName.set(name.toLowerCase(), obj);
    }
  });
  return byName;
}

function convertLeftoverMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || (obj.material && obj.material.isMeshPhongMaterial)) return;
    prepareGeometry(obj.geometry);
    const src = obj.material;
    const color = parseColor(src && src.color);
    obj.material = new THREE.MeshPhongMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.12),
      specular: new THREE.Color(0x445566),
      shininess: 18,
      transparent: Boolean(src && src.transparent),
      opacity: src && src.opacity != null ? src.opacity : 1,
      depthWrite: !src || src.opacity == null || src.opacity >= 0.85,
      side: THREE.DoubleSide,
      vertexColors: false,
    });
  });
}

function findNode(byName, def) {
  const keys = [def.meshNode, def.id, def.meshNode && def.meshNode.toLowerCase(), def.id && def.id.toLowerCase()];
  for (const key of keys) {
    if (key && byName.has(key)) return byName.get(key);
  }
  return null;
}

function tagObject(obj, def, material, fromAsset) {
  obj.userData.structureId = def.id;
  obj.userData.fromAsset = fromAsset;
  if (obj.isMesh) {
    if (material) obj.material = material;
    pickables.push(obj);
  }
  obj.traverse((child) => {
    if (child.isMesh) {
      child.userData.structureId = def.id;
      child.userData.fromAsset = fromAsset;
      if (material) child.material = material;
      if (pickables.indexOf(child) === -1) pickables.push(child);
    }
  });
}

async function tryLoadGlb(url) {
  const loader = getLoader();
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      () => resolve(null),
    );
  });
}

export async function loadGroups(scene, onProgress) {
  const manifest = state.manifest;
  const groups = manifest.groups || [];
  const total = Math.max(1, groups.length);
  let loadedAssets = 0;
  state.missingAssets = [];
  pickables.length = 0;
  structureObjects.clear();
  groupRoots.clear();

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const root = new THREE.Group();
    root.name = `group-${group.id}`;
    root.userData.groupId = group.id;
    scene.add(root);
    groupRoots.set(group.id, root);

    const label = `Loading ${group.name}…`;
    setProgress(label, 0.08 + (i / total) * 0.8, onProgress);

    let gltf = null;
    if (group.asset) {
      const url = /^https?:/i.test(group.asset)
        ? group.asset
        : new URL(`../${group.asset}`, import.meta.url).href;
      gltf = await tryLoadGlb(url);
      if (!gltf) {
        state.missingAssets.push(group.asset);
      } else {
        loadedAssets += 1;
        state.loadedGroups.add(group.id);
        root.add(gltf.scene);
      }
    }

    const byName = gltf ? collectMeshes(gltf.scene) : new Map();
    const defs = manifest.structures.filter((s) => s.group === group.id);

    for (const def of defs) {
      if (def.kind === 'folder') {
        structureObjects.set(def.id, { def, object: null, material: null, fromAsset: false });
        continue;
      }
      const material = makeMaterial(def);
      let object = findNode(byName, def);
      let fromAsset = Boolean(object);
      if (object) {
        tagObject(object, def, material, true);
      } else {
        object = createPlaceholderMesh(def, material);
        if (!object && def.centroid) {
          object = createPlaceholderMesh({
            placeholder: { type: 'sphere', center: def.centroid, radius: 4 },
          }, material);
        }
        if (object) {
          object.name = def.meshNode || def.id;
          tagObject(object, def, material, false);
          root.add(object);
        }
      }
      if (object) {
        object.renderOrder = (group.renderOrder || 10) + (def.opacity < 0.99 ? 5 : 0);
      }
      structureObjects.set(def.id, { def, object, material, fromAsset });
    }
    if (gltf) convertLeftoverMaterials(gltf.scene);
  }

  state.usingPlaceholders = loadedAssets === 0;
  setProgress('Ready', 1, onProgress);
  emit('loaded', { loadedAssets, missing: state.missingAssets });
  return structureObjects;
}

export function getStructureObject(id) {
  return structureObjects.get(id) || null;
}

export function getWorldCentroid(def) {
  const rec = structureObjects.get(def.id);
  if (rec && rec.object) {
    const box = new THREE.Box3().setFromObject(rec.object);
    if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
  }
  if (def.centroid) {
    return new THREE.Vector3(def.centroid[0], def.centroid[2], -def.centroid[1]);
  }
  return new THREE.Vector3();
}
