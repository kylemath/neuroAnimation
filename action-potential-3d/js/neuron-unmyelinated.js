/**
 * neuron-unmyelinated.js - Unmyelinated neuron geometry and updates
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, neuronGroup,
  SOMA_RADIUS, SOMA_POS, DENDRITE_COUNT, AXON_LENGTH, AXON_RADIUS, HILLOCK_LENGTH,
  THRESHOLD, animationState,
  dendrites, dendriteData, axonSegments, axonPathData, terminals, channels,
  segmentCount, CHANNEL_SPACING, CHANNELS_PER_RING,
  UNIFORM_ION_SIZE,
  ions, vesicles, microNTs, caInfluxIons, synapticInputs,
  hillockIons, apTimingData, MAX_TIMING_SAMPLES,
  MAX_BRANCH_DEPTH, BASE_BRANCH_LENGTH, PHI_INV, seededRandom, resetBranchSeed,
  AXON_START, AXON_END, AXON_END_POS,
  setAxonStart, setAxonEnd, setAxonEndPos
} from './config.js';
import { naMaterial, kMaterial, createIon } from './ions.js';

// ============================================================================
// MATERIALS
// ============================================================================

const somaMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.45, shininess: 50,
  emissive: 0x1a3a4a, emissiveIntensity: 0.3, side: THREE.DoubleSide
});

const nucleusMaterial = new THREE.MeshPhongMaterial({
  color: 0x2a3a4a, transparent: true, opacity: 0.75,
  emissive: 0x3a5a7a, emissiveIntensity: 0.3, side: THREE.DoubleSide
});

const hillockMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.35, shininess: 50,
  emissive: 0x1a3a4a, emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false
});

const axonMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.1, shininess: 30,
  emissive: 0x1a3a4a, emissiveIntensity: 0.15, side: THREE.DoubleSide, depthWrite: false
});

const vescleMat = new THREE.MeshPhongMaterial({
  color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.6, transparent: true, opacity: 0.9
});

// Organelle materials for soma internal structure
const organelleGeo = new THREE.TorusGeometry(SOMA_RADIUS * 0.3, 0.15, 8, 16);
const organelleMat = new THREE.MeshPhongMaterial({
  color: 0x4a6a8a, transparent: true, opacity: 0.35,
  emissive: 0x1a2a3a, emissiveIntensity: 0.2, side: THREE.DoubleSide
});

const mitoGeo = new THREE.SphereGeometry(0.3, 8, 6);
const mitoMat = new THREE.MeshPhongMaterial({
  color: 0x6a4a3a, transparent: true, opacity: 0.5,
  emissive: 0x3a2a1a, emissiveIntensity: 0.2
});

// ============================================================================
// GEOMETRIES
// ============================================================================

const somaGeometry = new THREE.SphereGeometry(SOMA_RADIUS, 32, 32);
const nucleusGeometry = new THREE.SphereGeometry(SOMA_RADIUS * 0.45, 24, 24);
const vesicleGeo = new THREE.SphereGeometry(0.25, 8, 8);
const microNTGeo = new THREE.SphereGeometry(0.06, 6, 6);
const ionGeometry = new THREE.SphereGeometry(UNIFORM_ION_SIZE, 8, 8);

// ============================================================================
// EXPORTED VARIABLES
// ============================================================================

export let soma;
export let hillock;
export let axon;
export let voltageSegments = [];
export let dendriteIndex = 0;

// Re-export for external use
export { AXON_START, AXON_END, AXON_END_POS } from './config.js';
export { somaMaterial, hillockMaterial };

/**
 * Get a point along the curved axon path
 */
export function getAxonPathPoint(distanceAlongAxon) {
  const d = Math.max(0, Math.min(distanceAlongAxon, AXON_LENGTH));
  for (let i = 0; i < axonPathData.length - 1; i++) {
    const p1 = axonPathData[i];
    const p2 = axonPathData[i + 1];
    if (d >= p1.distance && d <= p2.distance) {
      const t = (d - p1.distance) / (p2.distance - p1.distance);
      return {
        position: p1.position.clone().lerp(p2.position, t),
        direction: p1.direction.clone().lerp(p2.direction, t).normalize()
      };
    }
  }
  const last = axonPathData[axonPathData.length - 1];
  return { position: last.position.clone(), direction: last.direction.clone() };
}

/**
 * Create the complete unmyelinated neuron
 */
