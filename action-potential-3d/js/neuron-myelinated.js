/**
 * neuron-myelinated.js - Myelinated neuron geometry and updates
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, myelinatedNeuronGroup,
  SOMA_RADIUS, SOMA_POS, AXON_LENGTH, AXON_RADIUS, HILLOCK_LENGTH,
  MYELIN_NEURON_OFFSET, MYELIN_SHEATH_COUNT, NODE_OF_RANVIER_COUNT,
  MYELIN_THICKNESS, SALTATORY_SPEED_MULTIPLIER, NODE_WIDTH, INITIAL_SEGMENT_LENGTH,
  animationState,
  myelDendrites, myelDendriteData, myelAxonSegments, myelAxonPathData,
  myelTerminals, nodesOfRanvier, nodeChannels, myelVoltageSegments,
  myelVesicles, myelMicroNTs, myelCaInfluxIons, myelSynapticInputs,
  myelHillockIons, apTimingData, MAX_TIMING_SAMPLES, nodeVoltages,
  UNIFORM_ION_SIZE, segmentCount, myelIons,
  dendriteData, axonPathData, AXON_START,
  MAX_BRANCH_DEPTH, BASE_BRANCH_LENGTH, PHI_INV, seededRandom, resetBranchSeed
} from './config.js';
import { naMaterial, kMaterial } from './ions.js';

// ============================================================================
// MATERIALS
// ============================================================================

const myelSomaMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.45, shininess: 50,
  emissive: 0x1a3a4a, emissiveIntensity: 0.3, side: THREE.DoubleSide
});

const myelHillockMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.35, shininess: 50,
  emissive: 0x1a3a4a, emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false
});

const myelAxonMaterial = new THREE.MeshPhongMaterial({
  color: 0x7ae1ff, transparent: true, opacity: 0.075, shininess: 30,
  emissive: 0x1a3a4a, emissiveIntensity: 0.1, side: THREE.DoubleSide, depthWrite: false
});

const myelinMaterial = new THREE.MeshPhongMaterial({
  color: 0xf5e6d3, transparent: true, opacity: 0.75, shininess: 80,
  emissive: 0xe8d4b8, emissiveIntensity: 0.15, side: THREE.DoubleSide
});

const nodeMaterial = new THREE.MeshPhongMaterial({
  color: 0x51cf66, transparent: true, opacity: 0.35, shininess: 60,
  emissive: 0x2ecc71, emissiveIntensity: 0.2, side: THREE.DoubleSide
});

const vescleMat = new THREE.MeshPhongMaterial({
  color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.6, transparent: true, opacity: 0.9
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
// EXPORTED VARIABLES (module-local references, arrays come from config.js)
// ============================================================================

export let myelSoma;
export let myelHillock;
export let myelAxon;
export let initialSegmentX;

// Re-export from config for convenience (these are the SAME arrays)
export { myelVoltageSegments, myelIons, nodesOfRanvier, nodeChannels } from './config.js';

// Track which nodes have already fired bursts for this AP wave
const nodeBurstFired = { na: {}, k: {} };

/**
 * Get a point along the myelinated axon path
 */
export function getMyelAxonPathPoint(distanceAlongAxon) {
  const d = Math.max(0, Math.min(distanceAlongAxon, AXON_LENGTH));
  for (let i = 0; i < myelAxonPathData.length - 1; i++) {
    const p1 = myelAxonPathData[i];
    const p2 = myelAxonPathData[i + 1];
    if (d >= p1.distance && d <= p2.distance) {
      const t = (d - p1.distance) / (p2.distance - p1.distance);
      return {
        position: p1.position.clone().lerp(p2.position, t),
        direction: p1.direction.clone().lerp(p2.direction, t).normalize()
      };
    }
  }
  const last = myelAxonPathData[myelAxonPathData.length - 1];
  return { position: last.position.clone(), direction: last.direction.clone() };
}

/**
 * Create the complete myelinated neuron
 */
export function createMyelinatedNeuron() {
  myelinatedNeuronGroup.position.y = MYELIN_NEURON_OFFSET;

  // Soma
  myelSoma = new THREE.Mesh(somaGeometry.clone(), myelSomaMaterial);
  myelSoma.position.copy(SOMA_POS);
  myelSoma.userData = { type: 'soma', myelinated: true };
  myelinatedNeuronGroup.add(myelSoma);

  // Nucleus
  const myelNucleus = new THREE.Mesh(nucleusGeometry.clone(), myelSomaMaterial.clone());
  myelNucleus.material.opacity = 0.75;
  myelNucleus.material.color.setHex(0x2a3a4a);
  myelNucleus.position.copy(SOMA_POS);
  myelinatedNeuronGroup.add(myelNucleus);

  // Create dendrites (mirror unmyelinated structure)
  createMyelDendrites();

  // Axon hillock
  myelHillock = new THREE.Mesh(
    new THREE.CylinderGeometry(SOMA_RADIUS * 0.6, AXON_RADIUS * 1.2, HILLOCK_LENGTH, 24),
    myelHillockMaterial
  );
  myelHillock.rotation.z = Math.PI / 2;
  myelHillock.position.set(SOMA_POS.x + SOMA_RADIUS + HILLOCK_LENGTH / 2 - 1, 0, 0);
  myelHillock.userData = { type: 'hillock', myelinated: true };
  myelinatedNeuronGroup.add(myelHillock);

  // Copy axon path data from unmyelinated neuron
  axonPathData.forEach(point => {
    myelAxonPathData.push({
      position: point.position.clone(),
      direction: point.direction.clone(),
      distance: point.distance
    });
  });

  // Note: AXON_START is already set by unmyelinated neuron creation
  // Both neurons share the same axon geometry (just offset vertically)

  // Create axon segments
  createMyelAxon();

  // Create myelin sheaths and nodes
  createMyelinSheaths();

  // Create terminals
  createMyelTerminals();

  // Create voltage visualization
  createMyelVoltageSegments();
}

