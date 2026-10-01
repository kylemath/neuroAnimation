/**
 * MNI152 millimetres, RAS+  ↔  three.js world
 *
 * Master space: X right, Y anterior, Z superior. Origin near the anterior commissure.
 * Scene mapping (baked into committed GLBs): world = (x, z, -y) so Y is up and anterior is −Z.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export function mniToWorld(x, y, z, target = null) {
  const v = target || new THREE.Vector3();
  return v.set(x, z, -y);
}

export function mniArrayToWorld(mni, target = null) {
  return mniToWorld(mni[0], mni[1], mni[2], target);
}

export function worldToMni(wx, wy, wz) {
  if (wx && typeof wx === 'object') {
    return { x: wx.x, y: -wx.z, z: wx.y };
  }
  return { x: wx, y: -wz, z: wy };
}

export function formatMni(mni, digits = 1) {
  const x = Number(mni.x).toFixed(digits);
  const y = Number(mni.y).toFixed(digits);
  const z = Number(mni.z).toFixed(digits);
  return `${x}, ${y}, ${z}`;
}

/** MNI-aligned radii (rx, ry, rz) become world scale (rx, rz, ry). */
export function mniRadiiToWorldScale(rx, ry, rz, target = null) {
  const v = target || new THREE.Vector3();
  return v.set(rx, rz, ry);
}