export function createUnmyelinatedNeuron() {
  // Soma (cell body)
  soma = new THREE.Mesh(somaGeometry, somaMaterial);
  soma.position.copy(SOMA_POS);
  soma.userData = { type: 'soma' };
  neuronGroup.add(soma);

  // Nucleus
  const nucleus = new THREE.Mesh(nucleusGeometry, nucleusMaterial);
  nucleus.position.copy(SOMA_POS);
  neuronGroup.add(nucleus);
  
  // Add organelles inside soma (rough ER rings)
  for (let i = 0; i < 3; i++) {
    const organelle = new THREE.Mesh(organelleGeo, organelleMat);
    organelle.position.copy(SOMA_POS);
    organelle.rotation.x = Math.random() * Math.PI;
    organelle.rotation.y = Math.random() * Math.PI;
    organelle.scale.setScalar(0.8 + Math.random() * 0.4);
    neuronGroup.add(organelle);
  }
  
  // Add mitochondria
  for (let i = 0; i < 5; i++) {
    const mito = new THREE.Mesh(mitoGeo, mitoMat.clone());
    const angle = (i / 5) * Math.PI * 2;
    const r = SOMA_RADIUS * 0.6;
    mito.position.set(
      SOMA_POS.x + Math.cos(angle) * r * 0.7,
      SOMA_POS.y + (Math.random() - 0.5) * r,
      Math.sin(angle) * r * 0.7
    );
    mito.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mito.scale.set(1, 0.5, 2);
    neuronGroup.add(mito);
  }

  // Create dendrites with FULL branching and spines
  createDendrites();

  // Axon hillock
  const hillockGeometry = new THREE.CylinderGeometry(SOMA_RADIUS * 0.6, AXON_RADIUS * 1.2, HILLOCK_LENGTH, 24);
  hillock = new THREE.Mesh(hillockGeometry, hillockMaterial);
  hillock.rotation.z = Math.PI / 2;
  hillock.position.set(SOMA_POS.x + SOMA_RADIUS + HILLOCK_LENGTH / 2 - 1, 0, 0);
  hillock.userData = { type: 'hillock' };
  neuronGroup.add(hillock);

  // Create segmented axon
  createAxon();

  // Create axon terminals with branching
  createTerminals();

  // Create voltage visualization segments
  createVoltageSegments();
}

/**
 * Create dendrites with DENSE spines and RICH branching (matching original)
 */
function createDendrites() {
  dendriteIndex = 0;
  
  function createDendriteSegment(startPos, direction, length, radius, depth, parentQuaternion) {
    const segments = [];
    
    // Create the main segment
    const dendriteGeometry = new THREE.CylinderGeometry(radius * 0.7, radius, length, 8);
    const dendriteMaterial = new THREE.MeshPhongMaterial({
      color: 0x7ae1ff, transparent: true, opacity: 0.5,
      emissive: 0x1a3a4a, emissiveIntensity: 0.2, side: THREE.DoubleSide
    });
    const dendrite = new THREE.Mesh(dendriteGeometry, dendriteMaterial);
    
    const segmentCenter = startPos.clone().add(direction.clone().multiplyScalar(length / 2));
    dendrite.position.copy(segmentCenter);
    dendrite.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    dendrite.userData = { type: 'dendrite', index: dendriteIndex, voltage: -70, depth };
    neuronGroup.add(dendrite);
    dendrites.push(dendrite);
    
    // Add dendritic spines - DENSE coverage like "nails hammered into a club"
    // Spines are 3x longer and 5x wider to be clearly visible
    const spines = [];
    const spineCount = Math.floor(length * 3); // HIGH density of spines
    for (let s = 0; s < spineCount; s++) {
      const spinePos = (s + Math.random() * 0.5) / spineCount;
      
      // TRUE 3D random direction for spine (like nails at all angles)
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.8;
      
      const localSpineDir = new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi),
        Math.sin(theta) * Math.cos(phi)
      );
      
      const spineDir = localSpineDir.clone().applyQuaternion(dendrite.quaternion).normalize();
      
      // 3x LONGER spine for visibility
      const spineLength = (0.25 + Math.random() * 0.2) * 3;
      // 5x WIDER spine neck
      const spineGeo = new THREE.CylinderGeometry(0.03 * 5, 0.05 * 5, spineLength, 8);
      const spineMat = new THREE.MeshPhongMaterial({
        color: 0x7ae1ff, transparent: true, opacity: 0.6,
        emissive: 0x1a3a4a, emissiveIntensity: 0.3
      });
      const spine = new THREE.Mesh(spineGeo, spineMat);
      
      const alongDendrite = direction.clone().multiplyScalar(length * (spinePos - 0.5));
      spine.position.copy(segmentCenter).add(alongDendrite).add(spineDir.clone().multiplyScalar(radius * 0.5 + spineLength * 0.3));
      spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spineDir);
      neuronGroup.add(spine);
      
      // Spine head - HERSHEY KISS shape (flattened cone)
      const headRadius = (0.06 + Math.random() * 0.03) * 5;
      const headHeight = headRadius * 0.4;
      const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 12);
      const headMat = new THREE.MeshPhongMaterial({
        color: 0xff6b6b, transparent: true, opacity: 0.65,
        emissive: 0x330000, emissiveIntensity: 0.3
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.copy(spine.position).add(spineDir.clone().multiplyScalar(spineLength * 0.5 + headHeight * 0.3));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spineDir.clone().negate());
      neuronGroup.add(head);
      
      spines.push({ neck: spine, head, material: headMat, active: false });
    }
    
    const segmentData = {
      mesh: dendrite, material: dendriteMaterial, direction: direction.clone(),
      startPos: startPos.clone(), length, voltage: -70,
      epspActive: false, ipspActive: false, spines, depth, children: []
    };
    
    dendriteData.push(segmentData);
    const currentIndex = dendriteIndex;
    dendriteIndex++;
    
    const endPos = startPos.clone().add(direction.clone().multiplyScalar(length));
    
    // Branching logic - HIGH probability at all levels for rich dendritic tree
    const branchProb = depth === 0 ? 0.95 : (depth === 1 ? 0.85 : (depth === 2 ? 0.7 : 0.4));
    const shouldBranch = depth < 4 && Math.random() < branchProb;
    
    if (shouldBranch) {
      const branchCount = 2;
      
      for (let b = 0; b < branchCount; b++) {
        const randomVec = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        );
        const perpAxis = new THREE.Vector3().crossVectors(direction, randomVec).normalize();
        if (perpAxis.length() < 0.1) {
          perpAxis.set(0, 1, 0).cross(direction).normalize();
        }
        
        const rollAngle = Math.random() * Math.PI * 2;
        perpAxis.applyAxisAngle(direction, rollAngle + (b * Math.PI));
        
        const branchAngle = Math.PI / 4 * (0.7 + Math.random() * 0.6);
        const branchDir = direction.clone().applyAxisAngle(perpAxis, branchAngle).normalize();
        const branchLength = length * (0.65 + Math.random() * 0.25);
        const branchRadius = radius * 0.75;
        
        const childSegments = createDendriteSegment(
          endPos.clone(), branchDir, branchLength, branchRadius, depth + 1, dendrite.quaternion
        );
        segmentData.children.push(...childSegments);
      }
    } else if (depth < 3 && Math.random() < 0.3) {
      // Continue as single process
      const continueDir = direction.clone();
      const deviation = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );
      continueDir.add(deviation).normalize();
      
      const childSegments = createDendriteSegment(
        endPos.clone(), continueDir, length * (0.7 + Math.random() * 0.3),
        radius * 0.8, depth + 1, dendrite.quaternion
      );
      segmentData.children.push(...childSegments);
    }
    
    segments.push(segmentData);
    return segments;
  }
  
  // Create primary dendrites from soma - distributed around EQUATOR
  for (let i = 0; i < DENDRITE_COUNT; i++) {
    const azimuth = (i / DENDRITE_COUNT) * Math.PI * 2;
    const elevation = (Math.random() - 0.5) * Math.PI * 0.6;
    
    const direction = new THREE.Vector3(
      -0.3 - Math.random() * 0.4 + Math.cos(azimuth) * 0.3,
      Math.sin(elevation) * 0.8,
      Math.sin(azimuth) * 0.9
    ).normalize();
    
    const dendriteLength = 10 + Math.random() * 8;
    const dendriteRadius = 0.4 + Math.random() * 0.15;
    const startPos = SOMA_POS.clone().add(direction.clone().multiplyScalar(SOMA_RADIUS - 0.5));
    
    createDendriteSegment(startPos, direction, dendriteLength, dendriteRadius, 0, null);
  }
}

