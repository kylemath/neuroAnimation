/**
 * main.js - Main entry point for Molecular Membrane Visualization
 * 
 * Orchestrates all modules and runs the animation loop.
 * Models a ~200nm × 200nm patch of axon hillock membrane at molecular scale.
 * 
 * Features full Hodgkin-Huxley biophysics with:
 * - Nernst/GHK equations
 * - Compartmental model (soma → hillock → axon)
 * - EPSP/IPSP synaptic inputs
 * - Local circuit current propagation
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// Import configuration and state
import {
  animationState, scene, camera, container,
  defaultCameraPos, raycaster, mouse,
  membraneGroup, ionGroup, channelGroup,
  SCALE, AP_TIMING,
  getPhaseLabel
} from './config.js';

// Import scene setup
import { initScene, renderScene, updateCamera, renderer } from './scene.js';

// Import membrane creation
import { createMembrane, updateMembrane, getLipidCount, setShowLipidTails, setShowWater } from './membrane.js';

// Import channel management
import { createAllChannels, updateChannels, getChannelCounts, getChannelAtPosition, toggleChannelState } from './channels.js';

// Import ion management
import { createIons, updateIons, getIonCount, getATPCount } from './ions.js';

// Import UI controls
import { setupControls, updateUI, syncVoltageSlider } from './controls.js';

// Import electrophysiology (HH model)
import {
  updateElectrophysiology,
  compartments,
  equilibriumPotentials,
  triggerEPSP,
  triggerIPSP,
  setEIBalance,
  setSpontaneousRate,
  setRecordingMode,
  resetElectrophysiology,
  getElectrophysiologyState,
  synapticState,
  recordingState,
} from './electrophysiology.js';

// Import graphs
import { initGraphs, updateGraphs } from './graphs.js';

// Import recording visualization
import { 
  initRecordingVisualization, 
  updateRecordingSetup, 
  updateRecordingVisualization 
} from './recording.js';

// ============================================================================
// STATE VARIABLES
// ============================================================================

let lastTime = performance.now();
let frameCount = 0;
let fpsUpdateTime = 0;
let currentFPS = 60;

// Camera control state
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraDistance = defaultCameraPos.distance;
let cameraAngleX = defaultCameraPos.angleX;
let cameraAngleY = defaultCameraPos.angleY;

// Action potential state
let apInProgress = false;
let apStartTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  console.log('Initializing Molecular Membrane Visualization with HH Biophysics...');
  
  // Initialize Three.js scene
  initScene();
  
  // Create the membrane lipid bilayer
  console.log('Creating lipid bilayer...');
  createMembrane();
  
  // Create channels and pumps
  console.log('Creating ion channels and pumps...');
  createAllChannels();
  
  // Create ions
  console.log('Creating ions...');
  createIons();
  
  // Initialize graphs
  console.log('Initializing oscilloscope graphs...');
  initGraphs();
  
  // Initialize recording visualization
  console.log('Initializing recording apparatus...');
  initRecordingVisualization();
  
  // Setup UI controls
  setupControls({
    onStart: startAnimation,
    onPause: pauseAnimation,
    onReset: resetSimulation,
    onFlip: flipMembrane,
    onResetCamera: resetCamera,
    onTriggerAP: triggerActionPotential,
    onHyperpolarize: hyperpolarize,
    onVoltageChange: setVoltage,
    onLipidTailsToggle: setShowLipidTails,
    onWaterToggle: setShowWater,
    onEPSP: () => triggerEPSP(),
    onIPSP: () => triggerIPSP(),
    onEIBalanceChange: setEIBalance,
    onEPSPRateChange: (rate) => synapticState.epspRate = rate,
    onIPSPRateChange: (rate) => synapticState.ipspRate = rate,
    onRecordingModeChange: setRecordingMode,
    onHHModelToggle: (enabled) => animationState.useHHModel = enabled,
  });
  
  // Setup mouse interactions
  setupMouseInteractions();
  
  // Setup additional electrophysiology controls
  setupElectrophysiologyControls();
  
  // Start animation loop
  console.log('Starting animation...');
  animate();
}

/**
 * Setup electrophysiology-specific controls
 */
