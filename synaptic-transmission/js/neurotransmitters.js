/**
 * neurotransmitters.js - Neurotransmitter release and cleft dynamics
 * 
 * Models:
 * - NT release from vesicle fusion
 * - Diffusion across synaptic cleft
 * - Receptor binding kinetics
 * - Clearance mechanisms (reuptake, enzymatic, astrocyte)
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, ntGroup, cleftGroup,
  SCALE, COLORS, POSITIONS,
  VESICLE_CONTENT, RECEPTOR_PROPS, ASTROCYTE,
  animationState, neurotransmitters,
  geometryCache, materialCache, _tempVec3
} from './config.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_NT_PARTICLES = 800;      // Max visual particles
const NT_LIFETIME = 120;           // ms before clearance (even longer for binding)
const DIFFUSION_RATE = 2.0;        // Diffusion speed in cleft (slower for more binding)
const BINDING_DISTANCE = 5.0;      // Distance to consider for binding (LARGER for easier binding)

// ============================================================================
// GEOMETRY AND MATERIAL SETUP
// ============================================================================

function initGeometries() {
  if (!geometryCache.nt) {
    geometryCache.nt = new THREE.SphereGeometry(SCALE.NT_RADIUS, 8, 6);
    geometryCache.ntSmall = new THREE.SphereGeometry(SCALE.NT_RADIUS * 0.6, 6, 4);
  }
}

function initMaterials() {
  if (!materialCache.glutamate) {
    // Glutamate - BRIGHT GREEN like action-potential-3d neurotransmitter
    materialCache.glutamate = new THREE.MeshPhongMaterial({
      color: 0x00ff88,          // Bright green
      emissive: 0x00ff44,
      emissiveIntensity: 1.0,   // Very emissive for visibility
      transparent: true,
      opacity: 0.95,
    });
    
    // GABA - Purple for inhibitory
    materialCache.gaba = new THREE.MeshPhongMaterial({
      color: 0x8844ff,
      emissive: 0x5522cc,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.95,
    });
    
    materialCache.ntFading = new THREE.MeshPhongMaterial({
      color: 0x44aa66,
      emissive: 0x228844,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
    });
  }
}

// ============================================================================
// NT RELEASE
// ============================================================================

/**
 * Release neurotransmitters from vesicle fusion site
 * BURST OF GREEN (glutamate) or PURPLE (GABA) particles like action-potential-3d
 * @param {THREE.Vector3} position - Fusion site position
 * @param {string} ntType - 'glutamate' or 'gaba'
 * @param {number} count - Number of NT molecules (scaled for visualization)
 */
export function releaseNeurotransmitters(position, ntType, count) {
  initGeometries();
  initMaterials();
  
  // Release 15-25 DISTINCT particles (not too many = cloud effect)
  const visualCount = Math.min(25, Math.max(15, Math.ceil(count / 100)));
  
  const material = ntType === 'glutamate' ? materialCache.glutamate : materialCache.gaba;
  const ntArray = ntType === 'glutamate' ? neurotransmitters.glutamate : neurotransmitters.gaba;
  
  // Release position is at the presynaptic membrane
  const releasePos = new THREE.Vector3(
    position.x,
    SCALE.CLEFT_WIDTH / 2 - 0.5,
    position.z
  );
  
  console.log(`🟢 RELEASING ${visualCount} ${ntType} molecules at`, releasePos.toArray().map(v => v.toFixed(1)));
  
  for (let i = 0; i < visualCount; i++) {
    if (ntArray.length >= MAX_NT_PARTICLES) break;
    
    const mesh = new THREE.Mesh(geometryCache.nt, material.clone());
    
    // Spread particles out so they don't form a cloud
    const angle = (i / visualCount) * Math.PI * 2 + Math.random() * 0.5;  // Even angular distribution
    const spread = 1.0 + Math.random() * 2.0;  // Spread out
    mesh.position.set(
      releasePos.x + Math.cos(angle) * spread,
      releasePos.y - Math.random() * 0.5,  // Slight vertical variation
      releasePos.z + Math.sin(angle) * spread
    );
    
    // Match size of NT inside vesicles (VESICLE_RADIUS * 0.25 = 1.2 * 0.25 = 0.3)
    // NT_RADIUS is 0.5, so scale to make it ~0.3 radius = 0.6 scale
    mesh.scale.setScalar(0.7);
    
    // Render on top of membranes
    mesh.renderOrder = 8;
    
    ntGroup.add(mesh);
    
    // Downward velocity with spread - like action-potential-3d
    const speed = DIFFUSION_RATE * (1 + Math.random() * 0.5);
    const nt = {
      mesh,
      type: ntType,
      position: mesh.position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * speed * 0.8,
        -speed * (0.8 + Math.random() * 0.4),  // Strong downward
        (Math.random() - 0.5) * speed * 0.8
      ),
      lifetime: 0,
      maxLifetime: NT_LIFETIME * 2 + Math.random() * 40, // Longer lifetime
      bound: false,
      boundTo: null,
      clearanceType: null,
    };
    
    ntArray.push(nt);
  }
  
  // Update cleft concentration significantly
  if (ntType === 'glutamate') {
    animationState.cleftGlutamate += visualCount * 15; // μM equivalent - more
  } else {
    animationState.cleftGaba += visualCount * 15;
  }
}