/**
 * Create the segmented axon
 */
function createAxon() {
  const axonStartX = hillock.position.x + HILLOCK_LENGTH / 2;
  setAxonStart(axonStartX);
  let currentPos = new THREE.Vector3(axonStartX, 0, 0);
  let currentDir = new THREE.Vector3(1, 0, 0);
  let accumulatedDistance = 0;
  
  axonPathData.push({
    position: currentPos.clone(),
    direction: currentDir.clone(),
    distance: 0
  });
  
  const AXON_SEGMENT_COUNT = 12;
  const AXON_SEGMENT_LENGTH = AXON_LENGTH / AXON_SEGMENT_COUNT;

  for (let seg = 0; seg < AXON_SEGMENT_COUNT; seg++) {
    const deviationAngle = (Math.random() - 0.5) * 0.05;
    const deviationAxis = new THREE.Vector3(0, Math.random() - 0.5, Math.random() - 0.5).normalize();
    currentDir.applyAxisAngle(deviationAxis, deviationAngle).normalize();
    
    const segGeo = new THREE.CylinderGeometry(AXON_RADIUS, AXON_RADIUS, AXON_SEGMENT_LENGTH, 12);
    const segMat = axonMaterial.clone();
    const segment = new THREE.Mesh(segGeo, segMat);
    
    const segCenter = currentPos.clone().add(currentDir.clone().multiplyScalar(AXON_SEGMENT_LENGTH / 2));
    segment.position.copy(segCenter);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), currentDir);
    segment.userData = { type: 'axon', segmentIndex: seg };
    neuronGroup.add(segment);
    axonSegments.push(segment);
    
    currentPos.add(currentDir.clone().multiplyScalar(AXON_SEGMENT_LENGTH));
    accumulatedDistance += AXON_SEGMENT_LENGTH;
    
    axonPathData.push({
      position: currentPos.clone(),
      direction: currentDir.clone(),
      distance: accumulatedDistance
    });
  }
  
  axon = axonSegments[0];
  setAxonEnd(currentPos.x);
  setAxonEndPos(currentPos.clone());
}

