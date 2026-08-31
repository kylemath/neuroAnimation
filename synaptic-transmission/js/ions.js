/**
 * ions.js - Ion dynamics in the synapse
 * 
 * Models:
 * - Ca2+ influx through voltage-gated channels
 * - Na+/K+ flux through receptors
 * - Cl- flux through GABA-A receptors
 * - Ion diffusion and buffering
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, ionGroup, presynapticGroup, postsynapticGroup,
  SCALE, COLORS, POSITIONS,
  ION_VISUAL_COUNTS, ION_CONCENTRATIONS,
  AP_PARAMS, animationState, ions, channels,
  getCaVOpenProbability, geometryCache, materialCache,
  _tempVec3, _tempVec3_2
} from './config.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_IONS = 300;
const ION_SPEED = 3;
const CA_INFLUX_SPEED = 8;

// ============================================================================
// GEOMETRY AND MATERIAL SETUP
// ============================================================================

function initGeometries() {
  if (!geometryCache.ion) {
    geometryCache.ion = new THREE.SphereGeometry(SCALE.ION_RADIUS, 8, 6);
    geometryCache.ionSmall = new THREE.SphereGeometry(SCALE.ION_RADIUS * 0.7, 6, 4);
    geometryCache.ionLarge = new THREE.SphereGeometry(SCALE.ION_RADIUS * 1.2, 10, 8);
  }
}

function initMaterials() {
  if (!materialCache.Na) {
    // Na+ - RED/PINK like action-potential-3d
    materialCache.Na = new THREE.MeshPhongMaterial({
      color: 0xff6b6b,
      emissive: 0xff4444,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    
    // K+ - BRIGHT YELLOW like action-potential-3d (highly visible intracellular)
    materialCache.K = new THREE.MeshPhongMaterial({
      color: 0xffdd00,
      emissive: 0xffaa00,
      emissiveIntensity: 1.0,   // Very emissive - key for showing intracellular
      transparent: true,
      opacity: 0.9,
    });
    
    // Cl- - BLUE like action-potential-3d
    materialCache.Cl = new THREE.MeshPhongMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    
    // Ca2+ - WHITE/BRIGHT
    materialCache.Ca = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.95,
    });
    
    // Ca2+ influx - VERY BRIGHT during channel opening
    materialCache.CaInflux = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 1.0,
    });
    
    // Mg2+ - Gray (NMDA blocker)
    materialCache.Mg = new THREE.MeshPhongMaterial({
      color: 0xaaaaaa,
      emissive: 0x666666,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.8,
    });
  }
}

// ============================================================================
// ION CREATION
// ============================================================================

/**
 * Create ambient ions in all compartments
 */
export function createIons() {
  initGeometries();
  initMaterials();
  
  // Clear existing
  clearAllIons();
  
  if (!animationState.showIonFlow) return;
  
  // Cleft ions
  createIonsInCompartment('cleft', ION_VISUAL_COUNTS.cleft);
  
  // Presynaptic ions
  createIonsInCompartment('presynaptic', ION_VISUAL_COUNTS.presynaptic);
  
  // Postsynaptic ions
  createIonsInCompartment('postsynaptic', ION_VISUAL_COUNTS.postsynaptic);
  
  // EXTRACELLULAR ions - floating around OUTSIDE the synapse
  createExtracellularIons();
}

/**
 * Create ions in the extracellular space AROUND the synapse
 * These float in the environment surrounding the terminal and spine
 */
function createExtracellularIons() {
  // Extracellular has same concentrations as cleft
  const counts = {
    Na: 40,   // Lots of extracellular Na+
    Ca: 25,   // Extracellular Ca2+ (important for channels!)
    Cl: 30,   // Extracellular Cl-
  };
  
  // Initialize arrays if needed
  if (!ions.extracellular) {
    ions.extracellular = { Na: [], K: [], Cl: [], Ca: [], Mg: [] };
  }
  
  for (const ionType of Object.keys(counts)) {
    const count = counts[ionType];
    const array = ions.extracellular[ionType] || [];
    
    for (let i = 0; i < count; i++) {
      const ion = createExtracellularIon(ionType);
      if (ion) {
        array.push(ion);
      }
    }
    
    ions.extracellular[ionType] = array;
  }
}