function setupElectrophysiologyControls() {
  // EPSP button
  const btnEPSP = document.getElementById('btn-epsp');
  if (btnEPSP) {
    btnEPSP.addEventListener('click', () => {
      if (animationState.useHHModel) {
        triggerEPSP();  // Uses HH synaptic conductance
      } else {
        // Direct voltage injection in legacy mode
        animationState.targetVoltage = Math.min(animationState.targetVoltage + 15, -40);
        console.log('EPSP: voltage target ->', animationState.targetVoltage);
      }
    });
  }
  
  // IPSP button
  const btnIPSP = document.getElementById('btn-ipsp');
  if (btnIPSP) {
    btnIPSP.addEventListener('click', () => {
      if (animationState.useHHModel) {
        triggerIPSP();  // Uses HH synaptic conductance
      } else {
        // Direct voltage injection in legacy mode
        animationState.targetVoltage = Math.max(animationState.targetVoltage - 10, -90);
        console.log('IPSP: voltage target ->', animationState.targetVoltage);
      }
    });
  }
  
  // E/I Balance
  const eiBalanceSlider = document.getElementById('ei-balance-slider');
  const eiBalanceVal = document.getElementById('ei-balance-val');
  if (eiBalanceSlider) {
    eiBalanceSlider.addEventListener('input', (e) => {
      const balance = parseFloat(e.target.value);
      setEIBalance(balance);
      if (eiBalanceVal) {
        let label = 'balanced';
        if (balance > 1.5) label = 'excitable';
        else if (balance > 1.1) label = 'slightly excitable';
        else if (balance < 0.7) label = 'inhibited';
        else if (balance < 0.9) label = 'slightly inhibited';
        eiBalanceVal.textContent = balance.toFixed(1) + ' (' + label + ')';
      }
    });
  }
  
  // EPSP Rate
  const epspRateSlider = document.getElementById('epsp-rate-slider');
  const epspRateVal = document.getElementById('epsp-rate-val');
  if (epspRateSlider) {
    epspRateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      setSpontaneousRate(rate);
      if (epspRateVal) epspRateVal.textContent = rate + ' Hz';
    });
  }
  
  // IPSP Rate
  const ipspRateSlider = document.getElementById('ipsp-rate-slider');
  const ipspRateVal = document.getElementById('ipsp-rate-val');
  if (ipspRateSlider) {
    ipspRateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      synapticState.ipspRate = rate;
      if (ipspRateVal) ipspRateVal.textContent = rate + ' Hz';
    });
  }
  
  // Recording Mode
  const recordingModeSelect = document.getElementById('recording-mode-select');
  const recordingInfo = document.getElementById('recording-info');
  
  const recordingDescriptions = {
    'intracellular': 'Sharp electrode pierces membrane to record intracellular voltage directly. Shows true membrane potential.',
    'patch_clamp': 'Glass pipette forms gigaohm seal on membrane. Whole-cell mode accesses cell interior for voltage or current clamp.',
    'extracellular': 'Metal electrode outside cell detects voltage changes. Sees derivative of action potential (different shape).',
    'field': 'Large electrode samples summed activity of many cells. Shows population-level oscillations and rhythms.',
  };
  
  if (recordingModeSelect) {
    recordingModeSelect.addEventListener('change', (e) => {
      setRecordingMode(e.target.value);
      // Update the 3D recording visualization
      updateRecordingSetup(e.target.value);
      // Update description
      if (recordingInfo) {
        recordingInfo.textContent = recordingDescriptions[e.target.value];
      }
    });
  }
  
  // HH Model toggle
  const hhModelToggle = document.getElementById('hh-model-toggle');
  if (hhModelToggle) {
    hhModelToggle.addEventListener('change', (e) => {
      animationState.useHHModel = e.target.checked;
    });
  }
}

// ============================================================================
// CONTROL CALLBACKS
// ============================================================================

function startAnimation() {
  animationState.running = true;
}

function pauseAnimation() {
  animationState.running = false;
}

function resetSimulation() {
  animationState.time = 0;
  animationState.simTime = 0;
  animationState.voltage = -70;
  animationState.targetVoltage = -70;
  animationState.apPhase = 'resting';
  apInProgress = false;
  
  // Reset electrophysiology model
  resetElectrophysiology();
  
  // Reset camera
  resetCamera();
  
  // Sync UI
  syncVoltageSlider(-70);
}

function flipMembrane(isFlipped) {
  // Animate the flip
  animationState.isFlipped = isFlipped;
}

function resetCamera() {
  cameraDistance = defaultCameraPos.distance;
  cameraAngleX = defaultCameraPos.angleX;
  cameraAngleY = defaultCameraPos.angleY;
  animationState.isFlipped = false;
}