/**
 * Create axon terminals with GOLDEN RATIO branching
 */
function createTerminals() {
  resetBranchSeed();
  
  function createTerminalBranch(startPos, direction, depth, forceTerminal = false) {
    const lengthScale = Math.pow(PHI_INV, depth);
    const branchLength = BASE_BRANCH_LENGTH * lengthScale * (0.8 + seededRandom() * 0.4);
    const radiusScale = Math.pow(0.75, depth);
    const branchRadius = 0.5 * radiusScale;
    
    const branchGeo = new THREE.CylinderGeometry(branchRadius * 0.7, branchRadius, branchLength, 8);
    const branchMat = axonMaterial.clone();
    const branch = new THREE.Mesh(branchGeo, branchMat);
    
    const branchCenter = startPos.clone().add(direction.clone().multiplyScalar(branchLength / 2));
    branch.position.copy(branchCenter);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    neuronGroup.add(branch);
    
    const endPos = startPos.clone().add(direction.clone().multiplyScalar(branchLength));
    
    // Bouton - Hershey kiss shape using LatheGeometry
    const boutonSize = Math.max(0.25, 0.5 * Math.pow(0.85, depth));
    const kissPoints = [];
    const kissHeight = boutonSize * 2.2;
    const kissWidth = boutonSize * 1.4;
    kissPoints.push(new THREE.Vector2(0, kissHeight));
    kissPoints.push(new THREE.Vector2(kissWidth * 0.15, kissHeight * 0.85));
    kissPoints.push(new THREE.Vector2(kissWidth * 0.4, kissHeight * 0.65));
    kissPoints.push(new THREE.Vector2(kissWidth * 0.7, kissHeight * 0.45));
    kissPoints.push(new THREE.Vector2(kissWidth * 0.9, kissHeight * 0.25));
    kissPoints.push(new THREE.Vector2(kissWidth, kissHeight * 0.08));
    kissPoints.push(new THREE.Vector2(kissWidth, 0));
    kissPoints.push(new THREE.Vector2(0, 0));
    
    const boutonGeo = new THREE.LatheGeometry(kissPoints, 16);
    const boutonMat = new THREE.MeshPhongMaterial({
      color: 0xffb86b, emissive: 0xff8800, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.8
    });
    const bouton = new THREE.Mesh(boutonGeo, boutonMat);
    bouton.position.copy(endPos).add(direction.clone().multiplyScalar(kissHeight * 0.5));
    bouton.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
    bouton.userData = { type: 'bouton', direction, cleftSize: kissWidth };
    neuronGroup.add(bouton);
    
    // Synaptic cleft
    const cleftGeo = new THREE.CircleGeometry(kissWidth * 0.95, 16);
    const cleftMat = new THREE.MeshPhongMaterial({
      color: 0x664422, emissive: 0x332211, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.6, side: THREE.DoubleSide
    });
    const synapticCleft = new THREE.Mesh(cleftGeo, cleftMat);
    synapticCleft.position.copy(endPos).add(direction.clone().multiplyScalar(kissHeight + 0.02));
    synapticCleft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    neuronGroup.add(synapticCleft);
    
    terminals.push({
      mesh: branch, branch, bouton, synapticCleft, direction,
      position: branch.position.x,
      cleftPosition: endPos.clone().add(direction.clone().multiplyScalar(kissHeight)),
      releasing: false, releaseStage: 0
    });
    
    // Early termination check - "apples close to the trunk"
    if (!forceTerminal && depth < MAX_BRANCH_DEPTH) {
      const earlyTermProb = depth === 0 ? 0.15 : (depth === 1 ? 0.12 : 0.08);
      if (seededRandom() < earlyTermProb) return;
    }
    
    // Create sub-branches
    if (!forceTerminal && depth < MAX_BRANCH_DEPTH) {
      const baseBranchCount = 2;
      const extraBranches = (depth > 0 && seededRandom() < 0.4) ? 1 : 0;
      const subBranchCount = baseBranchCount + extraBranches;
      
      for (let sb = 0; sb < subBranchCount; sb++) {
        const theta = seededRandom() * Math.PI * 2;
        const baseSpread = Math.PI / 5 + depth * 0.05;
        const spreadAngle = baseSpread + seededRandom() * Math.PI / 6;
        
        const perpAxis = new THREE.Vector3(0, 1, 0).cross(direction);
        if (perpAxis.length() < 0.1) perpAxis.set(0, 0, 1);
        perpAxis.normalize().applyAxisAngle(direction, theta);
        
        const branchAngleOffset = (sb / subBranchCount) * Math.PI * 2;
        const finalPerpAxis = perpAxis.clone().applyAxisAngle(direction, branchAngleOffset);
        
        const subDir = direction.clone().applyAxisAngle(finalPerpAxis, spreadAngle).normalize();
        createTerminalBranch(endPos.clone(), subDir, depth + 1);
      }
    }
  }
  
  // Create primary collaterals
  const PRIMARY_COLLATERAL_COUNT = 8;
  for (let i = 0; i < PRIMARY_COLLATERAL_COUNT; i++) {
    const angle = (i / PRIMARY_COLLATERAL_COUNT) * Math.PI * 2;
    const spread = 0.6;
    const direction = new THREE.Vector3(
      0.5 + seededRandom() * 0.3,
      Math.sin(angle) * spread + (seededRandom() - 0.5) * 0.3,
      Math.cos(angle) * spread + (seededRandom() - 0.5) * 0.3
    ).normalize();
    createTerminalBranch(AXON_END_POS.clone(), direction, 0);
  }
}