/**
 * Create dendrites for myelinated neuron
 */
function createMyelDendrites() {
  dendriteData.forEach((originalDD, i) => {
    const direction = originalDD.direction.clone();
    const dendriteLength = originalDD.length;
    const depth = originalDD.depth || 0;
    const dendriteRadius = 0.4 * Math.pow(0.75, depth);
    
    const myelDendriteGeometry = new THREE.CylinderGeometry(dendriteRadius * 0.7, dendriteRadius, dendriteLength, 8);
    const myelDendriteMaterial = new THREE.MeshPhongMaterial({
      color: 0x7ae1ff, transparent: true, opacity: 0.5,
      emissive: 0x1a3a4a, emissiveIntensity: 0.2, side: THREE.DoubleSide
    });
    const myelDendrite = new THREE.Mesh(myelDendriteGeometry, myelDendriteMaterial);
    
    const startPos = originalDD.startPos ? originalDD.startPos.clone() : 
      SOMA_POS.clone().add(direction.clone().multiplyScalar(SOMA_RADIUS - 0.5));
    const segmentCenter = startPos.clone().add(direction.clone().multiplyScalar(dendriteLength / 2));
    
    myelDendrite.position.copy(segmentCenter);
    myelDendrite.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    myelDendrite.userData = { type: 'dendrite', index: i, voltage: -70, myelinated: true, depth };
    myelinatedNeuronGroup.add(myelDendrite);
    myelDendrites.push(myelDendrite);
    
    // Create spines
    const myelSpines = [];
    const originalSpines = originalDD.spines || [];
    originalSpines.forEach((origSpine) => {
      const spineMat = new THREE.MeshPhongMaterial({
        color: 0x7ae1ff, transparent: true, opacity: 0.5,
        emissive: 0x1a3a4a, emissiveIntensity: 0.2
      });
      const spine = new THREE.Mesh(origSpine.neck.geometry.clone(), spineMat);
      spine.position.copy(origSpine.neck.position);
      spine.quaternion.copy(origSpine.neck.quaternion);
      myelinatedNeuronGroup.add(spine);
      
      const headMat = new THREE.MeshPhongMaterial({
        color: 0xff6b6b, transparent: true, opacity: 0.6,
        emissive: 0x330000, emissiveIntensity: 0.3
      });
      const head = new THREE.Mesh(origSpine.head.geometry.clone(), headMat);
      head.position.copy(origSpine.head.position);
      head.quaternion.copy(origSpine.head.quaternion);
      myelinatedNeuronGroup.add(head);
      
      myelSpines.push({ neck: spine, head, material: headMat, active: false });
    });
    
    myelDendriteData.push({
      mesh: myelDendrite, material: myelDendriteMaterial, direction,
      startPos: startPos.clone(), length: dendriteLength, voltage: -70,
      epspActive: false, ipspActive: false, spines: myelSpines, depth
    });
  });
}

/**
 * Create myelinated axon segments
 */
function createMyelAxon() {
  const AXON_SEGMENT_COUNT = 12;
  const AXON_SEGMENT_LENGTH = AXON_LENGTH / AXON_SEGMENT_COUNT;

  for (let seg = 0; seg < AXON_SEGMENT_COUNT; seg++) {
    const p1 = axonPathData[seg];
    const segDir = p1.direction.clone();
    
    const segGeo = new THREE.CylinderGeometry(AXON_RADIUS, AXON_RADIUS, AXON_SEGMENT_LENGTH, 12);
    const segMat = myelAxonMaterial.clone();
    const segment = new THREE.Mesh(segGeo, segMat);
    
    const segCenter = p1.position.clone().add(segDir.clone().multiplyScalar(AXON_SEGMENT_LENGTH / 2));
    segment.position.copy(segCenter);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), segDir);
    segment.userData = { type: 'axon', myelinated: true, segmentIndex: seg };
    myelinatedNeuronGroup.add(segment);
    myelAxonSegments.push(segment);
  }
  myelAxon = myelAxonSegments[0];
}

/**
 * Create myelin sheaths and nodes of Ranvier
 */
