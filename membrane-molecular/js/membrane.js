/**
 * membrane.js - Lipid bilayer creation and dynamics
 * OPTIMIZED VERSION using InstancedMesh for performance
 * Creates individual lipid molecules with heads and optional tails
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, membraneGroup, ionGroup,
  SCALE, COLORS, BROWNIAN,
  lipids, cholesterols, waterMolecules,
  animationState, geometryCache,
  getMembraneSurfaceY
} from './config.js';

// Instanced meshes for performance
let outerHeadsInstanced = null;
let innerHeadsInstanced = null;
let outerTailsInstanced = null;
let innerTailsInstanced = null;
let cholesterolInstanced = null;

// Data arrays for instance transforms
let outerLipidData = [];
let innerLipidData = [];
let cholesterolData = [];

// Dummy object for matrix calculations
const dummy = new THREE.Object3D();
const tempMatrix = new THREE.Matrix4();

// Shared geometries
let lipidHeadGeometry;
let lipidTailGeometry;
let cholesterolGeometry;
let waterGeometry;

// Materials
let lipidHeadMaterial;
let lipidTailMaterial;
let cholesterolMaterial;
let waterMaterial;

/**
 * Initialize shared geometries and materials - SIMPLIFIED for performance
 */
function initGeometries() {
  // Lipid head - LOW POLY sphere
  lipidHeadGeometry = new THREE.SphereGeometry(SCALE.LIPID_HEAD_DIAMETER / 2, 6, 4);
  lipidHeadGeometry.scale(1, 0.7, 1);
  
  // Lipid tail - very simple cylinder
  lipidTailGeometry = new THREE.CylinderGeometry(0.12, 0.08, SCALE.LIPID_TAIL_LENGTH * 1.5, 4);
  
  // Cholesterol - simple ellipsoid
  cholesterolGeometry = new THREE.SphereGeometry(0.35, 5, 4);
  cholesterolGeometry.scale(1, 2.0, 0.8);
  
  // Water molecule - tiny sphere
  waterGeometry = new THREE.SphereGeometry(0.15, 4, 3);
  
  // Materials
  lipidHeadMaterial = new THREE.MeshPhongMaterial({
    color: COLORS.lipidHead,
    emissive: COLORS.lipidHead,
    emissiveIntensity: 0.15,
    shininess: 40,
  });
  
  lipidTailMaterial = new THREE.MeshPhongMaterial({
    color: COLORS.lipidTail,
    emissive: 0x112233,
    emissiveIntensity: 0.1,
    shininess: 20,
    transparent: true,
    opacity: 0.6,
  });
  
  cholesterolMaterial = new THREE.MeshPhongMaterial({
    color: COLORS.cholesterol,
    emissive: COLORS.cholesterol,
    emissiveIntensity: 0.2,
    shininess: 60,
  });
  
  waterMaterial = new THREE.MeshPhongMaterial({
    color: COLORS.water,
    emissive: COLORS.water,
    emissiveIntensity: 0.1,
    shininess: 90,
    transparent: true,
    opacity: 0.25,
  });
  
  geometryCache.lipidHead = lipidHeadGeometry;
  geometryCache.lipidTail = lipidTailGeometry;
}

/**
 * Create the lipid bilayer membrane using instanced meshes
 */
