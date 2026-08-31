/**
 * vesicles.js - Synaptic vesicle dynamics
 * 
 * Models:
 * - Vesicle pools (RRP, recycling, reserve)
 * - SNARE-mediated vesicle fusion
 * - Ca2+-triggered exocytosis via synaptotagmin
 * - Vesicle recycling via endocytosis
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, vesicleGroup, presynapticGroup,
  SCALE, COLORS, POSITIONS,
  VESICLE_POOLS, VESICLE_CONTENT, SNARE_STATES, SNARE_COLORS,
  AP_PARAMS, animationState, vesicles,
  getReleaseProbability, geometryCache, materialCache,
  _tempVec3, _tempVec3_2
} from './config.js';
import { releaseNeurotransmitters } from './neurotransmitters.js';

// ============================================================================
// GEOMETRY AND MATERIAL SETUP
// ============================================================================

function initGeometries() {
  if (!geometryCache.vesicle) {
    geometryCache.vesicle = new THREE.SphereGeometry(SCALE.VESICLE_RADIUS, 16, 12);
    geometryCache.vesicleSmall = new THREE.SphereGeometry(SCALE.VESICLE_RADIUS * 0.8, 12, 8);
    geometryCache.snareComplex = new THREE.CylinderGeometry(0.2, 0.4, 1.5, 6);
  }
}

function initMaterials() {
  if (!materialCache.vesicleRRP) {
    // Vesicle materials - Semi-transparent to show NT content inside
    // depthWrite: false allows NT inside to be visible
    materialCache.vesicleRRP = new THREE.MeshPhongMaterial({
      color: COLORS.vesicleRRP,
      emissive: COLORS.vesicleRRP,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.3,             // More transparent to see NT inside
      side: THREE.FrontSide,
      depthWrite: false,        // Don't hide NT inside
    });
    
    // Filled vesicle (has NT inside) - transparent shell with green tint
    materialCache.vesicleRRPFilled = new THREE.MeshPhongMaterial({
      color: 0x66ddaa,          // Light green tint for glutamate content
      emissive: 0x00ff66,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.35,            // Transparent to see NT inside
      side: THREE.FrontSide,
      depthWrite: false,        // Don't hide NT inside
    });
    
    materialCache.vesicleRecycling = new THREE.MeshPhongMaterial({
      color: COLORS.vesicleRecycling,
      emissive: COLORS.vesicleRecycling,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.3,             // More transparent
      side: THREE.FrontSide,
      depthWrite: false,
    });
    
    materialCache.vesicleReserve = new THREE.MeshPhongMaterial({
      color: COLORS.vesicleReserve,
      emissive: COLORS.vesicleReserve,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.25,            // More transparent
      side: THREE.FrontSide,
      depthWrite: false,
    });
    
    materialCache.vesicleFusing = new THREE.MeshPhongMaterial({
      color: 0x00ff88,          // Green during fusion (releasing glutamate)
      emissive: 0x00ffaa,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
    });
    
    // NT content sphere (visible inside transparent vesicle) - SUPER BRIGHT
    materialCache.ntContent = new THREE.MeshPhongMaterial({
      color: 0x00ff88,          // GREEN like action-potential-3d
      emissive: 0x00ff88,       // Match color for max glow
      emissiveIntensity: 2.0,   // VERY bright glow
      transparent: false,       // Solid - always visible
    });
    
    materialCache.ntContentGaba = new THREE.MeshPhongMaterial({
      color: 0xcc66ff,          // Bright purple for GABA
      emissive: 0xaa44ff,
      emissiveIntensity: 2.0,   // VERY bright glow
      transparent: false,       // Solid - always visible
    });
    
    // SNARE protein colors
    materialCache.synaptobrevin = new THREE.MeshPhongMaterial({
      color: SNARE_COLORS.synaptobrevin,
      emissive: SNARE_COLORS.synaptobrevin,
      emissiveIntensity: 0.5,
    });
    
    materialCache.syntaxin = new THREE.MeshPhongMaterial({
      color: SNARE_COLORS.syntaxin,
      emissive: SNARE_COLORS.syntaxin,
      emissiveIntensity: 0.5,
    });
    
    materialCache.snap25 = new THREE.MeshPhongMaterial({
      color: SNARE_COLORS.snap25,
      emissive: SNARE_COLORS.snap25,
      emissiveIntensity: 0.5,
    });
  }
}

// ============================================================================
// VESICLE CREATION
// ============================================================================

/**
 * Create initial vesicle pools
 */
