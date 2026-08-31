/**
 * synaptic.js - Synaptic input handling and neurotransmitter release
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, neuronGroup, myelinatedNeuronGroup,
  animationState, SOMA_POS, SOMA_RADIUS, HILLOCK_LENGTH, AXON_RADIUS,
  MYELIN_NEURON_OFFSET,
  dendriteData, synapticInputs, myelSynapticInputs, myelDendriteData,
  hillockIons, myelHillockIons, ION_CONC, THRESHOLD,
  vesicles, microNTs, caInfluxIons, myelVesicles, myelMicroNTs, myelCaInfluxIons,
  UNIFORM_ION_SIZE, AXON_START
} from './config.js';
import { createSynapticInput } from './neuron-unmyelinated.js';

// Shared geometry for micro-NTs
const microNTGeo = new THREE.SphereGeometry(0.06, 6, 6);

// Oscillation state for membrane noise
let oscillationPhase1 = 0;
let oscillationPhase2 = 0;
let oscillationPhase3 = 0;
let membraneNoise = 0;

// DC voltage tracking (global for persistence)
let hillockDC = -70;
let somaDC = -70;

// Export voltages
export let somaVoltage = -70;
export let hillockVoltage = -70;

/**
 * Update synaptic inputs - ion flow from dendrites to soma to hillock
 */
