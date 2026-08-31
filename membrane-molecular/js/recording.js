/**
 * recording.js - Visual representation of electrophysiology recording techniques
 * 
 * Shows 3D models of:
 * - Sharp electrode (intracellular recording)
 * - Patch clamp pipette (whole-cell, cell-attached)
 * - Extracellular electrode
 * - Field potential electrode
 * 
 * Each technique shows the physical setup and highlights what's being recorded
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { scene, SCALE, animationState } from './config.js';
import { recordingState, compartments } from './electrophysiology.js';

// Recording apparatus group
export const recordingGroup = new THREE.Group();

// Current recording setup
let currentSetup = null;
let recordingHighlight = null;
let signalIndicator = null;

// Materials
const materials = {
  glass: new THREE.MeshPhongMaterial({
    color: 0xaaccff,
    transparent: true,
    opacity: 0.4,
    shininess: 100,
    side: THREE.DoubleSide,
  }),
  glassTip: new THREE.MeshPhongMaterial({
    color: 0x88aadd,
    transparent: true,
    opacity: 0.6,
    shininess: 120,
  }),
  electrode: new THREE.MeshPhongMaterial({
    color: 0xcccccc,
    emissive: 0x333333,
    shininess: 80,
  }),
  electrodeActive: new THREE.MeshPhongMaterial({
    color: 0x00ff88,
    emissive: 0x00aa44,
    emissiveIntensity: 0.5,
    shininess: 100,
  }),
  seal: new THREE.MeshPhongMaterial({
    color: 0xff8844,
    emissive: 0x884422,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.7,
  }),
  membrane: new THREE.MeshPhongMaterial({
    color: 0x4a9eff,
    transparent: true,
    opacity: 0.5,
  }),
};

/**
 * Initialize the recording visualization
 */
export function initRecordingVisualization() {
  scene.add(recordingGroup);
  updateRecordingSetup(recordingState.mode);
}

/**
 * Update the recording setup based on mode
 */
export function updateRecordingSetup(mode) {
  // Clear previous setup
  clearRecordingSetup();
  
  // Create new setup based on mode
  switch (mode) {
    case 'intracellular':
      createSharpElectrode();
      break;
    case 'patch_clamp':
      createPatchClampPipette();
      break;
    case 'extracellular':
      createExtracellularElectrode();
      break;
    case 'field':
      createFieldPotentialElectrode();
      break;
  }
}

/**
 * Clear current recording setup
 */
function clearRecordingSetup() {
  while (recordingGroup.children.length > 0) {
    const child = recordingGroup.children[0];
    recordingGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  currentSetup = null;
  recordingHighlight = null;
  signalIndicator = null;
}

/**
 * Create sharp microelectrode for intracellular recording
 * Thin glass pipette that pierces the membrane
 */
function createSharpElectrode() {
  const group = new THREE.Group();
  group.name = 'sharp_electrode';
  
  // Glass pipette body (tapered) - wide at top, narrow at bottom
  const pipetteLength = 60;
  
  // Create tapered profile: wide at top (y=pipetteLength), narrow at bottom (y=0)
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * pipetteLength;
    // Wide at top, narrow at bottom (tip)
    const radius = 0.3 + (4 - 0.3) * Math.pow(t, 0.5);
    points.push(new THREE.Vector2(radius, y));
  }
  
  const pipetteGeo = new THREE.LatheGeometry(points, 16);
  const pipette = new THREE.Mesh(pipetteGeo, materials.glass);
  // Position so wide end is at top, narrow end near y=0
  pipette.position.y = 5;
  group.add(pipette);
  
  // Sharp tip (very fine) - pointing DOWN into membrane
  const tipGeo = new THREE.ConeGeometry(0.3, 8, 8);
  const tip = new THREE.Mesh(tipGeo, materials.glassTip);
  tip.rotation.x = Math.PI; // Flip so point faces down
  tip.position.y = 1; // Below the narrow end of pipette
  group.add(tip);
  
  // Silver/silver-chloride wire inside
  const wireGeo = new THREE.CylinderGeometry(0.08, 0.15, 55, 6); // Narrow at bottom, wide at top
  const wire = new THREE.Mesh(wireGeo, materials.electrode);
  wire.position.y = 32;
  group.add(wire);
  
  // Membrane penetration point - show the electrode piercing
  const penetrationGeo = new THREE.TorusGeometry(0.8, 0.15, 8, 16);
  const penetration = new THREE.Mesh(penetrationGeo, materials.seal);
  penetration.rotation.x = Math.PI / 2;
  penetration.position.y = -3; // At membrane level
  group.add(penetration);
  
  // Position at hillock (typical recording site) - tip pierces membrane
  group.position.set(20, 0, 0);
  group.rotation.z = -0.15; // Slight angle
  group.userData.baseY = 0;
  
  recordingGroup.add(group);
  currentSetup = group;
  
  // Add label
  addLabel(group, 'Sharp Electrode\n(Intracellular)', 0, 70, 0);
}

