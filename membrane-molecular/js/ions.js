/**
 * ions.js - Ion creation, dynamics, and ATP molecules
 * 
 * Creates and manages:
 * - Na+, K+, Cl- ions in extra/intracellular spaces
 * - ATP molecules in intracellular space
 * - Ion transit through channels during action potential
 * - Brownian motion and concentration gradients
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, ionGroup,
  SCALE, COLORS, BROWNIAN,
  ION_VISUAL_COUNTS,
  ions, atpMolecules,
  animationState,
  navChannels, kvChannels, pumps,
  NAV_STATES, KV_STATES, PUMP_STATES
} from './config.js';

// Shared geometries
let naIonGeometry;
let kIonGeometry;
let clIonGeometry;
let atpGeometry;
let adpGeometry;

// Materials
const ionMaterials = {};

/**
 * Initialize ion geometries and materials - SIMPLIFIED for performance
 */
function initIonGeometries() {
  // Na+ ion - small sphere (hydrated ~0.25nm) - LOW POLY
  naIonGeometry = new THREE.SphereGeometry(SCALE.NA_ION_RADIUS * 2.5, 6, 4);
  
  // K+ ion - slightly larger (hydrated ~0.35nm) - LOW POLY
  kIonGeometry = new THREE.SphereGeometry(SCALE.K_ION_RADIUS * 2.5, 6, 4);
  
  // Cl- ion - similar to K+ - LOW POLY
  clIonGeometry = new THREE.SphereGeometry(SCALE.CL_ION_RADIUS * 2.5, 6, 4);
  
  // ATP molecule - complex shape simplified as a cluster
  atpGeometry = new THREE.Group();
  // Adenine base
  const adenineGeo = new THREE.BoxGeometry(0.6, 0.3, 0.8);
  // Ribose
  const riboseGeo = new THREE.SphereGeometry(0.25, 8, 6);
  // Three phosphates
  const phosphateGeo = new THREE.SphereGeometry(0.2, 8, 6);
  
  // Materials with glow effects
  ionMaterials.Na = new THREE.MeshPhongMaterial({
    color: COLORS.Na,
    emissive: COLORS.Na,
    emissiveIntensity: 0.6,
    shininess: 80,
    transparent: true,
    opacity: 0.9,
  });
  
  ionMaterials.K = new THREE.MeshPhongMaterial({
    color: COLORS.K,
    emissive: COLORS.K,
    emissiveIntensity: 0.5,
    shininess: 80,
    transparent: true,
    opacity: 0.9,
  });
  
  ionMaterials.Cl = new THREE.MeshPhongMaterial({
    color: COLORS.Cl,
    emissive: COLORS.Cl,
    emissiveIntensity: 0.4,
    shininess: 60,
    transparent: true,
    opacity: 0.85,
  });
  
  ionMaterials.ATP = new THREE.MeshPhongMaterial({
    color: COLORS.atp,
    emissive: COLORS.atp,
    emissiveIntensity: 0.5,
    shininess: 70,
    transparent: true,
    opacity: 0.9,
  });
  
  ionMaterials.phosphate = new THREE.MeshPhongMaterial({
    color: 0xff6b6b,
    emissive: 0xff4444,
    emissiveIntensity: 0.4,
  });
}

/**
 * Create all ions based on concentration gradients
 */
export function createIons() {
  initIonGeometries();
  
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  const extraHeight = 20; // Height of extracellular region
  const intraHeight = 20; // Height of intracellular region
  
  // Extracellular ions (above membrane)
  createIonsInRegion('Na', ION_VISUAL_COUNTS.extracellular.Na, 
    -halfWidth, halfWidth, 
    SCALE.MEMBRANE_THICKNESS / 2 + 1, SCALE.MEMBRANE_THICKNESS / 2 + extraHeight,
    -halfDepth, halfDepth,
    'extracellular');
  
  createIonsInRegion('K', ION_VISUAL_COUNTS.extracellular.K,
    -halfWidth, halfWidth,
    SCALE.MEMBRANE_THICKNESS / 2 + 1, SCALE.MEMBRANE_THICKNESS / 2 + extraHeight,
    -halfDepth, halfDepth,
    'extracellular');
  
  createIonsInRegion('Cl', ION_VISUAL_COUNTS.extracellular.Cl,
    -halfWidth, halfWidth,
    SCALE.MEMBRANE_THICKNESS / 2 + 1, SCALE.MEMBRANE_THICKNESS / 2 + extraHeight,
    -halfDepth, halfDepth,
    'extracellular');
  
  // Intracellular ions (below membrane)
  createIonsInRegion('Na', ION_VISUAL_COUNTS.intracellular.Na,
    -halfWidth, halfWidth,
    -SCALE.MEMBRANE_THICKNESS / 2 - intraHeight, -SCALE.MEMBRANE_THICKNESS / 2 - 1,
    -halfDepth, halfDepth,
    'intracellular');
  
  createIonsInRegion('K', ION_VISUAL_COUNTS.intracellular.K,
    -halfWidth, halfWidth,
    -SCALE.MEMBRANE_THICKNESS / 2 - intraHeight, -SCALE.MEMBRANE_THICKNESS / 2 - 1,
    -halfDepth, halfDepth,
    'intracellular');
  
  createIonsInRegion('Cl', ION_VISUAL_COUNTS.intracellular.Cl,
    -halfWidth, halfWidth,
    -SCALE.MEMBRANE_THICKNESS / 2 - intraHeight, -SCALE.MEMBRANE_THICKNESS / 2 - 1,
    -halfDepth, halfDepth,
    'intracellular');
  
  // ATP molecules (intracellular only)
  createATPMolecules(ION_VISUAL_COUNTS.intracellular.ATP,
    -halfWidth, halfWidth,
    -SCALE.MEMBRANE_THICKNESS / 2 - intraHeight, -SCALE.MEMBRANE_THICKNESS / 2 - 2,
    -halfDepth, halfDepth);
}