// ============================================================================
// NT UPDATES
// ============================================================================

/**
 * Update all neurotransmitters in cleft
 */
export function updateNeurotransmitters(deltaTime, receptorPositions) {
  const simDelta = deltaTime * 1000; // Convert to ms
  
  updateNTArray(neurotransmitters.glutamate, simDelta, receptorPositions);
  updateNTArray(neurotransmitters.gaba, simDelta, receptorPositions);
  
  // Decay cleft concentration
  animationState.cleftGlutamate *= Math.exp(-simDelta * 0.02);
  animationState.cleftGaba *= Math.exp(-simDelta * 0.02);
  
  // Clamp to reasonable values
  if (animationState.cleftGlutamate < 0.1) animationState.cleftGlutamate = 0;
  if (animationState.cleftGaba < 0.1) animationState.cleftGaba = 0;
}

/**
 * Update a single NT array
 */
function updateNTArray(ntArray, deltaTime, receptorPositions) {
  for (let i = ntArray.length - 1; i >= 0; i--) {
    const nt = ntArray[i];
    
    nt.lifetime += deltaTime;
    
    if (nt.bound) {
      // Bound NT - stay at receptor, eventually unbind
      // Unbinding rate depends on receptor type (AMPA fast, NMDA slow)
      // Rates scaled for visual simulation speed
      let unbindRate = 0.02;  // Default - faster for visual feedback
      if (nt.boundTo === 'AMPA') unbindRate = 0.05;  // AMPA very fast ~1-2ms
      else if (nt.boundTo === 'NMDA') unbindRate = 0.01;  // NMDA slower but still visible
      else if (nt.boundTo === 'GABAA') unbindRate = 0.03;  // GABA-A moderate
      
      const unbindProb = deltaTime * unbindRate;
      if (Math.random() < unbindProb) {
        // Decrement bound counters when unbinding!
        if (nt.boundTo === 'AMPA') {
          animationState.ampaBound = Math.max(0, animationState.ampaBound - 1);
          console.log(`🔵 NT UNBOUND from AMPA. Remaining: ${animationState.ampaBound}`);
        } else if (nt.boundTo === 'NMDA') {
          animationState.nmdaBound = Math.max(0, animationState.nmdaBound - 1);
          console.log(`🟣 NT UNBOUND from NMDA. Remaining: ${animationState.nmdaBound}`);
        } else if (nt.boundTo === 'GABAA') {
          animationState.gabaaBound = Math.max(0, animationState.gabaaBound - 1);
          console.log(`🟡 NT UNBOUND from GABA-A. Remaining: ${animationState.gabaaBound}`);
        }
        nt.bound = false;
        nt.boundTo = null;
      }
      continue;
    }
    
    // Diffusion - active Brownian motion in cleft (like real molecules)
    const brownianScale = 0.08;  // More active movement
    nt.velocity.x += (Math.random() - 0.5) * brownianScale;
    nt.velocity.y += (Math.random() - 0.5) * brownianScale * 0.5;  // Some vertical jiggle
    nt.velocity.z += (Math.random() - 0.5) * brownianScale;
    
    // Dampen velocity slightly to prevent runaway
    nt.velocity.multiplyScalar(0.98);
    
    // Gentle drift toward postsynaptic membrane
    if (nt.mesh.position.y > -SCALE.CLEFT_WIDTH / 2 + 0.5) {
      nt.velocity.y -= 0.3;  // Gentle downward pull
    }
    
    // Apply velocity - faster movement for visible diffusion
    nt.mesh.position.add(
      _tempVec3.copy(nt.velocity).multiplyScalar(deltaTime * 0.003)
    );
    
    // Cleft boundaries
    const cleftTop = SCALE.CLEFT_WIDTH / 2 - 0.2;
    const cleftBottom = -SCALE.CLEFT_WIDTH / 2 + 0.2;
    const cleftRadius = SCALE.ACTIVE_ZONE_RADIUS * 1.5;
    
    // Bounce off top
    if (nt.mesh.position.y > cleftTop) {
      nt.mesh.position.y = cleftTop;
      nt.velocity.y *= -0.5;
    }
    
    // Check for binding when in lower half of cleft (near receptors)
    // Receptors are at y = -CLEFT_WIDTH/2, so check when NT gets close
    if (nt.mesh.position.y < 0) {  // In lower half of cleft
      if (receptorPositions && tryBinding(nt, receptorPositions)) {
        nt.bound = true;
        // Snap to receptor level
        nt.mesh.position.y = cleftBottom + 0.2;
      }
    }
    
    // Lateral boundaries
    const dist = Math.sqrt(nt.mesh.position.x ** 2 + nt.mesh.position.z ** 2);
    if (dist > cleftRadius) {
      // Outside active zone - clearance region
      nt.clearanceType = 'diffusion';
    }
    
    // Clearance
    if (nt.lifetime > nt.maxLifetime || nt.clearanceType) {
      clearNT(nt, i, ntArray);
    } else {
      // Fade with age
      const fadeStart = nt.maxLifetime * 0.6;
      if (nt.lifetime > fadeStart) {
        const fadeProgress = (nt.lifetime - fadeStart) / (nt.maxLifetime - fadeStart);
        nt.mesh.material.opacity = 0.9 * (1 - fadeProgress);
      }
    }
  }
}