export function updateSynapticInputs(deltaTime) {
  const hillockStartX = SOMA_POS.x + SOMA_RADIUS - 1.5;
  const hillockEndX = hillockStartX + HILLOCK_LENGTH + 1;
  
  for (let i = synapticInputs.length - 1; i >= 0; i--) {
    const inp = synapticInputs[i];
    inp.progress += deltaTime * 2;
    inp.lifetime += deltaTime;
    
    // Handle K+ efflux (flows OUT of dendrite into extracellular space)
    // TRUE BROWNIAN MOTION - tiny jittering steps, very slow drift
    if (inp.ionType === 'K' && inp.flowingIn === false) {
      // Delayed start - K+ appears after Na+ has entered
      if (inp.lifetime < 0) {
        inp.mesh.visible = false;
        continue;
      }
      inp.mesh.visible = true;
      
      // Pure Brownian motion: random step each frame (no persistent velocity)
      // Each step is tiny and completely random - like molecular thermal motion
      const stepSize = 0.03; // Very small step
      const randomStep = new THREE.Vector3(
        (Math.random() - 0.5) * stepSize,
        (Math.random() - 0.5) * stepSize,
        (Math.random() - 0.5) * stepSize
      );
      
      // Tiny outward drift (concentration gradient diffusion)
      const driftStep = inp.direction.clone().multiplyScalar(0.003);
      
      inp.mesh.position.add(randomStep);
      inp.mesh.position.add(driftStep);
      
      inp.mesh.material.opacity = Math.max(0, 0.9 - inp.lifetime * 0.15);
      
      if (inp.lifetime > 6 || inp.mesh.material.opacity < 0.1) {
        neuronGroup.remove(inp.mesh);
        synapticInputs.splice(i, 1);
      }
      continue;
    }
    
    // Handle ions flowing IN (Na+ and Cl-)
    // First phase: move from extracellular toward dendrite/target point
    if (inp.flowingIn && inp.targetPoint && !inp.reachedDendrite) {
      const toTarget = inp.targetPoint.clone().sub(inp.mesh.position);
      const distToTarget = toTarget.length();
      
      if (distToTarget > 0.5) {
        // Still approaching the dendrite/channel
        const speed = inp.speed || 0.6;
        inp.mesh.position.add(toTarget.normalize().multiplyScalar(deltaTime * speed));
        continue;
      } else {
        // Reached the dendrite - now flow toward soma
        inp.reachedDendrite = true;
        const dd = dendriteData[inp.dendriteIdx];
        inp.direction = dd.direction.clone().negate(); // Toward soma
      }
    }
    
    // Calculate distance to soma center
    const toSoma = SOMA_POS.clone().sub(inp.mesh.position);
    const distToSoma = toSoma.length();
    const x = inp.mesh.position.x;
    
    // Check regions
    const inHillock = x > hillockStartX && x < hillockEndX;
    const nearHillock = x > SOMA_POS.x - 2;
    const inSoma = distToSoma < SOMA_RADIUS * 1.1;
    
    if (distToSoma > SOMA_RADIUS * 0.9 && !inHillock && !inSoma) {
      // Still traveling toward soma - simply move along dendrite direction
      // This is the ORIGINAL simple logic that works correctly!
      const speed = inp.speed || 0.6;
      
      // Ensure direction is set (toward soma along dendrite)
      if (!inp.direction) {
        const dd = dendriteData[inp.dendriteIdx];
        if (dd) {
          inp.direction = dd.direction.clone().negate();
        } else {
          inp.direction = toSoma.clone().normalize();
        }
      }
      
      inp.mesh.position.add(inp.direction.clone().multiplyScalar(deltaTime * speed));
    } else {
      // Inside soma or hillock - diffuse with bias toward hillock
      if (!inp.somaVelocity) {
        inp.somaVelocity = new THREE.Vector3(
          3.0 + Math.random() * 2.0,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        );
        inp.enteredSoma = true;
      }
      
      const biasStrength = inHillock ? 0.3 : (nearHillock ? 3.0 : 2.0);
      inp.somaVelocity.x += biasStrength * deltaTime;
      
      if (inHillock) {
        inp.somaVelocity.x += (Math.random() - 0.5) * 2 * deltaTime;
        inp.somaVelocity.x = Math.min(inp.somaVelocity.x, 3.0);
      }
      
      inp.somaVelocity.add(new THREE.Vector3(
        (Math.random() - 0.4) * 3 * deltaTime,
        (Math.random() - 0.5) * 5 * deltaTime,
        (Math.random() - 0.5) * 5 * deltaTime
      ));
      
      inp.somaVelocity.x *= 0.98;
      inp.somaVelocity.y *= 0.95;
      inp.somaVelocity.z *= 0.95;
      
      inp.somaVelocity.x = Math.max(-2, Math.min(8, inp.somaVelocity.x));
      inp.somaVelocity.y = Math.max(-4, Math.min(4, inp.somaVelocity.y));
      inp.somaVelocity.z = Math.max(-4, Math.min(4, inp.somaVelocity.z));
      
      inp.mesh.position.add(inp.somaVelocity.clone().multiplyScalar(deltaTime));
      
      const newX = inp.mesh.position.x;
      const nowInHillock = newX > hillockStartX && newX < hillockEndX;
      
      // Bounce off nucleus
      const toNucleus = inp.mesh.position.clone().sub(SOMA_POS);
      if (toNucleus.length() < SOMA_RADIUS * 0.5 && newX < hillockStartX) {
        toNucleus.normalize().multiplyScalar(SOMA_RADIUS * 0.55);
        inp.mesh.position.copy(SOMA_POS).add(toNucleus);
        inp.somaVelocity.x = Math.abs(inp.somaVelocity.x) + 2;
        inp.somaVelocity.y *= -0.3;
        inp.somaVelocity.z *= -0.3;
      }
      
      // Containment logic
      if (nowInHillock) {
        const hillockProgress = Math.max(0, Math.min(1, (newX - hillockStartX) / HILLOCK_LENGTH));
        const hillockRadius = SOMA_RADIUS * 0.6 * (1 - hillockProgress) + AXON_RADIUS * 1.1 * hillockProgress;
        const yz = Math.sqrt(inp.mesh.position.y ** 2 + inp.mesh.position.z ** 2);
        
        if (yz > hillockRadius * 0.9) {
          const scale = (hillockRadius * 0.85) / yz;
          inp.mesh.position.y *= scale;
          inp.mesh.position.z *= scale;
          inp.somaVelocity.y *= -0.3;
          inp.somaVelocity.z *= -0.3;
          inp.somaVelocity.x += 1.5;
        }
        
        if (newX > hillockEndX) {
          inp.inAxon = true;
          inp.somaVelocity = null;
        }
      } else if (inp.inAxon) {
        // Ion in axon - gentle drift
        if (!inp.axonVel) {
          inp.axonVel = new THREE.Vector3(
            0.5 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
          );
        }
        
        inp.axonVel.add(new THREE.Vector3(
          (Math.random() - 0.4) * 0.5 * deltaTime,
          (Math.random() - 0.5) * 0.8 * deltaTime,
          (Math.random() - 0.5) * 0.8 * deltaTime
        ));
        inp.axonVel.multiplyScalar(0.98);
        
        inp.axonVel.x = Math.max(0.1, Math.min(1.5, inp.axonVel.x));
        inp.axonVel.y = Math.max(-0.5, Math.min(0.5, inp.axonVel.y));
        inp.axonVel.z = Math.max(-0.5, Math.min(0.5, inp.axonVel.z));
        
        inp.mesh.position.add(inp.axonVel.clone().multiplyScalar(deltaTime));
        
        const axonYZ = Math.sqrt(inp.mesh.position.y ** 2 + inp.mesh.position.z ** 2);
        if (axonYZ > AXON_RADIUS * 0.7) {
          const scale = (AXON_RADIUS * 0.65) / axonYZ;
          inp.mesh.position.y *= scale;
          inp.mesh.position.z *= scale;
          inp.axonVel.y *= -0.3;
          inp.axonVel.z *= -0.3;
        }
        
        inp.lifetime += deltaTime * 1.5;
      } else if (newX > SOMA_POS.x - 1) {
        // Transition zone
        const fromSoma = inp.mesh.position.clone().sub(SOMA_POS);
        const yz = Math.sqrt(inp.mesh.position.y ** 2 + inp.mesh.position.z ** 2);
        const transitionProgress = (newX - (SOMA_POS.x - 1)) / (hillockStartX - SOMA_POS.x + 1);
        const maxYZ = SOMA_RADIUS * 0.8 * (1 - transitionProgress * 0.4);
        
        if (yz > maxYZ) {
          const scale = maxYZ / yz;
          inp.mesh.position.y *= scale;
          inp.mesh.position.z *= scale;
          inp.somaVelocity.y *= 0.5;
          inp.somaVelocity.z *= 0.5;
        }
        
        if (fromSoma.length() > SOMA_RADIUS * 0.95 && fromSoma.x < 0) {
          fromSoma.normalize().multiplyScalar(SOMA_RADIUS * 0.9);
          inp.mesh.position.copy(SOMA_POS).add(fromSoma);
          inp.somaVelocity.x = Math.abs(inp.somaVelocity.x) + 1;
        }
      } else {
        // Main soma body
        const fromSoma = inp.mesh.position.clone().sub(SOMA_POS);
        if (fromSoma.length() > SOMA_RADIUS * 0.9) {
          fromSoma.normalize().multiplyScalar(SOMA_RADIUS * 0.85);
          inp.mesh.position.copy(SOMA_POS).add(fromSoma);
          inp.somaVelocity.reflect(fromSoma.normalize().negate());
          inp.somaVelocity.x += 2.0;
        }
      }
    }
    
    // Fade
    const inHillockNow = inp.mesh.position.x > hillockStartX && inp.mesh.position.x < hillockEndX;
    const fadeRate = inp.inAxon ? 0.25 : (inHillockNow ? 0.18 : 0.12);
    inp.mesh.material.opacity = Math.max(0, 0.95 - inp.lifetime * fadeRate);
    inp.mesh.scale.setScalar(Math.max(0.3, 1 - inp.lifetime * 0.08));
    inp.mesh.material.emissiveIntensity = (inHillockNow ? 1.2 : 0.8) + Math.sin(inp.lifetime * 8) * 0.3;
    
    // Remove when faded
    const maxLifetime = inp.inAxon ? 4 : (inHillockNow ? 6 : 8);
    if (inp.lifetime > maxLifetime || inp.mesh.material.opacity < 0.1) {
      neuronGroup.remove(inp.mesh);
      synapticInputs.splice(i, 1);
    }
  }
  
  // Spontaneous inputs with rhythmic patterns
  const time = animationState.time;
  
  const burstPhase1 = Math.sin(time * 4 * Math.PI) * 0.5 + 0.5;
  const burstPhase2 = Math.sin(time * 8 * Math.PI) * 0.5 + 0.5;
  const burstPhase3 = Math.sin(time * 16 * Math.PI) * 0.3 + 0.7;
  
  const epspBurstMod = burstPhase1 * burstPhase3;
  const ipspBurstMod = burstPhase2 * (1 - burstPhase1 * 0.3);
  
  const epspChance = animationState.epspRate / 100 * deltaTime * 30 * (0.3 + epspBurstMod * 1.5);
  const ipspChance = animationState.ipspRate / 100 * deltaTime * 25 * (0.3 + ipspBurstMod * 1.2);
  
  const burstSize = Math.floor(1 + burstPhase1 * 3);
  
  for (let i = 0; i < burstSize; i++) {
    if (Math.random() < epspChance && dendriteData.length > 0) {
      createSynapticInput(Math.floor(Math.random() * dendriteData.length), true);
    }
    if (Math.random() < ipspChance && dendriteData.length > 0) {
      createSynapticInput(Math.floor(Math.random() * dendriteData.length), false);
    }
  }
}

