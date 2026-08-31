/**
 * ions.js - Ion creation and management
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, neuronGroup, myelinatedNeuronGroup,
  animationState, UNIFORM_ION_SIZE, AXON_RADIUS, AXON_LENGTH, SOMA_RADIUS,
  EXTRACELLULAR_BOUNDS, ionOpacity, MYELIN_NEURON_OFFSET,
  ions, myelIons, SOMA_POS,
  ambientNaIons, ambientKIons, ambientClIons, ambientCaIons,
  myelAmbientNaIons, myelAmbientKIons, myelAmbientClIons, myelAmbientCaIons,
  hillockIons, myelHillockIons, AXON_START, axonPathData
} from './config.js';
import { getAxonPathPoint } from './neuron-unmyelinated.js';

// Shared geometries
const ionGeometry = new THREE.SphereGeometry(UNIFORM_ION_SIZE, 8, 8);
const ambientIonGeometry = new THREE.SphereGeometry(UNIFORM_ION_SIZE * 0.8, 6, 6);

// Ion materials
export const naMaterial = new THREE.MeshPhongMaterial({
  color: 0xff6b6b,
  emissive: 0xff0000,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.9
});

export const kMaterial = new THREE.MeshPhongMaterial({
  color: 0xffdd00,
  emissive: 0xffaa00,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.85
});

export const clMaterial = new THREE.MeshPhongMaterial({
  color: 0x4338ca,
  emissive: 0x3730a3,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.9
});

export const caMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.9
});

/**
 * Create ambient ions in extracellular and intracellular spaces
 */