/**
 * Create voltage visualization segments
 */
function createVoltageSegments() {
  voltageSegments = [];
  const segLength = AXON_LENGTH / segmentCount;
  
  for (let i = 0; i < segmentCount; i++) {
    const distanceAlongAxon = i * segLength + segLength / 2;
    const pathPoint = getAxonPathPoint(distanceAlongAxon);
    
    const segmentGeometry = new THREE.CylinderGeometry(AXON_RADIUS * 0.85, AXON_RADIUS * 0.85, segLength * 1.02, 16);
    const segmentMaterial = new THREE.MeshPhongMaterial({
      color: 0x2060aa, emissive: 0x2060aa, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.7, shininess: 100, side: THREE.DoubleSide, depthWrite: false
    });
    const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
    
    segment.position.copy(pathPoint.position);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pathPoint.direction);
    segment.renderOrder = 1;
    neuronGroup.add(segment);
    
    voltageSegments.push({
      mesh: segment, position: AXON_START + distanceAlongAxon,
      distance: distanceAlongAxon, voltage: -70, refractoryState: 0
    });
  }
}

/**
 * Get voltage at position during AP
 */
export function getAxonVoltage(position, time) {
  if (!animationState.apTriggered || animationState.apStartTime < 0) return -70;
  
  const timeSinceAP = time - animationState.apStartTime;
  const waveSpeed = 50 * (animationState.propSpeed / 100);
  const wavePos = AXON_START + timeSinceAP * waveSpeed;
  const distance = position - wavePos;
  
  if (distance > 10 || distance < -25) return -70;
  
  if (distance > 0 && distance <= 10) {
    const t = 1 - distance / 10;
    return -70 + 110 * Math.pow(t, 1.5);
  } else if (distance >= -2 && distance <= 0) {
    return 40;
  } else if (distance >= -8 && distance < -2) {
    const t = (Math.abs(distance) - 2) / 6;
    return 40 - 120 * t;
  } else if (distance >= -15 && distance < -8) {
    const t = (Math.abs(distance) - 8) / 7;
    return -80 + 5 * t;
  } else {
    const t = (Math.abs(distance) - 15) / 10;
    return -75 + 5 * Math.min(1, t);
  }
}

/**
 * Get refractory state at position
 */
export function getRefractoryState(position, time) {
  if (!animationState.apTriggered) return 0;
  const timeSinceAP = time - animationState.apStartTime;
  const waveSpeed = 50 * (animationState.propSpeed / 100);
  const wavePos = AXON_START + timeSinceAP * waveSpeed;
  const distance = position - wavePos;
  
  if (distance >= -15 && distance < -2) return 1;
  if (distance >= -25 && distance < -15) return 2;
  return 0;
}

/**
 * Get phase label for voltage
 */
export function getPhaseLabel(voltage, refState) {
  if (refState === 1) return 'Absolute Refractory';
  if (refState === 2) return 'Relative Refractory';
  if (voltage > 20) return 'Peak Depolarization';
  if (voltage > -55) return 'Depolarization';
  if (voltage < -75) return 'Hyperpolarization';
  return 'Resting State';
}

/**
 * Update voltage field visualization
 */
export function updateVoltageField() {
  voltageSegments.forEach(segment => {
    const voltage = getAxonVoltage(segment.position, animationState.time);
    const refState = getRefractoryState(segment.position, animationState.time);
    segment.voltage = voltage;
    segment.refractoryState = refState;
    
    const mat = segment.mesh.material;
    
    let r, g, b, intensity, opacity;
    
    if (voltage >= -70) {
      const depolarT = Math.max(0, Math.min(1, (voltage + 70) / 110));
      const depolarT2 = depolarT * depolarT;
      r = 0.2 + depolarT2 * 0.8;
      g = 0.5 + depolarT * 0.5;
      b = 0.9 + depolarT * 0.1;
      intensity = 0.8 + depolarT2 * 15.0;
      opacity = 0.7 + depolarT * 0.3;
    } else if (voltage >= -80) {
      const recoveryT = (voltage + 80) / 10;
      r = 0.1 + recoveryT * 0.1;
      g = 0.2 + recoveryT * 0.3;
      b = 0.5 + recoveryT * 0.4;
      intensity = 0.3 + recoveryT * 0.5;
      opacity = 0.6 + recoveryT * 0.1;
    } else {
      const hyperT = Math.max(0, Math.min(1, (voltage + 90) / 10));
      r = 0.02 + hyperT * 0.08;
      g = 0.02 + hyperT * 0.18;
      b = 0.08 + hyperT * 0.42;
      intensity = 0.05 + hyperT * 0.25;
      opacity = 0.5 + hyperT * 0.1;
    }
    
    mat.emissive.setRGB(r, g, b);
    mat.emissiveIntensity = intensity;
    mat.opacity = opacity;
    mat.color.setRGB(r * 0.8 + 0.2, g * 0.8 + 0.2, b * 0.8 + 0.2);
  });
}