function createMyelinSheaths() {
  const effectiveAxonLength = AXON_LENGTH - INITIAL_SEGMENT_LENGTH - NODE_WIDTH;
  const MYELIN_SHEATH_LENGTH = (effectiveAxonLength - (NODE_OF_RANVIER_COUNT - 1) * NODE_WIDTH) / MYELIN_SHEATH_COUNT;
  
  initialSegmentX = AXON_START + INITIAL_SEGMENT_LENGTH / 2;
  
  // Create myelin sheaths
  for (let i = 0; i < MYELIN_SHEATH_COUNT; i++) {
    const sheathStartDist = INITIAL_SEGMENT_LENGTH + i * (MYELIN_SHEATH_LENGTH + NODE_WIDTH);
    const sheathMidDist = sheathStartDist + MYELIN_SHEATH_LENGTH / 2;
    const pathPoint = getMyelAxonPathPoint(sheathMidDist);
    
    const sheathGeometry = new THREE.CylinderGeometry(
      AXON_RADIUS + MYELIN_THICKNESS, AXON_RADIUS + MYELIN_THICKNESS, MYELIN_SHEATH_LENGTH, 24
    );
    const sheath = new THREE.Mesh(sheathGeometry, myelinMaterial.clone());
    sheath.position.copy(pathPoint.position);
    sheath.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pathPoint.direction);
    sheath.userData = { type: 'myelin', index: i };
    myelinatedNeuronGroup.add(sheath);
  }

  // Create initial segment channels
  createNodeChannels(INITIAL_SEGMENT_LENGTH / 2, -1, true);

  // Create nodes of Ranvier
  for (let i = 0; i < NODE_OF_RANVIER_COUNT - 1; i++) {
    const nodeDist = INITIAL_SEGMENT_LENGTH + (i + 1) * MYELIN_SHEATH_LENGTH + i * NODE_WIDTH + NODE_WIDTH / 2;
    const nodeX = AXON_START + nodeDist;
    const nodePathPoint = getMyelAxonPathPoint(nodeDist);
    
    const nodeGeometry = new THREE.TorusGeometry(AXON_RADIUS + 0.12, 0.06, 6, 18);
    const nodeMatInstance = nodeMaterial.clone();
    nodeMatInstance.opacity = 0.25;
    const node = new THREE.Mesh(nodeGeometry, nodeMatInstance);
    node.position.copy(nodePathPoint.position);
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nodePathPoint.direction);
    node.userData = { type: 'node', index: i };
    myelinatedNeuronGroup.add(node);
    
    createNodeChannels(nodeDist, i);
    
    nodesOfRanvier.push({
      mesh: node, material: nodeMatInstance, position: nodeX,
      voltage: -70, active: false
    });
  }

  // Terminal node
  const terminalNodeDist = AXON_LENGTH - NODE_WIDTH / 2;
  const terminalPathPoint = getMyelAxonPathPoint(terminalNodeDist);
  const terminalNodeMat = nodeMaterial.clone();
  terminalNodeMat.opacity = 0.25;
  const terminalNode = new THREE.Mesh(
    new THREE.TorusGeometry(AXON_RADIUS + 0.12, 0.06, 6, 18),
    terminalNodeMat
  );
  terminalNode.position.copy(terminalPathPoint.position);
  terminalNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), terminalPathPoint.direction);
  myelinatedNeuronGroup.add(terminalNode);
  
  createNodeChannels(terminalNodeDist, NODE_OF_RANVIER_COUNT - 1);
  
  nodesOfRanvier.push({
    mesh: terminalNode, material: terminalNodeMat, position: AXON_START + terminalNodeDist,
    voltage: -70, active: false, isTerminal: true
  });
}

/**
 * Create ion channels at a node
 */
function createNodeChannels(nodeDist, nodeIdx, isInitialSegment = false) {
  const channelsPerNode = isInitialSegment ? 8 : 10;
  const pathPoint = getMyelAxonPathPoint(nodeDist);
  
  for (let c = 0; c < channelsPerNode; c++) {
    const angle = (c / channelsPerNode) * Math.PI * 2;
    const distOffset = isInitialSegment ? 
      (c / channelsPerNode - 0.5) * INITIAL_SEGMENT_LENGTH * 0.6 : 
      (Math.random() - 0.5) * NODE_WIDTH * 0.7;
    const chPathPoint = getMyelAxonPathPoint(nodeDist + distOffset);
    
    // Na+ channel
    const naChannelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.45, 6);
    const naChannelMat = new THREE.MeshPhongMaterial({
      color: 0xff6b6b, emissive: 0xff0000, emissiveIntensity: 0.4
    });
    const naChannel = new THREE.Mesh(naChannelGeo, naChannelMat);
    
    const radialDir = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
    naChannel.position.copy(chPathPoint.position).add(radialDir.multiplyScalar(AXON_RADIUS));
    naChannel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radialDir.clone().normalize());
    myelinatedNeuronGroup.add(naChannel);
    
    const gateGeo = new THREE.BoxGeometry(0.2, 0.08, 0.2);
    const gateMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.position.y = 0.2;
    naChannel.add(gate);
    
    nodeChannels.sodium.push({ 
      mesh: naChannel, gate, nodeIndex: nodeIdx, 
      position: AXON_START + nodeDist + distOffset, angle, openness: 0 
    });
    
    // K+ channel (every other position)
    if (c % 2 === 0) {
      const kChannelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6);
      const kChannelMat = new THREE.MeshPhongMaterial({
        color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.3
      });
      const kChannel = new THREE.Mesh(kChannelGeo, kChannelMat);
      
      const kAngle = angle + 0.5;
      const kRadialDir = new THREE.Vector3(0, Math.cos(kAngle), Math.sin(kAngle));
      kChannel.position.copy(chPathPoint.position).add(kRadialDir.multiplyScalar(AXON_RADIUS));
      kChannel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), kRadialDir.clone().normalize());
      myelinatedNeuronGroup.add(kChannel);
      
      const kGate = new THREE.Mesh(gateGeo.clone(), gateMat.clone());
      kGate.position.y = 0.18;
      kChannel.add(kGate);
      
      nodeChannels.potassium.push({ 
        mesh: kChannel, gate: kGate, nodeIndex: nodeIdx, 
        position: AXON_START + nodeDist + distOffset + 0.3, angle: kAngle, openness: 0 
      });
    }
  }
}