/**
 * Create ions in a specific region
 */
function createIonsInRegion(type, count, minX, maxX, minY, maxY, minZ, maxZ, region) {
  const geometry = type === 'Na' ? naIonGeometry : 
                   type === 'K' ? kIonGeometry : clIonGeometry;
  
  for (let i = 0; i < count; i++) {
    const material = ionMaterials[type].clone();
    
    // Add slight color/opacity variation
    material.opacity *= 0.8 + Math.random() * 0.4;
    
    const ion = new THREE.Mesh(geometry, material);
    
    // Random position in region
    ion.position.set(
      minX + Math.random() * (maxX - minX),
      minY + Math.random() * (maxY - minY),
      minZ + Math.random() * (maxZ - minZ)
    );
    
    ionGroup.add(ion);
    
    // Store ion data for dynamics
    const ionData = {
      mesh: ion,
      type: type,
      region: region,
      basePosition: ion.position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * BROWNIAN.ionVelocityBase,
        (Math.random() - 0.5) * BROWNIAN.ionVelocityBase,
        (Math.random() - 0.5) * BROWNIAN.ionVelocityBase
      ),
      phase: Math.random() * Math.PI * 2,
      isTransiting: false,
      transitTarget: null,
      transitProgress: 0,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    };
    
    ions[region][type].push(ionData);
  }
}

/**
 * Create ATP molecules - SIMPLIFIED for performance
 */
function createATPMolecules(count, minX, maxX, minY, maxY, minZ, maxZ) {
  // Simplified ATP geometry - just a small elongated shape
  const atpGeo = new THREE.SphereGeometry(0.6, 5, 4);
  atpGeo.scale(1.5, 0.6, 0.6);
  
  for (let i = 0; i < count; i++) {
    const atp = new THREE.Mesh(atpGeo, ionMaterials.ATP.clone());
    
    // Random position
    atp.position.set(
      minX + Math.random() * (maxX - minX),
      minY + Math.random() * (maxY - minY),
      minZ + Math.random() * (maxZ - minZ)
    );
    
    // Random rotation
    atp.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI
    );
    
    ionGroup.add(atp);
    
    atpMolecules.push({
      mesh: atp,
      basePosition: atp.position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * BROWNIAN.atpAmplitude,
        (Math.random() - 0.5) * BROWNIAN.atpAmplitude,
        (Math.random() - 0.5) * BROWNIAN.atpAmplitude
      ),
      phase: Math.random() * Math.PI * 2,
      isBeingUsed: false,
      targetPump: null,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    });
  }
}

/**
 * Update all ion positions (Brownian motion + channel transit)
 */
export function updateIons(deltaTime) {
  const time = animationState.time;
  const brownian = animationState.brownianIntensity;
  
  // Update extracellular ions
  for (const type of ['Na', 'K', 'Cl']) {
    for (const ion of ions.extracellular[type]) {
      if (ion.isTransiting) {
        updateTransitingIon(ion, deltaTime);
      } else {
        updateBrownianIon(ion, time, brownian, deltaTime);
      }
    }
  }
  
  // Update intracellular ions
  for (const type of ['Na', 'K', 'Cl']) {
    for (const ion of ions.intracellular[type]) {
      if (ion.isTransiting) {
        updateTransitingIon(ion, deltaTime);
      } else {
        updateBrownianIon(ion, time, brownian, deltaTime);
      }
    }
  }
  
  // Update transiting ions
  for (let i = ions.transiting.length - 1; i >= 0; i--) {
    const ion = ions.transiting[i];
    updateTransitingIon(ion, deltaTime);
    
    // Remove if transit complete
    if (ion.transitProgress >= 1) {
      completeIonTransit(ion);
      ions.transiting.splice(i, 1);
    }
  }
  
  // Update ATP molecules
  for (const atp of atpMolecules) {
    if (!atp.isBeingUsed) {
      updateATPMolecule(atp, time, brownian, deltaTime);
    }
  }
  
  // Trigger ion flow through open channels
  triggerIonFlow(deltaTime);
}