export function createAmbientIons() {
  const bounds = EXTRACELLULAR_BOUNDS;
  
  // Create Na+ ions (extracellular - high concentration) - DENSE coverage
  for (let i = 0; i < 200; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, naMaterial.clone());
    ion.position.set(
      bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
      bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
    );
    ion.material.opacity = ionOpacity.Na * 0.4;
    ion.material.emissiveIntensity = 0.3;
    ion.visible = animationState.showExtracellularIons;
    ion.userData = { basePos: ion.position.clone() };
    scene.add(ion);
    ambientNaIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      )
    });
  }
  
  // Create K+ ions (INTRACELLULAR - inside soma, hillock, and axon) - ALWAYS visible
  // MANY MORE K+ ions - high intracellular concentration is key to resting potential
  const K_SOMA_COUNT = 150;     // Very dense in soma (was 60)
  const K_HILLOCK_COUNT = 60;   // Dense in hillock region (was 25)
  const K_AXON_COUNT = 500;     // Dense along entire axon (was 100, now 10x)
  const HILLOCK_START_X = SOMA_POS.x + SOMA_RADIUS - 1.5;
  const HILLOCK_END_X = HILLOCK_START_X + 8; // ~8 unit hillock length
  
  // K+ in SOMA - dense concentration
  for (let i = 0; i < K_SOMA_COUNT; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, kMaterial.clone());
    const r = Math.random() * SOMA_RADIUS * 0.85;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1); // Uniform sphere distribution
    ion.position.set(
      SOMA_POS.x + r * Math.sin(phi) * Math.cos(theta),
      SOMA_POS.y + r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    ion.material.opacity = ionOpacity.K * 0.6;
    ion.material.emissiveIntensity = 0.35;
    ion.visible = true;
    ion.userData = { basePos: ion.position.clone(), region: 'soma' };
    scene.add(ion);
    ambientKIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      )
    });
  }
  
  // K+ in AXON HILLOCK - transition zone
  for (let i = 0; i < K_HILLOCK_COUNT; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, kMaterial.clone());
    const t = Math.random(); // Position along hillock
    const hillockX = HILLOCK_START_X + t * (HILLOCK_END_X - HILLOCK_START_X);
    // Hillock tapers from soma radius to axon radius
    const hillockRadius = SOMA_RADIUS * 0.6 * (1 - t * 0.7) + AXON_RADIUS * t * 0.7;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * hillockRadius * 0.8;
    ion.position.set(
      hillockX,
      r * Math.cos(angle),
      r * Math.sin(angle)
    );
    ion.material.opacity = ionOpacity.K * 0.6;
    ion.material.emissiveIntensity = 0.35;
    ion.visible = true;
    ion.userData = { basePos: ion.position.clone(), region: 'hillock' };
    scene.add(ion);
    ambientKIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      )
    });
  }
  
  // K+ in AXON - distributed along length, following the actual curved axon path
  for (let i = 0; i < K_AXON_COUNT; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, kMaterial.clone());
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * AXON_RADIUS * 0.75;
    
    // Get position along the actual axon path (which snakes)
    const distanceAlongAxon = Math.random() * AXON_LENGTH;
    const pathPoint = getAxonPathPoint(distanceAlongAxon);
    
    // Calculate local offset perpendicular to the path direction
    // Create a perpendicular basis from the path direction
    const pathDir = pathPoint.direction;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(pathDir, up).normalize();
    const localUp = new THREE.Vector3().crossVectors(right, pathDir).normalize();
    
    // Position ion at path point with local perpendicular offset
    const offset = right.clone().multiplyScalar(r * Math.cos(angle))
                  .add(localUp.clone().multiplyScalar(r * Math.sin(angle)));
    
    ion.position.copy(pathPoint.position).add(offset);
    ion.material.opacity = ionOpacity.K * 0.55;
    ion.material.emissiveIntensity = 0.3;
    ion.visible = true;
    // Store the distance along path for proper animation
    ion.userData = { 
      basePos: ion.position.clone(), 
      region: 'axon',
      distanceAlongAxon: distanceAlongAxon,
      localAngle: angle,
      localRadius: r
    };
    scene.add(ion);
    ambientKIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      )
    });
  }
  
  // Create Cl- ions (extracellular) - DENSE coverage
  for (let i = 0; i < 150; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, clMaterial.clone());
    ion.position.set(
      bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
      bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
    );
    ion.material.opacity = ionOpacity.Cl * 0.35;
    ion.material.emissiveIntensity = 0.25;
    ion.visible = animationState.showExtracellularIons;
    ion.userData = { basePos: ion.position.clone() };
    scene.add(ion);
    ambientClIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      )
    });
  }
  
  // Create Ca2+ ions (extracellular - concentrated near terminals)
  for (let i = 0; i < 80; i++) {
    const ion = new THREE.Mesh(ambientIonGeometry, caMaterial.clone());
    ion.position.set(
      15 + Math.random() * 25,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15
    );
    ion.material.opacity = ionOpacity.Ca * 0.3;
    ion.material.emissiveIntensity = 0.4;
    ion.visible = animationState.showExtracellularIons;
    ion.userData = { basePos: ion.position.clone() };
    scene.add(ion);
    ambientCaIons.push({
      mesh: ion,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      )
    });
  }
  
  // EXTRA: Add more Na+/Cl- concentrated around the dendritic tree (negative X)
  for (let i = 0; i < 100; i++) {
    const ionType = Math.random() < 0.6 ? 'Na' : 'Cl';
    const material = ionType === 'Na' ? naMaterial.clone() : clMaterial.clone();
    const ion = new THREE.Mesh(ambientIonGeometry, material);
    
    // Concentrate around dendritic tree area
    ion.position.set(
      -60 + Math.random() * 55, // Dendrite region (negative X toward soma)
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50
    );
    ion.material.opacity = ionOpacity[ionType] * 0.4;
    ion.material.emissiveIntensity = 0.3;
    ion.visible = animationState.showExtracellularIons;
    ion.userData = { basePos: ion.position.clone() };
    scene.add(ion);
    
    if (ionType === 'Na') {
      ambientNaIons.push({
        mesh: ion,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        )
      });
    } else {
      ambientClIons.push({
        mesh: ion,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4
        )
      });
    }
  }
}

/**
 * Update ambient ion positions (Brownian motion) and visibility
 */
