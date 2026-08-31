/**
 * receptors.js - Postsynaptic receptor dynamics
 * 
 * Models:
 * - Ionotropic receptors (AMPA, NMDA, GABA-A)
 * - Metabotropic receptors (mGluR, GABA-B)
 * - Receptor binding and activation kinetics
 * - Ion channel gating
 * - G-protein signaling cascades
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, receptorGroup, postsynapticGroup, channelGroup,
  SCALE, COLORS, POSITIONS,
  CHANNEL_COUNTS, RECEPTOR_PROPS,
  animationState, channels,
  getNMDAMgBlock, getReceptorBinding,
  geometryCache, materialCache, _tempVec3
} from './config.js';

// ============================================================================
// RECEPTOR STATES
// ============================================================================

const RECEPTOR_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  DESENSITIZED: 'desensitized',
};

// ============================================================================
// GEOMETRY AND MATERIAL SETUP
// ============================================================================

function initGeometries() {
  if (!geometryCache.receptor) {
    // Ionotropic receptor - pentameric structure
    geometryCache.receptor = new THREE.CylinderGeometry(
      SCALE.RECEPTOR_RADIUS,
      SCALE.RECEPTOR_RADIUS * 0.9,
      2,
      5 // Pentameric
    );
    
    // NMDA receptor - slightly larger, tetrameric
    geometryCache.nmdaReceptor = new THREE.CylinderGeometry(
      SCALE.RECEPTOR_RADIUS * 1.2,
      SCALE.RECEPTOR_RADIUS * 1.1,
      2.5,
      4
    );
    
    // Metabotropic receptor - 7TM structure
    geometryCache.metabotropic = new THREE.CylinderGeometry(
      SCALE.RECEPTOR_RADIUS * 0.8,
      SCALE.RECEPTOR_RADIUS * 0.7,
      2.2,
      7
    );
    
    // Ion pore (for visualization)
    geometryCache.pore = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
  }
}

function initMaterials() {
  if (!materialCache.ampaReceptor) {
    materialCache.ampaReceptor = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.AMPA.color,
      emissive: RECEPTOR_PROPS.AMPA.color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8,
    });
    
    materialCache.ampaOpen = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.AMPA.color,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.95,
    });
    
    materialCache.nmdaReceptor = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.NMDA.color,
      emissive: RECEPTOR_PROPS.NMDA.color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8,
    });
    
    materialCache.nmdaBlocked = new THREE.MeshPhongMaterial({
      color: 0x666666,
      emissive: 0x333333,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    
    materialCache.nmdaOpen = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.NMDA.color,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.95,
    });
    
    materialCache.gabaaReceptor = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.GABAA.color,
      emissive: RECEPTOR_PROPS.GABAA.color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8,
    });
    
    materialCache.gabaaOpen = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.GABAA.color,
      emissive: 0xffffff,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.95,
    });
    
    materialCache.mglurReceptor = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.mGluR.color,
      emissive: RECEPTOR_PROPS.mGluR.color,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.7,
    });
    
    materialCache.gababReceptor = new THREE.MeshPhongMaterial({
      color: RECEPTOR_PROPS.GABAB.color,
      emissive: RECEPTOR_PROPS.GABAB.color,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.7,
    });
    
    materialCache.pore = new THREE.MeshPhongMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
    });
    
    materialCache.poreOpen = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    });
  }
}

// ============================================================================
// RECEPTOR CREATION
// ============================================================================

/**
 * Create all postsynaptic receptors
 * SPREAD THROUGHOUT the entire PSD, not just center
 */