/**
 * Update Brownian motion for an ion
 */
function updateBrownianIon(ion, time, brownian, deltaTime) {
  const amp = BROWNIAN.ionAmplitude * brownian;
  const phase = ion.phase;
  
  // Random walk component
  ion.velocity.x += (Math.random() - 0.5) * 0.5 * deltaTime;
  ion.velocity.y += (Math.random() - 0.5) * 0.5 * deltaTime;
  ion.velocity.z += (Math.random() - 0.5) * 0.5 * deltaTime;
  
  // Damping
  ion.velocity.multiplyScalar(0.98);
  
  // Apply velocity
  ion.mesh.position.add(ion.velocity.clone().multiplyScalar(deltaTime));
  
  // Add oscillation
  ion.mesh.position.x += Math.sin(time * 3 + phase) * amp * 0.1;
  ion.mesh.position.y += Math.sin(time * 2.5 + phase * 1.3) * amp * 0.1;
  ion.mesh.position.z += Math.cos(time * 2.8 + phase * 0.7) * amp * 0.1;
  
  // Boundary reflection
  const bounds = ion.bounds;
  if (ion.mesh.position.x < bounds.minX) {
    ion.mesh.position.x = bounds.minX;
    ion.velocity.x = Math.abs(ion.velocity.x);
  }
  if (ion.mesh.position.x > bounds.maxX) {
    ion.mesh.position.x = bounds.maxX;
    ion.velocity.x = -Math.abs(ion.velocity.x);
  }
  if (ion.mesh.position.y < bounds.minY) {
    ion.mesh.position.y = bounds.minY;
    ion.velocity.y = Math.abs(ion.velocity.y);
  }
  if (ion.mesh.position.y > bounds.maxY) {
    ion.mesh.position.y = bounds.maxY;
    ion.velocity.y = -Math.abs(ion.velocity.y);
  }
  if (ion.mesh.position.z < bounds.minZ) {
    ion.mesh.position.z = bounds.minZ;
    ion.velocity.z = Math.abs(ion.velocity.z);
  }
  if (ion.mesh.position.z > bounds.maxZ) {
    ion.mesh.position.z = bounds.maxZ;
    ion.velocity.z = -Math.abs(ion.velocity.z);
  }
}

/**
 * Update ion transiting through a channel
 */
function updateTransitingIon(ion, deltaTime) {
  ion.transitProgress += deltaTime * 3; // Transit speed
  ion.transitProgress = Math.min(1, ion.transitProgress);
  
  // Lerp position
  const t = easeInOutQuad(ion.transitProgress);
  ion.mesh.position.lerpVectors(ion.transitStart, ion.transitEnd, t);
  
  // Pulse effect during transit
  const scale = 1 + Math.sin(ion.transitProgress * Math.PI) * 0.3;
  ion.mesh.scale.setScalar(scale);
  
  // Increase emissive during transit
  ion.mesh.material.emissiveIntensity = 0.6 + Math.sin(ion.transitProgress * Math.PI) * 0.4;
}

/**
 * Complete ion transit - move to destination array
 */
function completeIonTransit(ion) {
  ion.mesh.scale.setScalar(1);
  ion.mesh.material.emissiveIntensity = 0.5;
  ion.isTransiting = false;
  
  // Update region
  const newRegion = ion.transitDirection === 'in' ? 'intracellular' : 'extracellular';
  ion.region = newRegion;
  
  // Update bounds
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  const height = 15;
  
  if (newRegion === 'intracellular') {
    ion.bounds = {
      minX: -halfWidth, maxX: halfWidth,
      minY: -SCALE.MEMBRANE_THICKNESS / 2 - height, maxY: -SCALE.MEMBRANE_THICKNESS / 2 - 1,
      minZ: -halfDepth, maxZ: halfDepth
    };
  } else {
    ion.bounds = {
      minX: -halfWidth, maxX: halfWidth,
      minY: SCALE.MEMBRANE_THICKNESS / 2 + 1, maxY: SCALE.MEMBRANE_THICKNESS / 2 + height,
      minZ: -halfDepth, maxZ: halfDepth
    };
  }
  
  // Add to appropriate array
  ions[newRegion][ion.type].push(ion);
}

/**
 * Update ATP molecule motion - SIMPLIFIED
 */