/**
 * Create a single extracellular ion floating around the synapse
 */
function createExtracellularIon(type) {
  let material, geometry;
  
  switch (type) {
    case 'Na':
      material = materialCache.Na.clone();
      geometry = geometryCache.ion;
      break;
    case 'Ca':
      material = materialCache.Ca.clone();
      geometry = geometryCache.ionLarge;
      break;
    case 'Cl':
      material = materialCache.Cl.clone();
      geometry = geometryCache.ion;
      break;
    default:
      return null;
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  
  // Position around the synapse - in a shell around the terminal and spine
  const angle = Math.random() * Math.PI * 2;
  const vertAngle = Math.random() * Math.PI - Math.PI / 2;  // -90 to +90 degrees
  const radius = SCALE.TERMINAL_RADIUS + 5 + Math.random() * 15;  // 5-20 units outside
  
  const position = new THREE.Vector3(
    Math.cos(angle) * Math.cos(vertAngle) * radius,
    Math.sin(vertAngle) * radius * 0.6,  // Flatten vertically
    Math.sin(angle) * Math.cos(vertAngle) * radius
  );
  
  mesh.position.copy(position);
  ionGroup.add(mesh);
  
  return {
    mesh,
    type,
    compartment: 'extracellular',
    position: position.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * ION_SPEED * 0.5,
      (Math.random() - 0.5) * ION_SPEED * 0.5,
      (Math.random() - 0.5) * ION_SPEED * 0.5
    ),
    transiting: false,
    target: null,
    lifetime: 0,
  };
}

/**
 * Create ions in a specific compartment
 */
function createIonsInCompartment(compartment, counts) {
  const ionTypes = Object.keys(counts);
  
  for (const ionType of ionTypes) {
    const count = counts[ionType];
    const array = ions[compartment][ionType] || [];
    
    for (let i = 0; i < count; i++) {
      const ion = createIon(ionType, compartment);
      if (ion) {
        array.push(ion);
      }
    }
    
    ions[compartment][ionType] = array;
  }
}

/**
 * Create a single ion
 */
function createIon(type, compartment) {
  let material, geometry;
  
  switch (type) {
    case 'Na':
      material = materialCache.Na.clone();
      geometry = geometryCache.ion;
      break;
    case 'K':
      material = materialCache.K.clone();
      geometry = geometryCache.ion;
      break;
    case 'Cl':
      material = materialCache.Cl.clone();
      geometry = geometryCache.ion;
      break;
    case 'Ca':
      material = materialCache.Ca.clone();
      geometry = geometryCache.ionLarge;
      break;
    case 'Mg':
      material = materialCache.Mg.clone();
      geometry = geometryCache.ionSmall;
      break;
    default:
      return null;
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  const position = getRandomPositionInCompartment(compartment);
  mesh.position.copy(position);
  
  ionGroup.add(mesh);
  
  return {
    mesh,
    type,
    compartment,
    position: position.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * ION_SPEED,
      (Math.random() - 0.5) * ION_SPEED,
      (Math.random() - 0.5) * ION_SPEED
    ),
    transiting: false,
    target: null,
    lifetime: 0,
  };
}

/**
 * Get random position within a compartment
 */