/**
 * Create terminals for myelinated neuron - IDENTICAL to unmyelinated
 */
function createMyelTerminals() {
  resetBranchSeed();  // Reset to same seed as unmyelinated
  const MYEL_AXON_END_POS = myelAxonPathData[myelAxonPathData.length - 1].position.clone();
  
  function createMyelTerminalBranch(startPos, direction, depth, forceTerminal = false) {
    const lengthScale = Math.pow(PHI_INV, depth);
    const branchLength = BASE_BRANCH_LENGTH * lengthScale * (0.8 + seededRandom() * 0.4);
    const branchRadius = 0.5 * Math.pow(0.75, depth);
    
    const branchGeo = new THREE.CylinderGeometry(branchRadius * 0.7, branchRadius, branchLength, 8);
    const branchMat = myelAxonMaterial.clone();
    branchMat.opacity = 0.5;
    const branch = new THREE.Mesh(branchGeo, branchMat);
    
    const branchCenter = startPos.clone().add(direction.clone().multiplyScalar(branchLength / 2));
    branch.position.copy(branchCenter);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    myelinatedNeuronGroup.add(branch);
    
    const endPos = startPos.clone().add(direction.clone().multiplyScalar(branchLength));
    
    // Bouton - Hershey kiss shape using LatheGeometry (SAME as unmyelinated)
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
      color: 0x51cf66, emissive: 0x27ae60, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.8
    });
    const bouton = new THREE.Mesh(boutonGeo, boutonMat);
    bouton.position.copy(endPos).add(direction.clone().multiplyScalar(kissHeight * 0.5));
    bouton.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
    bouton.userData = { type: 'bouton', direction, myelinated: true, cleftSize: kissWidth };
    myelinatedNeuronGroup.add(bouton);
    
    // Synaptic cleft
    const cleftGeo = new THREE.CircleGeometry(kissWidth * 0.95, 16);
    const cleftMat = new THREE.MeshPhongMaterial({
      color: 0x446633, emissive: 0x223311, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.6, side: THREE.DoubleSide
    });
    const synapticCleft = new THREE.Mesh(cleftGeo, cleftMat);
    synapticCleft.position.copy(endPos).add(direction.clone().multiplyScalar(kissHeight + 0.02));
    synapticCleft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    myelinatedNeuronGroup.add(synapticCleft);
    
    myelTerminals.push({
      mesh: branch, branch, bouton, synapticCleft, direction,
      position: branch.position.x,
      cleftPosition: endPos.clone().add(direction.clone().multiplyScalar(kissHeight)),
      releasing: false, releaseStage: 0
    });
    
    // Early termination check - "apples close to the trunk" (SAME logic as unmyelinated)
    if (!forceTerminal && depth < MAX_BRANCH_DEPTH) {
      const earlyTermProb = depth === 0 ? 0.15 : (depth === 1 ? 0.12 : 0.08);
      if (seededRandom() < earlyTermProb) return;
    }
    
    // Sub-branches (SAME logic as unmyelinated)
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
        createMyelTerminalBranch(endPos.clone(), subDir, depth + 1);
      }
    }
  }
  
  // Create primary branches (SAME count as unmyelinated)
  const PRIMARY_COLLATERAL_COUNT = 8;
  for (let i = 0; i < PRIMARY_COLLATERAL_COUNT; i++) {
    const angle = (i / PRIMARY_COLLATERAL_COUNT) * Math.PI * 2;
    const spread = 0.6;
    const direction = new THREE.Vector3(
      0.5 + seededRandom() * 0.3,
      Math.sin(angle) * spread + (seededRandom() - 0.5) * 0.3,
      Math.cos(angle) * spread + (seededRandom() - 0.5) * 0.3
    ).normalize();
    createMyelTerminalBranch(MYEL_AXON_END_POS.clone(), direction, 0);
  }
}

/**
 * Create voltage visualization segments
 */