/**
 * Update myelinated neuron synaptic inputs - same logic as unmyelinated
 */
export function updateMyelSynapticInputs(deltaTime) {
  if (!animationState.showMyelinatedNeuron) return;
  
  // Myelinated soma position is offset
  const MYEL_SOMA_POS = SOMA_POS.clone();
  MYEL_SOMA_POS.y = 0; // Relative to myelinatedNeuronGroup which has MYELIN_NEURON_OFFSET
  
  const hillockStartX = SOMA_POS.x + SOMA_RADIUS - 1.5;
  const hillockEndX = hillockStartX + HILLOCK_LENGTH + 1;
  
  for (let i = myelSynapticInputs.length - 1; i >= 0; i--) {
    const inp = myelSynapticInputs[i];
    inp.progress += deltaTime * 2;
    inp.lifetime += deltaTime;
    
    // Handle K+ efflux (flows OUT) - TRUE BROWNIAN MOTION
    if (inp.ionType === 'K' && inp.flowingIn === false) {
      if (inp.lifetime < 0) {
        inp.mesh.visible = false;
        continue;
      }
      inp.mesh.visible = true;
      
      // Pure Brownian motion: random step each frame
      const stepSize = 0.03;
      const randomStep = new THREE.Vector3(
        (Math.random() - 0.5) * stepSize,
        (Math.random() - 0.5) * stepSize,
        (Math.random() - 0.5) * stepSize
      );
      
      // Tiny outward drift
      const driftStep = inp.direction.clone().multiplyScalar(0.003);
      
      inp.mesh.position.add(randomStep);
      inp.mesh.position.add(driftStep);
      
      inp.mesh.material.opacity = Math.max(0, 0.9 - inp.lifetime * 0.15);
      
      if (inp.lifetime > 6 || inp.mesh.material.opacity < 0.1) {
        myelinatedNeuronGroup.remove(inp.mesh);
        myelSynapticInputs.splice(i, 1);
      }
      continue;
    }
    
    // Handle ions flowing IN (Na+ and Cl-)
    // First phase: move from extracellular toward dendrite/target point
    if (inp.flowingIn && inp.targetPoint && !inp.reachedDendrite) {
      const toTarget = inp.targetPoint.clone().sub(inp.mesh.position);
      const distToTarget = toTarget.length();
      
      if (distToTarget > 0.5) {
        // Still approaching the dendrite/channel
        const speed = inp.speed || 0.6;
        inp.mesh.position.add(toTarget.normalize().multiplyScalar(deltaTime * speed));
        continue;
      } else {
        // Reached the dendrite - now flow toward soma
        inp.reachedDendrite = true;
        const dd = myelDendriteData[inp.dendriteIdx];
        inp.direction = dd.direction.clone().negate(); // Toward soma
      }
    }
    
    // Calculate distance to soma
    const toSoma = MYEL_SOMA_POS.clone().sub(inp.mesh.position);
    const distToSoma = toSoma.length();
    const x = inp.mesh.position.x;
    
    const inHillock = x > hillockStartX && x < hillockEndX;
    const inSoma = distToSoma < SOMA_RADIUS * 1.1;
    
    if (distToSoma > SOMA_RADIUS * 0.9 && !inHillock && !inSoma) {
      // Still traveling toward soma - simply move along dendrite direction
      const speed = inp.speed || 0.6;
      
      // Ensure direction is set (toward soma along dendrite)
      if (!inp.direction) {
        const dd = myelDendriteData[inp.dendriteIdx];
        if (dd) {
          inp.direction = dd.direction.clone().negate();
        } else {
          inp.direction = toSoma.clone().normalize();
        }
      }
      
      inp.mesh.position.add(inp.direction.clone().multiplyScalar(deltaTime * speed));
    } else {
      // Inside soma/hillock - diffuse with bias toward hillock
      if (!inp.somaVelocity) {
        inp.somaVelocity = new THREE.Vector3(
          3.0 + Math.random() * 2.0,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        );
      }
      
      inp.somaVelocity.add(new THREE.Vector3(
        (Math.random() - 0.3) * deltaTime * 4,
        (Math.random() - 0.5) * deltaTime * 6,
        (Math.random() - 0.5) * deltaTime * 6
      ));
      inp.somaVelocity.multiplyScalar(0.96);
      inp.mesh.position.add(inp.somaVelocity.clone().multiplyScalar(deltaTime));
      
      // Containment
      const fromSoma = inp.mesh.position.clone().sub(MYEL_SOMA_POS);
      if (fromSoma.length() > SOMA_RADIUS * 0.9) {
        fromSoma.normalize().multiplyScalar(SOMA_RADIUS * 0.85);
        inp.mesh.position.copy(MYEL_SOMA_POS).add(fromSoma);
        inp.somaVelocity.x = Math.abs(inp.somaVelocity.x) + 2;
      }
    }
    
    // Fade
    const fadeRate = inp.inAxon ? 0.25 : 0.12;
    inp.mesh.material.opacity = Math.max(0, 0.95 - inp.lifetime * fadeRate);
    inp.mesh.material.emissiveIntensity = 0.8 + Math.sin(inp.lifetime * 8) * 0.3;
    
    const maxLifetime = 8;
    if (inp.lifetime > maxLifetime || inp.mesh.material.opacity < 0.1) {
      myelinatedNeuronGroup.remove(inp.mesh);
      myelSynapticInputs.splice(i, 1);
    }
  }
}