function getRandomPositionInCompartment(compartment) {
  const pos = new THREE.Vector3();
  
  switch (compartment) {
    case 'cleft':
      // Synaptic cleft region
      pos.set(
        (Math.random() - 0.5) * SCALE.ACTIVE_ZONE_RADIUS * 2.5,
        (Math.random() - 0.5) * SCALE.CLEFT_WIDTH * 0.8,
        (Math.random() - 0.5) * SCALE.ACTIVE_ZONE_RADIUS * 2.5
      );
      break;
      
    case 'presynaptic':
      // Inside terminal button
      const preAngle = Math.random() * Math.PI * 2;
      const preRadius = Math.random() * SCALE.TERMINAL_RADIUS * 0.8;
      pos.set(
        Math.cos(preAngle) * preRadius,
        SCALE.CLEFT_WIDTH / 2 + 2 + Math.random() * 8,
        Math.sin(preAngle) * preRadius
      );
      break;
      
    case 'postsynaptic':
      // Inside spine head
      const postAngle = Math.random() * Math.PI * 2;
      const postRadius = Math.random() * SCALE.SPINE_RADIUS * 0.7;
      pos.set(
        Math.cos(postAngle) * postRadius,
        -SCALE.CLEFT_WIDTH / 2 - 2 - Math.random() * 5,
        Math.sin(postAngle) * postRadius
      );
      break;
  }
  
  return pos;
}

// ============================================================================
// ION UPDATES
// ============================================================================

/**
 * Update all ions
 */
export function updateIons(deltaTime) {
  if (!animationState.showIonFlow) return;
  
  const simDelta = deltaTime * 1000;
  
  // Update cleft ions
  updateIonsInCompartment('cleft', simDelta);
  
  // Update extracellular ions (floating around outside synapse)
  updateExtracellularIons(simDelta);
  
  // Update presynaptic ions (including Ca2+ dynamics)
  updatePresynapticIons(simDelta);
  
  // Update postsynaptic ions
  updatePostsynapticIons(simDelta);
  
  // Update transiting ions
  updateTransitingIons(simDelta);
}

/**
 * Update extracellular ions floating around the synapse
 */
function updateExtracellularIons(deltaTime) {
  if (!ions.extracellular) return;
  
  const ionTypes = Object.keys(ions.extracellular);
  
  for (const ionType of ionTypes) {
    const ionArray = ions.extracellular[ionType];
    if (!ionArray) continue;
    
    for (const ion of ionArray) {
      if (ion.transiting) continue;
      
      // Gentle Brownian motion
      const brownianScale = 0.03;
      ion.velocity.x += (Math.random() - 0.5) * brownianScale;
      ion.velocity.y += (Math.random() - 0.5) * brownianScale;
      ion.velocity.z += (Math.random() - 0.5) * brownianScale;
      
      // Stronger damping for smoother motion
      ion.velocity.multiplyScalar(0.95);
      
      // Apply velocity
      ion.mesh.position.add(
        _tempVec3.copy(ion.velocity).multiplyScalar(deltaTime * 0.001)
      );
      
      // Keep in extracellular shell around synapse
      const dist = ion.mesh.position.length();
      const minDist = SCALE.TERMINAL_RADIUS + 3;
      const maxDist = SCALE.TERMINAL_RADIUS + 25;
      
      if (dist < minDist) {
        // Push outward
        ion.mesh.position.normalize().multiplyScalar(minDist + 1);
        ion.velocity.multiplyScalar(-0.3);
      } else if (dist > maxDist) {
        // Pull back toward synapse
        ion.velocity.add(
          _tempVec3.copy(ion.mesh.position).normalize().multiplyScalar(-0.1)
        );
      }
    }
  }
}

/**
 * Update ions in a compartment (Brownian motion)
 */
function updateIonsInCompartment(compartment, deltaTime) {
  const ionTypes = Object.keys(ions[compartment] || {});
  
  for (const ionType of ionTypes) {
    const ionArray = ions[compartment][ionType];
    if (!ionArray) continue;
    
    for (const ion of ionArray) {
      if (ion.transiting) continue;
      
      // Brownian motion
      const brownianScale = 0.05;
      ion.velocity.x += (Math.random() - 0.5) * brownianScale;
      ion.velocity.y += (Math.random() - 0.5) * brownianScale;
      ion.velocity.z += (Math.random() - 0.5) * brownianScale;
      
      // Damping
      ion.velocity.multiplyScalar(0.98);
      
      // Apply velocity
      ion.mesh.position.add(
        _tempVec3.copy(ion.velocity).multiplyScalar(deltaTime * 0.001)
      );
      
      // Boundary constraints
      constrainToCompartment(ion, compartment);
    }
  }
}