export function createReceptors() {
  initGeometries();
  initMaterials();
  
  // Clear existing
  channels.postsynaptic.AMPA = [];
  channels.postsynaptic.NMDA = [];
  channels.postsynaptic.GABAA = [];
  channels.postsynaptic.GABAB = [];
  channels.postsynaptic.mGluR = [];
  
  const psdRadius = SCALE.ACTIVE_ZONE_RADIUS * 0.95;  // Use full PSD
  const baseY = -SCALE.CLEFT_WIDTH / 2 - 0.3;
  
  // Create AMPA receptors - DISTRIBUTED throughout PSD (not just center)
  const ampaCount = Math.round(CHANNEL_COUNTS.postsynaptic.AMPA * animationState.ampaDensity / 8);
  for (let i = 0; i < ampaCount; i++) {
    const receptor = createReceptor('AMPA', i, ampaCount, psdRadius * 0.9, baseY);
    channels.postsynaptic.AMPA.push(receptor);
  }
  
  // Create NMDA receptors - intermixed throughout
  const nmdaCount = Math.round(CHANNEL_COUNTS.postsynaptic.NMDA / 4);
  for (let i = 0; i < nmdaCount; i++) {
    const receptor = createReceptor('NMDA', i, nmdaCount, psdRadius * 0.85, baseY);
    channels.postsynaptic.NMDA.push(receptor);
  }
  
  // Create GABA-A receptors - throughout and perisynaptic
  const gabaaCount = Math.round(CHANNEL_COUNTS.postsynaptic.GABAA / 4);
  for (let i = 0; i < gabaaCount; i++) {
    const receptor = createReceptor('GABAA', i, gabaaCount, psdRadius, baseY);
    channels.postsynaptic.GABAA.push(receptor);
  }
  
  // Create metabotropic receptors - throughout
  const mglurCount = Math.round(CHANNEL_COUNTS.postsynaptic.mGluR / 3);
  for (let i = 0; i < mglurCount; i++) {
    const receptor = createReceptor('mGluR', i, mglurCount, psdRadius, baseY);
    channels.postsynaptic.mGluR.push(receptor);
  }
  
  const gababCount = Math.round(CHANNEL_COUNTS.postsynaptic.GABAB / 3);
  for (let i = 0; i < gababCount; i++) {
    const receptor = createReceptor('GABAB', i, gababCount, psdRadius * 1.05, baseY);
    channels.postsynaptic.GABAB.push(receptor);
  }
}

/**
 * Create a single receptor with MOLECULAR STRUCTURE
 * - Ionotropic (AMPA, NMDA, GABAA): Pentameric/Tetrameric with subunits and central pore
 * - Metabotropic (mGluR, GABAB): 7-transmembrane helix structure
 */