export function createVesicles() {
  initGeometries();
  initMaterials();
  
  // Clear existing
  vesicles.rrp = [];
  vesicles.recycling = [];
  vesicles.reserve = [];
  vesicles.fusing = [];
  vesicles.recyclingBack = [];
  
  // Create RRP vesicles (docked at active zone)
  for (let i = 0; i < VESICLE_POOLS.RRP.maxCount; i++) {
    const vesicle = createVesicle('rrp', i);
    vesicles.rrp.push(vesicle);
  }
  
  // Create recycling pool vesicles
  for (let i = 0; i < Math.min(VESICLE_POOLS.RECYCLING.maxCount, 30); i++) {
    const vesicle = createVesicle('recycling', i);
    vesicles.recycling.push(vesicle);
  }
  
  // Create reserve pool vesicles (sparse representation)
  for (let i = 0; i < Math.min(VESICLE_POOLS.RESERVE.maxCount, 20); i++) {
    const vesicle = createVesicle('reserve', i);
    vesicles.reserve.push(vesicle);
  }
  
  animationState.rrpCount = vesicles.rrp.length;
  animationState.recyclingCount = vesicles.recycling.length;
  animationState.reserveCount = vesicles.reserve.length;
}

/**
 * Create a single vesicle with visible NT content inside
 */
function createVesicle(pool, index) {
  let material, position, state;
  const ntType = getRandomNTType();
  
  switch (pool) {
    case 'rrp':
      // Use filled material for RRP (they have NT)
      material = ntType === 'glutamate' 
        ? materialCache.vesicleRRPFilled.clone()
        : materialCache.vesicleRRP.clone();
      position = getRRPPosition(index);
      state = SNARE_STATES.PRIMED;
      break;
    case 'recycling':
      material = materialCache.vesicleRecycling.clone();
      position = getRecyclingPosition(index);
      state = SNARE_STATES.UNPRIMED;
      break;
    case 'reserve':
      material = materialCache.vesicleReserve.clone();
      position = getReservePosition(index);
      state = SNARE_STATES.UNPRIMED;
      break;
    default:
      material = materialCache.vesicleRRP.clone();
      position = new THREE.Vector3(0, 5, 0);
      state = SNARE_STATES.UNPRIMED;
  }
  
  const mesh = new THREE.Mesh(geometryCache.vesicle, material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.renderOrder = 5;  // Render AFTER domes (domes are -1)
  
  // Add multiple NT spheres inside vesicle (visible through transparent membrane)
  // Each sphere represents NT molecules that float around with Brownian motion
  let ntContentMeshes = [];
  if (pool === 'rrp' || pool === 'recycling') {
    // Create 5-10 NT spheres inside the vesicle - LARGER for visibility
    const ntCount = 5 + Math.floor(Math.random() * 6);
    const ntRadius = SCALE.VESICLE_RADIUS * 0.25;  // LARGER spheres (25% of vesicle)
    const ntContentGeo = new THREE.SphereGeometry(ntRadius, 10, 8);
    const ntContentMat = ntType === 'glutamate' 
      ? materialCache.ntContent.clone()
      : materialCache.ntContentGaba.clone();
    ntContentMat.emissiveIntensity = 2.0;  // Very bright
    
    for (let n = 0; n < ntCount; n++) {
      const ntMesh = new THREE.Mesh(ntContentGeo, ntContentMat.clone());
      
      // Random position inside vesicle (within 60% of radius)
      const maxDist = SCALE.VESICLE_RADIUS * 0.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.random() * maxDist;
      ntMesh.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      
      // Render on top of vesicle shell
      ntMesh.renderOrder = 6;
      
      // Store Brownian motion properties
      ntMesh.userData.brownianVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
      );
      ntMesh.userData.brownianPhase = Math.random() * Math.PI * 2;
      
      mesh.add(ntMesh);
      ntContentMeshes.push(ntMesh);
    }
  }
  
  // Add SNARE complex visualization for RRP vesicles
  let snareComplex = null;
  if (pool === 'rrp') {
    snareComplex = createSNAREComplex();
    snareComplex.position.set(0, -SCALE.VESICLE_RADIUS, 0);
    mesh.add(snareComplex);
  }
  
  vesicleGroup.add(mesh);
  
  const vesicle = {
    mesh,
    pool,
    state,
    snareComplex,
    ntContentMeshes,  // Array of small NT spheres
    targetPosition: position.clone(),
    velocity: new THREE.Vector3(),
    ntType: ntType,
    ntCount: VESICLE_CONTENT.ntCount,
    fusionProgress: 0,
    recycleProgress: 0,
    dockedTime: 0,
  };
  
  // Add Brownian motion properties
  vesicle.brownianOffset = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  );
  vesicle.brownianPhase = Math.random() * Math.PI * 2;
  
  return vesicle;
}