/**
 * Update presynaptic ions with Ca2+ channel dynamics
 */
function updatePresynapticIons(deltaTime) {
  // Regular Brownian motion for Na/K
  updateIonsInCompartment('presynaptic', deltaTime);
  
  // Ca2+ influx during AP - DRAMATIC visual of Ca rushing in!
  if (animationState.apActive && animationState.preVoltage > AP_PARAMS.CaV_threshold) {
    const caOpenProb = getCaVOpenProbability(animationState.preVoltage);
    
    // Spawn MULTIPLE Ca2+ influx particles for visual effect
    const influxRate = caOpenProb * animationState.caDensity * deltaTime * 0.05;  // 5x more frequent
    
    // Spawn multiple per frame when channels are open wide
    const numToSpawn = Math.floor(influxRate) + (Math.random() < (influxRate % 1) ? 1 : 0);
    for (let s = 0; s < Math.min(numToSpawn, 3); s++) {
      spawnCaInflux();
    }
  }
  
  // Update existing Ca2+ in presynaptic
  const caArray = ions.presynaptic.Ca;
  if (caArray) {
    for (let i = caArray.length - 1; i >= 0; i--) {
      const ion = caArray[i];
      ion.lifetime += deltaTime;
      
      // If influxing, move toward target inside terminal
      if (ion.influxing && ion.target) {
        // Fast movement toward target
        ion.mesh.position.add(
          _tempVec3.copy(ion.velocity).multiplyScalar(deltaTime * 0.003)
        );
        
        // Check if reached target (inside terminal)
        const distToTarget = ion.mesh.position.distanceTo(ion.target);
        if (distToTarget < 2 || ion.mesh.position.y > SCALE.CLEFT_WIDTH / 2 + SCALE.TERMINAL_HEIGHT * 0.7) {
          // Arrived inside - switch to Brownian motion
          ion.influxing = false;
          ion.velocity.set(
            (Math.random() - 0.5) * ION_SPEED,
            (Math.random() - 0.5) * ION_SPEED,
            (Math.random() - 0.5) * ION_SPEED
          );
        }
      } else {
        // Normal Brownian motion inside terminal
        const brownianScale = 0.04;
        ion.velocity.x += (Math.random() - 0.5) * brownianScale;
        ion.velocity.y += (Math.random() - 0.5) * brownianScale;
        ion.velocity.z += (Math.random() - 0.5) * brownianScale;
        ion.velocity.multiplyScalar(0.97);
        
        ion.mesh.position.add(
          _tempVec3.copy(ion.velocity).multiplyScalar(deltaTime * 0.001)
        );
        
        // Keep inside terminal dome
        const membraneY = SCALE.CLEFT_WIDTH / 2;
        if (ion.mesh.position.y < membraneY + 1) {
          ion.mesh.position.y = membraneY + 1;
          ion.velocity.y *= -0.5;
        }
      }
      
      // Ca2+ buffering/removal (slowly fade after some time)
      if (ion.lifetime > 150) {
        const fadeProgress = (ion.lifetime - 150) / 250;
        ion.mesh.material.opacity = 0.95 * (1 - fadeProgress);
        
        if (fadeProgress > 1) {
          ionGroup.remove(ion.mesh);
          caArray.splice(i, 1);
        }
      }
    }
  }
}

/**
 * Spawn Ca2+ influx particle at active zone
 */