function triggerActionPotential() {
  if (animationState.useHHModel) {
    // With HH model: inject a large depolarizing current to reliably trigger AP
    // This simulates a strong synaptic input or current injection
    triggerEPSP(20);  // Large EPSP to ensure threshold crossing
    console.log('Action potential triggered via large EPSP injection!');
  } else {
    // Legacy mode: use the canned AP waveform
    if (apInProgress) return;
    
    apInProgress = true;
    apStartTime = animationState.simTime;
    animationState.apPhase = 'depolarizing';
    animationState.apStartTime = apStartTime;
    
    console.log('Action potential triggered (legacy mode)!');
  }
}

function hyperpolarize() {
  animationState.targetVoltage = -85;
  animationState.apPhase = 'hyperpolarizing';
}

function setVoltage(voltage) {
  if (!apInProgress) {
    animationState.targetVoltage = voltage;
    animationState.voltage = voltage;
  }
}

// ============================================================================
// MOUSE INTERACTIONS
// ============================================================================

function setupMouseInteractions() {
  const canvas = renderer.domElement;
  
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('wheel', onWheel);
  canvas.addEventListener('click', onClick);
  
  // Touch support
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
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
  
  cameraAngleX += deltaX * 0.008;
  cameraAngleY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraAngleY + deltaY * 0.008));
  
  previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(event) {
  event.preventDefault();
  cameraDistance = Math.max(30, Math.min(300, cameraDistance + event.deltaY * 0.08));
}

function onClick(event) {
  // Raycast to detect channel clicks
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(channelGroup.children, true);
  
  if (intersects.length > 0) {
    const channelInfo = getChannelAtPosition(intersects);
    if (channelInfo) {
      toggleChannelState(channelInfo);
      console.log('Toggled channel:', channelInfo.type);
    }
  }
}

function onTouchStart(event) {
  if (event.touches.length === 1) {
    event.preventDefault();
    isDragging = true;
    previousMousePosition = { 
      x: event.touches[0].clientX, 
      y: event.touches[0].clientY 
    };
  }
}

function onTouchMove(event) {
  if (!isDragging || event.touches.length !== 1) return;
  event.preventDefault();
  
  const deltaX = event.touches[0].clientX - previousMousePosition.x;
  const deltaY = event.touches[0].clientY - previousMousePosition.y;
  
  cameraAngleX += deltaX * 0.008;
  cameraAngleY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraAngleY + deltaY * 0.008));
  
  previousMousePosition = { 
    x: event.touches[0].clientX, 
    y: event.touches[0].clientY 
  };
}

function onTouchEnd() {
  isDragging = false;
}

// ============================================================================
// ACTION POTENTIAL SIMULATION
// ============================================================================

function updateActionPotential(deltaTime) {
  if (!apInProgress) {
    // Normal voltage change toward target - faster response
    const diff = animationState.targetVoltage - animationState.voltage;
    animationState.voltage += diff * Math.min(deltaTime * 0.5, 0.3); // Faster but capped
    
    // Check if we crossed threshold - auto-trigger AP
    if (animationState.voltage > animationState.navThreshold && !apInProgress) {
      apInProgress = true;
      apStartTime = animationState.simTime;
      animationState.apPhase = 'depolarizing';
      console.log('Threshold crossed! AP auto-triggered.');
    }
    return;
  }
  
  const elapsed = animationState.simTime - apStartTime;
  
  // Action potential waveform
  if (elapsed < AP_TIMING.riseDuration) {
    // Depolarization - rapid rise
    const progress = elapsed / AP_TIMING.riseDuration;
    const targetV = -55 + (AP_TIMING.peakVoltage + 55) * easeOutQuad(progress);
    animationState.voltage = targetV;
    animationState.apPhase = 'depolarizing';
    
  } else if (elapsed < AP_TIMING.riseDuration + 0.2) {
    // Peak
    animationState.voltage = AP_TIMING.peakVoltage;
    animationState.apPhase = 'peak';
    
  } else if (elapsed < AP_TIMING.riseDuration + 0.2 + AP_TIMING.fallDuration) {
    // Repolarization
    const fallElapsed = elapsed - AP_TIMING.riseDuration - 0.2;
    const progress = fallElapsed / AP_TIMING.fallDuration;
    const targetV = AP_TIMING.peakVoltage + (AP_TIMING.undershootVoltage - AP_TIMING.peakVoltage) * easeInQuad(progress);
    animationState.voltage = targetV;
    animationState.apPhase = 'repolarizing';
    
  } else if (elapsed < AP_TIMING.riseDuration + 0.2 + AP_TIMING.fallDuration + AP_TIMING.recoveryDuration) {
    // Recovery from undershoot
    const recoveryElapsed = elapsed - AP_TIMING.riseDuration - 0.2 - AP_TIMING.fallDuration;
    const progress = recoveryElapsed / AP_TIMING.recoveryDuration;
    const targetV = AP_TIMING.undershootVoltage + (-70 - AP_TIMING.undershootVoltage) * easeOutQuad(progress);
    animationState.voltage = targetV;
    animationState.apPhase = 'hyperpolarizing';
    
  } else {
    // Return to resting
    animationState.voltage = -70;
    animationState.apPhase = 'resting';
    apInProgress = false;
    
    // Check if we should trigger another AP (for demo purposes with threshold)
    if (animationState.targetVoltage > animationState.navThreshold) {
      // Don't auto-trigger, let user control
    }
  }
  
  // Refractory period tracking
  if (elapsed < AP_TIMING.absoluteRefractory) {
    animationState.apPhase = animationState.apPhase + ' (absolute refractory)';
  } else if (elapsed < AP_TIMING.relativeRefractory) {
    animationState.apPhase = animationState.apPhase + ' (relative refractory)';
  }
}