/**
 * Create SNARE complex visualization
 */
function createSNAREComplex() {
  const group = new THREE.Group();
  
  // Synaptobrevin (on vesicle)
  const vamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 1.2, 6),
    materialCache.synaptobrevin
  );
  vamp.position.set(-0.2, -0.3, 0);
  vamp.rotation.x = 0.2;
  group.add(vamp);
  
  // Syntaxin (on membrane)
  const syntaxin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 1.0, 6),
    materialCache.syntaxin
  );
  syntaxin.position.set(0.2, -0.3, 0);
  syntaxin.rotation.x = -0.2;
  group.add(syntaxin);
  
  // SNAP-25 (connects them)
  const snap25 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6),
    materialCache.snap25
  );
  snap25.position.set(0, -0.5, 0.2);
  snap25.rotation.z = Math.PI / 2;
  group.add(snap25);
  
  return group;
}

// ============================================================================
// POSITION CALCULATIONS
// ============================================================================

/**
 * Get position for RRP vesicle (docked near active zone, inside terminal dome)
 * These are docked and ready to fuse with the membrane
 */
function getRRPPosition(index) {
  const radius = SCALE.ACTIVE_ZONE_RADIUS * 0.6;
  
  // Arrange in rings just above the membrane
  const ring = Math.floor(index / 6);
  const posInRing = index % 6;
  const ringRadius = radius * (0.3 + ring * 0.3);
  const angle = (posInRing / 6) * Math.PI * 2 + ring * 0.4;
  
  // Position inside the dome, just above the presynaptic membrane
  const membraneY = SCALE.CLEFT_WIDTH / 2;  // This is preMembraneY
  const baseHeight = membraneY + 2;  // Just above membrane
  
  return new THREE.Vector3(
    Math.cos(angle) * ringRadius,
    baseHeight + ring * 1.5,
    Math.sin(angle) * ringRadius
  );
}

/**
 * Get position for recycling pool vesicle (mid-height inside terminal dome)
 * Constrained to be INSIDE the hemisphere
 */
function getRecyclingPosition(index) {
  const membraneY = SCALE.CLEFT_WIDTH / 2;
  const domeR = SCALE.TERMINAL_RADIUS;
  
  // Random height inside dome (not too close to membrane)
  const minHeight = membraneY + 3;
  const maxHeight = membraneY + domeR * 0.7;
  const height = minHeight + Math.random() * (maxHeight - minHeight);
  
  // Calculate max radius at this height (hemisphere constraint)
  const heightAboveBase = height - membraneY;
  const maxRadiusAtHeight = Math.sqrt(Math.max(0, domeR * domeR - heightAboveBase * heightAboveBase)) * 0.8;
  
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * maxRadiusAtHeight;
  
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );
}