function createReceptor(type, index, total, radius, baseY) {
  const group = new THREE.Group();
  let hasPore = true;
  let subunits = [];
  let helices = [];
  let pore = null;
  let material;
  
  // Position in PSD - DISTRIBUTE throughout, not just center
  // Use sqrt for uniform area distribution (not just angle-based)
  const angle = (index / total) * Math.PI * 2 + Math.random() * 0.5;
  const rNorm = Math.sqrt(Math.random());  // Uniform area distribution
  const r = radius * (0.15 + rNorm * 0.85);  // From 15% to 100% of radius
  
  switch (type) {
    case 'AMPA':
      // AMPA receptor: Tetrameric (4 subunits: GluA1-4)
      material = materialCache.ampaReceptor;
      subunits = createTetramericReceptor(group, material, 0.8);
      pore = createCentralPore(group, 0.3, 2.5);
      break;
      
    case 'NMDA':
      // NMDA receptor: Tetrameric (2 GluN1 + 2 GluN2 subunits) - larger
      material = materialCache.nmdaReceptor;
      subunits = createTetramericReceptor(group, material, 1.0);
      pore = createCentralPore(group, 0.35, 3.0);
      // Add Mg2+ block indicator - visible sphere that blocks the pore
      const mgBlockSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 6),  // Larger, more visible
        new THREE.MeshPhongMaterial({ 
          color: 0xaaaaaa, 
          emissive: 0x666666, 
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.9 
        })
      );
      mgBlockSphere.position.y = 1.0;  // Inside pore
      mgBlockSphere.userData.isMgBlock = true;
      group.add(mgBlockSphere);
      group.userData.mgBlock = mgBlockSphere;
      break;
      
    case 'GABAA':
      // GABA-A receptor: Pentameric (2α, 2β, 1γ subunits)
      material = materialCache.gabaaReceptor;
      subunits = createPentamericReceptor(group, material, 0.85);
      pore = createCentralPore(group, 0.28, 2.5);
      break;
      
    case 'mGluR':
      // Metabotropic glutamate receptor: 7-TM structure
      material = materialCache.mglurReceptor;
      helices = create7TMReceptor(group, material, 0.7);
      hasPore = false;
      // Add Venus flytrap domain (extracellular) - larger, more visible
      const vftDomain = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 10, 8),  // Larger
        material.clone()
      );
      vftDomain.scale.set(0.9, 1.4, 0.9);  // Elongated
      vftDomain.position.y = 3.5;  // Higher up
      vftDomain.material.emissiveIntensity = 0.3;
      group.add(vftDomain);
      group.userData.vftDomain = vftDomain;
      break;
      
    case 'GABAB':
      // GABA-B receptor: Heterodimeric 7-TM (GABABR1 + GABABR2)
      material = materialCache.gababReceptor;
      helices = create7TMReceptor(group, material, 0.6);
      hasPore = false;
      // Add second receptor unit (dimer)
      const dimer = create7TMReceptor(group, material, 0.5, 1.5);
      break;
      
    default:
      material = materialCache.ampaReceptor;
      subunits = createPentamericReceptor(group, material, 0.8);
      pore = createCentralPore(group, 0.3, 2.5);
  }
  
  group.position.set(
    Math.cos(angle) * r,
    baseY,
    Math.sin(angle) * r
  );
  
  group.rotation.x = Math.PI;
  group.userData.type = type;
  
  receptorGroup.add(group);
  
  return {
    mesh: group,
    pore,
    subunits,
    helices,
    type,
    state: RECEPTOR_STATES.CLOSED,
    bound: false,
    boundCount: 0,
    openProbability: 0,
    conductance: 0,
    desensitization: 0,
    gProteinActive: false,
    conformationProgress: 0,
  };
}

/**
 * Create tetrameric receptor (AMPA, NMDA)
 * Smaller, more realistic scale to fit many in PSD
 */
function createTetramericReceptor(group, material, scale) {
  const S = scale * 1.0;  // Normal scale - smaller receptors
  const subunits = [];
  const subunitRadius = 0.5 * S;
  
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const subunitGroup = new THREE.Group();
    
    // Main subunit body (extracellular domain) - larger, more visible
    const bodyGeo = new THREE.CylinderGeometry(0.35 * S, 0.30 * S, 1.5 * S, 8);
    const body = new THREE.Mesh(bodyGeo, material.clone());
    body.position.y = 0.75 * S;
    subunitGroup.add(body);
    
    // Transmembrane helices (4 per subunit: M1-M4) - thicker
    for (let h = 0; h < 4; h++) {
      const hAngle = (h / 4) * Math.PI * 2;
      const hGeo = new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 1.2 * S, 6);
      const helix = new THREE.Mesh(hGeo, material.clone());
      helix.position.set(
        Math.cos(hAngle) * 0.22 * S,
        0,
        Math.sin(hAngle) * 0.22 * S
      );
      subunitGroup.add(helix);
    }
    
    // Position subunit around central axis
    subunitGroup.position.set(
      Math.cos(angle) * subunitRadius,
      0,
      Math.sin(angle) * subunitRadius
    );
    
    group.add(subunitGroup);
    subunits.push(subunitGroup);
  }
  
  return subunits;
}

/**
 * Create pentameric receptor (GABA-A)
 * Smaller scale to fit more in PSD
 */