export function updateAmbientIons(deltaTime) {
  const bounds = EXTRACELLULAR_BOUNDS;
  const brownianStrength = 0.5;
  const showExtracellular = animationState.showExtracellularIons;
  const time = animationState.time;
  
  // Update Na+ ions (extracellular)
  ambientNaIons.forEach(ion => {
    ion.mesh.visible = showExtracellular;
    if (!showExtracellular) return;
    
    const bp = ion.mesh.userData.basePos;
    ion.mesh.position.x = bp.x + Math.sin(time * 2 + bp.y) * 0.5;
    ion.mesh.position.y = bp.y + Math.sin(time * 1.5 + bp.x) * 0.3;
    ion.mesh.position.z = bp.z + Math.cos(time * 1.8 + bp.z) * 0.3;
    
    ion.mesh.material.opacity = ionOpacity.Na * 0.4;
  });
  
  // Update K+ ions (INTRACELLULAR - always visible, nice floating motion)
  ambientKIons.forEach((ion, idx) => {
    ion.mesh.visible = true; // Always visible
    
    const bp = ion.mesh.userData.basePos;
    const region = ion.mesh.userData.region;
    const phase = idx * 0.5; // Each ion has unique phase
    
    if (region === 'axon') {
      // For axon K+ ions, animate along the curved path to stay inside
      const baseDistance = ion.mesh.userData.distanceAlongAxon;
      const localAngle = ion.mesh.userData.localAngle;
      const localRadius = ion.mesh.userData.localRadius;
      
      // Small oscillation along the axon path
      const distOscillation = Math.sin(time * 1.2 + phase) * 1.5;
      const newDistance = Math.max(0, Math.min(AXON_LENGTH, baseDistance + distOscillation));
      
      // Get current path point
      const pathPoint = getAxonPathPoint(newDistance);
      
      // Oscillate the local radius and angle slightly
      const angleOsc = Math.sin(time * 1.5 + phase + 1.5) * 0.2;
      const radiusOsc = 1 + Math.sin(time * 1.3 + phase + 3.0) * 0.15;
      const currentAngle = localAngle + angleOsc;
      const currentR = localRadius * radiusOsc;
      
      // Calculate perpendicular offset from path
      const pathDir = pathPoint.direction;
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(pathDir, up).normalize();
      const localUp = new THREE.Vector3().crossVectors(right, pathDir).normalize();
      
      const offset = right.clone().multiplyScalar(currentR * Math.cos(currentAngle))
                    .add(localUp.clone().multiplyScalar(currentR * Math.sin(currentAngle)));
      
      ion.mesh.position.copy(pathPoint.position).add(offset);
    } else {
      // Soma and hillock - simple oscillation around base position
      let ampX = 0.6, ampY = 0.5, ampZ = 0.5;
      if (region === 'soma') {
        ampX = 1.2; ampY = 1.0; ampZ = 1.0;
      } else if (region === 'hillock') {
        ampX = 0.8; ampY = 0.6; ampZ = 0.6;
      }
      
      ion.mesh.position.x = bp.x + Math.sin(time * 1.2 + phase) * ampX;
      ion.mesh.position.y = bp.y + Math.sin(time * 1.5 + phase + 1.5) * ampY;
      ion.mesh.position.z = bp.z + Math.cos(time * 1.3 + phase + 3.0) * ampZ;
    }
    
    // Bright yellow K+ - highly visible
    ion.mesh.material.opacity = ionOpacity.K * 0.65;
    ion.mesh.material.emissiveIntensity = 0.4;
  });
  
  // Update Cl- ions (extracellular)
  ambientClIons.forEach(ion => {
    ion.mesh.visible = showExtracellular;
    if (!showExtracellular) return;
    
    const bp = ion.mesh.userData.basePos;
    ion.mesh.position.x = bp.x + Math.sin(time * 1.2 + bp.y) * 0.4;
    ion.mesh.position.y = bp.y + Math.cos(time * 1.4 + bp.x) * 0.3;
    ion.mesh.position.z = bp.z + Math.sin(time * 1.6 + bp.z) * 0.3;
    
    ion.mesh.material.opacity = ionOpacity.Cl * 0.35;
  });
  
  // Update Ca2+ ions (extracellular - near terminals)
  ambientCaIons.forEach(ion => {
    ion.mesh.visible = showExtracellular;
    if (!showExtracellular) return;
    
    const bp = ion.mesh.userData.basePos;
    ion.mesh.position.x = bp.x + Math.sin(time * 1.3 + bp.y) * 0.5;
    ion.mesh.position.y = bp.y + Math.cos(time * 1.6 + bp.x) * 0.35;
    ion.mesh.position.z = bp.z + Math.sin(time * 1.9 + bp.z) * 0.35;
    
    ion.mesh.material.opacity = ionOpacity.Ca * 0.3;
  });
}

/**
 * Create an ion during AP propagation
 * @param {string} type - 'Na' or 'K'
 * @param {Object} channel - Channel object with position data
 */