function createMyelVoltageSegments() {
  myelVoltageSegments.length = 0;  // Clear array without reassigning
  const segLength = AXON_LENGTH / segmentCount;
  
  for (let i = 0; i < segmentCount; i++) {
    const distanceAlongAxon = i * segLength + segLength / 2;
    const pathPoint = getMyelAxonPathPoint(distanceAlongAxon);
    
    const segmentGeometry = new THREE.CylinderGeometry(AXON_RADIUS * 0.8, AXON_RADIUS * 0.8, segLength * 1.02, 16);
    const segmentMaterial = new THREE.MeshPhongMaterial({
      color: 0x2060aa, emissive: 0x2060aa, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.5, shininess: 100, side: THREE.DoubleSide, depthWrite: false
    });
    const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
    
    segment.position.copy(pathPoint.position);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pathPoint.direction);
    segment.renderOrder = 1;
    myelinatedNeuronGroup.add(segment);
    
    myelVoltageSegments.push({
      mesh: segment, position: AXON_START + distanceAlongAxon,
      distance: distanceAlongAxon, voltage: -70, refractoryState: 0
    });
  }
}

/**
 * Get voltage for myelinated axon (saltatory conduction)
 */
export function getMyelinatedAxonVoltage(position, time) {
  if (!window.myelAPTriggered || window.myelAPStartTime < 0) return -70;
  
  const timeSinceAP = time - window.myelAPStartTime;
  const waveSpeed = 50 * (animationState.propSpeed / 100) * SALTATORY_SPEED_MULTIPLIER;
  const wavePos = AXON_START + timeSinceAP * waveSpeed;
  
  // Check if at a node
  let atNode = false;
  for (let i = 0; i < nodesOfRanvier.length; i++) {
    if (Math.abs(position - nodesOfRanvier[i].position) < NODE_WIDTH) {
      atNode = true;
      break;
    }
  }
  
  const inInitialSegment = (position - AXON_START) < INITIAL_SEGMENT_LENGTH + 2;
  const inTerminalRegion = position >= (AXON_START + AXON_LENGTH - NODE_WIDTH * 2);
  
  const distance = position - wavePos;
  
  if (distance > 15 || distance < -30) return -70;
  
  if (atNode || inInitialSegment || inTerminalRegion) {
    // Full AP at nodes
    if (distance > 0 && distance <= 12) {
      const t = 1 - distance / 12;
      return -70 + 110 * Math.pow(t, 1.5);
    } else if (distance >= -2 && distance <= 0) {
      return 40;
    } else if (distance >= -8 && distance < -2) {
      const t = (Math.abs(distance) - 2) / 6;
      return 40 - 120 * t;
    } else if (distance >= -18 && distance < -8) {
      const t = (Math.abs(distance) - 8) / 10;
      return -80 + 10 * t;
    } else {
      return -70;
    }
  } else {
    // Reduced voltage under myelin (passive spread)
    if (distance > 0 && distance <= 20) {
      const t = 1 - distance / 20;
      return -70 + 60 * Math.pow(t, 2) * 0.5;
    } else if (distance >= -5 && distance <= 0) {
      return -20 + 30 * Math.exp(-Math.abs(distance) * 0.3);
    } else if (distance >= -15 && distance < -5) {
      const t = (Math.abs(distance) - 5) / 10;
      return -20 - 50 * t;
    } else {
      return -70;
    }
  }
}

/**
 * Get refractory state for myelinated neuron
 */
export function getMyelRefractoryState(position, time) {
  if (!window.myelAPTriggered) return 0;
  const timeSinceAP = time - window.myelAPStartTime;
  const waveSpeed = 50 * (animationState.propSpeed / 100) * SALTATORY_SPEED_MULTIPLIER;
  const wavePos = AXON_START + timeSinceAP * waveSpeed;
  const distance = position - wavePos;
  
  if (distance >= -18 && distance < -2) return 1;
  if (distance >= -30 && distance < -18) return 2;
  return 0;
}

/**
 * Update voltage field visualization
 */