function createPentamericReceptor(group, material, scale) {
  const S = scale * 1.0;  // Normal scale
  const subunits = [];
  const subunitRadius = 0.45 * S;
  
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const subunitGroup = new THREE.Group();
    
    // Main subunit body - larger
    const bodyGeo = new THREE.CylinderGeometry(0.30 * S, 0.25 * S, 1.3 * S, 6);
    const body = new THREE.Mesh(bodyGeo, material.clone());
    body.position.y = 0.65 * S;
    subunitGroup.add(body);
    
    // Transmembrane helices (4 per subunit) - thicker
    for (let h = 0; h < 4; h++) {
      const hAngle = (h / 4) * Math.PI * 2;
      const hGeo = new THREE.CylinderGeometry(0.08 * S, 0.08 * S, 1.0 * S, 6);
      const helix = new THREE.Mesh(hGeo, material.clone());
      helix.position.set(
        Math.cos(hAngle) * 0.18 * S,
        0,
        Math.sin(hAngle) * 0.18 * S
      );
      subunitGroup.add(helix);
    }
    
    subunitGroup.position.set(
      Math.cos(angle) * subunitRadius,
      0,
      Math.sin(angle) * subunitRadius
    );
    
    group.add(subunitGroup);
    subunits.push(subunitGroup);
  }
  
  return subunits;
}

/**
 * Create 7-transmembrane receptor (mGluR, GABAB)
 * Smaller scale
 */
function create7TMReceptor(group, material, scale, offsetX = 0) {
  const S = scale * 1.0;  // Normal scale
  const helices = [];
  const helixRadius = 0.35 * S;
  
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    
    // Transmembrane helix - thicker
    const helixGeo = new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 1.6 * S, 6);
    const helix = new THREE.Mesh(helixGeo, material.clone());
    helix.position.set(
      Math.cos(angle) * helixRadius + offsetX,
      0,
      Math.sin(angle) * helixRadius
    );
    helix.userData.baseX = helix.position.x;
    helix.userData.baseZ = helix.position.z;
    
    group.add(helix);
    helices.push(helix);
  }
  
  // Intracellular loop (G-protein coupling region)
  const loopGeo = new THREE.TorusGeometry(0.4 * S, 0.08 * S, 6, 12);
  const loop = new THREE.Mesh(loopGeo, material.clone());
  loop.rotation.x = Math.PI / 2;
  loop.position.set(offsetX, -1.0 * S, 0);
  group.add(loop);
  
  return helices;
}

/**
 * Create central ion pore - smaller
 */
function createCentralPore(group, radius, height) {
  const S = 1.0;  // Normal scale
  const poreGeo = new THREE.CylinderGeometry(radius * S, radius * 0.8 * S, height * S, 12, 1, true);
  const pore = new THREE.Mesh(poreGeo, materialCache.pore.clone());
  pore.position.y = height * 0.2 * S;
  group.add(pore);
  
  // Selectivity filter ring
  const filterGeo = new THREE.TorusGeometry(radius * 0.8 * S, radius * 0.2 * S, 6, 12);
  const filter = new THREE.Mesh(filterGeo, new THREE.MeshPhongMaterial({
    color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.4,
  }));
  filter.rotation.x = Math.PI / 2;
  filter.position.y = height * 0.3 * S;
  group.add(filter);
  pore.userData.filter = filter;
  
  return pore;
}

// ============================================================================
// RECEPTOR UPDATES
// ============================================================================

/**
 * Update all receptors based on cleft [NT]
 */
export function updateReceptors(deltaTime) {
  const simDelta = deltaTime * 1000; // Convert to ms
  
  // Get cleft concentrations
  const gluConc = animationState.cleftGlutamate;
  const gabaConc = animationState.cleftGaba;
  
  // Update ionotropic receptors
  updateAMPAReceptors(simDelta, gluConc);
  updateNMDAReceptors(simDelta, gluConc);
  updateGABAAReceptors(simDelta, gabaConc);
  
  // Update metabotropic receptors
  updateMetabotropicReceptors(simDelta, gluConc, gabaConc);
}

/**
 * Update AMPA receptors with MOLECULAR ANIMATION
 */