export function createMembrane() {
  initGeometries();
  
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  const spacing = SCALE.LIPID_SPACING;
  
  // Calculate grid
  const gridSizeX = Math.floor(SCALE.MEMBRANE_WIDTH / spacing);
  const gridSizeZ = Math.floor(SCALE.MEMBRANE_DEPTH / spacing);
  const totalPerLeaflet = gridSizeX * gridSizeZ;
  
  console.log(`Creating membrane with ~${totalPerLeaflet * 2} lipids`);
  
  // Generate lipid positions for outer leaflet
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeZ; j++) {
      const x = -halfWidth + i * spacing + (Math.random() - 0.5) * spacing * 0.5;
      const z = -halfDepth + j * spacing + (Math.random() - 0.5) * spacing * 0.5;
      const surfaceY = getMembraneSurfaceY(x, z);
      
      // ~25% chance of cholesterol
      if (Math.random() < 0.25) {
        cholesterolData.push({
          x, z,
          y: surfaceY + SCALE.MEMBRANE_THICKNESS / 4,
          rotX: (Math.random() - 0.5) * 0.3,
          rotZ: (Math.random() - 0.5) * 0.3,
          phase: Math.random() * Math.PI * 2,
          leaflet: 'outer'
        });
      } else {
        outerLipidData.push({
          x, z,
          y: surfaceY + SCALE.MEMBRANE_THICKNESS / 2 - SCALE.LIPID_HEAD_DIAMETER / 3,
          rotX: (Math.random() - 0.5) * 0.2,
          rotZ: (Math.random() - 0.5) * 0.2,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  
  // Generate lipid positions for inner leaflet
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeZ; j++) {
      const x = -halfWidth + i * spacing + spacing * 0.4 + (Math.random() - 0.5) * spacing * 0.5;
      const z = -halfDepth + j * spacing + spacing * 0.4 + (Math.random() - 0.5) * spacing * 0.5;
      const surfaceY = getMembraneSurfaceY(x, z);
      
      if (Math.random() < 0.2) {
        cholesterolData.push({
          x, z,
          y: surfaceY - SCALE.MEMBRANE_THICKNESS / 4,
          rotX: (Math.random() - 0.5) * 0.3,
          rotZ: (Math.random() - 0.5) * 0.3,
          phase: Math.random() * Math.PI * 2,
          leaflet: 'inner'
        });
      } else {
        innerLipidData.push({
          x, z,
          y: surfaceY - SCALE.MEMBRANE_THICKNESS / 2 + SCALE.LIPID_HEAD_DIAMETER / 3,
          rotX: Math.PI + (Math.random() - 0.5) * 0.2,
          rotZ: (Math.random() - 0.5) * 0.2,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  
  // Create instanced meshes for heads
  outerHeadsInstanced = new THREE.InstancedMesh(
    lipidHeadGeometry,
    lipidHeadMaterial,
    outerLipidData.length
  );
  outerHeadsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  membraneGroup.add(outerHeadsInstanced);
  
  innerHeadsInstanced = new THREE.InstancedMesh(
    lipidHeadGeometry,
    lipidHeadMaterial.clone(),
    innerLipidData.length
  );
  innerHeadsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  membraneGroup.add(innerHeadsInstanced);
  
  // Create instanced meshes for tails (initially hidden)
  outerTailsInstanced = new THREE.InstancedMesh(
    lipidTailGeometry,
    lipidTailMaterial,
    outerLipidData.length
  );
  outerTailsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  outerTailsInstanced.visible = animationState.showLipidTails;
  membraneGroup.add(outerTailsInstanced);
  
  innerTailsInstanced = new THREE.InstancedMesh(
    lipidTailGeometry,
    lipidTailMaterial.clone(),
    innerLipidData.length
  );
  innerTailsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  innerTailsInstanced.visible = animationState.showLipidTails;
  membraneGroup.add(innerTailsInstanced);
  
  // Create instanced mesh for cholesterol
  cholesterolInstanced = new THREE.InstancedMesh(
    cholesterolGeometry,
    cholesterolMaterial,
    cholesterolData.length
  );
  cholesterolInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  membraneGroup.add(cholesterolInstanced);
  
  // Initial transform update
  updateInstancedTransforms(0);
  
  // Create water molecules
  createWaterMolecules();
  
  // Store counts in lipids arrays for compatibility
  lipids.outer.length = outerLipidData.length;
  lipids.inner.length = innerLipidData.length;
}

/**
 * Update all instanced mesh transforms
 */
function updateInstancedTransforms(time) {
  const brownian = animationState.brownianIntensity;
  const flex = animationState.membraneFlexibility;
  const amp = BROWNIAN.lipidAmplitude * brownian * 0.3; // Reduced amplitude
  const freq = BROWNIAN.lipidFrequency * 0.5; // Slower frequency
  
  // Update outer leaflet
  for (let i = 0; i < outerLipidData.length; i++) {
    const data = outerLipidData[i];
    const phase = data.phase;
    
    // Simple oscillation
    const dx = Math.sin(time * freq + phase) * amp;
    const dz = Math.cos(time * freq * 0.7 + phase) * amp;
    const dy = Math.sin(time * 1.0 + data.x * 0.03 + data.z * 0.03) * amp * flex * 0.3;
    
    // Head position
    dummy.position.set(data.x + dx, data.y + dy, data.z + dz);
    dummy.rotation.set(data.rotX, 0, data.rotZ);
    dummy.updateMatrix();
    outerHeadsInstanced.setMatrixAt(i, dummy.matrix);
    
    // Tail position (below head)
    dummy.position.y = data.y + dy - SCALE.LIPID_HEAD_DIAMETER / 2 - SCALE.LIPID_TAIL_LENGTH * 0.75;
    dummy.updateMatrix();
    outerTailsInstanced.setMatrixAt(i, dummy.matrix);
  }
  
  // Update inner leaflet
  for (let i = 0; i < innerLipidData.length; i++) {
    const data = innerLipidData[i];
    const phase = data.phase;
    
    const dx = Math.sin(time * freq + phase) * amp;
    const dz = Math.cos(time * freq * 0.7 + phase) * amp;
    const dy = Math.sin(time * 1.0 + data.x * 0.03 + data.z * 0.03) * amp * flex * 0.3;
    
    // Head position (flipped)
    dummy.position.set(data.x + dx, data.y + dy, data.z + dz);
    dummy.rotation.set(data.rotX, 0, data.rotZ);
    dummy.updateMatrix();
    innerHeadsInstanced.setMatrixAt(i, dummy.matrix);
    
    // Tail position (above head for inner leaflet)
    dummy.position.y = data.y + dy + SCALE.LIPID_HEAD_DIAMETER / 2 + SCALE.LIPID_TAIL_LENGTH * 0.75;
    dummy.updateMatrix();
    innerTailsInstanced.setMatrixAt(i, dummy.matrix);
  }
  
  // Update cholesterol
  for (let i = 0; i < cholesterolData.length; i++) {
    const data = cholesterolData[i];
    const phase = data.phase;
    const cholAmp = amp * 0.3; // Cholesterol moves less
    
    const dx = Math.sin(time * freq * 0.5 + phase) * cholAmp;
    const dz = Math.cos(time * freq * 0.4 + phase) * cholAmp;
    
    dummy.position.set(data.x + dx, data.y, data.z + dz);
    dummy.rotation.set(data.rotX, 0, data.rotZ);
    dummy.updateMatrix();
    cholesterolInstanced.setMatrixAt(i, dummy.matrix);
  }
  
  // Mark matrices as needing update
  outerHeadsInstanced.instanceMatrix.needsUpdate = true;
  innerHeadsInstanced.instanceMatrix.needsUpdate = true;
  outerTailsInstanced.instanceMatrix.needsUpdate = true;
  innerTailsInstanced.instanceMatrix.needsUpdate = true;
  cholesterolInstanced.instanceMatrix.needsUpdate = true;
}

/**
 * Create water molecules in extra and intracellular space
 */
function createWaterMolecules() {
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  const extraHeight = 15;
  const intraHeight = 15;
  
  // Reduced water count for performance
  const waterCount = Math.floor((SCALE.MEMBRANE_WIDTH * SCALE.MEMBRANE_DEPTH) / 50);
  
  // Extracellular water
  for (let i = 0; i < waterCount; i++) {
    const water = new THREE.Mesh(waterGeometry, waterMaterial.clone());
    water.position.set(
      (Math.random() - 0.5) * SCALE.MEMBRANE_WIDTH,
      SCALE.MEMBRANE_THICKNESS / 2 + 1 + Math.random() * extraHeight,
      (Math.random() - 0.5) * SCALE.MEMBRANE_DEPTH
    );
    water.visible = animationState.showWater;
    ionGroup.add(water);
    
    waterMolecules.push({
      mesh: water,
      basePosition: water.position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ),
      phase: Math.random() * Math.PI * 2,
      region: 'extracellular',
      bounds: {
        minX: -halfWidth, maxX: halfWidth,
        minY: SCALE.MEMBRANE_THICKNESS / 2 + 0.5, maxY: SCALE.MEMBRANE_THICKNESS / 2 + extraHeight,
        minZ: -halfDepth, maxZ: halfDepth
      }
    });
  }
  
  // Intracellular water
  for (let i = 0; i < waterCount; i++) {
    const water = new THREE.Mesh(waterGeometry, waterMaterial.clone());
    water.position.set(
      (Math.random() - 0.5) * SCALE.MEMBRANE_WIDTH,
      -SCALE.MEMBRANE_THICKNESS / 2 - 1 - Math.random() * intraHeight,
      (Math.random() - 0.5) * SCALE.MEMBRANE_DEPTH
    );
    water.visible = animationState.showWater;
    ionGroup.add(water);
    
    waterMolecules.push({
      mesh: water,
      basePosition: water.position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ),
      phase: Math.random() * Math.PI * 2,
      region: 'intracellular',
      bounds: {
        minX: -halfWidth, maxX: halfWidth,
        minY: -SCALE.MEMBRANE_THICKNESS / 2 - intraHeight, maxY: -SCALE.MEMBRANE_THICKNESS / 2 - 0.5,
        minZ: -halfDepth, maxZ: halfDepth
      }
    });
  }
}

/**
 * Update membrane - now just updates instanced transforms
 */
export function updateMembrane(deltaTime) {
  const time = animationState.time;
  
  // Update instanced mesh transforms (this is fast)
  updateInstancedTransforms(time);
  
  // Update water molecules only if visible
  if (animationState.showWater) {
    const brownian = animationState.brownianIntensity;
    for (const water of waterMolecules) {
      updateWaterMotion(water, time, brownian, deltaTime);
    }
  }
}

/**
 * Update water molecule motion
 */
function updateWaterMotion(water, time, brownian, deltaTime) {
  // Simple random walk
  water.velocity.x += (Math.random() - 0.5) * deltaTime * 30;
  water.velocity.y += (Math.random() - 0.5) * deltaTime * 30;
  water.velocity.z += (Math.random() - 0.5) * deltaTime * 30;
  water.velocity.multiplyScalar(0.95);
  
  water.mesh.position.add(water.velocity.clone().multiplyScalar(deltaTime));
  
  // Boundary reflection
  const bounds = water.bounds;
  if (water.mesh.position.x < bounds.minX || water.mesh.position.x > bounds.maxX) {
    water.velocity.x *= -1;
    water.mesh.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, water.mesh.position.x));
  }
  if (water.mesh.position.y < bounds.minY || water.mesh.position.y > bounds.maxY) {
    water.velocity.y *= -1;
    water.mesh.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, water.mesh.position.y));
  }
  if (water.mesh.position.z < bounds.minZ || water.mesh.position.z > bounds.maxZ) {
    water.velocity.z *= -1;
    water.mesh.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, water.mesh.position.z));
  }
}