/**
 * Integrate soma voltage based on synaptic inputs
 */
export function integrateSoma(deltaTime, somaMaterial, hillockMaterial) {
  const hillockStartX = SOMA_POS.x + SOMA_RADIUS - 1.5;
  const hillockEndX = hillockStartX + HILLOCK_LENGTH + 1;
  const nearHillockX = SOMA_POS.x + SOMA_RADIUS * 0.3;
  
  // Count ions in different regions
  let hillockPosIons = 0;
  let hillockNegIons = 0;
  let somaPosIons = 0;
  let somaNegIons = 0;
  
  synapticInputs.forEach(inp => {
    const x = inp.mesh.position.x;
    const distToSoma = inp.mesh.position.distanceTo(SOMA_POS);
    
    if (x > hillockStartX && x < hillockEndX) {
      if (inp.isEPSP) hillockPosIons++;
      else hillockNegIons++;
    } else if (x > nearHillockX && distToSoma < SOMA_RADIUS * 1.2) {
      if (inp.isEPSP) {
        hillockPosIons += 0.5;
        somaPosIons++;
      } else {
        hillockNegIons += 0.5;
        somaNegIons++;
      }
    } else if (distToSoma < SOMA_RADIUS * 1.1) {
      if (inp.isEPSP) somaPosIons++;
      else somaNegIons++;
    }
  });
  
  // Update hillock ion counts
  const baseDecay = 0.92;
  const noInputDecay = 0.75;
  const posDecay = hillockPosIons > 0.5 ? baseDecay : noInputDecay;
  const negDecay = hillockNegIons > 0.5 ? baseDecay : noInputDecay;
  hillockIons.positive = hillockIons.positive * posDecay + hillockPosIons * 0.6;
  hillockIons.negative = hillockIons.negative * negDecay + hillockNegIons * 0.6;
  
  // Update hillock concentrations
  const naInflux = hillockIons.positive * 0.25 * deltaTime;
  const clInflux = hillockIons.negative * 0.2 * deltaTime;
  
  ION_CONC.hillock.Na = Math.max(10, Math.min(50, 
    ION_CONC.hillock.Na + naInflux - (ION_CONC.hillock.Na - 15) * 0.3 * deltaTime
  ));
  ION_CONC.hillock.Cl = Math.max(5, Math.min(30,
    ION_CONC.hillock.Cl + clInflux - (ION_CONC.hillock.Cl - 10) * 0.3 * deltaTime
  ));
  
  // Update dendrite voltages
  let totalInput = 0;
  dendriteData.forEach(dd => {
    const contribution = (dd.voltage + 70) * 0.08;
    totalInput += contribution;
    dd.voltage += (-70 - dd.voltage) * 1.5 * deltaTime;
    
    const depol = dd.voltage + 70;
    const intensity = Math.max(0.3, Math.min(1.5, depol / 25));
    dd.material.emissiveIntensity = intensity;
    
    if (dd.voltage > -55) {
      dd.material.emissive.setRGB(1.0, 0.3, 0.3);
      dd.material.color.setRGB(1.0, 0.5, 0.5);
    } else if (dd.voltage > -65) {
      const t = (dd.voltage + 65) / 10;
      dd.material.emissive.setRGB(0.8 * t + 0.2, 0.3, 0.3 + 0.3 * (1 - t));
      dd.material.color.setRGB(0.6 * t + 0.4, 0.6, 0.8);
    } else if (dd.voltage < -80) {
      dd.material.emissive.setRGB(0.5, 0.2, 0.7);
      dd.material.color.setRGB(0.6, 0.4, 0.8);
    } else if (dd.voltage < -72) {
      const t = (-72 - dd.voltage) / 8;
      dd.material.emissive.setRGB(0.2 + 0.3 * t, 0.2, 0.4 + 0.3 * t);
      dd.material.color.setRGB(0.5, 0.5, 0.7 + 0.1 * t);
    } else {
      dd.material.emissive.setRGB(0.1, 0.3, 0.5);
      dd.material.color.setRGB(0.47, 0.69, 1.0);
    }
  });
  
  // Update soma concentration
  const somaIonContribution = (somaPosIons - somaNegIons * 0.8) * 0.3;
  ION_CONC.soma.Na = Math.max(10, Math.min(40,
    ION_CONC.soma.Na + totalInput * deltaTime * 0.5 + somaIonContribution * deltaTime - (ION_CONC.soma.Na - 15) * 0.25 * deltaTime
  ));
  
  // Membrane noise & oscillations
  oscillationPhase1 += deltaTime * 0.5 * Math.PI * 2;
  oscillationPhase2 += deltaTime * 2 * Math.PI * 2;
  oscillationPhase3 += deltaTime * 5 * Math.PI * 2;
  
  membraneNoise += (Math.random() - 0.5) * 1.5 * deltaTime * 10;
  membraneNoise *= 0.98;
  membraneNoise = Math.max(-2, Math.min(2, membraneNoise));
  
  const epspRate = animationState.epspRate / 100;
  const ipspRate = animationState.ipspRate / 100;
  
  const baselineOscAmp = 1.0;
  const inputOscAmp = (epspRate + ipspRate * 0.3) * 1.5;
  const totalOscAmp = Math.max(1.2, Math.min(3.5, baselineOscAmp + inputOscAmp));
  
  const slowWave = Math.sin(oscillationPhase1) * 1.8 * totalOscAmp;
  const mediumOsc = Math.sin(oscillationPhase2) * 2.0 * totalOscAmp;
  const thetaOsc = Math.sin(oscillationPhase3) * 1.0 * totalOscAmp;
  
  const rhythmicNoise = slowWave * 0.35 + mediumOsc * 0.7 + thetaOsc * 0.25 + membraneNoise;
  
  // E/I balance
  const netExcitation = epspRate - ipspRate * 0.8;
  const rawShift = netExcitation * 18;
  const baselineShift = Math.max(-6, Math.min(10, rawShift * 0.7 + Math.sign(rawShift) * Math.pow(Math.abs(rawShift), 0.8) * 0.3));
  
  // Ion-based depolarization
  const rawIonDepol = (hillockIons.positive * 0.8) - (hillockIons.negative * 0.6);
  const ionDepolarization = Math.max(-5, Math.min(8, rawIonDepol));
  const rawSomaDepol = (somaPosIons * 0.5) - (somaNegIons * 0.4);
  const somaDepolarization = Math.max(-3, Math.min(5, rawSomaDepol));
  
  const restingV = -70;
  
  // Target DC voltage
  const targetHillockDC = restingV + ionDepolarization + baselineShift;
  const targetSomaDC = restingV + somaDepolarization + baselineShift * 0.4;
  
  // Fast decay toward target
  const decayStrength = 0.8 + Math.max(0, (hillockDC - restingV)) * 0.05;
  
  somaDC += (targetSomaDC - somaDC) * decayStrength * deltaTime * 5;
  hillockDC += (targetHillockDC - hillockDC) * decayStrength * deltaTime * 5;
  
  if (netExcitation < 0.05 && hillockIons.positive < 0.5) {
    hillockDC += (restingV - hillockDC) * 0.5 * deltaTime;
    somaDC += (restingV - somaDC) * 0.5 * deltaTime;
  }
  
  // Add oscillations
  somaVoltage = somaDC + rhythmicNoise * 0.5;
  hillockVoltage = hillockDC + rhythmicNoise;
  
  // Clamp
  somaVoltage = Math.max(-90, Math.min(-50, somaVoltage));
  hillockVoltage = Math.max(-90, Math.min(-50, hillockVoltage));
  
  // Update soma visual
  const somaDepol = somaVoltage + 70;
  const somaIntensity = Math.max(0.4, Math.min(2.5, somaDepol / 15));
  somaMaterial.emissiveIntensity = somaIntensity;
  
  if (somaVoltage > -55) {
    somaMaterial.emissive.setRGB(1.0, 0.5, 0.3);
    somaMaterial.color.setRGB(1.0, 0.7, 0.6);
  } else if (somaVoltage > -65) {
    const t = (somaVoltage + 65) / 10;
    somaMaterial.emissive.setRGB(0.6 * t + 0.2, 0.4, 0.5);
    somaMaterial.color.setRGB(0.5 + 0.3 * t, 0.6, 0.8);
  } else if (somaVoltage < -75) {
    somaMaterial.emissive.setRGB(0.2, 0.4, 0.3);
    somaMaterial.color.setRGB(0.4, 0.7, 0.6);
  } else {
    somaMaterial.emissive.setRGB(0.1, 0.4, 0.6);
    somaMaterial.color.setRGB(0.47, 0.69, 1.0);
  }
  
  // Update hillock visual
  const visualVoltage = hillockDC;
  const hillockDepol = visualVoltage + 70;
  const hillockIntensity = Math.max(0.15, Math.min(3.0, hillockDepol / 12));
  hillockMaterial.emissiveIntensity = hillockIntensity;
  
  if (visualVoltage > -55) {
    const t = Math.min(1, (visualVoltage + 55) / 15);
    hillockMaterial.emissive.setRGB(0.7 + t * 0.3, 0.8 + t * 0.2, 1.0);
    hillockMaterial.color.setRGB(0.8 + t * 0.2, 0.9 + t * 0.1, 1.0);
    hillockMaterial.opacity = 0.45 + t * 0.25;
  } else if (visualVoltage > -62) {
    const t = (visualVoltage + 62) / 7;
    hillockMaterial.emissive.setRGB(0.2 + t * 0.3, 0.3 + t * 0.3, 0.5 + t * 0.3);
    hillockMaterial.color.setRGB(0.35 + t * 0.25, 0.5 + t * 0.2, 0.75 + t * 0.15);
    hillockMaterial.opacity = 0.3 + t * 0.1;
  } else if (visualVoltage < -75) {
    hillockMaterial.emissive.setRGB(0.1, 0.15, 0.25);
    hillockMaterial.color.setRGB(0.3, 0.4, 0.6);
    hillockMaterial.opacity = 0.25;
  } else {
    hillockMaterial.emissive.setRGB(0.1, 0.2, 0.35);
    hillockMaterial.color.setRGB(0.35, 0.55, 0.85);
    hillockMaterial.opacity = 0.28;
  }
  
  return { somaVoltage, hillockVoltage };
}