/**
 * Create patch clamp pipette for whole-cell recording
 * Larger bore pipette that forms gigaohm seal
 */
function createPatchClampPipette() {
  const group = new THREE.Group();
  group.name = 'patch_clamp';
  
  // Glass pipette (wider bore than sharp electrode)
  // Profile: narrow at bottom (tip), wide at top
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * 50;
    // Narrow at bottom (t=0), wide at top (t=1)
    const radius = 1.2 + (5 - 1.2) * Math.pow(t, 0.6);
    points.push(new THREE.Vector2(radius, y));
  }
  
  const pipetteGeo = new THREE.LatheGeometry(points, 16);
  const pipette = new THREE.Mesh(pipetteGeo, materials.glass);
  // Position so narrow tip is near y=0
  pipette.position.y = 5;
  group.add(pipette);
  
  // Blunt tip (fire-polished) - at the bottom of the pipette
  const tipGeo = new THREE.SphereGeometry(1.2, 12, 8);
  tipGeo.scale(1, 0.3, 1);
  const tip = new THREE.Mesh(tipGeo, materials.glassTip);
  tip.position.y = 4; // At bottom of pipette
  group.add(tip);
  
  // Patch of membrane pulled into pipette (whole-cell config)
  const patchGeo = new THREE.SphereGeometry(1.0, 12, 8);
  patchGeo.scale(1, 0.5, 1);
  const patch = new THREE.Mesh(patchGeo, materials.membrane);
  patch.position.y = 6; // Slightly inside the tip
  group.add(patch);
  
  // Gigaohm seal ring - at membrane contact point
  const sealGeo = new THREE.TorusGeometry(1.3, 0.25, 8, 24);
  const seal = new THREE.Mesh(sealGeo, materials.seal);
  seal.rotation.x = Math.PI / 2;
  seal.position.y = 3; // At membrane level
  group.add(seal);
  
  // Electrode wire - narrow at bottom, wide at top
  const wireGeo = new THREE.CylinderGeometry(0.12, 0.2, 45, 6);
  const wire = new THREE.Mesh(wireGeo, materials.electrode);
  wire.position.y = 28;
  group.add(wire);
  
  // Position at soma (typical patch clamp location) - tip on membrane
  group.position.set(-40, 0, 10);
  group.rotation.z = 0.1;
  group.userData.baseY = 0;
  
  recordingGroup.add(group);
  currentSetup = group;
  
  addLabel(group, 'Patch Pipette\n(Whole-Cell)', 0, 60, 0);
}

/**
 * Create extracellular recording electrode
 * Metal electrode positioned near but not penetrating cell
 */