export function updateMyelVoltageField() {
  myelVoltageSegments.forEach(segment => {
    const voltage = getMyelinatedAxonVoltage(segment.position, animationState.time);
    segment.voltage = voltage;
    
    const mat = segment.mesh.material;
    
    // Check if at node
    let atNode = false;
    for (let i = 0; i < nodesOfRanvier.length; i++) {
      if (Math.abs(segment.position - nodesOfRanvier[i].position) < NODE_WIDTH) {
        atNode = true;
        break;
      }
    }
    
    if (atNode) {
      if (voltage >= -70) {
        const depolarT = Math.max(0, Math.min(1, (voltage + 70) / 110));
        mat.emissive.setRGB(0.2 + depolarT * 0.3, 0.8 + depolarT * 0.2, 0.4 + depolarT * 0.6);
        mat.emissiveIntensity = 0.8 + depolarT * 15.0;
        mat.opacity = 0.7 + depolarT * 0.3;
      } else {
        mat.emissive.setRGB(0.1, 0.3, 0.3);
        mat.emissiveIntensity = 0.3;
        mat.opacity = 0.6;
      }
    } else {
      if (voltage > -60) {
        const t = (voltage + 60) / 50;
        mat.emissive.setRGB(0.15 + t * 0.1, 0.25 + t * 0.2, 0.35 + t * 0.1);
        mat.emissiveIntensity = 0.3 + t * 1.5;
        mat.opacity = 0.4 + t * 0.2;
      } else {
        mat.emissive.setRGB(0.1, 0.15, 0.25);
        mat.emissiveIntensity = 0.2;
        mat.opacity = 0.35;
      }
    }
    
    mat.color.setRGB(mat.emissive.r * 0.8 + 0.2, mat.emissive.g * 0.8 + 0.2, mat.emissive.b * 0.8 + 0.2);
  });
  
  // Update node appearances
  nodesOfRanvier.forEach((node, i) => {
    const voltage = getMyelinatedAxonVoltage(node.position, animationState.time);
    node.voltage = voltage;
    
    if (voltage > -55) {
      node.active = true;
      const t = Math.min(1, (voltage + 55) / 95);
      node.mesh.material.emissive.setRGB(0.3 + t * 0.7, 1.0, 0.5 + t * 0.5);
      node.mesh.material.emissiveIntensity = 0.5 + t * 4.0;
      node.mesh.material.opacity = 0.4 + t * 0.6;
      node.mesh.scale.setScalar(1 + t * 0.5);
    } else {
      node.active = false;
      node.mesh.material.emissive.setRGB(0.15, 0.5, 0.3);
      node.mesh.material.emissiveIntensity = 0.1;
      node.mesh.material.opacity = 0.2;
      node.mesh.scale.setScalar(1);
    }
    
    if (i < nodeVoltages.length) {
      nodeVoltages[i] = voltage;
    }
  });
}

/**
 * Update node channel states
 */
export function updateMyelNodeChannels() {
  nodeChannels.sodium.forEach(ch => {
    const nodeIdx = ch.nodeIndex;
    let voltage = -70;
    
    if (nodeIdx === -1) {
      voltage = getMyelinatedAxonVoltage(initialSegmentX, animationState.time);
    } else if (nodeIdx >= 0 && nodeIdx < nodesOfRanvier.length) {
      voltage = nodesOfRanvier[nodeIdx].voltage;
    }
    
    const refState = getMyelRefractoryState(ch.position, animationState.time);
    
    if (refState === 0 && voltage > -55 && voltage < 30) {
      ch.openness = Math.min(1, ch.openness + 8 * 0.016);
    } else {
      ch.openness = Math.max(0, ch.openness - 4 * 0.016);
    }
    
    if (ch.gate) ch.gate.position.y = 0.2 - ch.openness * 0.35;
    ch.mesh.material.emissiveIntensity = 0.4 + ch.openness * 0.8;
  });
  
  nodeChannels.potassium.forEach(ch => {
    const nodeIdx = ch.nodeIndex;
    let voltage = -70;
    
    if (nodeIdx === -1) {
      voltage = getMyelinatedAxonVoltage(initialSegmentX, animationState.time);
    } else if (nodeIdx >= 0 && nodeIdx < nodesOfRanvier.length) {
      voltage = nodesOfRanvier[nodeIdx].voltage;
    }
    
    const refState = getMyelRefractoryState(ch.position, animationState.time);
    const isRepolarizing = refState === 1 && voltage < 30 && voltage > -75;
    
    if (isRepolarizing) {
      ch.openness = Math.min(1, ch.openness + 6 * 0.016);
    } else {
      ch.openness = Math.max(0, ch.openness - 4 * 0.016);
    }
    
    if (ch.gate) ch.gate.position.y = 0.18 - ch.openness * 0.35;
    ch.mesh.material.emissiveIntensity = 0.3 + ch.openness * 0.8;
  });
}

/**
 * Update terminal states
 */
export function updateMyelTerminals() {
  const terminalX = AXON_START + AXON_LENGTH;
  
  myelTerminals.forEach(terminal => {
    const voltage = getMyelinatedAxonVoltage(terminalX, animationState.time);
    
    if (terminal.branch && terminal.branch.material) {
      if (voltage >= -55) {
        const depolarT = Math.max(0, Math.min(1, (voltage + 55) / 95));
        terminal.branch.material.emissive.setRGB(0.2 + depolarT * 0.3, 0.6 + depolarT * 0.4, 0.4 + depolarT * 0.2);
        terminal.branch.material.emissiveIntensity = 0.5 + depolarT * 3.0;
        terminal.branch.material.opacity = 0.3 + depolarT * 0.4;
      } else {
        terminal.branch.material.emissive.setRGB(0.1, 0.3, 0.2);
        terminal.branch.material.emissiveIntensity = 0.2;
        terminal.branch.material.opacity = 0.2;
      }
    }
    
    if (voltage > 10 && !terminal.releasing) {
      terminal.releasing = true;
      terminal.bouton.material.emissiveIntensity = 2.5;
      terminal.bouton.material.emissive.setRGB(0.4, 1.0, 0.6);
      
      releaseMyelNeurotransmitter(terminal);
      
      // Record timing
      if (window.myelAPTriggered && apTimingData.myelinated.apStartTimes.length > apTimingData.myelinated.ntReleaseTimes.length) {
        const releaseTime = animationState.time;
        const startTime = apTimingData.myelinated.apStartTimes[apTimingData.myelinated.apStartTimes.length - 1];
        const delay = (releaseTime - startTime) * 1000;
        apTimingData.myelinated.ntReleaseTimes.push(releaseTime);
        apTimingData.myelinated.delays.push(delay);
        if (apTimingData.myelinated.delays.length > MAX_TIMING_SAMPLES) {
          apTimingData.myelinated.delays.shift();
          apTimingData.myelinated.apStartTimes.shift();
          apTimingData.myelinated.ntReleaseTimes.shift();
        }
        apTimingData.myelinated.avgDelay = apTimingData.myelinated.delays.reduce((a, b) => a + b, 0) / apTimingData.myelinated.delays.length;
      }
    } else if (voltage < -30 && terminal.releasing) {
      terminal.releasing = false;
      terminal.bouton.material.emissiveIntensity = 0.3;
      terminal.bouton.material.emissive.setRGB(0.2, 0.7, 0.4);
    }
  });
}