function updateATPMolecule(atp, time, brownian, deltaTime) {
  const phase = atp.phase;
  
  // Simple tumbling
  atp.mesh.rotation.x += 0.01;
  atp.mesh.rotation.y += 0.008;
  
  // Random walk
  atp.velocity.x += (Math.random() - 0.5) * deltaTime * 20;
  atp.velocity.y += (Math.random() - 0.5) * deltaTime * 20;
  atp.velocity.z += (Math.random() - 0.5) * deltaTime * 20;
  atp.velocity.multiplyScalar(0.95);
  
  atp.mesh.position.add(atp.velocity.clone().multiplyScalar(deltaTime));
  
  // Boundary reflection
  const bounds = atp.bounds;
  if (atp.mesh.position.x < bounds.minX || atp.mesh.position.x > bounds.maxX) {
    atp.velocity.x *= -1;
    atp.mesh.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, atp.mesh.position.x));
  }
  if (atp.mesh.position.y < bounds.minY || atp.mesh.position.y > bounds.maxY) {
    atp.velocity.y *= -1;
    atp.mesh.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, atp.mesh.position.y));
  }
  if (atp.mesh.position.z < bounds.minZ || atp.mesh.position.z > bounds.maxZ) {
    atp.velocity.z *= -1;
    atp.mesh.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, atp.mesh.position.z));
  }
}

/**
 * Trigger ion flow through open channels based on electrochemical gradient
 */
function triggerIonFlow(deltaTime) {
  // Na+ flows INWARD through open Nav channels (during depolarization)
  for (const channel of navChannels) {
    if (channel.state === NAV_STATES.OPEN) {
      // Probability of ion transit per frame
      if (Math.random() < 0.15 * deltaTime * 60) {
        const nearbyNa = findNearbyIon('Na', 'extracellular', channel.position, 8);
        if (nearbyNa) {
          startIonTransit(nearbyNa, channel, 'in');
        }
      }
    }
  }
  
  // K+ flows OUTWARD through open Kv channels (during repolarization)
  for (const channel of kvChannels) {
    if (channel.state === KV_STATES.OPEN) {
      if (Math.random() < 0.12 * deltaTime * 60) {
        const nearbyK = findNearbyIon('K', 'intracellular', channel.position, 8);
        if (nearbyK) {
          startIonTransit(nearbyK, channel, 'out');
        }
      }
    }
  }
  
  // Na+/K+-ATPase pumps: 3 Na+ out, 2 K+ in
  for (const pump of pumps) {
    // During E1P phase: pump Na+ out
    if (pump.state === PUMP_STATES.E1P) {
      if (Math.random() < 0.1 * deltaTime * 60) {
        const nearbyNa = findNearbyIon('Na', 'intracellular', pump.position, 6);
        if (nearbyNa) {
          startIonTransit(nearbyNa, pump, 'out', true);
        }
      }
    }
    // During E2 phase: pump K+ in
    if (pump.state === PUMP_STATES.E2) {
      if (Math.random() < 0.08 * deltaTime * 60) {
        const nearbyK = findNearbyIon('K', 'extracellular', pump.position, 6);
        if (nearbyK) {
          startIonTransit(nearbyK, pump, 'in', true);
        }
      }
    }
  }
}

/**
 * Find a nearby ion of specified type
 */
function findNearbyIon(type, region, channelPos, maxDist) {
  const ionList = ions[region][type];
  
  for (let i = 0; i < ionList.length; i++) {
    const ion = ionList[i];
    if (ion.isTransiting) continue;
    
    const dist = ion.mesh.position.distanceTo(channelPos);
    if (dist < maxDist) {
      // Remove from current array
      ionList.splice(i, 1);
      return ion;
    }
  }
  return null;
}

/**
 * Start ion transit through channel/pump
 */
function startIonTransit(ion, target, direction, isPump = false) {
  ion.isTransiting = true;
  ion.transitProgress = 0;
  ion.transitDirection = direction;
  ion.transitStart = ion.mesh.position.clone();
  
  // Calculate end position on other side of membrane
  const targetY = direction === 'in' 
    ? -SCALE.MEMBRANE_THICKNESS / 2 - 3 
    : SCALE.MEMBRANE_THICKNESS / 2 + 3;
  
  ion.transitEnd = new THREE.Vector3(
    target.position.x + (Math.random() - 0.5) * 3,
    targetY,
    target.position.z + (Math.random() - 0.5) * 3
  );
  
  // Add to transiting array
  ions.transiting.push(ion);
}

/**
 * Easing function for smooth transit
 */
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Get ion count for UI
 */
export function getIonCount() {
  let total = 0;
  for (const region of ['extracellular', 'intracellular']) {
    for (const type of ['Na', 'K', 'Cl']) {
      total += ions[region][type].length;
    }
  }
  total += ions.transiting.length;
  return total;
}

/**
 * Get ATP count
 */
export function getATPCount() {
  return atpMolecules.filter(a => !a.isBeingUsed).length;
}