function createExtracellularElectrode() {
  const group = new THREE.Group();
  group.name = 'extracellular';
  
  // Metal electrode shaft
  const shaftGeo = new THREE.CylinderGeometry(1.5, 1.5, 50, 12);
  const shaft = new THREE.Mesh(shaftGeo, materials.electrode);
  shaft.position.y = 35;
  group.add(shaft);
  
  // Tapered tip
  const tipGeo = new THREE.ConeGeometry(1.5, 10, 12);
  const tip = new THREE.Mesh(tipGeo, materials.electrode);
  tip.rotation.x = Math.PI;
  tip.position.y = 5;
  group.add(tip);
  
  // Active recording site (exposed metal)
  const activeSiteGeo = new THREE.CylinderGeometry(0.8, 0.8, 3, 12);
  const activeSite = new THREE.Mesh(activeSiteGeo, materials.electrodeActive);
  activeSite.position.y = 2;
  group.add(activeSite);
  
  // Insulation coating (shows electrode is insulated except at tip)
  const insulationGeo = new THREE.CylinderGeometry(1.8, 1.6, 45, 12);
  const insulation = new THREE.Mesh(insulationGeo, new THREE.MeshPhongMaterial({
    color: 0x444444,
    transparent: true,
    opacity: 0.6,
  }));
  insulation.position.y = 32;
  group.add(insulation);
  
  // Position above membrane (extracellular) - tip near but not touching
  group.position.set(40, 18, -20);
  group.rotation.z = -0.2;
  group.rotation.x = 0.1;
  group.userData.baseY = 18;
  
  recordingGroup.add(group);
  currentSetup = group;
  
  addLabel(group, 'Extracellular\nElectrode', 0, 55, 0);
}

/**
 * Create local field potential electrode
 * Larger electrode for population activity
 */
function createFieldPotentialElectrode() {
  const group = new THREE.Group();
  group.name = 'field_potential';
  
  // Large metal shaft
  const shaftGeo = new THREE.CylinderGeometry(3, 3, 60, 16);
  const shaft = new THREE.Mesh(shaftGeo, materials.electrode);
  shaft.position.y = 45;
  group.add(shaft);
  
  // Blunt tip with larger recording surface
  const tipGeo = new THREE.SphereGeometry(3, 16, 12);
  tipGeo.scale(1, 0.5, 1);
  const tip = new THREE.Mesh(tipGeo, materials.electrodeActive);
  tip.position.y = 12;
  group.add(tip);
  
  // Position to sample from multiple compartments (above membrane)
  group.position.set(0, 22, 0);
  group.userData.baseY = 22;
  
  recordingGroup.add(group);
  currentSetup = group;
  
  addLabel(group, 'LFP Electrode\n(Field Potential)', 0, 60, 0);
}

/**
 * Add text label to recording setup
 */
function addLabel(parent, text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(line, 128, 50 + i * 30);
  });
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(20, 10, 1);
  sprite.position.set(x, y, z);
  parent.add(sprite);
}

/**
 * Update recording visualization each frame
 */
export function updateRecordingVisualization(deltaTime) {
  if (!currentSetup) return;
  
  const time = animationState.time;
  
  // Gentle bobbing motion for electrode (very subtle)
  if (currentSetup && currentSetup.userData.baseY !== undefined) {
    currentSetup.position.y = currentSetup.userData.baseY + Math.sin(time * 1.5) * 0.05;
  }
  
  // Animate electrode wire glow based on voltage (conducting)
  if (currentSetup) {
    currentSetup.traverse((child) => {
      if (child.material === materials.electrode || child.material === materials.electrodeActive) {
        const voltage = compartments ? compartments.hillock.voltage : -70;
        const intensity = Math.max(0, (voltage + 70) / 110);
        if (child.material.emissiveIntensity !== undefined) {
          child.material.emissiveIntensity = 0.1 + intensity * 0.4;
        }
      }
    });
  }
}

/**
 * Set recording position (for user interaction)
 */
export function setRecordingPosition(x, z) {
  if (currentSetup) {
    currentSetup.position.x = x;
    currentSetup.position.z = z;
    
    if (recordingHighlight) {
      recordingHighlight.position.x = x;
      recordingHighlight.position.z = z;
    }
  }
}