/**
 * Generate ion channels along axon
 */
export function generateChannels() {
  channels.sodium.forEach(ch => neuronGroup.remove(ch.group));
  channels.potassium.forEach(ch => neuronGroup.remove(ch.group));
  channels.sodium = [];
  channels.potassium = [];

  const naFactor = animationState.naDensity / 100;
  const kFactor = animationState.kDensity / 100;

  for (let d = 0; d < AXON_LENGTH; d += CHANNEL_SPACING) {
    for (let i = 0; i < CHANNELS_PER_RING; i++) {
      const angle = (i / CHANNELS_PER_RING) * Math.PI * 2;
      if (Math.random() < naFactor * 0.7) {
        channels.sodium.push(createChannel('Na', d, angle));
      }
      if (Math.random() < kFactor * 0.5) {
        channels.potassium.push(createChannel('K', d + CHANNEL_SPACING * 0.4, angle + 0.4));
      }
    }
  }
}

function createChannel(type, distanceAlongAxon, angle) {
  const group = new THREE.Group();
  
  const channelGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.45, 6);
  const channelMaterial = new THREE.MeshPhongMaterial({
    color: type === 'Na' ? 0xff6b6b : 0xffdd00,
    emissive: type === 'Na' ? 0xff0000 : 0xffaa00,
    emissiveIntensity: 0.3
  });
  const channelBody = new THREE.Mesh(channelGeometry, channelMaterial);
  group.add(channelBody);
  
  const gateGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.25);
  const gateMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const gate = new THREE.Mesh(gateGeometry, gateMaterial);
  gate.position.y = 0.18;
  group.add(gate);
  
  const pathPoint = getAxonPathPoint(distanceAlongAxon);
  const radialDir = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
  
  group.position.set(
    pathPoint.position.x,
    pathPoint.position.y + AXON_RADIUS * Math.cos(angle),
    pathPoint.position.z + AXON_RADIUS * Math.sin(angle)
  );
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radialDir);
  neuronGroup.add(group);
  
  return { group, gate, type, position: AXON_START + distanceAlongAxon, distance: distanceAlongAxon, angle, openness: 0 };
}

/**
 * Update channel states and ion flow
 */
export function updateChannels(deltaTime) {
  channels.sodium.forEach(ch => {
    const voltage = getAxonVoltage(ch.position, animationState.time);
    const refState = getRefractoryState(ch.position, animationState.time);
    
    if (refState === 0 && voltage > -55 && voltage < 30) {
      ch.openness = Math.min(1, ch.openness + 8 * deltaTime);
      if (ch.openness > 0.6 && Math.random() < 0.15) createIon('Na', ch);
    } else {
      ch.openness = Math.max(0, ch.openness - 4 * deltaTime);
    }
    
    ch.gate.position.y = 0.18 - ch.openness * 0.35;
    ch.group.children[0].material.emissiveIntensity = 0.3 + ch.openness * 0.7;
  });
  
  channels.potassium.forEach(ch => {
    const voltage = getAxonVoltage(ch.position, animationState.time);
    const refState = getRefractoryState(ch.position, animationState.time);
    
    const isRepolarizing = refState === 1 && voltage < 30 && voltage > -75;
    const atPeak = animationState.apTriggered && voltage > 20 && voltage < 40;
    
    if (isRepolarizing || atPeak) {
      const openRate = isRepolarizing ? 8 : 3;
      ch.openness = Math.min(1, ch.openness + openRate * deltaTime);
      if (ch.openness > 0.5 && isRepolarizing && Math.random() < 0.2) {
        createIon('K', ch);
      }
    } else {
      ch.openness = Math.max(0, ch.openness - 5 * deltaTime);
    }
    
    ch.gate.position.y = 0.18 - ch.openness * 0.35;
    ch.group.children[0].material.emissiveIntensity = 0.3 + ch.openness * 0.9;
  });
}

/**
 * Update terminal bouton states
 */