/**
 * Get position for reserve pool vesicle (upper part of terminal dome)
 * Also constrained inside hemisphere
 */
function getReservePosition(index) {
  const membraneY = SCALE.CLEFT_WIDTH / 2;
  const domeR = SCALE.TERMINAL_RADIUS;
  
  // Higher up in the dome
  const minHeight = membraneY + domeR * 0.4;
  const maxHeight = membraneY + domeR * 0.85;
  const height = minHeight + Math.random() * (maxHeight - minHeight);
  
  // Calculate max radius at this height
  const heightAboveBase = height - membraneY;
  const maxRadiusAtHeight = Math.sqrt(Math.max(0, domeR * domeR - heightAboveBase * heightAboveBase)) * 0.7;
  
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * maxRadiusAtHeight;
  
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );
}

/**
 * Get random neurotransmitter type based on current setting
 */
function getRandomNTType() {
  if (animationState.ntType === 'glutamate') return 'glutamate';
  if (animationState.ntType === 'gaba') return 'gaba';
  // Mixed
  return Math.random() < 0.7 ? 'glutamate' : 'gaba';
}

// ============================================================================
// VESICLE UPDATES
// ============================================================================

/**
 * Update NT particles inside a vesicle with Brownian motion
 * Makes them float around like real molecules
 */
function updateNTParticlesInVesicle(vesicle, deltaTime) {
  if (!vesicle.ntContentMeshes || vesicle.ntContentMeshes.length === 0) return;
  
  const maxDist = SCALE.VESICLE_RADIUS * 0.65;  // Keep inside vesicle
  
  for (const ntMesh of vesicle.ntContentMeshes) {
    // Update Brownian motion
    ntMesh.userData.brownianPhase += deltaTime * 0.01;
    
    // Random velocity changes (Brownian motion)
    ntMesh.userData.brownianVelocity.x += (Math.random() - 0.5) * 0.005;
    ntMesh.userData.brownianVelocity.y += (Math.random() - 0.5) * 0.005;
    ntMesh.userData.brownianVelocity.z += (Math.random() - 0.5) * 0.005;
    
    // Dampen velocity
    ntMesh.userData.brownianVelocity.multiplyScalar(0.98);
    
    // Apply velocity
    ntMesh.position.add(ntMesh.userData.brownianVelocity);
    
    // Constrain to vesicle interior (bounce off walls)
    const dist = ntMesh.position.length();
    if (dist > maxDist) {
      // Bounce back toward center
      ntMesh.position.normalize().multiplyScalar(maxDist * 0.9);
      ntMesh.userData.brownianVelocity.multiplyScalar(-0.5);
    }
  }
}

/**
 * Update all vesicles
 */
export function updateVesicles(deltaTime) {
  const simDelta = deltaTime * 1000; // Convert to ms
  
  // Update RRP vesicles
  updateRRPVesicles(simDelta);
  
  // Update fusing vesicles
  updateFusingVesicles(simDelta);
  
  // Update recycling vesicles
  updateRecyclingVesicles(simDelta);
  
  // Update reserve pool
  updateReserveVesicles(simDelta);
  
  // Mobilize vesicles between pools
  mobilizeVesicles(simDelta);
  
  // Update counts
  animationState.rrpCount = vesicles.rrp.length;
  animationState.recyclingCount = vesicles.recycling.length;
  animationState.reserveCount = vesicles.reserve.length;
}

/**
 * Update RRP vesicles - Brownian motion and Ca2+ response
 */