/**
 * Toggle lipid tail visibility
 */
export function setShowLipidTails(show) {
  animationState.showLipidTails = show;
  if (outerTailsInstanced) outerTailsInstanced.visible = show;
  if (innerTailsInstanced) innerTailsInstanced.visible = show;
}

/**
 * Toggle water molecule visibility
 */
export function setShowWater(show) {
  animationState.showWater = show;
  for (const water of waterMolecules) {
    water.mesh.visible = show;
  }
}

/**
 * Update lipid density - not supported with instanced mesh without recreation
 */
export function setLipidDensity(density) {
  animationState.lipidDensity = density;
  // Would need to recreate membrane - not implemented for performance
}

/**
 * Clear space for channels at specific positions
 * With instanced mesh, we just set the scale to 0 for those instances
 */
export function clearSpaceForChannel(x, z, radius) {
  // For outer leaflet
  for (let i = 0; i < outerLipidData.length; i++) {
    const data = outerLipidData[i];
    const dist = Math.sqrt((data.x - x) ** 2 + (data.z - z) ** 2);
    if (dist < radius) {
      // Move far away (hide it)
      data.y = -1000;
    }
  }
  
  // For inner leaflet
  for (let i = 0; i < innerLipidData.length; i++) {
    const data = innerLipidData[i];
    const dist = Math.sqrt((data.x - x) ** 2 + (data.z - z) ** 2);
    if (dist < radius) {
      data.y = -1000;
    }
  }
  
  // For cholesterol
  for (let i = 0; i < cholesterolData.length; i++) {
    const data = cholesterolData[i];
    const dist = Math.sqrt((data.x - x) ** 2 + (data.z - z) ** 2);
    if (dist < radius) {
      data.y = -1000;
    }
  }
}

/**
 * Get total lipid count for stats
 */
export function getLipidCount() {
  return outerLipidData.length + innerLipidData.length + cholesterolData.length;
}