export function updateTerminals() {
  terminals.forEach(terminal => {
    const terminalDelay = terminal.branch ? 0.15 : 0.1;
    const delayedTime = animationState.time - terminalDelay;
    const voltage = delayedTime > 0 ? getAxonVoltage(AXON_END, delayedTime) : -70;
    
    if (terminal.branch && terminal.branch.material) {
      if (voltage >= -55) {
        const depolarT = Math.max(0, Math.min(1, (voltage + 55) / 95));
        terminal.branch.material.emissive.setRGB(0.3 + depolarT * 0.7, 0.6 + depolarT * 0.4, 0.9 + depolarT * 0.1);
        terminal.branch.material.emissiveIntensity = 0.5 + depolarT * 3.0;
        terminal.branch.material.opacity = 0.3 + depolarT * 0.4;
      } else {
        terminal.branch.material.emissive.setRGB(0.15, 0.35, 0.6);
        terminal.branch.material.emissiveIntensity = 0.3;
        terminal.branch.material.opacity = 0.25;
      }
    }
    
    if (voltage > 10 && !terminal.releasing) {
      terminal.releasing = true;
      releaseNeurotransmitter(terminal);
      terminal.bouton.material.emissiveIntensity = 2.0;
      terminal.bouton.material.emissive.setRGB(1.0, 0.8, 0.3);
      
      if (animationState.apTriggered && apTimingData.unmyelinated.apStartTimes.length > apTimingData.unmyelinated.ntReleaseTimes.length) {
        const releaseTime = animationState.time;
        const startTime = apTimingData.unmyelinated.apStartTimes[apTimingData.unmyelinated.apStartTimes.length - 1];
        const delay = (releaseTime - startTime) * 1000;
        apTimingData.unmyelinated.ntReleaseTimes.push(releaseTime);
        apTimingData.unmyelinated.delays.push(delay);
        if (apTimingData.unmyelinated.delays.length > MAX_TIMING_SAMPLES) {
          apTimingData.unmyelinated.delays.shift();
          apTimingData.unmyelinated.apStartTimes.shift();
          apTimingData.unmyelinated.ntReleaseTimes.shift();
        }
        apTimingData.unmyelinated.avgDelay = apTimingData.unmyelinated.delays.reduce((a, b) => a + b, 0) / apTimingData.unmyelinated.delays.length;
      }
    } else if (voltage < -30 && terminal.releasing) {
      terminal.releasing = false;
      terminal.bouton.material.emissiveIntensity = 0.3;
      terminal.bouton.material.emissive.setRGB(0.8, 0.6, 0.2);
    } else if (voltage > -55 && voltage <= 10) {
      const t = (voltage + 55) / 65;
      terminal.bouton.material.emissiveIntensity = 0.3 + t * 1.2;
    }
  });
}

/**
 * Release neurotransmitter from terminal
 */
export function releaseNeurotransmitter(terminal) {
  terminal.releaseStage = 1;
  
  const caInfluxMat = new THREE.MeshPhongMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2,
    transparent: true, opacity: 0.95
  });
  const ambientCaGeo = new THREE.SphereGeometry(UNIFORM_ION_SIZE, 6, 6);

  const caCount = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < caCount; i++) {
    const ion = new THREE.Mesh(ambientCaGeo, caInfluxMat.clone());
    const angle1 = Math.random() * Math.PI * 2;
    const angle2 = Math.random() * Math.PI * 2;
    const startRadius = 1.0 + Math.random() * 2.5;
    ion.position.set(
      terminal.bouton.position.x + Math.cos(angle1) * Math.cos(angle2) * startRadius,
      terminal.bouton.position.y + Math.sin(angle2) * startRadius,
      terminal.bouton.position.z + Math.sin(angle1) * Math.cos(angle2) * startRadius
    );
    scene.add(ion);
    caInfluxIons.push({
      mesh: ion, target: terminal.bouton.position.clone(),
      speed: 4 + Math.random() * 3, lifetime: 0,
      fadeStart: 0.5 + Math.random() * 0.2
    });
  }
  
  const vesicle = new THREE.Mesh(vesicleGeo, vescleMat.clone());
  vesicle.position.copy(terminal.bouton.position);
  scene.add(vesicle);
  
  const cleftPos = terminal.cleftPosition || terminal.bouton.position.clone().add(terminal.direction.clone().multiplyScalar(1.5));
  
  vesicles.push({
    mesh: vesicle, terminal, direction: terminal.direction.clone(),
    cleftPosition: cleftPos, progress: 0, lifetime: 0, released: false
  });
}

/**
 * Create synaptic input on dendrite - with FULL ion flow system
 */