/**
 * Try to bind NT to a receptor
 */
function tryBinding(nt, receptorPositions) {
  if (!receptorPositions) {
    return false;
  }
  
  const receptorType = nt.type === 'glutamate' ? ['AMPA', 'NMDA'] : ['GABAA'];
  
  for (const type of receptorType) {
    const positions = receptorPositions[type];
    if (!positions || positions.length === 0) continue;
    
    for (const pos of positions) {
      const dist = nt.mesh.position.distanceTo(pos);
      
      if (dist < BINDING_DISTANCE) {
        // HIGH binding probability when close enough
        const bindProb = 0.6;  // 60% chance to bind when in range
        
        if (Math.random() < bindProb) {
          nt.boundTo = type;
          // Snap to receptor position
          nt.mesh.position.copy(pos);
          
          // Update binding counts
          if (type === 'AMPA') {
            animationState.ampaBound++;
            console.log(`🔵 NT BOUND to AMPA! Total: ${animationState.ampaBound}`);
          }
          else if (type === 'NMDA') {
            animationState.nmdaBound++;
            console.log(`🟣 NT BOUND to NMDA! Total: ${animationState.nmdaBound}`);
          }
          else if (type === 'GABAA') {
            animationState.gabaaBound++;
            console.log(`🟡 NT BOUND to GABA-A! Total: ${animationState.gabaaBound}`);
          }
          
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Clear (remove) a neurotransmitter
 */
function clearNT(nt, index, ntArray) {
  // Determine clearance mechanism
  if (!nt.clearanceType) {
    const r = Math.random();
    if (r < ASTROCYTE.glutamateUptake && animationState.showAstrocyte) {
      nt.clearanceType = 'astrocyte';
    } else if (r < 0.7) {
      nt.clearanceType = 'reuptake';
    } else {
      nt.clearanceType = 'enzymatic';
    }
  }
  
  // Animate clearance
  nt.mesh.material.opacity = 0;
  ntGroup.remove(nt.mesh);
  
  // Remove from array
  ntArray.splice(index, 1);
  
  // Update bound count if was bound
  if (nt.bound) {
    if (nt.boundTo === 'AMPA') animationState.ampaBound = Math.max(0, animationState.ampaBound - 1);
    else if (nt.boundTo === 'NMDA') animationState.nmdaBound = Math.max(0, animationState.nmdaBound - 1);
    else if (nt.boundTo === 'GABAA') animationState.gabaaBound = Math.max(0, animationState.gabaaBound - 1);
  }
}

// ============================================================================
// EXTERNAL API
// ============================================================================

/**
 * Get cleft concentrations for UI
 */
export function getCleftConcentrations() {
  return {
    glutamate: animationState.cleftGlutamate,
    gaba: animationState.cleftGaba,
    total: neurotransmitters.glutamate.length + neurotransmitters.gaba.length,
  };
}

/**
 * Get receptor binding counts
 */
export function getReceptorBinding() {
  return {
    ampa: animationState.ampaBound,
    nmda: animationState.nmdaBound,
    gabaa: animationState.gabaaBound,
  };
}

/**
 * Clear all NTs (reset)
 */
export function clearAllNTs() {
  for (const nt of neurotransmitters.glutamate) {
    ntGroup.remove(nt.mesh);
  }
  for (const nt of neurotransmitters.gaba) {
    ntGroup.remove(nt.mesh);
  }
  
  neurotransmitters.glutamate = [];
  neurotransmitters.gaba = [];
  neurotransmitters.peptides = [];
  
  animationState.cleftGlutamate = 0;
  animationState.cleftGaba = 0;
  animationState.ampaBound = 0;
  animationState.nmdaBound = 0;
  animationState.gabaaBound = 0;
}