function spawnCaInflux() {
  if ((ions.presynaptic.Ca?.length || 0) >= 80) return;  // Allow more Ca2+
  
  const mesh = new THREE.Mesh(geometryCache.ionLarge, materialCache.CaInflux.clone());
  
  // Ca2+ should spawn OUTSIDE and rush IN through the membrane channels
  // Position at the sides of the terminal dome (where Ca channels are)
  const angle = Math.random() * Math.PI * 2;
  const terminalRadius = SCALE.TERMINAL_RADIUS;
  const preMembraneY = SCALE.CLEFT_WIDTH / 2;
  
  // Start position: OUTSIDE the terminal dome surface
  const startRadius = terminalRadius * 0.85;  // On the curved dome surface
  const heightOnDome = preMembraneY + Math.sqrt(terminalRadius * terminalRadius - startRadius * startRadius) * 0.4;
  
  const startX = Math.cos(angle) * (startRadius + 2);  // Slightly outside
  const startZ = Math.sin(angle) * (startRadius + 2);
  
  mesh.position.set(startX, heightOnDome + 2, startZ);
  
  ionGroup.add(mesh);
  
  // Target: INSIDE the terminal, toward the center
  const targetX = Math.cos(angle) * startRadius * 0.3;
  const targetY = preMembraneY + 5 + Math.random() * 5;
  const targetZ = Math.sin(angle) * startRadius * 0.3;
  
  // Velocity pointing INWARD toward the terminal interior
  const direction = new THREE.Vector3(
    targetX - startX,
    targetY - heightOnDome,
    targetZ - startZ
  ).normalize();
  
  const ion = {
    mesh,
    type: 'Ca',
    compartment: 'presynaptic',
    position: mesh.position.clone(),
    velocity: direction.multiplyScalar(CA_INFLUX_SPEED * 1.5),  // Fast influx!
    transiting: false,
    lifetime: 0,
    influxing: true,
    target: new THREE.Vector3(targetX, targetY, targetZ),
  };
  
  if (!ions.presynaptic.Ca) ions.presynaptic.Ca = [];
  ions.presynaptic.Ca.push(ion);
  
  console.log(`💨 Ca2+ INFLUX! Starting at (${startX.toFixed(1)}, ${heightOnDome.toFixed(1)}, ${startZ.toFixed(1)}) → inside terminal`);
  
  // Update presynaptic Ca concentration
  animationState.preCaConc = Math.min(0.1, animationState.preCaConc + 0.001);
}

/**
 * Update postsynaptic ions with receptor-mediated flux
 * Models both influx and efflux through open receptors
 */