// Easing functions
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t) {
  return t * t;
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

function animate() {
  requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  let deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  // Cap delta time
  deltaTime = Math.min(deltaTime, 0.05);
  
  // Apply speed multiplier
  const scaledDelta = deltaTime * animationState.speed;
  
  // Convert to milliseconds for HH model (uses ms timescale)
  const scaledDeltaMs = scaledDelta * 1000;
  
  if (animationState.running) {
    // Update time
    animationState.time += scaledDelta;
    animationState.simTime += scaledDeltaMs;  // simTime in ms
    
    // Update electrophysiology (HH model) - this drives voltage
    if (animationState.useHHModel) {
      updateElectrophysiology(scaledDeltaMs);
    } else {
      // Legacy action potential simulation
      updateActionPotential(scaledDeltaMs);
    }
    
    // Update membrane (Brownian motion, flexibility)
    updateMembrane(scaledDelta);
    
    // Update channels (state transitions based on voltage)
    updateChannels(scaledDelta);
    
    // Update ions (Brownian motion, channel transit)
    updateIons(scaledDelta);
    
    // Update graphs
    updateGraphs();
    
    // Update recording visualization
    updateRecordingVisualization(scaledDelta);
  }
  
  // Update camera position (always, even when paused)
  updateCamera(cameraDistance, cameraAngleX, cameraAngleY, animationState.isFlipped);
  
  // Render
  renderScene();
  
  // Update UI
  updateUIState();
  
  // FPS calculation
  frameCount++;
  if (currentTime - fpsUpdateTime >= 1000) {
    currentFPS = frameCount;
    frameCount = 0;
    fpsUpdateTime = currentTime;
  }
}

/**
 * Update UI with current state
 */
function updateUIState() {
  const channelCounts = getChannelCounts();
  const physState = getElectrophysiologyState();
  
  updateUI({
    voltage: animationState.voltage,
    phaseLabel: getPhaseLabel(animationState.voltage, animationState.apPhase),
    navOpen: channelCounts.navOpen,
    navTotal: channelCounts.navTotal,
    kvOpen: channelCounts.kvOpen,
    kvTotal: channelCounts.kvTotal,
    pumpsActive: channelCounts.pumpsActive,
    pumpsTotal: channelCounts.pumpsTotal,
    atpCount: getATPCount(),
    fps: currentFPS,
    lipidCount: getLipidCount(),
    ionCount: getIonCount(),
    simTime: animationState.simTime / 1000,  // Convert to seconds for display
    firingRate: physState.firingRate,
    spikeCount: physState.spikeCount,
  });
  
  // Update equilibrium potential displays
  const eNaEl = document.getElementById('e-na');
  const eKEl = document.getElementById('e-k');
  if (eNaEl) eNaEl.textContent = '+' + Math.round(equilibriumPotentials.E_Na);
  if (eKEl) eKEl.textContent = Math.round(equilibriumPotentials.E_K);
}

// ============================================================================
// START
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