/**
 * Release neurotransmitter from myelinated terminal
 */
export function releaseMyelNeurotransmitter(terminal) {
  const boutonPos = terminal.bouton.position.clone();
  
  // Ca2+ influx
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
      boutonPos.x + Math.cos(angle1) * Math.cos(angle2) * startRadius,
      boutonPos.y + Math.sin(angle2) * startRadius,
      boutonPos.z + Math.sin(angle1) * Math.cos(angle2) * startRadius
    );
    myelinatedNeuronGroup.add(ion);
    myelCaInfluxIons.push({
      mesh: ion, target: boutonPos.clone(),
      speed: 4 + Math.random() * 3, lifetime: 0,
      fadeStart: 0.5 + Math.random() * 0.2
    });
  }
  
  // Vesicle
  const vesicle = new THREE.Mesh(vesicleGeo, vescleMat.clone());
  vesicle.position.copy(boutonPos);
  myelinatedNeuronGroup.add(vesicle);
  
  const cleftPos = terminal.cleftPosition || boutonPos.clone().add(terminal.direction.clone().multiplyScalar(1.5));
  
  myelVesicles.push({
    mesh: vesicle, terminal, direction: terminal.direction.clone(),
    cleftPosition: cleftPos, progress: 0, lifetime: 0, released: false
  });
}

/**
 * Update myelinated neuron ions
 */
export function updateMyelIons(deltaTime) {
  if (!animationState.showMyelinatedNeuron) return;
  
  // Reset burst tracking when AP ends
  if (!window.myelAPTriggered) {
    for (let key in nodeBurstFired.na) nodeBurstFired.na[key] = false;
    for (let key in nodeBurstFired.k) nodeBurstFired.k[key] = false;
  }
  
  // Create ions at active nodes
  nodesOfRanvier.forEach((node, idx) => {
    const voltage = node.voltage;
    const refState = getMyelRefractoryState(node.position, animationState.time);
    const nodeKey = 'node_' + idx;
    
    // Na+ during depolarization
    if (voltage > -55 && voltage < 30 && refState === 0) {
      if (!nodeBurstFired.na[nodeKey]) {
        nodeBurstFired.na[nodeKey] = true;
        createMyelIonBurst('Na', node, 8);
      }
    } else if (voltage < -65) {
      nodeBurstFired.na[nodeKey] = false;
    }
    
    // K+ during repolarization
    if (refState === 1 && !nodeBurstFired.k[nodeKey]) {
      nodeBurstFired.k[nodeKey] = true;
      createMyelIonBurst('K', node, 6);
    }
    if (refState === 0 && voltage < -65) {
      nodeBurstFired.k[nodeKey] = false;
    }
  });
  
  // Update existing ions
  for (let i = myelIons.length - 1; i >= 0; i--) {
    const ion = myelIons[i];
    ion.lifetime += deltaTime;
    
    if (ion.velocity) {
      ion.mesh.position.add(ion.velocity.clone().multiplyScalar(deltaTime));
      ion.velocity.multiplyScalar(0.95);
    }
    
    // Fade
    if (ion.lifetime > 1.5) {
      const fadeProgress = (ion.lifetime - 1.5) / 0.5;
      ion.mesh.material.opacity = Math.max(0, 0.9 - fadeProgress);
    }
    
    if (ion.lifetime > 2.0 || ion.mesh.material.opacity < 0.05) {
      myelinatedNeuronGroup.remove(ion.mesh);
      myelIons.splice(i, 1);
    }
  }
}

/**
 * Create a burst of ions at a node
 */
function createMyelIonBurst(type, nodeData, count) {
  for (let i = 0; i < count; i++) {
    createMyelIon(type, nodeData);
  }
}

/**
 * Create a single ion at a node
 */