function updateAMPAReceptors(deltaTime, gluConc) {
  const props = RECEPTOR_PROPS.AMPA;
  let totalConductance = 0;
  let openCount = 0;
  
  for (const receptor of channels.postsynaptic.AMPA) {
    // Binding kinetics
    const bindingFraction = gluConc / (props.Kd + gluConc);
    
    // Stochastic opening
    const openProb = bindingFraction * (1 - receptor.desensitization);
    
    // Target conformation based on binding
    const targetConformation = receptor.state === RECEPTOR_STATES.OPEN ? 1 : openProb * 0.3;
    
    if (Math.random() < openProb * 0.1) {
      receptor.state = RECEPTOR_STATES.OPEN;
      receptor.openProbability = openProb;
      openCount++;
    } else if (receptor.state === RECEPTOR_STATES.OPEN) {
      // Close with time constant
      if (Math.random() < deltaTime / props.tauDecay) {
        receptor.state = RECEPTOR_STATES.CLOSED;
      }
    }
    
    // Smooth conformational animation
    const lerpSpeed = receptor.state === RECEPTOR_STATES.OPEN ? 0.15 : 0.08;
    receptor.conformationProgress = receptor.conformationProgress || 0;
    const newTarget = receptor.state === RECEPTOR_STATES.OPEN ? 1 : 0;
    receptor.conformationProgress += (newTarget - receptor.conformationProgress) * lerpSpeed;
    const t = receptor.conformationProgress;
    
    // ANIMATE MOLECULAR STRUCTURE
    if (receptor.subunits && receptor.subunits.length > 0) {
      // Subunits rotate outward when open
      for (let i = 0; i < receptor.subunits.length; i++) {
        const subunit = receptor.subunits[i];
        const angle = (i / receptor.subunits.length) * Math.PI * 2;
        const baseRadius = 1.2 * 0.8; // Scale factor
        const openRadius = baseRadius * (1 + t * 0.25);
        subunit.position.x = Math.cos(angle) * openRadius;
        subunit.position.z = Math.sin(angle) * openRadius;
        
        // Update material
        subunit.traverse(child => {
          if (child.isMesh) {
            child.material = t > 0.5 ? materialCache.ampaOpen : materialCache.ampaReceptor.clone();
          }
        });
      }
    }
    
    // Pore expands when open
    if (receptor.pore) {
      const poreScale = 1 + t * 0.6;
      receptor.pore.scale.set(poreScale, 1, poreScale);
      receptor.pore.material = t > 0.5 ? materialCache.poreOpen : materialCache.pore.clone();
      
      // Selectivity filter glows
      if (receptor.pore.userData.filter) {
        receptor.pore.userData.filter.material.emissiveIntensity = 0.3 + t * 0.7;
      }
    }
    
    // Desensitization
    if (gluConc > 10) {
      receptor.desensitization = Math.min(0.8, receptor.desensitization + deltaTime * 0.001);
    } else {
      receptor.desensitization = Math.max(0, receptor.desensitization - deltaTime * 0.0005);
    }
    
    // Conductance
    if (receptor.state === RECEPTOR_STATES.OPEN) {
      receptor.conductance = props.conductance * receptor.openProbability;
      totalConductance += receptor.conductance;
    } else {
      receptor.conductance = 0;
    }
  }
  
  // Calculate EPSP contribution from AMPA
  const drivingForce = animationState.postVoltage - props.reversal;
  const current = totalConductance * drivingForce * 0.001; // pA scale
  
  // Update postsynaptic voltage (simplified)
  if (openCount > 0) {
    animationState.pspAmplitude = Math.min(30, current * 0.1);
    animationState.epspActive = true;
  }
}

/**
 * Update NMDA receptors (voltage-dependent Mg2+ block) with MOLECULAR ANIMATION
 */