export function createIon(type, channel) {
  const mat = type === 'Na' ? naMaterial.clone() : kMaterial.clone();
  mat.emissiveIntensity = 1.2;
  const ion = new THREE.Mesh(ionGeometry, mat);
  
  const startR = type === 'Na' ? AXON_RADIUS + 2 : AXON_RADIUS * 0.3;
  const angle = channel.angle || Math.random() * Math.PI * 2;
  
  ion.position.set(
    channel.position + (Math.random() - 0.5) * 0.5,
    startR * Math.cos(angle),
    startR * Math.sin(angle)
  );
  
  neuronGroup.add(ion);
  
  const speed = type === 'Na' ? 3 : 2.5;
  const velocity = type === 'Na'
    ? new THREE.Vector3(0, -Math.cos(angle) * speed, -Math.sin(angle) * speed)
    : new THREE.Vector3(0, Math.cos(angle) * speed, Math.sin(angle) * speed);
  
  ions.push({
    mesh: ion,
    type,
    position: channel.position,
    angle,
    progress: 0,
    lifetime: 0,
    velocity
  });
}

/**
 * Update active ions during AP
 */
export function updateIons(deltaTime) {
  const PUMP_START_TIME = 1.2;
  const PUMP_DURATION = 2.5;
  
  for (let i = ions.length - 1; i >= 0; i--) {
    const ion = ions[i];
    ion.progress += deltaTime * 2.5;
    ion.lifetime += deltaTime;
    
    const pumpActive = ion.lifetime > PUMP_START_TIME && ion.lifetime < (PUMP_START_TIME + PUMP_DURATION);
    const pumpProgress = pumpActive ? (ion.lifetime - PUMP_START_TIME) / PUMP_DURATION : 0;
    
    if (ion.type === 'Na') {
      if (ion.lifetime < PUMP_START_TIME) {
        if (ion.velocity) {
          ion.mesh.position.add(ion.velocity.clone().multiplyScalar(deltaTime));
          ion.velocity.multiplyScalar(0.95);
        }
        
        if (ion.mesh.position.x > -30 && ion.mesh.position.x < -25) {
          hillockIons.positive += 0.1;
        }
      } else if (pumpActive) {
        const pumpOutR = AXON_RADIUS * 0.3 + pumpProgress * (AXON_RADIUS + 2);
        ion.mesh.position.set(
          ion.position + (Math.random() - 0.5) * 0.1 * (1 + pumpProgress),
          pumpOutR * Math.cos(ion.angle),
          pumpOutR * Math.sin(ion.angle)
        );
        ion.mesh.material.emissive.setRGB(1.0, 0.3 + pumpProgress * 0.4, 0.3);
      }
    } else {
      if (ion.lifetime < PUMP_START_TIME) {
        if (ion.velocity) {
          ion.mesh.position.add(ion.velocity.clone().multiplyScalar(deltaTime));
          ion.velocity.multiplyScalar(0.95);
        }
      } else if (pumpActive) {
        const startR = AXON_RADIUS + 2;
        const targetR = AXON_RADIUS * 0.35;
        const currentR = startR + (targetR - startR) * pumpProgress;
        ion.mesh.position.set(
          ion.position + (Math.random() - 0.5) * 0.1 * (1 - pumpProgress),
          currentR * Math.cos(ion.angle),
          currentR * Math.sin(ion.angle)
        );
        ion.mesh.material.emissive.setRGB(1.0, 0.8 + pumpProgress * 0.2, 0.0);
      }
    }
    
    const maxLifetime = PUMP_START_TIME + PUMP_DURATION + 0.5;
    const fadeStart = PUMP_START_TIME + PUMP_DURATION - 0.3;
    if (ion.lifetime > fadeStart) {
      const fadeProgress = (ion.lifetime - fadeStart) / 0.8;
      ion.mesh.material.opacity = Math.max(0, 0.9 - fadeProgress);
      ion.mesh.scale.setScalar(Math.max(0.3, 1 - fadeProgress * 0.5));
    }
    
    if (ion.lifetime > maxLifetime || ion.mesh.material.opacity < 0.05) {
      neuronGroup.remove(ion.mesh);
      ions.splice(i, 1);
    }
  }
}

export { ionGeometry };