function createMyelIon(type, nodeData) {
  const mat = type === 'Na' ? naMaterial.clone() : kMaterial.clone();
  mat.emissiveIntensity = 1.2;
  const ion = new THREE.Mesh(ionGeometry, mat);
  
  const angle = Math.random() * Math.PI * 2;
  const startR = type === 'Na' ? AXON_RADIUS + MYELIN_THICKNESS + 2 : AXON_RADIUS * 0.3;
  
  ion.position.set(
    nodeData.position + (Math.random() - 0.5) * NODE_WIDTH * 0.4,
    startR * Math.cos(angle),
    startR * Math.sin(angle)
  );
  myelinatedNeuronGroup.add(ion);
  
  const speed = type === 'Na' ? 3 : 2.5;
  const velocity = type === 'Na'
    ? new THREE.Vector3(0, -Math.cos(angle) * speed, -Math.sin(angle) * speed)
    : new THREE.Vector3(0, Math.cos(angle) * speed, Math.sin(angle) * speed);
  
  myelIons.push({
    mesh: ion, type, position: nodeData.position, angle,
    progress: 0, lifetime: 0, velocity
  });
}

/**
 * Update myelinated vesicles
 */
export function updateMyelVesicles(deltaTime) {
  if (!animationState.showMyelinatedNeuron) return;
  
  for (let i = myelVesicles.length - 1; i >= 0; i--) {
    const v = myelVesicles[i];
    v.progress += deltaTime * 3;
    v.lifetime += deltaTime;
    
    v.mesh.position.add(v.direction.clone().multiplyScalar(deltaTime * 2));
    
    if (v.progress > 0.5 && !v.released) {
      v.released = true;
      // Release neurotransmitters
      const ntMat = new THREE.MeshPhongMaterial({
        color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.6, transparent: true, opacity: 0.9
      });
      for (let j = 0; j < 30; j++) {
        const microNT = new THREE.Mesh(microNTGeo, ntMat.clone());
        microNT.position.copy(v.mesh.position);
        myelinatedNeuronGroup.add(microNT);
        
        myelMicroNTs.push({
          mesh: microNT,
          velocity: new THREE.Vector3(
            (Math.random() - 0.3) * 3,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          ),
          lifetime: 0
        });
      }
    }
    
    if (v.progress > 0.6) {
      const fadeProgress = (v.progress - 0.6) / 0.4;
      v.mesh.material.opacity = Math.max(0, 0.9 - fadeProgress);
      v.mesh.scale.setScalar(Math.max(0.1, 1 - fadeProgress * 0.8));
    }
    
    if (v.progress > 1.0 || v.mesh.material.opacity < 0.05) {
      myelinatedNeuronGroup.remove(v.mesh);
      myelVesicles.splice(i, 1);
    }
  }
  
  // Update micro NTs
  for (let i = myelMicroNTs.length - 1; i >= 0; i--) {
    const nt = myelMicroNTs[i];
    nt.lifetime += deltaTime;
    nt.mesh.position.add(nt.velocity.clone().multiplyScalar(deltaTime));
    nt.velocity.multiplyScalar(0.95);
    
    if (nt.lifetime > 0.5) {
      const fadeProgress = (nt.lifetime - 0.5) / 1.0;
      nt.mesh.material.opacity = Math.max(0, 0.9 - fadeProgress);
    }
    
    if (nt.lifetime > 1.5 || nt.mesh.material.opacity < 0.05) {
      myelinatedNeuronGroup.remove(nt.mesh);
      myelMicroNTs.splice(i, 1);
    }
  }
}

/**
 * Create synaptic input on myelinated dendrite
 */
export function createMyelSynapticInput(dendriteIdx, isExcitatory) {
  const dd = myelDendriteData[dendriteIdx];
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
      myelinatedNeuronGroup.add(particle);
      
      const towardDendrite = synapsePoint.clone().sub(startPos).normalize();
      
      myelSynapticInputs.push({
        mesh: particle, dendriteIdx, isExcitatory: true, isEPSP: true, ionType: 'Na',
        flowingIn: true, progress: Math.random() * 0.1, lifetime: 0,
        direction: towardDendrite,
        targetPoint: synapsePoint.clone(),
        speed: 0.6 + Math.random() * 0.4  // SLOW - like original
      });
    }
    
    // K+ efflux - starts INSIDE dendrite, flows OUT
    const kCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < kCount; i++) {
      const particle = new THREE.Mesh(ionGeo, kMat.clone());
      
      const startPos = synapsePoint.clone()
        .add(dd.direction.clone().multiplyScalar((Math.random() - 0.5) * 1.5));
      particle.position.copy(startPos);
      myelinatedNeuronGroup.add(particle);
      
      const outwardAngle = Math.random() * Math.PI * 2;
      const outwardDir = new THREE.Vector3(Math.cos(outwardAngle), Math.sin(outwardAngle), 0)
        .applyQuaternion(dd.mesh.quaternion);
      
      myelSynapticInputs.push({
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
      
      const perpAngle = Math.random() * Math.PI * 2;
      const perpDist = 1.5 + Math.random() * 2;
      const perpDir = new THREE.Vector3(Math.cos(perpAngle), Math.sin(perpAngle), 0)
        .applyQuaternion(dd.mesh.quaternion);
      const startPos = synapsePoint.clone()
        .add(perpDir.multiplyScalar(perpDist))
        .add(dd.direction.clone().multiplyScalar((Math.random() - 0.5) * 2));
      particle.position.copy(startPos);
      myelinatedNeuronGroup.add(particle);
      
      const towardDendrite = synapsePoint.clone().sub(startPos).normalize();
      
      myelSynapticInputs.push({
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