function updateNMDAReceptors(deltaTime, gluConc) {
  const props = RECEPTOR_PROPS.NMDA;
  let openCount = 0;
  
  // Get Mg2+ block factor (voltage-dependent)
  const mgBlock = getNMDAMgBlock(animationState.postVoltage);
  animationState.mgBlock = 1 - mgBlock;
  
  for (const receptor of channels.postsynaptic.NMDA) {
    // NMDA requires glutamate AND depolarization (Mg2+ relief)
    const bindingFraction = gluConc / (props.Kd + gluConc);
    const effectiveOpen = bindingFraction * mgBlock;
    
    // Slower kinetics than AMPA
    if (effectiveOpen > 0.3 && Math.random() < effectiveOpen * 0.05) {
      receptor.state = RECEPTOR_STATES.OPEN;
      receptor.openProbability = effectiveOpen;
      openCount++;
    } else if (receptor.state === RECEPTOR_STATES.OPEN) {
      // Much slower closing than AMPA
      if (Math.random() < deltaTime / props.tauDecay) {
        receptor.state = RECEPTOR_STATES.CLOSED;
      }
    }
    
    // Smooth conformational animation
    receptor.conformationProgress = receptor.conformationProgress || 0;
    const newTarget = receptor.state === RECEPTOR_STATES.OPEN ? 1 : 0;
    receptor.conformationProgress += (newTarget - receptor.conformationProgress) * 0.1;
    const t = receptor.conformationProgress;
    
    // ANIMATE Mg2+ BLOCK
    if (receptor.mesh.userData && receptor.mesh.userData.mgBlock) {
      const mgSphere = receptor.mesh.userData.mgBlock;
      // Mg2+ moves out of pore when membrane is depolarized
      mgSphere.position.y = 0.5 + mgBlock * 1.5; // Moves up when unblocked
      mgSphere.visible = mgBlock < 0.7; // Hide when fully unblocked
      mgSphere.material.opacity = 1 - mgBlock;
    }
    
    // ANIMATE MOLECULAR STRUCTURE
    if (receptor.subunits && receptor.subunits.length > 0) {
      // Subunits rotate outward when open
      for (let i = 0; i < receptor.subunits.length; i++) {
        const subunit = receptor.subunits[i];
        const angle = (i / receptor.subunits.length) * Math.PI * 2;
        const baseRadius = 1.2 * 1.0;
        const openRadius = baseRadius * (1 + t * 0.2);
        subunit.position.x = Math.cos(angle) * openRadius;
        subunit.position.z = Math.sin(angle) * openRadius;
        
        // Update material based on state
        const mat = t > 0.5 ? materialCache.nmdaOpen :
                    mgBlock < 0.3 ? materialCache.nmdaBlocked : materialCache.nmdaReceptor;
        subunit.traverse(child => {
          if (child.isMesh) {
            child.material = mat.clone();
          }
        });
      }
    }
    
    // Pore animation
    if (receptor.pore) {
      const poreScale = 1 + t * 0.4;
      receptor.pore.scale.set(poreScale, 1, poreScale);
      receptor.pore.material = t > 0.5 ? materialCache.poreOpen : materialCache.pore.clone();
      
      if (receptor.pore.userData.filter) {
        receptor.pore.userData.filter.material.emissiveIntensity = 0.3 + t * 0.7;
      }
    }
    
    // NMDA allows Ca2+ influx when open
    if (receptor.state === RECEPTOR_STATES.OPEN) {
      animationState.postCaConc += deltaTime * 0.0001 * receptor.openProbability;
    }
  }
}

/**
 * Update GABA-A receptors with MOLECULAR ANIMATION (pentameric)
 */