function updateRRPVesicles(deltaTime) {
  const caConc = animationState.preCaConc * 1000; // Convert to μM
  
  for (let i = vesicles.rrp.length - 1; i >= 0; i--) {
    const v = vesicles.rrp[i];
    
    // Brownian motion (reduced when docked)
    v.brownianPhase += deltaTime * 0.005;
    const brownianAmp = 0.02 * Math.sin(v.brownianPhase);
    v.mesh.position.x += v.brownianOffset.x * brownianAmp;
    v.mesh.position.z += v.brownianOffset.z * brownianAmp;
    
    // Animate NT particles inside vesicle with Brownian motion
    updateNTParticlesInVesicle(v, deltaTime);
    
    // Keep near docked position
    const dockForce = 0.1;
    v.mesh.position.lerp(v.targetPosition, dockForce);
    
    // Check for Ca2+-triggered release
    // Lower threshold (0.5 μM) for more visible release
    if (v.state === SNARE_STATES.PRIMED && caConc > 0.5) {
      const releasePr = getReleaseProbability(caConc);
      
      // Stochastic release decision - HIGHER probability for visible vesicle release
      const releaseChance = releasePr * deltaTime * 0.02;  // Doubled chance
      if (Math.random() < releaseChance) {
        console.log(`💥 Ca2+=${caConc.toFixed(1)}μM, Pr=${releasePr.toFixed(3)}, Releasing vesicle!`);
        triggerVesicleFusion(v, i);
      }
    }
    
    // Update SNARE visualization
    if (v.snareComplex && caConc > 10) {
      // SNARE complex tightening
      v.snareComplex.scale.y = 1 - Math.min(0.5, caConc / 100);
    }
  }
}

/**
 * Trigger vesicle fusion
 */
function triggerVesicleFusion(vesicle, index) {
  vesicle.state = SNARE_STATES.TRIGGERED;
  
  // Move from RRP to fusing
  vesicles.rrp.splice(index, 1);
  vesicles.fusing.push(vesicle);
  
  // Change material
  vesicle.mesh.material = materialCache.vesicleFusing.clone();
  
  // Set fusion target (membrane surface)
  vesicle.targetPosition.set(
    vesicle.mesh.position.x,
    SCALE.CLEFT_WIDTH / 2 + 0.5,
    vesicle.mesh.position.z
  );
  
  vesicle.fusionProgress = 0;
  vesicle.hasReleased = false;  // Track if NT has been released
  
  console.log(`⚡ VESICLE TRIGGERED for fusion - ${vesicle.ntType}`);
  
  // Update SNARE state display
  animationState.snareState = SNARE_STATES.TRIGGERED;
}

/**
 * Update fusing vesicles
 */