function updatePostsynapticIons(deltaTime) {
  updateIonsInCompartment('postsynaptic', deltaTime);
  
  // Track ion flow for graphs (reset each frame, accumulated by spawn functions)
  if (animationState.ionFlowAccumulator === undefined) {
    animationState.ionFlowAccumulator = { Na: 0, K: 0, Cl: 0, Ca: 0, net: 0 };
  }
  
  // Reset flow accumulator each update cycle
  animationState.ionFlowAccumulator.Na = 0;
  animationState.ionFlowAccumulator.K = 0;
  animationState.ionFlowAccumulator.Cl = 0;
  animationState.ionFlowAccumulator.Ca = 0;
  
  // AMPA receptors: Na+ influx AND K+ efflux (non-selective cation channel)
  // Driving forces: Na+ rushes IN (high outside), K+ rushes OUT (high inside)
  if (animationState.ampaBound > 0) {
    // Na+ influx through AMPA
    const naInfluxRate = animationState.ampaBound * deltaTime * 0.02;
    const naToSpawn = Math.floor(naInfluxRate) + (Math.random() < (naInfluxRate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(naToSpawn, 3); i++) {
      spawnPostsynapticIon('Na', 'influx');
      animationState.ionFlowAccumulator.Na += 1;  // Positive = influx
    }
    
    // K+ efflux through AMPA (K+ leaves cell into cleft)
    // Slightly less than Na+ due to driving force differences
    const kEffluxRate = animationState.ampaBound * deltaTime * 0.015;
    const kToSpawn = Math.floor(kEffluxRate) + (Math.random() < (kEffluxRate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(kToSpawn, 2); i++) {
      spawnPostsynapticIonEfflux('K');
      animationState.ionFlowAccumulator.K -= 1;  // Negative = efflux
    }
  }
  
  // NMDA receptors: Na+, K+, AND Ca2+ (when Mg block relieved)
  if (animationState.nmdaBound > 0 && animationState.mgBlock < 0.5) {
    const mgRelief = 1 - animationState.mgBlock;
    
    // Ca2+ influx (main NMDA contribution - critical for plasticity)
    const caInfluxRate = animationState.nmdaBound * mgRelief * deltaTime * 0.012;
    const caToSpawn = Math.floor(caInfluxRate) + (Math.random() < (caInfluxRate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(caToSpawn, 2); i++) {
      spawnPostsynapticIon('Ca', 'influx');
      animationState.ionFlowAccumulator.Ca += 2;  // Ca2+ is divalent, counts double
    }
    
    // Na+ influx through NMDA
    const naNMDARate = animationState.nmdaBound * mgRelief * deltaTime * 0.01;
    const naNMDA = Math.floor(naNMDARate) + (Math.random() < (naNMDARate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(naNMDA, 2); i++) {
      spawnPostsynapticIon('Na', 'influx');
      animationState.ionFlowAccumulator.Na += 1;
    }
    
    // K+ efflux through NMDA
    const kNMDARate = animationState.nmdaBound * mgRelief * deltaTime * 0.008;
    const kNMDA = Math.floor(kNMDARate) + (Math.random() < (kNMDARate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(kNMDA, 1); i++) {
      spawnPostsynapticIonEfflux('K');
      animationState.ionFlowAccumulator.K -= 1;
    }
  }
  
  // GABA-A receptors: Cl- influx (inhibitory)
  if (animationState.gabaaBound > 0) {
    const clInfluxRate = animationState.gabaaBound * deltaTime * 0.02;
    const clToSpawn = Math.floor(clInfluxRate) + (Math.random() < (clInfluxRate % 1) ? 1 : 0);
    for (let i = 0; i < Math.min(clToSpawn, 3); i++) {
      spawnPostsynapticIon('Cl', 'influx');
      animationState.ionFlowAccumulator.Cl -= 1;  // Cl- influx is hyperpolarizing (negative current)
    }
  }
  
  // Calculate net ion flow (positive = depolarizing, negative = hyperpolarizing)
  // Na+ in = +, K+ out = -, Cl- in = - (inhibitory)
  animationState.ionFlowAccumulator.net = 
    animationState.ionFlowAccumulator.Na + 
    animationState.ionFlowAccumulator.K + 
    animationState.ionFlowAccumulator.Cl +
    animationState.ionFlowAccumulator.Ca;
  
  // Apply time-smoothed ion flow for display
  if (animationState.smoothedIonFlow === undefined) {
    animationState.smoothedIonFlow = 0;
  }
  // Smooth with decay (mimics membrane capacitance delay)
  animationState.smoothedIonFlow = 
    animationState.smoothedIonFlow * 0.9 + 
    animationState.ionFlowAccumulator.net * 0.1;
  
  // Update existing postsynaptic ions with lifetime (FIX: ions need to decay!)
  updatePostsynapticIonLifetimes(deltaTime);
}

/**
 * Spawn ion in postsynaptic compartment (INFLUX - from cleft into spine)
 * Now with lifetime tracking for proper replenishment
 */
function spawnPostsynapticIon(type, direction) {
  // Increased cap to allow more dynamic ion flow
  if ((ions.postsynaptic[type]?.length || 0) >= 60) return;
  
  let material;
  switch (type) {
    case 'Na': material = materialCache.Na.clone(); break;
    case 'Cl': material = materialCache.Cl.clone(); break;
    case 'Ca': material = materialCache.CaInflux.clone(); break;
    default: return;
  }
  
  const geometry = type === 'Ca' ? geometryCache.ionLarge : geometryCache.ion;
  const mesh = new THREE.Mesh(geometry, material);
  
  // Spawn at PSD (just below cleft - ion entering spine)
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * SCALE.ACTIVE_ZONE_RADIUS * 0.6;
  
  mesh.position.set(
    Math.cos(angle) * radius,
    -SCALE.CLEFT_WIDTH / 2 - 0.5,
    Math.sin(angle) * radius
  );
  
  ionGroup.add(mesh);
  
  const ion = {
    mesh,
    type,
    compartment: 'postsynaptic',
    position: mesh.position.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      -ION_SPEED,  // Moving DOWN into spine
      (Math.random() - 0.5) * 2
    ),
    transiting: false,
    lifetime: 0,
    maxLifetime: 200 + Math.random() * 300,  // 200-500ms lifetime before "buffered"
    direction: 'influx',
  };
  
  if (!ions.postsynaptic[type]) ions.postsynaptic[type] = [];
  ions.postsynaptic[type].push(ion);
}

/**
 * Spawn K+ ion efflux (from postsynaptic INTO cleft)
 * K+ flows out through open AMPA/NMDA channels due to concentration gradient
 */
function spawnPostsynapticIonEfflux(type) {
  if (type !== 'K') return;
  
  // Check cleft K+ capacity (K+ accumulates in cleft during activity)
  if ((ions.cleft.K?.length || 0) >= 50) return;
  
  const material = materialCache.K.clone();
  const mesh = new THREE.Mesh(geometryCache.ion, material);
  
  // Spawn at PSD (K+ leaving the spine head)
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * SCALE.ACTIVE_ZONE_RADIUS * 0.5;
  
  // Start just inside spine, will move UP into cleft
  mesh.position.set(
    Math.cos(angle) * radius,
    -SCALE.CLEFT_WIDTH / 2 - 1.0,
    Math.sin(angle) * radius
  );
  
  ionGroup.add(mesh);
  
  const ion = {
    mesh,
    type: 'K',
    compartment: 'cleft',  // Will end up in cleft
    position: mesh.position.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      ION_SPEED * 1.2,  // Moving UP into cleft (efflux)
      (Math.random() - 0.5) * 2
    ),
    transiting: false,
    lifetime: 0,
    maxLifetime: 300 + Math.random() * 400,  // Will be cleared from cleft
    direction: 'efflux',
    fromPostsynaptic: true,  // Track origin
  };
  
  if (!ions.cleft.K) ions.cleft.K = [];
  ions.cleft.K.push(ion);
}

/**
 * Update postsynaptic ion lifetimes and remove "buffered" ions
 * This fixes the bug where ions accumulate and never clear
 */
function updatePostsynapticIonLifetimes(deltaTime) {
  const ionTypes = ['Na', 'K', 'Cl', 'Ca'];
  
  for (const ionType of ionTypes) {
    const ionArray = ions.postsynaptic[ionType];
    if (!ionArray) continue;
    
    for (let i = ionArray.length - 1; i >= 0; i--) {
      const ion = ionArray[i];
      ion.lifetime += deltaTime;
      
      // Ion gets "buffered" or pumped out after its lifetime
      if (ion.lifetime > (ion.maxLifetime || 400)) {
        // Fade out effect
        const fadeProgress = (ion.lifetime - (ion.maxLifetime || 400)) / 150;
        ion.mesh.material.opacity = Math.max(0, 0.9 * (1 - fadeProgress));
        
        if (fadeProgress > 1) {
          ionGroup.remove(ion.mesh);
          ionArray.splice(i, 1);
        }
      }
    }
  }
  
  // Also update cleft K+ (effluxed K+ gets cleared by astrocytes/diffusion)
  const cleftK = ions.cleft.K;
  if (cleftK) {
    for (let i = cleftK.length - 1; i >= 0; i--) {
      const ion = cleftK[i];
      if (ion.fromPostsynaptic) {
        ion.lifetime += deltaTime;
        
        if (ion.lifetime > (ion.maxLifetime || 350)) {
          const fadeProgress = (ion.lifetime - (ion.maxLifetime || 350)) / 200;
          ion.mesh.material.opacity = Math.max(0, 0.9 * (1 - fadeProgress));
          
          if (fadeProgress > 1) {
            ionGroup.remove(ion.mesh);
            cleftK.splice(i, 1);
          }
        }
      }
    }
  }
}

/**
 * Update ions transiting through channels
 */
function updateTransitingIons(deltaTime) {
  for (let i = ions.transiting.length - 1; i >= 0; i--) {
    const ion = ions.transiting[i];
    
    // Move toward target
    if (ion.target) {
      ion.mesh.position.lerp(ion.target, 0.1);
      
      const dist = ion.mesh.position.distanceTo(ion.target);
      if (dist < 0.5) {
        // Arrived at destination
        ion.transiting = false;
        ions.transiting.splice(i, 1);
        
        // Add to destination compartment
        const destArray = ions[ion.destCompartment]?.[ion.type];
        if (destArray) {
          destArray.push(ion);
        }
      }
    }
  }
}

/**
 * Constrain ion to compartment boundaries
 */
function constrainToCompartment(ion, compartment) {
  const pos = ion.mesh.position;
  
  switch (compartment) {
    case 'cleft':
      const cleftRadius = SCALE.ACTIVE_ZONE_RADIUS * 1.5;
      const dist = Math.sqrt(pos.x ** 2 + pos.z ** 2);
      if (dist > cleftRadius) {
        pos.x *= cleftRadius / dist;
        pos.z *= cleftRadius / dist;
        ion.velocity.x *= -0.5;
        ion.velocity.z *= -0.5;
      }
      // Vertical bounds
      const cleftHalf = SCALE.CLEFT_WIDTH / 2 * 0.9;
      pos.y = Math.max(-cleftHalf, Math.min(cleftHalf, pos.y));
      if (Math.abs(pos.y) >= cleftHalf) ion.velocity.y *= -0.5;
      break;
      
    case 'presynaptic':
      const preRadius = SCALE.TERMINAL_RADIUS * 0.9;
      const preDist = Math.sqrt(pos.x ** 2 + pos.z ** 2);
      if (preDist > preRadius) {
        pos.x *= preRadius / preDist;
        pos.z *= preRadius / preDist;
      }
      const preMinY = SCALE.CLEFT_WIDTH / 2 + 1;
      const preMaxY = SCALE.CLEFT_WIDTH / 2 + 10;
      pos.y = Math.max(preMinY, Math.min(preMaxY, pos.y));
      break;
      
    case 'postsynaptic':
      const postRadius = SCALE.SPINE_RADIUS * 0.8;
      const postDist = Math.sqrt(pos.x ** 2 + pos.z ** 2);
      if (postDist > postRadius) {
        pos.x *= postRadius / postDist;
        pos.z *= postRadius / postDist;
      }
      const postMaxY = -SCALE.CLEFT_WIDTH / 2 - 1;
      const postMinY = -SCALE.CLEFT_WIDTH / 2 - 7;
      pos.y = Math.max(postMinY, Math.min(postMaxY, pos.y));
      break;
  }
}

// ============================================================================
// EXTERNAL API
// ============================================================================

/**
 * Clear all ions
 */
export function clearAllIons() {
  // Clear each compartment including extracellular
  for (const compartment of ['cleft', 'presynaptic', 'postsynaptic', 'extracellular']) {
    const ionTypes = Object.keys(ions[compartment] || {});
    for (const ionType of ionTypes) {
      const array = ions[compartment][ionType];
      if (array) {
        for (const ion of array) {
          ionGroup.remove(ion.mesh);
        }
        array.length = 0;
      }
    }
  }
  
  // Clear transiting
  for (const ion of ions.transiting) {
    ionGroup.remove(ion.mesh);
  }
  ions.transiting = [];
}

/**
 * Toggle ion visibility
 */
export function setIonVisibility(visible) {
  ionGroup.visible = visible;
  animationState.showIonFlow = visible;
  
  if (visible && getTotalIonCount() === 0) {
    createIons();
  }
}

/**
 * Get total ion count
 */
export function getTotalIonCount() {
  let count = 0;
  for (const compartment of ['cleft', 'presynaptic', 'postsynaptic']) {
    const ionTypes = Object.keys(ions[compartment] || {});
    for (const ionType of ionTypes) {
      count += (ions[compartment][ionType]?.length || 0);
    }
  }
  return count + ions.transiting.length;
}