function updateGABAAReceptors(deltaTime, gabaConc) {
  const props = RECEPTOR_PROPS.GABAA;
  let openCount = 0;
  
  for (const receptor of channels.postsynaptic.GABAA) {
    const bindingFraction = gabaConc / (props.Kd + gabaConc);
    
    if (Math.random() < bindingFraction * 0.1) {
      receptor.state = RECEPTOR_STATES.OPEN;
      receptor.openProbability = bindingFraction;
      openCount++;
    } else if (receptor.state === RECEPTOR_STATES.OPEN) {
      if (Math.random() < deltaTime / props.tauDecay) {
        receptor.state = RECEPTOR_STATES.CLOSED;
      }
    }
    
    // Smooth conformational animation
    receptor.conformationProgress = receptor.conformationProgress || 0;
    const newTarget = receptor.state === RECEPTOR_STATES.OPEN ? 1 : 0;
    receptor.conformationProgress += (newTarget - receptor.conformationProgress) * 0.12;
    const t = receptor.conformationProgress;
    
    // ANIMATE MOLECULAR STRUCTURE (pentameric)
    if (receptor.subunits && receptor.subunits.length > 0) {
      for (let i = 0; i < receptor.subunits.length; i++) {
        const subunit = receptor.subunits[i];
        const angle = (i / receptor.subunits.length) * Math.PI * 2;
        const baseRadius = 1.0 * 0.85;
        const openRadius = baseRadius * (1 + t * 0.2);
        subunit.position.x = Math.cos(angle) * openRadius;
        subunit.position.z = Math.sin(angle) * openRadius;
        
        // Slight rotation when opening
        subunit.rotation.y = t * 0.15;
        
        subunit.traverse(child => {
          if (child.isMesh) {
            child.material = t > 0.5 ? materialCache.gabaaOpen : materialCache.gabaaReceptor.clone();
          }
        });
      }
    }
    
    // Pore animation (Cl- channel)
    if (receptor.pore) {
      const poreScale = 1 + t * 0.5;
      receptor.pore.scale.set(poreScale, 1, poreScale);
      receptor.pore.material = t > 0.5 ? materialCache.poreOpen : materialCache.pore.clone();
      
      if (receptor.pore.userData.filter) {
        receptor.pore.userData.filter.material.emissiveIntensity = 0.3 + t * 0.6;
        // GABA channels have cyan glow when open
        receptor.pore.userData.filter.material.emissive.setHex(t > 0.5 ? 0x00ffcc : 0xaa8800);
      }
    }
  }
  
  // IPSP
  if (openCount > 0) {
    animationState.ipspActive = true;
    // Cl- influx hyperpolarizes
    animationState.pspAmplitude = Math.max(-15, animationState.pspAmplitude - openCount * 0.5);
  }
}

/**
 * Update metabotropic receptors with 7-TM MOLECULAR ANIMATION
 */
function updateMetabotropicReceptors(deltaTime, gluConc, gabaConc) {
  // mGluR activation (Group I mGluRs)
  let mglurActive = false;
  for (const receptor of channels.postsynaptic.mGluR) {
    const bindingFraction = gluConc / (RECEPTOR_PROPS.mGluR.Kd + gluConc);
    
    // Conformational state
    receptor.conformationProgress = receptor.conformationProgress || 0;
    const targetConf = bindingFraction > 0.3 ? 1 : 0;
    receptor.conformationProgress += (targetConf - receptor.conformationProgress) * 0.05; // Slow G-protein
    const t = receptor.conformationProgress;
    
    if (bindingFraction > 0.3) {
      receptor.gProteinActive = true;
      mglurActive = true;
    } else {
      receptor.gProteinActive = false;
    }
    
    // ANIMATE 7-TM HELICES - conformational change upon ligand binding
    if (receptor.helices && receptor.helices.length > 0) {
      for (let i = 0; i < receptor.helices.length; i++) {
        const helix = receptor.helices[i];
        if (helix.userData.baseX !== undefined) {
          // Helices rotate slightly outward when activated
          const angle = (i / 7) * Math.PI * 2;
          const expansion = 1 + t * 0.15;
          helix.position.x = helix.userData.baseX * expansion;
          helix.position.z = helix.userData.baseZ * expansion;
          
          // TM6 moves outward significantly (key conformational change)
          if (i === 5) {
            helix.position.x += t * 0.3;
          }
        }
        helix.material.emissiveIntensity = 0.15 + t * 0.5;
      }
    }
    
    // Venus flytrap domain closes when ligand binds
    if (receptor.mesh.userData && receptor.mesh.userData.vftDomain) {
      const vft = receptor.mesh.userData.vftDomain;
      vft.scale.x = 1 - t * 0.2; // Closes
      vft.material.emissiveIntensity = 0.15 + t * 0.6;
    }
  }
  animationState.mglurActive = mglurActive;
  
  // GABA-B activation (heterodimeric)
  let gababActive = false;
  for (const receptor of channels.postsynaptic.GABAB) {
    const bindingFraction = gabaConc / (RECEPTOR_PROPS.GABAB.Kd + gabaConc);
    
    receptor.conformationProgress = receptor.conformationProgress || 0;
    const targetConf = bindingFraction > 0.2 ? 1 : 0;
    receptor.conformationProgress += (targetConf - receptor.conformationProgress) * 0.04;
    const t = receptor.conformationProgress;
    
    if (bindingFraction > 0.2) {
      receptor.gProteinActive = true;
      gababActive = true;
    } else {
      receptor.gProteinActive = false;
    }
    
    // Animate 7-TM helices
    if (receptor.helices && receptor.helices.length > 0) {
      for (const helix of receptor.helices) {
        helix.material.emissiveIntensity = 0.15 + t * 0.4;
      }
    }
    
    // Update all children materials
    receptor.mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissiveIntensity = 0.15 + t * 0.4;
      }
    });
  }
  animationState.gababActive = gababActive;
  
  // G-protein cascade (slow effects)
  if (mglurActive || gababActive) {
    animationState.gProteinCascade = Math.min(100, animationState.gProteinCascade + deltaTime * 0.05);
  } else {
    animationState.gProteinCascade = Math.max(0, animationState.gProteinCascade - deltaTime * 0.02);
  }
}

