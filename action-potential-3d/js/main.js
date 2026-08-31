/**
 * main.js - Main entry point for the 3D Action Potential Visualization
 * 
 * This module orchestrates the entire neuron simulation by importing
 * and coordinating all sub-modules.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// Import configuration and state (ALL from config.js in one block)
import {
  animationState, scene, camera, container,
  defaultCameraPos,
  neuronGroup, myelinatedNeuronGroup,
  SOMA_POS, SOMA_RADIUS, AXON_LENGTH, AXON_RADIUS, HILLOCK_LENGTH,
  THRESHOLD, MYELIN_NEURON_OFFSET, SALTATORY_SPEED_MULTIPLIER,
  raycaster, mouse,
  ION_CONC,
  hillockIons, myelHillockIons,
  apTimingData,
  ionOpacity,
  dendriteData, myelDendriteData,
  // Axon position markers
  AXON_START, AXON_END, AXON_END_POS,
  // Arrays for unmyelinated neuron
  vesicles, microNTs, caInfluxIons, terminals, ions, synapticInputs,
  // Arrays for myelinated neuron
  myelIons, myelVesicles, myelMicroNTs, myelCaInfluxIons, myelSynapticInputs
} from './config.js';

// Import biophysics calculations
import { calculateGHKVoltage, calculateNernst } from './biophysics.js';

// Import scene setup
import { initScene, updateCamera, renderScene, renderer, electrodeGroup, scaleBarGroup } from './scene.js';

// Import neuron creation and updates (unmyelinated)
import {
  createUnmyelinatedNeuron,
  getAxonVoltage, getRefractoryState, getPhaseLabel,
  updateVoltageField, generateChannels, updateChannels, updateTerminals,
  voltageSegments, soma, hillock, axon, getAxonPathPoint,
  createSynapticInput, releaseNeurotransmitter,
  somaMaterial, hillockMaterial
} from './neuron-unmyelinated.js';

// Import neuron creation and updates (myelinated)
import {
  createMyelinatedNeuron,
  getMyelinatedAxonVoltage, getMyelRefractoryState,
  updateMyelVoltageField, updateMyelNodeChannels, updateMyelTerminals,
  updateMyelIons, updateMyelVesicles,
  myelSoma, myelHillock, myelAxon, getMyelAxonPathPoint,
  createMyelSynapticInput, releaseMyelNeurotransmitter,
  initialSegmentX
} from './neuron-myelinated.js';

// Import ion management
import {
  createAmbientIons, updateAmbientIons,
  createIon, updateIons,
  naMaterial, kMaterial, clMaterial, caMaterial
} from './ions.js';

// Import synaptic update functions
import {
  updateSynapticInputs, updateMyelSynapticInputs, updateVesicles, integrateSoma,
  somaVoltage as synapticSomaVoltage, hillockVoltage as synapticHillockVoltage
} from './synaptic.js';

// Import graph drawing
import {
  drawAPGraph, drawHillockGraph, drawTimingGraph, drawSpeedComparisonGraph,
  resetGraphs, setMyelHillockVoltage
} from './graphs.js';

// Import UI controls
import { setupControls } from './controls.js';

// ============================================================================
// STATE VARIABLES
// ============================================================================

// These track the exported soma/hillock voltages from synaptic.js
let currentSomaVoltage = -70;
let currentHillockVoltage = -70;
let myelSomaVoltage = -70;
let myelHillockVoltage = -70;

let lastTime = performance.now();
let frameCount = 0;
let fpsUpdateTime = 0;

// Mouse interaction state
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let currentCameraDistance = 70;
let currentCameraAngleX = 0;
let currentCameraAngleY = 0.3;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  // Initialize Three.js scene
  initScene();
  
  // Set initial camera position
  currentCameraDistance = defaultCameraPos.distance;
  currentCameraAngleX = defaultCameraPos.angleX;
  currentCameraAngleY = defaultCameraPos.angleY;
  
  // Create neurons
  createUnmyelinatedNeuron();
  createMyelinatedNeuron();
  
  // Generate ion channels
  generateChannels();
  
  // Create ambient ions
  createAmbientIons();
  
  // Setup UI controls
  setupControls({
    onStart: startAnimation,
    onStop: stopAnimation,
    onReset: resetSimulation,
    onResetCamera: resetCamera,
    onExcite: triggerEPSP,
    onInhibit: triggerIPSP,
    onMyelinToggle: toggleMyelinatedNeuron,
    onSpeedChange: updateSpeed,
    onLoopChange: updateLoop,
    onExtracellularToggle: toggleExtracellularIons,
    onIonOpacityChange: updateIonOpacity,
    onChannelDensityChange: updateChannelDensity,
    onPropSpeedChange: updatePropSpeed,
    onEpspRateChange: updateEpspRate,
    onIpspRateChange: updateIpspRate
  });
  
  // Setup mouse interactions
  setupMouseInteractions();
  
  // Hide myelinated neuron initially
  myelinatedNeuronGroup.visible = false;
  
  // Start animation loop
  animate();
}

// ============================================================================
// CONTROL CALLBACKS
// ============================================================================

function startAnimation() {
  animationState.running = true;
  document.getElementById('btn-start').classList.add('active');
  document.getElementById('btn-stop').classList.remove('active');
}

function stopAnimation() {
  animationState.running = false;
  document.getElementById('btn-start').classList.remove('active');
  document.getElementById('btn-stop').classList.add('active');
}

function resetSimulation() {
  animationState.time = 0;
  animationState.apTriggered = false;
  animationState.apStartTime = -1;
  
  // Reset myelinated state
  window.myelAPTriggered = false;
  window.myelAPStartTime = -1;
  window.myelLastSyncedAPTime = -1;
  
  // Reset voltages
  currentSomaVoltage = -70;
  currentHillockVoltage = -70;
  myelSomaVoltage = -70;
  myelHillockVoltage = -70;
  
  // Reset ion concentrations
  hillockIons.positive = 0;
  hillockIons.negative = 0;
  myelHillockIons.positive = 0;
  myelHillockIons.negative = 0;
  
  // Reset graph histories
  resetGraphs();
  window.apGraphStartTime = -1;
  
  // Reset dendrite voltages
  dendriteData.forEach(dd => {
    dd.voltage = -70;
    dd.epspActive = false;
    dd.ipspActive = false;
  });
  myelDendriteData.forEach(dd => {
    dd.voltage = -70;
    dd.epspActive = false;
    dd.ipspActive = false;
  });
  
  // Clear ions
  clearAllIons();
}

function resetCamera() {
  currentCameraDistance = defaultCameraPos.distance;
  currentCameraAngleX = defaultCameraPos.angleX;
  currentCameraAngleY = defaultCameraPos.angleY;
}

function triggerEPSP() {
  const dendriteIdx = Math.floor(Math.random() * dendriteData.length);
  createSynapticInput(dendriteIdx, true);
  
  if (animationState.showMyelinatedNeuron && myelDendriteData.length > 0) {
    const myelIdx = Math.min(dendriteIdx, myelDendriteData.length - 1);
    createMyelSynapticInput(myelIdx, true);
  }
}

function triggerIPSP() {
  const dendriteIdx = Math.floor(Math.random() * dendriteData.length);
  createSynapticInput(dendriteIdx, false);
  
  if (animationState.showMyelinatedNeuron && myelDendriteData.length > 0) {
    const myelIdx = Math.min(dendriteIdx, myelDendriteData.length - 1);
    createMyelSynapticInput(myelIdx, false);
  }
}

function toggleMyelinatedNeuron(show) {
  animationState.showMyelinatedNeuron = show;
  myelinatedNeuronGroup.visible = show;
  
  document.getElementById('comparison-panel').style.display = show ? 'block' : 'none';
  document.getElementById('hillock-legend').style.display = show ? 'block' : 'none';
  document.getElementById('timing-graph-container').style.display = show ? 'block' : 'none';
  
  if (show && currentCameraAngleY < 0.5) {
    currentCameraAngleY = 0.5;
  }
}

function updateSpeed(value) {
  animationState.speed = parseFloat(value);
  document.getElementById('speed-val').textContent = value + 'x';
}

function updateLoop(checked) {
  animationState.loop = checked;
}

function toggleExtracellularIons(show) {
  animationState.showExtracellularIons = show;
}

function updateIonOpacity(ion, value) {
  ionOpacity[ion] = value / 100;
  document.getElementById(ion.toLowerCase() + '-opacity-val').textContent = value + '%';
}

function updateChannelDensity(type, value) {
  if (type === 'Na') {
    animationState.naDensity = parseInt(value);
    document.getElementById('na-density-val').textContent = value;
  } else {
    animationState.kDensity = parseInt(value);
    document.getElementById('k-density-val').textContent = value;
  }
  generateChannels();
}

function updatePropSpeed(value) {
  animationState.propSpeed = parseInt(value);
  document.getElementById('prop-speed-val').textContent = value;
  updateTransitTimeDisplay();
}

function updateEpspRate(value) {
  animationState.epspRate = parseInt(value);
  document.getElementById('epsp-rate-val').textContent = value + '%';
}

function updateIpspRate(value) {
  animationState.ipspRate = parseInt(value);
  document.getElementById('ipsp-rate-val').textContent = value + '%';
}

function updateTransitTimeDisplay() {
  const baseSpeed = 50 * (animationState.propSpeed / 100);
  const unmyelTransit = (AXON_LENGTH / baseSpeed) * 1000;
  const myelTransit = unmyelTransit / SALTATORY_SPEED_MULTIPLIER;
  
  document.getElementById('unmyel-transit').textContent = unmyelTransit.toFixed(1) + 'ms';
  document.getElementById('myel-transit').textContent = myelTransit.toFixed(1) + 'ms';
}

// ============================================================================
// MOUSE INTERACTIONS
// ============================================================================

function setupMouseInteractions() {
  const canvas = renderer.domElement;
  
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel);
  canvas.addEventListener('click', onClick);
  
  // Touch support
  canvas.addEventListener('touchstart', onTouchStart);
  canvas.addEventListener('touchmove', onTouchMove);
  canvas.addEventListener('touchend', onTouchEnd);
}

function onMouseDown(event) {
  isDragging = true;
  previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseMove(event) {
  if (!isDragging) return;
  
  const deltaX = event.clientX - previousMousePosition.x;
  const deltaY = event.clientY - previousMousePosition.y;
  
  currentCameraAngleX += deltaX * 0.005;
  currentCameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, currentCameraAngleY + deltaY * 0.005));
  
  previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(event) {
  event.preventDefault();
  currentCameraDistance = Math.max(20, Math.min(200, currentCameraDistance + event.deltaY * 0.05));
}

function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(neuronGroup.children, true);
  
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.type === 'soma' || obj.userData.type === 'hillock' || 
        obj.userData.type === 'dendrite' || obj.userData.type === 'axon') {
      triggerActionPotential();
    }
  }
  
  // Check myelinated neuron too
  if (animationState.showMyelinatedNeuron) {
    const myelIntersects = raycaster.intersectObjects(myelinatedNeuronGroup.children, true);
    if (myelIntersects.length > 0) {
      const obj = myelIntersects[0].object;
      if (obj.userData.type === 'soma' || obj.userData.type === 'hillock' || 
          obj.userData.type === 'dendrite' || obj.userData.type === 'axon') {
        triggerActionPotential();
      }
    }
  }
}

function onTouchStart(event) {
  if (event.touches.length === 1) {
    isDragging = true;
    previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
}

function onTouchMove(event) {
  if (!isDragging || event.touches.length !== 1) return;
  event.preventDefault();
  
  const deltaX = event.touches[0].clientX - previousMousePosition.x;
  const deltaY = event.touches[0].clientY - previousMousePosition.y;
  
  currentCameraAngleX += deltaX * 0.005;
  currentCameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, currentCameraAngleY + deltaY * 0.005));
  
  previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}

function onTouchEnd() {
  isDragging = false;
}

// ============================================================================
// ACTION POTENTIAL TRIGGERING
// ============================================================================

function triggerActionPotential() {
  if (animationState.apTriggered && !animationState.loop) return;
  
  // Trigger unmyelinated AP
  animationState.apTriggered = true;
  animationState.apStartTime = animationState.time;
  window.apGraphStartTime = animationState.time;
  // Note: AP graph state is managed internally by graphs.js with rolling buffer
  
  // Record timing
  apTimingData.unmyelinated.apStartTimes.push(animationState.time);
  
  // Trigger myelinated AP in sync
  if (animationState.showMyelinatedNeuron) {
    window.myelAPTriggered = true;
    window.myelAPStartTime = animationState.time;
    window.myelLastSyncedAPTime = animationState.time;
    apTimingData.myelinated.apStartTimes.push(animationState.time);
  }
}

function clearAllIons() {
  // Clear unmyelinated ions
  ions.forEach(ion => scene.remove(ion.mesh));
  ions.length = 0;
  
  vesicles.forEach(v => scene.remove(v.mesh));
  vesicles.length = 0;
  
  microNTs.forEach(nt => scene.remove(nt.mesh));
  microNTs.length = 0;
  
  caInfluxIons.forEach(ion => scene.remove(ion.mesh));
  caInfluxIons.length = 0;
  
  synapticInputs.forEach(si => neuronGroup.remove(si.mesh));
  synapticInputs.length = 0;
  
  // Clear myelinated ions
  myelIons.forEach(ion => myelinatedNeuronGroup.remove(ion.mesh));
  myelIons.length = 0;
  
  myelVesicles.forEach(v => myelinatedNeuronGroup.remove(v.mesh));
  myelVesicles.length = 0;
  
  myelMicroNTs.forEach(nt => myelinatedNeuronGroup.remove(nt.mesh));
  myelMicroNTs.length = 0;
  
  myelCaInfluxIons.forEach(ion => myelinatedNeuronGroup.remove(ion.mesh));
  myelCaInfluxIons.length = 0;
  
  myelSynapticInputs.forEach(si => myelinatedNeuronGroup.remove(si.mesh));
  myelSynapticInputs.length = 0;
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

function updateVoltages(deltaTime) {
  // Use the integrateSoma function from synaptic.js which handles:
  // - Ion counting in different regions
  // - DC voltage tracking with oscillations
  // - Dendrite voltage decay and visual updates
  // - Soma and hillock visual updates
  const voltages = integrateSoma(deltaTime, somaMaterial, hillockMaterial);
  currentSomaVoltage = voltages.somaVoltage;
  currentHillockVoltage = voltages.hillockVoltage;
  
  // Check for threshold crossing
  if (currentHillockVoltage >= THRESHOLD && !animationState.apTriggered) {
    // Stochastic threshold - probability increases as voltage approaches threshold
    const voltageAboveThreshold = currentHillockVoltage - THRESHOLD;
    let firingProbability = 0;
    
    if (voltageAboveThreshold > 0) {
      firingProbability = 1 - Math.exp(-voltageAboveThreshold * 0.5);
    } else if (voltageAboveThreshold > -3) {
      firingProbability = 0.05 * (1 + voltageAboveThreshold / 3);
    }
    
    if (Math.random() < firingProbability) {
      triggerActionPotential();
    }
  }
  
  // Update myelinated neuron voltages (mirrors unmyelinated)
  if (animationState.showMyelinatedNeuron) {
    myelSomaVoltage = currentSomaVoltage;
    myelHillockVoltage = currentHillockVoltage;
    
    // Set for graph drawing
    setMyelHillockVoltage(myelHillockVoltage);
    
    // Sync AP triggering
    if (animationState.apTriggered && !window.myelAPTriggered) {
      window.myelAPTriggered = true;
      window.myelAPStartTime = animationState.apStartTime;
      window.myelLastSyncedAPTime = animationState.apStartTime;
      apTimingData.myelinated.apStartTimes.push(animationState.apStartTime);
    }
  }
}

function updateDendrites(deltaTime) {
  dendriteData.forEach(dd => {
    const voltage = dd.voltage;
    const isActive = Math.abs(voltage + 70) > 5;
    
    if (dd.material) {
      if (voltage > -60) {
        const t = (voltage + 60) / 30;
        dd.material.emissive.setRGB(0.4 + t * 0.6, 0.2 + t * 0.3, 0.2);
        dd.material.emissiveIntensity = 0.3 + t * 0.7;
      } else if (voltage < -75) {
        const t = Math.min(1, (-75 - voltage) / 15);
        dd.material.emissive.setRGB(0.1, 0.1, 0.3 + t * 0.4);
        dd.material.emissiveIntensity = 0.2 + t * 0.5;
      } else {
        dd.material.emissive.setRGB(0.1, 0.2, 0.3);
        dd.material.emissiveIntensity = 0.2;
      }
    }
  });
  
  // Update myelinated dendrites similarly
  if (animationState.showMyelinatedNeuron) {
    myelDendriteData.forEach(dd => {
      const voltage = dd.voltage;
      
      if (dd.material) {
        if (voltage > -60) {
          const t = (voltage + 60) / 30;
          dd.material.emissive.setRGB(0.4 + t * 0.6, 0.2 + t * 0.3, 0.2);
          dd.material.emissiveIntensity = 0.3 + t * 0.7;
        } else if (voltage < -75) {
          const t = Math.min(1, (-75 - voltage) / 15);
          dd.material.emissive.setRGB(0.1, 0.1, 0.3 + t * 0.4);
          dd.material.emissiveIntensity = 0.2 + t * 0.5;
        } else {
          dd.material.emissive.setRGB(0.1, 0.2, 0.3);
          dd.material.emissiveIntensity = 0.2;
        }
      }
    });
  }
}

function updateSpontaneousActivity(deltaTime) {
  // Spontaneous EPSPs
  if (Math.random() < animationState.epspRate / 100 * deltaTime * 2) {
    const idx = Math.floor(Math.random() * dendriteData.length);
    createSynapticInput(idx, true);
    
    if (animationState.showMyelinatedNeuron && myelDendriteData.length > 0) {
      const myelIdx = Math.min(idx, myelDendriteData.length - 1);
      createMyelSynapticInput(myelIdx, true);
    }
  }
  
  // Spontaneous IPSPs
  if (Math.random() < animationState.ipspRate / 100 * deltaTime * 1.5) {
    const idx = Math.floor(Math.random() * dendriteData.length);
    createSynapticInput(idx, false);
    
    if (animationState.showMyelinatedNeuron && myelDendriteData.length > 0) {
      const myelIdx = Math.min(idx, myelDendriteData.length - 1);
      createMyelSynapticInput(myelIdx, false);
    }
  }
}

function checkAPCompletion() {
  if (!animationState.apTriggered) return;
  
  const waveSpeed = 50 * (animationState.propSpeed / 100);
  const wavePos = (animationState.time - animationState.apStartTime) * waveSpeed;
  
  // Check if wave has passed the end of the axon
  if (wavePos > AXON_LENGTH + 30) {
    if (animationState.loop) {
      // Reset for next AP
      animationState.apTriggered = false;
      animationState.apStartTime = -1;
      window.myelAPTriggered = false;
      window.myelAPStartTime = -1;
    }
  }
}

function updateUI() {
  // Electrode voltage (at fixed position along axon)
  const electrodePos = electrodeGroup.position.x;
  const electrodeVoltage = getAxonVoltage(electrodePos, animationState.time);
  const refState = getRefractoryState(electrodePos, animationState.time);
  
  document.getElementById('voltage-value').innerHTML = 
    electrodeVoltage.toFixed(0) + '<span style="font-size: 20px;">mV</span>';
  document.getElementById('phase-label').textContent = getPhaseLabel(electrodeVoltage, refState);
  
  // Update voltage indicator position
  const normalizedV = (electrodeVoltage + 90) / 130;
  const indicatorPos = Math.max(0, Math.min(100, normalizedV * 100));
  document.getElementById('voltage-indicator').style.left = indicatorPos + '%';
  
  // Refractory indicator
  const refEl = document.getElementById('refractory-indicator');
  if (refState === 1) {
    refEl.style.background = 'rgba(255, 100, 100, 0.3)';
    refEl.style.color = '#ff6b6b';
    refEl.textContent = '⚠️ Absolute Refractory';
  } else if (refState === 2) {
    refEl.style.background = 'rgba(255, 200, 100, 0.3)';
    refEl.style.color = '#ffb86b';
    refEl.textContent = '⚡ Relative Refractory';
  } else {
    refEl.style.background = 'rgba(81, 207, 102, 0.2)';
    refEl.style.color = '#51cf66';
    refEl.textContent = '✓ Ready to Fire';
  }
  
  // Pump indicator
  const pumpEl = document.getElementById('pump-indicator');
  if (refState === 1 || refState === 2) {
    pumpEl.style.background = 'rgba(81, 207, 102, 0.3)';
    pumpEl.style.color = '#51cf66';
    pumpEl.textContent = '🔄 Na⁺/K⁺-ATPase: ACTIVE';
  } else {
    pumpEl.style.background = 'rgba(255, 184, 107, 0.2)';
    pumpEl.style.color = '#ffb86b';
    pumpEl.textContent = '⚡ Na⁺/K⁺-ATPase: Standby';
  }
  
  // Stats
  document.getElementById('soma-voltage').textContent = currentSomaVoltage.toFixed(1);
  document.getElementById('hillock-voltage').textContent = currentHillockVoltage.toFixed(1);
  document.getElementById('hillock-na').textContent = ION_CONC.hillock.Na.toFixed(1);
  document.getElementById('hillock-pos-ions').textContent = hillockIons.positive.toFixed(0);
  document.getElementById('ion-count').textContent = ions.length + myelIons.length;
  
  // Wave position
  if (animationState.apTriggered) {
    const waveSpeed = 50 * (animationState.propSpeed / 100);
    const wavePos = (animationState.time - animationState.apStartTime) * waveSpeed;
    const wavePercent = Math.min(100, Math.max(0, (wavePos / AXON_LENGTH) * 100));
    document.getElementById('wave-pos').textContent = wavePercent.toFixed(0);
  } else {
    document.getElementById('wave-pos').textContent = '0';
  }
  
  // Timing comparison
  if (animationState.showMyelinatedNeuron) {
    const unmyelDelay = apTimingData.unmyelinated.avgDelay;
    const myelDelay = apTimingData.myelinated.avgDelay;
    
    document.getElementById('unmyel-delay').textContent = 
      unmyelDelay > 0 ? unmyelDelay.toFixed(1) + ' ms' : '-- ms';
    document.getElementById('myel-delay').textContent = 
      myelDelay > 0 ? myelDelay.toFixed(1) + ' ms' : '-- ms';
    
    if (unmyelDelay > 0 && myelDelay > 0) {
      const ratio = unmyelDelay / myelDelay;
      document.getElementById('speed-ratio').textContent = ratio.toFixed(1);
    }
  }
}

function updateGraphs() {
  // Get electrode voltage for AP waveform graph
  const electrodePos = electrodeGroup.position.x;
  const electrodeVoltage = getAxonVoltage(electrodePos, animationState.time);
  
  // Draw all graphs (they handle their own history internally)
  drawAPGraph(electrodeVoltage);
  drawHillockGraph();
  
  if (animationState.showMyelinatedNeuron) {
    drawTimingGraph();
    drawSpeedComparisonGraph();
  }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

function animate() {
  requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  let deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  // Cap delta time to prevent physics explosions
  deltaTime = Math.min(deltaTime, 0.05);
  
  // Apply animation speed
  const scaledDelta = deltaTime * animationState.speed;
  
  if (animationState.running) {
    animationState.time += scaledDelta;
    
    // Update all systems
    updateVoltages(scaledDelta);
    updateDendrites(scaledDelta);
    updateSpontaneousActivity(scaledDelta);
    
    // Update voltage visualizations
    updateVoltageField();
    updateChannels(scaledDelta);
    updateTerminals();
    
    // Update ions
    updateIons(scaledDelta);
    updateSynapticInputs(scaledDelta);
    updateVesicles(scaledDelta);
    
    // Always update ambient ions (visibility is handled internally)
    updateAmbientIons(scaledDelta);
    
    // Update myelinated neuron
    if (animationState.showMyelinatedNeuron) {
      updateMyelVoltageField();
      updateMyelNodeChannels();
      updateMyelTerminals();
      updateMyelIons(scaledDelta);
      updateMyelVesicles(scaledDelta);
      updateMyelSynapticInputs(scaledDelta);
    }
    
    // Check AP completion
    checkAPCompletion();
    
    // Update UI and graphs
    updateUI();
    updateGraphs();
  }
  
  // Update camera
  camera.position.x = Math.sin(currentCameraAngleX) * currentCameraDistance;
  camera.position.y = Math.sin(currentCameraAngleY) * currentCameraDistance * 0.5;
  camera.position.z = Math.cos(currentCameraAngleX) * currentCameraDistance;
  camera.lookAt(0, animationState.showMyelinatedNeuron ? MYELIN_NEURON_OFFSET / 2 : 0, 0);
  
  // Render
  renderScene();
  
  // FPS counter
  frameCount++;
  if (currentTime - fpsUpdateTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    fpsUpdateTime = currentTime;
  }
}

// ============================================================================
// START
// ============================================================================

// Make some state accessible globally for cross-module communication
window.myelAPTriggered = false;
window.myelAPStartTime = -1;
window.myelLastSyncedAPTime = -1;
window.apGraphStartTime = -1;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