function updateFusingVesicles(deltaTime) {
  for (let i = vesicles.fusing.length - 1; i >= 0; i--) {
    const v = vesicles.fusing[i];
    
    v.fusionProgress += deltaTime * 0.001; // ~1000ms fusion (MUCH slower)
    
    // Animate NT particles faster as fusion progresses (they're getting agitated)
    updateNTParticlesInVesicle(v, deltaTime * (1 + v.fusionProgress * 2));
    
    if (v.fusionProgress < 0.5) {
      // Move toward membrane
      v.mesh.position.lerp(v.targetPosition, 0.15);
      v.state = SNARE_STATES.FUSING;
      
      // Squeeze vesicle
      const squeeze = 1 - v.fusionProgress * 0.6;
      v.mesh.scale.set(1 + v.fusionProgress * 0.3, squeeze, 1 + v.fusionProgress * 0.3);
      
    } else if (v.fusionProgress < 1.0) {
      // Fusion pore opening - flatten and spread
      const spread = 1 + (v.fusionProgress - 0.5) * 2;
      const flatten = Math.max(0.1, 1 - (v.fusionProgress - 0.5) * 1.8);
      v.mesh.scale.set(spread, flatten, spread);
      v.mesh.material.opacity = 1 - (v.fusionProgress - 0.5) * 1.5;
      
      // Release neurotransmitters - trigger ONCE when crossing 0.55 threshold
      if (!v.hasReleased && v.fusionProgress > 0.55) {
        v.hasReleased = true;  // Only release once per vesicle
        console.log(`🔴 VESICLE FUSION - Releasing ${v.ntType} from position:`, v.mesh.position.toArray().map(x => x.toFixed(1)));
        
        // Hide the NT particles inside vesicle (they're being released!)
        if (v.ntContentMeshes && v.ntContentMeshes.length > 0) {
          for (const ntMesh of v.ntContentMeshes) {
            ntMesh.visible = false;
          }
        }
        
        releaseNeurotransmitters(
          v.mesh.position.clone(),
          v.ntType,
          v.ntCount
        );
        animationState.vesiclesReleased++;
      }
      
    } else {
      // Fusion complete
      v.state = SNARE_STATES.FUSED;
      vesicleGroup.remove(v.mesh);
      vesicles.fusing.splice(i, 1);
      
      // Start recycling - FAST for visual simulation (500ms instead of 30s)
      setTimeout(() => {
        if (vesicles.recycling.length < VESICLE_POOLS.RECYCLING.maxCount) {
          const newV = createVesicle('recycling', vesicles.recycling.length);
          // Make sure recycled vesicle has NT content
          newV.ntCount = VESICLE_CONTENT.ntCount;
          vesicles.recycling.push(newV);
          console.log(`♻️ Vesicle recycled with NT. Recycling pool: ${vesicles.recycling.length}`);
        }
      }, 500); // 500ms recycling time - FAST for visualization
      
      animationState.snareState = SNARE_STATES.PRIMED;
    }
  }
}

/**
 * Update recycling pool vesicles
 * Keeps them constrained inside the terminal dome (hemisphere)
 */
function updateRecyclingVesicles(deltaTime) {
  const membraneY = SCALE.CLEFT_WIDTH / 2;
  const domeRadius = SCALE.TERMINAL_RADIUS;
  
  for (const v of vesicles.recycling) {
    // Gentle Brownian motion
    v.brownianPhase += deltaTime * 0.003;
    const amp = 0.04;
    
    v.mesh.position.x += Math.sin(v.brownianPhase) * v.brownianOffset.x * amp;
    v.mesh.position.y += Math.sin(v.brownianPhase * 0.7) * v.brownianOffset.y * amp * 0.3;
    v.mesh.position.z += Math.cos(v.brownianPhase) * v.brownianOffset.z * amp;
    
    // Animate NT particles inside
    updateNTParticlesInVesicle(v, deltaTime);
    
    // STRICT hemisphere constraint - keep inside the terminal dome
    const heightAboveBase = v.mesh.position.y - membraneY;
    
    // Hemisphere: r² + h² = R², so max r at height h is sqrt(R² - h²)
    const maxRadiusAtHeight = Math.sqrt(Math.max(1, domeRadius * domeRadius - heightAboveBase * heightAboveBase)) * 0.85;
    const dist = Math.sqrt(v.mesh.position.x ** 2 + v.mesh.position.z ** 2);
    
    if (dist > maxRadiusAtHeight) {
      const scale = maxRadiusAtHeight / dist;
      v.mesh.position.x *= scale;
      v.mesh.position.z *= scale;
    }
    
    // Vertical bounds - stay inside dome, above membrane
    const minY = membraneY + 2;
    const maxY = membraneY + domeRadius * 0.85;
    v.mesh.position.y = Math.max(minY, Math.min(maxY, v.mesh.position.y));
    
    // If somehow outside dome, reset to valid position
    const totalDist = Math.sqrt(
      v.mesh.position.x ** 2 + 
      heightAboveBase ** 2 + 
      v.mesh.position.z ** 2
    );
    if (totalDist > domeRadius * 0.9) {
      v.mesh.position.copy(getRecyclingPosition(0));
    }
  }
}

/**
 * Update reserve pool vesicles
 */