// ============================================================================
// EXTERNAL API
// ============================================================================

/**
 * Get receptor positions for NT binding (in WORLD coordinates)
 */
export function getReceptorPositions() {
  const positions = {
    AMPA: [],
    NMDA: [],
    GABAA: [],
  };
  
  // Get WORLD positions (not local) for proper distance calculations with NT
  const worldPos = new THREE.Vector3();
  
  for (const r of channels.postsynaptic.AMPA) {
    r.mesh.getWorldPosition(worldPos);
    positions.AMPA.push(worldPos.clone());
  }
  for (const r of channels.postsynaptic.NMDA) {
    r.mesh.getWorldPosition(worldPos);
    positions.NMDA.push(worldPos.clone());
  }
  for (const r of channels.postsynaptic.GABAA) {
    r.mesh.getWorldPosition(worldPos);
    positions.GABAA.push(worldPos.clone());
  }
  
  // Debug: log receptor counts
  if (positions.AMPA.length === 0 && positions.NMDA.length === 0) {
    console.warn('⚠️ No receptor positions found! AMPA:', channels.postsynaptic.AMPA.length, 'NMDA:', channels.postsynaptic.NMDA.length);
  }
  
  return positions;
}

/**
 * Get receptor states for UI
 */
export function getReceptorStates() {
  let ampaOpen = 0, nmdaOpen = 0, gabaaOpen = 0;
  
  for (const r of channels.postsynaptic.AMPA) {
    if (r.state === RECEPTOR_STATES.OPEN) ampaOpen++;
  }
  for (const r of channels.postsynaptic.NMDA) {
    if (r.state === RECEPTOR_STATES.OPEN) nmdaOpen++;
  }
  for (const r of channels.postsynaptic.GABAA) {
    if (r.state === RECEPTOR_STATES.OPEN) gabaaOpen++;
  }
  
  return {
    ampaOpen,
    ampaTotal: channels.postsynaptic.AMPA.length,
    nmdaOpen,
    nmdaTotal: channels.postsynaptic.NMDA.length,
    nmdaMgBlock: animationState.mgBlock,
    gabaaOpen,
    gabaaTotal: channels.postsynaptic.GABAA.length,
    mglurActive: animationState.mglurActive,
    gababActive: animationState.gababActive,
    gProteinCascade: animationState.gProteinCascade,
  };
}