/**
 * Update vesicles and neurotransmitter particles
 */
export function updateVesicles(deltaTime) {
  // Update vesicles
  for (let i = vesicles.length - 1; i >= 0; i--) {
    const v = vesicles[i];
    v.progress += deltaTime * 3;
    v.lifetime += deltaTime;
    
    v.mesh.position.add(v.direction.clone().multiplyScalar(deltaTime * 2));
    
    if (v.progress > 0.5 && !v.released) {
      v.released = true;
      const ntMat = new THREE.MeshPhongMaterial({
        color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.9
      });
      
      for (let j = 0; j < 30; j++) {
        const microNT = new THREE.Mesh(microNTGeo, ntMat.clone());
        microNT.position.copy(v.mesh.position);
        scene.add(microNT);
        
        microNTs.push({
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
    
    v.mesh.material.opacity = Math.max(0, 0.9 - v.lifetime * 0.5);
    
    if (v.lifetime > 2) {
      scene.remove(v.mesh);
      vesicles.splice(i, 1);
    }
  }
  
  // Update micro-NTs
  for (let i = microNTs.length - 1; i >= 0; i--) {
    const nt = microNTs[i];
    nt.lifetime += deltaTime;
    nt.mesh.position.add(nt.velocity.clone().multiplyScalar(deltaTime));
    nt.velocity.y -= deltaTime * 0.5;
    nt.mesh.material.opacity = Math.max(0, 0.9 - nt.lifetime * 0.4);
    
    if (nt.lifetime > 2.5) {
      scene.remove(nt.mesh);
      microNTs.splice(i, 1);
    }
  }
  
  // Update Ca2+ influx ions
  for (let i = caInfluxIons.length - 1; i >= 0; i--) {
    const ca = caInfluxIons[i];
    ca.lifetime += deltaTime;
    
    const toTarget = ca.target.clone().sub(ca.mesh.position);
    const dist = toTarget.length();
    
    if (dist > 0.3) {
      const moveSpeed = ca.speed * (1 + ca.lifetime * 2);
      ca.mesh.position.add(toTarget.normalize().multiplyScalar(deltaTime * moveSpeed));
      ca.mesh.material.emissiveIntensity = 1.2 + Math.sin(ca.lifetime * 20) * 0.3;
    } else {
      ca.mesh.material.opacity = Math.max(0, ca.mesh.material.opacity - deltaTime * 3);
    }
    
    if (ca.lifetime > ca.fadeStart) {
      ca.mesh.material.opacity = Math.max(0, ca.mesh.material.opacity - deltaTime * 2);
    }
    
    if (ca.lifetime > 2 || ca.mesh.material.opacity <= 0) {
      scene.remove(ca.mesh);
      caInfluxIons.splice(i, 1);
    }
  }
}