export function createSynapticInput(dendriteIdx, isExcitatory) {
  const dd = dendriteData[dendriteIdx];
  if (!dd) return;
  
  const startPos = dd.startPos || SOMA_POS.clone().add(dd.direction.clone().multiplyScalar(SOMA_RADIUS));
  const synapsePos = Math.random() * 0.8 + 0.1;
  const synapsePoint = startPos.clone().add(dd.direction.clone().multiplyScalar(dd.length * synapsePos));
  
  const ionGeo = new THREE.SphereGeometry(UNIFORM_ION_SIZE * 1.3, 8, 8);
  const naMat = new THREE.MeshPhongMaterial({
    color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 1.5, transparent: true, opacity: 0.95
  });
  const clIonMat = new THREE.MeshPhongMaterial({
    color: 0x4338ca, emissive: 0x3730a3, emissiveIntensity: 1.4, transparent: true, opacity: 0.95
  });
  const kMat = new THREE.MeshPhongMaterial({
    color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 1.3, transparent: true, opacity: 0.9
  });

  if (isExcitatory) {
    // EXCITATORY (glutamate): Na+ flows IN, K+ flows OUT
    // Create Na+ ions starting OUTSIDE the dendrite, flowing IN
    const naCount = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < naCount; i++) {
      const particle = new THREE.Mesh(ionGeo, naMat.clone());
      
      // Start position: OUTSIDE the dendrite (extracellular)
      const perpAngle = Math.random() * Math.PI * 2;
      const perpDist = 1.5 + Math.random() * 2;
      const perpDir = new THREE.Vector3(Math.cos(perpAngle), Math.sin(perpAngle), 0)
        .applyQuaternion(dd.mesh.quaternion);
      const startPos = synapsePoint.clone()
        .add(perpDir.multiplyScalar(perpDist))
        .add(dd.direction.clone().multiplyScalar((Math.random() - 0.5) * 2));
      particle.position.copy(startPos);
      neuronGroup.add(particle);
      
      // Direction: toward dendrite center then toward soma
      const towardDendrite = synapsePoint.clone().sub(startPos).normalize();
      
      synapticInputs.push({
        mesh: particle, dendriteIdx, isExcitatory: true, isEPSP: true, ionType: 'Na',
        flowingIn: true, progress: Math.random() * 0.1, lifetime: 0,
        direction: towardDendrite,
        targetPoint: synapsePoint.clone(),
        speed: 0.6 + Math.random() * 0.4  // SLOW - like original
      });
    }
    
    // Create K+ ions starting INSIDE dendrite, flowing OUT
    const kCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < kCount; i++) {
      const particle = new THREE.Mesh(ionGeo, kMat.clone());
      
      // Start position: INSIDE the dendrite
      const startPos = synapsePoint.clone()
        .add(dd.direction.clone().multiplyScalar((Math.random() - 0.5) * 1.5));
      particle.position.copy(startPos);
      neuronGroup.add(particle);
      
      // Direction: outward from dendrite
      const outwardAngle = Math.random() * Math.PI * 2;
      const outwardDir = new THREE.Vector3(Math.cos(outwardAngle), Math.sin(outwardAngle), 0)
        .applyQuaternion(dd.mesh.quaternion);
      
      synapticInputs.push({
        mesh: particle, dendriteIdx, isExcitatory: true, isEPSP: true, ionType: 'K',
        flowingIn: false, progress: Math.random() * 0.1, lifetime: 0,
        direction: outwardDir,
        speed: 0.4 + Math.random() * 0.3  // SLOW - like original
      });
    }
  } else {
    // INHIBITORY (GABA): Cl- flows IN
    const clCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < clCount; i++) {
      const particle = new THREE.Mesh(ionGeo, clIonMat.clone());
      
      // Start position: OUTSIDE the dendrite (extracellular)
      const perpAngle = Math.random() * Math.PI * 2;
      const perpDist = 1.5 + Math.random() * 2;
      const perpDir = new THREE.Vector3(Math.cos(perpAngle), Math.sin(perpAngle), 0)
        .applyQuaternion(dd.mesh.quaternion);
      const startPos = synapsePoint.clone()
        .add(perpDir.multiplyScalar(perpDist))
        .add(dd.direction.clone().multiplyScalar((Math.random() - 0.5) * 2));
      particle.position.copy(startPos);
      neuronGroup.add(particle);
      
      const towardDendrite = synapsePoint.clone().sub(startPos).normalize();
      
      synapticInputs.push({
        mesh: particle, dendriteIdx, isExcitatory: false, isEPSP: false, ionType: 'Cl',
        flowingIn: true, progress: Math.random() * 0.1, lifetime: 0,
        direction: towardDendrite,
        targetPoint: synapsePoint.clone(),
        speed: 0.5 + Math.random() * 0.3  // SLOW - like original
      });
    }
  }
  
  // Activate spine
  if (dd.spines && dd.spines.length > 0) {
    const spine = dd.spines[Math.floor(Math.random() * dd.spines.length)];
    spine.active = true;
    spine.material.emissiveIntensity = 1.5;
    spine.material.color.setHex(isExcitatory ? 0xff6b6b : 0x4338ca);
    setTimeout(() => {
      spine.active = false;
      spine.material.emissiveIntensity = 0.3;
      spine.material.color.setHex(0xff6b6b);
    }, 500);
  }
  
  // Update dendrite voltage
  if (isExcitatory) {
    dd.voltage = Math.min(-40, dd.voltage + 12);
    dd.epspActive = true;
  } else {
    dd.voltage = Math.max(-90, dd.voltage - 8);
    dd.ipspActive = true;
  }
}