function updateReserveVesicles(deltaTime) {
  for (const v of vesicles.reserve) {
    // Slow drift
    v.brownianPhase += deltaTime * 0.001;
    const amp = 0.02;
    
    v.mesh.position.x += Math.sin(v.brownianPhase) * amp;
    v.mesh.position.z += Math.cos(v.brownianPhase * 1.3) * amp;
    
    // Animate NT particles inside (slower for reserve pool)
    updateNTParticlesInVesicle(v, deltaTime * 0.5);
  }
}

/**
 * Mobilize vesicles between pools - FAST for AP trains
 */
function mobilizeVesicles(deltaTime) {
  // Recycling → RRP (refill docked vesicles) - FAST AND CONTINUOUS
  const rrpDeficit = VESICLE_POOLS.RRP.maxCount - vesicles.rrp.length;
  
  if (rrpDeficit > 0 && vesicles.recycling.length > 0) {
    // Much faster refill rate - can refill multiple per frame
    const refillRate = VESICLE_POOLS.RRP.refillRate * deltaTime * 0.01;  // 10x faster
    const numToRefill = Math.min(
      Math.floor(refillRate) + (Math.random() < (refillRate % 1) ? 1 : 0),
      rrpDeficit,
      vesicles.recycling.length
    );
    
    for (let i = 0; i < numToRefill; i++) {
      const v = vesicles.recycling.pop();
      if (v) {
        // Convert to RRP
        v.pool = 'rrp';
        v.state = SNARE_STATES.PRIMED;
        v.mesh.material = materialCache.vesicleRRPFilled ? 
          materialCache.vesicleRRPFilled.clone() : materialCache.vesicleRRP.clone();
        v.targetPosition = getRRPPosition(vesicles.rrp.length);
        
        // Ensure vesicle has NT content
        v.ntCount = VESICLE_CONTENT.ntCount;
        v.hasReleased = false;
        
        // Restore NT particle visibility (they were hidden during fusion)
        if (v.ntContentMeshes && v.ntContentMeshes.length > 0) {
          for (const ntMesh of v.ntContentMeshes) {
            ntMesh.visible = true;
          }
        }
        
        // Add SNARE complex if not present
        if (!v.snareComplex) {
          v.snareComplex = createSNAREComplex();
          v.snareComplex.position.set(0, -SCALE.VESICLE_RADIUS, 0);
          v.mesh.add(v.snareComplex);
        }
        
        vesicles.rrp.push(v);
        console.log(`🔄 Vesicle refilled to RRP with NT. Count: ${vesicles.rrp.length}/${VESICLE_POOLS.RRP.maxCount}`);
      }
    }
  }
  
  // Reserve → Recycling (slower)
  if (vesicles.recycling.length < 30 && vesicles.reserve.length > 0) {
    const mobRate = VESICLE_POOLS.RESERVE.mobilizationRate * deltaTime * 0.001;
    
    if (Math.random() < mobRate) {
      const v = vesicles.reserve.pop();
      if (v) {
        v.pool = 'recycling';
        v.mesh.material = materialCache.vesicleRecycling.clone();
        v.targetPosition = getRecyclingPosition(vesicles.recycling.length);
        vesicles.recycling.push(v);
      }
    }
  }
}

// ============================================================================
// EXTERNAL TRIGGERS
// ============================================================================

/**
 * Force vesicle release (for manual triggering)
 */
export function forceRelease() {
  if (vesicles.rrp.length > 0) {
    const index = Math.floor(Math.random() * vesicles.rrp.length);
    triggerVesicleFusion(vesicles.rrp[index], index);
    return true;
  }
  return false;
}

/**
 * Get vesicle counts for UI
 */
export function getVesicleCounts() {
  return {
    rrp: vesicles.rrp.length,
    rrpMax: VESICLE_POOLS.RRP.maxCount,
    recycling: vesicles.recycling.length,
    reserve: vesicles.reserve.length,
    fusing: vesicles.fusing.length,
  };
}

/**
 * Get SNARE state for UI
 */
export function getSNAREState() {
  return animationState.snareState;
}
