/**
 * main.js - Main entry point for 3D Synaptic Transmission Visualization
 * 
 * Orchestrates all modules:
 * - Scene setup and rendering
 * - Vesicle dynamics and SNARE machinery
 * - Neurotransmitter release and diffusion
 * - Receptor binding and activation
 * - Ion flux and postsynaptic potentials
 * - Endocannabinoid retrograde signaling
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// Import configuration and state
import {
  animationState, scene, camera, container,
  defaultCameraPos, raycaster, mouse,
  synapseGroup, presynapticGroup, postsynapticGroup,
  ntGroup,  // For eCB particle visuals
  SCALE, AP_PARAMS, ENDOCANNABINOID,
  getPrePhaseLabel, getPostPhaseLabel,
  getCaVOpenProbability, easeOutQuad, easeInQuad
} from './config.js';

// Import scene setup
import {
  initScene, renderScene, updateCamera, renderer,
  updatePresynapticVisual, updatePostsynapticVisual,
  setAstrocyteVisible, setStructureVisibility, updateCaChannelVisuals,
  setPresynapticVisible, setPostsynapticVisible, setMembraneOnlyMode,
  updateCB1Visuals
} from './scene.js';

// Import vesicle management
import { createVesicles, updateVesicles, getVesicleCounts, getSNAREState } from './vesicles.js';

// Import neurotransmitter management
import { updateNeurotransmitters, getCleftConcentrations, clearAllNTs } from './neurotransmitters.js';

// Import receptor management
import { createReceptors, updateReceptors, getReceptorPositions, getReceptorStates } from './receptors.js';

// Import ion management
import { createIons, updateIons, clearAllIons, setIonVisibility, getTotalIonCount } from './ions.js';

// Import UI controls
import { setupControls, updateUI } from './controls.js';

// Import graphs
import { initGraphs, drawGraphs, sampleGraphData, clearGraphs, resetGraphHistory } from './graphs.js';

// Import panel management (draggable/minimizable panels)
import { initPanels, resetPanelPositions } from './panels.js';

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

// AP simulation state
let apInProgress = false;
let apStartTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  console.log('Initializing Synaptic Transmission Visualization...');
  
  // Initialize Three.js scene
  initScene();
  
  // Initialize graphs
  initGraphs();
  
  // Create synaptic components
  console.log('Creating vesicles...');
  createVesicles();
  
  console.log('Creating receptors...');
  createReceptors();
  
  console.log('Creating ions...');
  createIons();
  
  // Setup UI controls
  setupControls({
    onStart: startAnimation,
    onPause: pauseAnimation,
    onReset: resetSimulation,
    onTriggerAP: triggerActionPotential,
    onTrainToggle: toggleAPTrain,
    onResetCamera: resetCamera,
    onFlipView: flipView,
    onIonFlowToggle: toggleIonFlow,
    onAstrocyteToggle: toggleAstrocyte,
    onAMPADensityChange: updateAMPADensity,
    onCB1Change: updateCB1,
    onNTTypeChange: updateNTType,
    onEndoToggle: toggleEndocannabinoid,
    onStructureVisibilityChange: setStructureVisibility,
    onPresynapticToggle: setPresynapticVisible,
    onPostsynapticToggle: setPostsynapticVisible,
    onMembraneOnlyToggle: setMembraneOnlyMode,
    onResetPanels: resetPanelPositions,
  });
  
  // Setup mouse interactions
  setupMouseInteractions();
  
  // Initialize draggable/minimizable panels
  initPanels();
  
  // Start animation loop
  console.log('Starting animation...');
  animate();
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
  // Reset time
  animationState.time = 0;
  animationState.simTime = 0;
  
  // Reset voltages
  animationState.preVoltage = -70;
  animationState.postVoltage = -70;
  animationState.preCaConc = 0.0001;
  animationState.postCaConc = 0.0001;
  
  // Reset AP state
  animationState.apActive = false;
  animationState.apStartTime = -1;
  animationState.apPhase = 'resting';
  animationState.trainMode = false;
  animationState.lastAPTime = -1000;
  apInProgress = false;
  
  // Reset PSP
  animationState.pspAmplitude = 0;
  animationState.epspActive = false;
  animationState.ipspActive = false;
  
  // Reset cleft
  animationState.cleftGlutamate = 0;
  animationState.cleftGaba = 0;
  
  // Reset receptor binding
  animationState.ampaBound = 0;
  animationState.nmdaBound = 0;
  animationState.gabaaBound = 0;
  animationState.mgBlock = 1.0;
  
  // Reset metabotropic
  animationState.mglurActive = false;
  animationState.gababActive = false;
  animationState.gProteinCascade = 0;
  
  // Reset endocannabinoid
  animationState.endoLevel = 0;
  animationState.cb1Activation = 0;
  animationState.retrogradeSignal = false;
  
  // Reset stats
  animationState.vesiclesReleased = 0;
  animationState.totalEpsps = 0;
  
  // Recreate components
  clearAllNTs();
  clearAllIons();
  createVesicles();
  createReceptors();
  createIons();
  
  // Reset graphs
  clearGraphs();
  
  // Reset camera
  resetCamera();
  
  // Restart
  animationState.running = true;
}

function resetCamera() {
  cameraDistance = defaultCameraPos.distance;
  cameraAngleX = defaultCameraPos.angleX;
  cameraAngleY = defaultCameraPos.angleY;
  animationState.isFlipped = false;
}

function flipView(isFlipped) {
  animationState.isFlipped = isFlipped;
}

function toggleIonFlow(show) {
  setIonVisibility(show);
}

function toggleAstrocyte(show) {
  setAstrocyteVisible(show);
}

function updateAMPADensity(value) {
  // Recreate receptors with new density
  createReceptors();
}

function updateCB1(value) {
  // CB1 activation affects release probability
  // This is handled in the vesicle release calculation
}

function updateNTType(type) {
  animationState.ntType = type;
}

function toggleEndocannabinoid(enabled) {
  animationState.endoSynthesis = enabled;
}

function toggleAPTrain(enabled) {
  animationState.trainMode = enabled;
}

// ============================================================================
// ACTION POTENTIAL SIMULATION
// ============================================================================

function triggerActionPotential() {
  if (apInProgress) {
    console.log('AP already in progress, ignoring trigger (apStartTime:', apStartTime.toFixed(2), 'elapsed:', (animationState.simTime - apStartTime).toFixed(2), 'ms)');
    return;
  }
  
  console.log('═══════════════════════════════════════════════');
  console.log('⚡ TRIGGERING ACTION POTENTIAL! ⚡');
  console.log('  Time:', animationState.simTime.toFixed(2), 'ms');
  console.log('  Pre-voltage BEFORE:', animationState.preVoltage.toFixed(1), 'mV');
  console.log('  AP_PARAMS.duration:', AP_PARAMS.duration, 'ms (visual)');
  console.log('  AP_PARAMS.riseDuration:', AP_PARAMS.riseDuration, 'ms');
  console.log('═══════════════════════════════════════════════');
  
  apInProgress = true;
  animationState.apActive = true;
  animationState.apStartTime = animationState.simTime;
  apStartTime = animationState.simTime;
  animationState.apPhase = 'depolarizing';
  animationState.lastAPTime = animationState.simTime;
  
  // Give an initial Ca2+ boost to help trigger vesicle release
  animationState.preCaConc = 0.001;  // Small initial boost
  
  // Start depolarization immediately
  animationState.preVoltage = -65;  // Initial depolarization kick
  console.log('  Pre-voltage AFTER initial kick:', animationState.preVoltage.toFixed(1), 'mV');
  
  // Ensure animation is running to see the effect
  if (!animationState.running) {
    console.log('🎬 Starting animation to show AP effect');
    animationState.running = true;
    
    // Update button states
    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    if (btnStart) btnStart.classList.add('active');
    if (btnPause) btnPause.classList.remove('active');
  }
}

function updateActionPotential(deltaTime) {
  // Handle AP train mode - use larger interval for visual timing
  if (animationState.trainMode && !apInProgress) {
    const interval = 1000 / animationState.trainFrequency * 100; // Scale up for visual
    if (animationState.simTime - animationState.lastAPTime >= interval) {
      triggerActionPotential();
    }
  }
  
  if (!apInProgress) {
    // Decay presynaptic voltage toward resting (slowly)
    const diff = -70 - animationState.preVoltage;
    animationState.preVoltage += diff * deltaTime * 0.002;
    
    // Decay Ca2+ concentration
    animationState.preCaConc *= Math.exp(-deltaTime / AP_PARAMS.Ca_tauDecay);
    animationState.preCaConc = Math.max(0.0001, animationState.preCaConc);
    
    return;
  }
  
  const elapsed = animationState.simTime - apStartTime;
  
  // Log progress for debugging (every 50ms during AP)
  if (Math.floor(elapsed / 50) !== Math.floor((elapsed - deltaTime) / 50) || elapsed < 50) {
    console.log(`📈 AP: elapsed=${elapsed.toFixed(0)}ms, voltage=${animationState.preVoltage.toFixed(1)}mV, phase=${animationState.apPhase}, Ca=${(animationState.preCaConc * 1000).toFixed(1)}μM`);
  }
  
  // AP waveform phases (using visual-scaled timing)
  if (elapsed < AP_PARAMS.riseDuration) {
    // ████ DEPOLARIZATION - rapid rise to peak ████
    const progress = elapsed / AP_PARAMS.riseDuration;
    const targetVoltage = -70 + (AP_PARAMS.peakVoltage + 70) * easeOutQuad(progress);
    animationState.preVoltage = targetVoltage;
    animationState.apPhase = 'depolarizing';
    
    // Ca2+ channels start opening above threshold
    if (animationState.preVoltage > AP_PARAMS.CaV_threshold) {
      const caOpenProb = getCaVOpenProbability(animationState.preVoltage);
      animationState.preCaConc += caOpenProb * 0.0005 * deltaTime * animationState.caDensity;
    }
    
  } else if (elapsed < AP_PARAMS.riseDuration + 80) {
    // ████ PEAK - maximum depolarization, MAXIMUM Ca2+ INFLUX ████
    animationState.preVoltage = AP_PARAMS.peakVoltage;
    animationState.apPhase = 'peak';
    
    // STRONG Ca2+ influx during peak (triggers vesicle release)
    animationState.preCaConc += 0.001 * deltaTime * animationState.caDensity;
    animationState.preCaConc = Math.min(0.1, animationState.preCaConc);  // Cap at 100 μM
    
  } else if (elapsed < AP_PARAMS.duration) {
    // ████ REPOLARIZATION - return toward resting ████
    const peakEnd = AP_PARAMS.riseDuration + 80;
    const repolarProgress = (elapsed - peakEnd) / (AP_PARAMS.duration - peakEnd);
    animationState.preVoltage = AP_PARAMS.peakVoltage + (-80 - AP_PARAMS.peakVoltage) * easeInQuad(Math.min(1, repolarProgress));
    animationState.apPhase = 'repolarizing';
    
    // Ca2+ channels closing, concentration starts to decay
    animationState.preCaConc *= Math.exp(-deltaTime / 300);
    
  } else if (elapsed < AP_PARAMS.duration + AP_PARAMS.absoluteRefractory) {
    // ████ REFRACTORY PERIOD - hyperpolarized ████
    const refractProgress = (elapsed - AP_PARAMS.duration) / AP_PARAMS.absoluteRefractory;
    animationState.preVoltage = -80 + refractProgress * 10; // Slowly return to -70
    animationState.apPhase = 'refractory';
    
  } else {
    // ████ AP COMPLETE ████
    console.log('✅ AP complete! Duration:', elapsed.toFixed(0), 'ms, Final voltage:', animationState.preVoltage.toFixed(1), 'mV');
    animationState.preVoltage = -70;
    animationState.apActive = false;
    animationState.apPhase = 'resting';
    apInProgress = false;
  }
  
  // Cap Ca2+ concentration
  animationState.preCaConc = Math.min(0.1, animationState.preCaConc);
}

// ============================================================================
// POSTSYNAPTIC POTENTIAL SIMULATION
// ============================================================================

// Slow oscillation phases for realistic membrane noise (like action-potential-3d)
let pspOscPhase1 = 0;  // 0.5 Hz - slow wave
let pspOscPhase2 = 0;  // 2 Hz - medium oscillation
let pspOscPhase3 = 0;  // 5 Hz - theta rhythm
let smoothedPSP = -70; // Smoothed voltage for display

function updatePostsynapticPotential(deltaTime) {
  // =========================================================================
  // LOCAL SPINE POTENTIAL MODEL
  // =========================================================================
  // Shows voltage at the spine head only - dendritic propagation is shown
  // in action-potential-3d and membrane-molecular apps
  // =========================================================================
  
  const restingPotential = -70;  // mV
  const membraneTau = 20;        // ms - spine membrane time constant
  
  // Update slow oscillation phases for realistic membrane noise
  pspOscPhase1 += deltaTime * 0.0005 * Math.PI * 2;  // 0.5 Hz
  pspOscPhase2 += deltaTime * 0.002 * Math.PI * 2;   // 2 Hz
  pspOscPhase3 += deltaTime * 0.005 * Math.PI * 2;   // 5 Hz
  
  // =========================================================================
  // SYNAPTIC CURRENT (Driving Force Model)
  // I = g * (E_rev - V_m) → current decreases as V approaches reversal
  // =========================================================================
  let synapticCurrent = 0;
  
  // AMPA: Fast EPSP, E_rev = 0mV
  // Conductance SCALES with plasticity state (LTP/LTD effect!)
  if (animationState.ampaBound > 0) {
    const ampaReversal = 0;
    const baseConductance = 0.003;
    // PLASTICITY: AMPA conductance is modulated by receptor density
    const plasticityFactor = animationState.ampaPlasticity || 1.0;
    const ampaConductance = baseConductance * plasticityFactor;
    const drivingForce = ampaReversal - animationState.postVoltage;
    synapticCurrent += animationState.ampaBound * ampaConductance * drivingForce;
  }
  
  // NMDA: Slow EPSP, E_rev = 0mV, Mg2+ block, Ca2+ permeable
  // KEY FOR PLASTICITY: Ca2+ through NMDA triggers LTP/LTD!
  let nmdaCaInflux = 0;
  if (animationState.nmdaBound > 0) {
    const nmdaReversal = 0;
    const nmdaConductance = 0.004;
    const mgFactor = 1 - animationState.mgBlock;
    const drivingForce = nmdaReversal - animationState.postVoltage;
    const nmdaCurrent = animationState.nmdaBound * nmdaConductance * drivingForce * mgFactor;
    synapticCurrent += nmdaCurrent;
    
    // Track Ca2+ influx through NMDA (proportional to current when unblocked)
    nmdaCaInflux = Math.max(0, nmdaCurrent * mgFactor * 0.1);
  }
  
  // GABA-A: Fast IPSP, E_rev = -80mV
  if (animationState.gabaaBound > 0) {
    const gabaReversal = -80;
    const gabaConductance = 0.003;
    const drivingForce = gabaReversal - animationState.postVoltage;
    synapticCurrent += animationState.gabaaBound * gabaConductance * drivingForce;
  }
  
  // =========================================================================
  // MEMBRANE NOISE
  // =========================================================================
  const activityLevel = Math.min(1, (animationState.ampaBound + animationState.nmdaBound + animationState.gabaaBound) * 0.1);
  const totalNoiseAmp = 0.2 + activityLevel * 0.3;
  
  const membraneNoise = 
    Math.sin(pspOscPhase1) * 0.5 * totalNoiseAmp +
    Math.sin(pspOscPhase2) * 0.3 * totalNoiseAmp +
    Math.sin(pspOscPhase3) * 0.2 * totalNoiseAmp;
  
  // =========================================================================
  // MEMBRANE EQUATION: dV/dt = (V_rest - V)/τ + I_syn
  // =========================================================================
  const leakCurrent = (restingPotential - animationState.postVoltage) / membraneTau;
  const dVdt = leakCurrent + synapticCurrent;
  
  animationState.postVoltage += dVdt * deltaTime + membraneNoise;
  
  // Physiological bounds (reversal potentials)
  if (animationState.postVoltage > 0) animationState.postVoltage = 0;
  if (animationState.postVoltage < -90) animationState.postVoltage = -90;
  
  // =========================================================================
  // SYNAPTIC PLASTICITY (LTP/LTD via NMDA-dependent Ca2+)
  // =========================================================================
  // 
  // BIOLOGICAL PATHWAY:
  // 
  // LTP (Long-Term Potentiation):
  //   1. High [Ca²⁺] → Calmodulin binds Ca²⁺ → Ca²⁺/CaM complex
  //   2. Ca²⁺/CaM activates CaMKII (Calcium/calmodulin-dependent kinase II)
  //   3. CaMKII phosphorylates:
  //      - GluA1 subunits of AMPA receptors (↑ conductance)
  //      - Stargazin/TARPs (promotes AMPA surface expression)
  //   4. Triggers exocytosis of AMPA receptors from recycling endosomes
  //   5. More AMPA receptors at synapse = STRONGER EPSPs
  //
  // LTD (Long-Term Depression):
  //   1. Moderate [Ca²⁺] → activates Calcineurin (protein phosphatase 2B)
  //   2. Calcineurin dephosphorylates AMPA receptors
  //   3. Triggers clathrin-mediated endocytosis of AMPA receptors
  //   4. Fewer AMPA receptors = WEAKER EPSPs
  //
  // =========================================================================
  
  // Initialize plasticity state if needed
  if (animationState.ampaPlasticity === undefined) {
    animationState.ampaPlasticity = 1.0;
    animationState.spineCa = 0;
    animationState.ltpInduction = 0;
    animationState.ltdInduction = 0;
    // Signaling pathway states
    animationState.camkiiActive = 0;      // CaMKII activation (0-100%)
    animationState.calcineurinActive = 0; // Calcineurin activation (0-100%)
    animationState.ampaTrafficking = 0;   // Net trafficking (+insertion, -removal)
  }
  
  // Calculate Ca2+ sources
  // mgBlock stores the BLOCK fraction (1 = fully blocked, 0 = fully unblocked)
  // So relief = 1 - mgBlock
  const mgRelief = 1 - animationState.mgBlock;
  
  // Ca2+ from NMDA (requires both binding AND depolarization/Mg relief)
  let nmdaCaSource = 0;
  if (animationState.nmdaBound > 0) {
    // Ca2+ influx proportional to bound receptors and Mg relief
    // Even small relief allows SOME Ca2+ through
    nmdaCaSource = animationState.nmdaBound * Math.max(0.05, mgRelief) * 0.8;
  }
  
  // Ca2+ from mGluR (IP3-mediated release from ER) - STRONGER
  const mglurCaSource = animationState.mglurActive ? 0.5 : 0;
  
  // Ca2+ from voltage-gated Ca channels (VGCCs) when depolarized
  // These are important for plasticity too!
  let vgccCaSource = 0;
  if (animationState.postVoltage > -55) {
    vgccCaSource = (animationState.postVoltage + 55) * 0.03;
  }
  
  // Total Ca2+ influx
  const totalCaInflux = nmdaCaSource + mglurCaSource + vgccCaSource;
  
  // Accumulate Ca2+ (faster rate for visible changes)
  animationState.spineCa += totalCaInflux * deltaTime * 0.008;
  
  // Ca2+ decay (moderate decay)
  animationState.spineCa *= Math.exp(-deltaTime * 0.0008);  // τ ≈ 1.25 seconds
  
  // Clamp Ca2+
  animationState.spineCa = Math.max(0, Math.min(10, animationState.spineCa));
  
  // Debug logging
  if (Math.random() < 0.005 && totalCaInflux > 0) {
    console.log(`🧪 Ca² sources: NMDA=${nmdaCaSource.toFixed(2)} (bound=${animationState.nmdaBound}, relief=${mgRelief.toFixed(2)}), mGluR=${mglurCaSource.toFixed(2)}, VGCC=${vgccCaSource.toFixed(2)}, total=${animationState.spineCa.toFixed(2)}`);
  }
  
  // Debug logging (every ~1 second)
  if (Math.random() < 0.01 && (nmdaCaSource > 0 || animationState.spineCa > 0.1)) {
    console.log(`🔬 Plasticity debug: NMDA bound=${animationState.nmdaBound}, mgRelief=${mgRelief.toFixed(2)}, nmdaCa=${nmdaCaSource.toFixed(3)}, spineCa=${animationState.spineCa.toFixed(3)}`);
  }
  
  // =========================================================================
  // SIGNALING CASCADE: Ca²⁺ → CaMKII/Calcineurin → AMPA Trafficking
  // =========================================================================
  // 
  // EXTREMELY GRADUAL - plasticity requires MANY repeated activations!
  // A single AP should produce <1% change
  // Full LTP (e.g., 150%) requires sustained high-frequency stimulation
  // =========================================================================
  
  // Thresholds based on BCM theory
  const ltpThreshold = 1.5;   // High Ca²⁺ → CaMKII activation → LTP
  const ltdThreshold = 0.5;   // Moderate Ca²⁺ → Calcineurin activation → LTD
  
  // -------------------------------------------------------------------------
  // Step 1: Ca²⁺ activates downstream kinases/phosphatases
  // -------------------------------------------------------------------------
  
  // CaMKII activation (requires SUSTAINED high Ca²⁺)
  if (animationState.spineCa > ltpThreshold) {
    // EXTREMELY slow activation
    const camkiiRate = (animationState.spineCa - ltpThreshold) * deltaTime * 0.0005;
    animationState.camkiiActive = Math.min(100, animationState.camkiiActive + camkiiRate);
  }
  // CaMKII decay (faster than activation - needs sustained input)
  animationState.camkiiActive *= Math.exp(-deltaTime * 0.001);  // τ ≈ 1 second
  
  // Calcineurin activation (moderate Ca²⁺, inhibited by CaMKII)
  if (animationState.spineCa > ltdThreshold && animationState.spineCa < ltpThreshold * 1.2) {
    const inhibitionByCaMKII = 1 - (animationState.camkiiActive / 100) * 0.95;
    const calcineurinRate = (animationState.spineCa - ltdThreshold) * deltaTime * 0.0003 * inhibitionByCaMKII;
    animationState.calcineurinActive = Math.min(100, animationState.calcineurinActive + calcineurinRate);
  }
  // Calcineurin decay
  animationState.calcineurinActive *= Math.exp(-deltaTime * 0.002);  // τ ≈ 0.5 seconds
  
  // -------------------------------------------------------------------------
  // Step 2: CaMKII/Calcineurin control AMPA receptor trafficking
  // -------------------------------------------------------------------------
  
  // High thresholds - need sustained kinase activity
  const camkiiThreshold = 25;  // Need >25% CaMKII for insertion
  const calcineurinThreshold = 30;  // Need >30% calcineurin for removal
  
  let insertionRate = 0;
  let removalRate = 0;
  
  if (animationState.camkiiActive > camkiiThreshold) {
    // TINY insertion rate - ~0.1% per second of sustained activity
    insertionRate = (animationState.camkiiActive - camkiiThreshold) * 0.000001;
  }
  
  if (animationState.calcineurinActive > calcineurinThreshold) {
    removalRate = (animationState.calcineurinActive - calcineurinThreshold) * 0.0000005;
  }
  
  // Net trafficking
  animationState.ampaTrafficking = insertionRate - removalRate;
  
  // -------------------------------------------------------------------------
  // Step 3: GRADUALLY update AMPA receptor density
  // -------------------------------------------------------------------------
  
  // Integrate trafficking - VERY small increments
  animationState.ltpInduction += insertionRate * deltaTime;
  animationState.ltdInduction += removalRate * deltaTime;
  
  // -------------------------------------------------------------------------
  // Step 4: DECAY of plasticity (protein turnover, receptor recycling)
  // -------------------------------------------------------------------------
  // YES - LTP and LTD should decay over time!
  // In real neurons, plasticity decays over hours/days unless consolidated
  // We speed this up for visualization (τ ≈ 30-60 seconds)
  
  const plasticityDecayRate = 0.00002;  // τ ≈ 50 seconds
  
  // Decay toward baseline (both LTP and LTD decay)
  if (animationState.ltpInduction > 0) {
    animationState.ltpInduction *= Math.exp(-deltaTime * plasticityDecayRate);
  }
  if (animationState.ltdInduction > 0) {
    animationState.ltdInduction *= Math.exp(-deltaTime * plasticityDecayRate);
  }
  
  // Calculate net AMPA receptor density change
  // Scale factor controls how much induction translates to density change
  const inductionToPlasticityScale = 0.1;  // 10% efficiency
  const netPlasticity = (animationState.ltpInduction - animationState.ltdInduction) * inductionToPlasticityScale;
  animationState.ampaPlasticity = Math.max(0.5, Math.min(2.0, 1.0 + netPlasticity));
  
  // Update the actual AMPA density
  animationState.ampaDensity = animationState.ampaPlasticity;
  
  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------
  if (insertionRate > 0 && Math.random() < 0.01) {
    console.log(`📈 LTP: CaMKII=${animationState.camkiiActive.toFixed(1)}%, ltpInduction=${animationState.ltpInduction.toFixed(4)}, AMPA=${(animationState.ampaPlasticity * 100).toFixed(1)}%`);
  }
  if (removalRate > 0 && Math.random() < 0.01) {
    console.log(`📉 LTD: Calcineurin=${animationState.calcineurinActive.toFixed(1)}%, ltdInduction=${animationState.ltdInduction.toFixed(4)}, AMPA=${(animationState.ampaPlasticity * 100).toFixed(1)}%`);
  }
  
  // =========================================================================
  // DISPLAY VALUES
  // =========================================================================
  
  // Smooth for display
  const smoothingFactor = 0.15;
  smoothedPSP += (animationState.postVoltage - smoothedPSP) * smoothingFactor;
  animationState.pspAmplitude = smoothedPSP - restingPotential;
  
  // EPSP/IPSP flags
  const totalExcitatory = animationState.ampaBound + animationState.nmdaBound * (1 - animationState.mgBlock);
  animationState.epspActive = totalExcitatory > 0.5 || animationState.postVoltage > -65;
  animationState.ipspActive = animationState.gabaaBound > 0.5 || animationState.postVoltage < -72;
  
  // Track EPSPs
  if (animationState.postVoltage > -55 && !animationState.lastEpspCounted) {
    animationState.totalEpsps++;
    animationState.lastEpspCounted = true;
  } else if (animationState.postVoltage < -60) {
    animationState.lastEpspCounted = false;
  }
}

// ============================================================================
// ENDOCANNABINOID SYSTEM
// ============================================================================

// Visual eCB particles for retrograde signaling
const eCBParticles = [];
const MAX_ECB_PARTICLES = 30;
let eCBGeometry = null;
let eCBMaterial = null;

function initECBVisuals() {
  if (!eCBGeometry) {
    eCBGeometry = new THREE.SphereGeometry(0.4, 8, 6);
    eCBMaterial = new THREE.MeshPhongMaterial({
      color: 0x2ed573,  // Green for 2-AG
      emissive: 0x2ed573,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.9,
    });
  }
}

function spawnECBParticle() {
  initECBVisuals();
  if (eCBParticles.length >= MAX_ECB_PARTICLES) return;
  
  const mesh = new THREE.Mesh(eCBGeometry, eCBMaterial.clone());
  
  // Spawn at postsynaptic membrane (bottom of cleft)
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * SCALE.ACTIVE_ZONE_RADIUS * 0.6;
  mesh.position.set(
    Math.cos(angle) * radius,
    -SCALE.CLEFT_WIDTH / 2 + 0.5,  // Just above postsynaptic membrane
    Math.sin(angle) * radius
  );
  
  ntGroup.add(mesh);
  
  eCBParticles.push({
    mesh,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      2 + Math.random(),  // Upward toward presynaptic
      (Math.random() - 0.5) * 0.5
    ),
    lifetime: 0,
    maxLifetime: 2000 + Math.random() * 1000,  // 2-3 seconds
    bound: false,
  });
  
  console.log(`🌿 eCB (2-AG) released from postsynaptic! Count: ${eCBParticles.length}`);
}

function updateECBParticles(deltaTime) {
  const preMembraneY = SCALE.CLEFT_WIDTH / 2;
  
  for (let i = eCBParticles.length - 1; i >= 0; i--) {
    const ecb = eCBParticles[i];
    ecb.lifetime += deltaTime;
    
    if (ecb.bound) {
      // Fade out when bound to CB1
      ecb.mesh.material.opacity -= deltaTime * 0.002;
      if (ecb.mesh.material.opacity <= 0) {
        ntGroup.remove(ecb.mesh);
        eCBParticles.splice(i, 1);
      }
      continue;
    }
    
    // Move upward toward presynaptic terminal
    ecb.mesh.position.add(
      ecb.velocity.clone().multiplyScalar(deltaTime * 0.002)
    );
    
    // Add slight wobble
    ecb.mesh.position.x += Math.sin(ecb.lifetime * 0.01) * 0.02;
    ecb.mesh.position.z += Math.cos(ecb.lifetime * 0.012) * 0.02;
    
    // Check if reached presynaptic membrane (CB1 binding)
    if (ecb.mesh.position.y >= preMembraneY - 0.5) {
      ecb.bound = true;
      ecb.velocity.set(0, 0, 0);
      // Boost CB1 activation when eCB binds
      animationState.cb1Activation = Math.min(100, animationState.cb1Activation + 5);
      console.log(`🎯 eCB bound to CB1! CB1 activation: ${animationState.cb1Activation.toFixed(1)}%`);
    }
    
    // Remove if expired
    if (ecb.lifetime > ecb.maxLifetime) {
      ntGroup.remove(ecb.mesh);
      eCBParticles.splice(i, 1);
    }
  }
}

function updateEndocannabinoid(deltaTime) {
  // Always update existing particles
  updateECBParticles(deltaTime);
  
  if (!animationState.endoSynthesis) {
    // Decay if synthesis disabled
    animationState.endoLevel *= Math.exp(-deltaTime * 0.001);
    animationState.cb1Activation *= Math.exp(-deltaTime * 0.0005);
    animationState.retrogradeSignal = false;
    return;
  }
  
  // 2-AG synthesis triggered by strong postsynaptic activation
  if (animationState.postVoltage > ENDOCANNABINOID.synthesisThreshold) {
    // Synthesis rate proportional to depolarization
    const depolarization = animationState.postVoltage - ENDOCANNABINOID.synthesisThreshold;
    animationState.endoLevel += depolarization * 0.15 * deltaTime;  // Faster synthesis
    
    // Spawn visual eCB particles when synthesis is active
    const spawnRate = depolarization * deltaTime * 0.001;
    if (Math.random() < spawnRate) {
      spawnECBParticle();
    }
  }
  
  // Decay
  animationState.endoLevel *= Math.exp(-deltaTime / ENDOCANNABINOID.tauSynthesis);
  animationState.endoLevel = Math.min(100, animationState.endoLevel);
  
  // Retrograde transport to presynaptic
  if (animationState.endoLevel > 20) {
    animationState.retrogradeSignal = true;
    
    // CB1 activation (also boosted by particle binding)
    const targetCB1 = animationState.endoLevel * ENDOCANNABINOID.maxInhibition;
    animationState.cb1Activation += (targetCB1 - animationState.cb1Activation) * deltaTime * 0.003;
  } else {
    animationState.retrogradeSignal = false;
  }
  
  // CB1 decay
  animationState.cb1Activation *= Math.exp(-deltaTime / ENDOCANNABINOID.tauEffect);
  animationState.cb1Activation = Math.max(0, Math.min(100, animationState.cb1Activation));
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
  
  cameraAngleX += deltaX * 0.006;
  cameraAngleY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraAngleY + deltaY * 0.006));
  
  previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(event) {
  event.preventDefault();
  cameraDistance = Math.max(30, Math.min(150, cameraDistance + event.deltaY * 0.05));
}

function onClick(event) {
  // Raycast to detect clicks on synapse
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(synapseGroup.children, true);
  
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.type === 'presynaptic' || obj.userData.type === 'activeZone') {
      triggerActionPotential();
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
  
  cameraAngleX += deltaX * 0.006;
  cameraAngleY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraAngleY + deltaY * 0.006));
  
  previousMousePosition = {
    x: event.touches[0].clientX,
    y: event.touches[0].clientY
  };
}

function onTouchEnd() {
  isDragging = false;
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
  const simDelta = scaledDelta * 1000; // Convert to ms for simulation
  
  if (animationState.running) {
    // Update time
    animationState.time += scaledDelta;
    animationState.simTime += simDelta;
    
    // Update action potential
    updateActionPotential(simDelta);
    
    // Update vesicles
    updateVesicles(scaledDelta);
    
    // Update neurotransmitters
    const receptorPositions = getReceptorPositions();
    updateNeurotransmitters(scaledDelta, receptorPositions);
    
    // Update receptors
    updateReceptors(scaledDelta);
    
    // Update ions
    updateIons(scaledDelta);
    
    // Update postsynaptic potential
    updatePostsynapticPotential(simDelta);
    
    // Update endocannabinoid system
    updateEndocannabinoid(simDelta);
    
    // Update visuals
    updatePresynapticVisual(animationState.preVoltage, animationState.preCaConc);
    updatePostsynapticVisual(animationState.postVoltage, animationState.epspActive, animationState.ipspActive);
    
    // Update Ca channel visualization
    const openChannels = updateCaChannelVisuals(animationState.preVoltage, animationState.apActive);
    animationState.caChannelsOpen = openChannels;
    
    // Update CB1 receptor visualization (endocannabinoid retrograde signaling)
    updateCB1Visuals(animationState.cb1Activation, animationState.endoLevel);
    
    // Sample graph data
    sampleGraphData();
  }
  
  // Update camera
  updateCamera(cameraDistance, cameraAngleX, cameraAngleY, animationState.isFlipped);
  
  // Render
  renderScene();
  
  // Draw graphs
  drawGraphs();
  
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
  const vesicleCounts = getVesicleCounts();
  const receptorStates = getReceptorStates();
  const caChannelsOpen = Math.round(getCaVOpenProbability(animationState.preVoltage) * 12);
  
  updateUI({
    // Presynaptic
    preVoltage: animationState.preVoltage,
    prePhase: getPrePhaseLabel(animationState.preVoltage, animationState.apPhase),
    preCaConc: animationState.preCaConc,
    caChannelsOpen: animationState.apActive ? caChannelsOpen : 0,
    cb1Activation: animationState.cb1Activation,
    releaseProbability: animationState.releaseProbability * (1 - animationState.cb1Activation / 100 * 0.7),
    
    // Vesicles
    rrpCount: vesicleCounts.rrp,
    recyclingCount: vesicleCounts.recycling,
    reserveCount: vesicleCounts.reserve,
    snareState: getSNAREState(),
    
    // Postsynaptic
    postVoltage: animationState.postVoltage,
    postPhase: getPostPhaseLabel(animationState.postVoltage, animationState.epspActive, animationState.ipspActive),
    pspAmplitude: animationState.pspAmplitude,
    
    // Receptors
    ampaBound: animationState.ampaBound,
    ampaTotal: receptorStates.ampaTotal,
    nmdaBound: animationState.nmdaBound,
    nmdaTotal: receptorStates.nmdaTotal,
    nmdaMgBlock: animationState.mgBlock,
    gabaaBound: animationState.gabaaBound,
    gabaaTotal: receptorStates.gabaaTotal,
    
    // Metabotropic
    mglurActive: receptorStates.mglurActive,
    gababActive: receptorStates.gababActive,
    gProteinCascade: receptorStates.gProteinCascade,
    
    // SYNAPTIC PLASTICITY (CaMKII/Calcineurin pathway)
    spineCa: animationState.spineCa || 0,
    ampaPlasticity: animationState.ampaPlasticity || 1.0,
    ampaDensity: animationState.ampaDensity || 1.0,
    ltpInduction: animationState.ltpInduction || 0,
    ltdInduction: animationState.ltdInduction || 0,
    camkiiActive: animationState.camkiiActive || 0,
    calcineurinActive: animationState.calcineurinActive || 0,
    ampaTrafficking: animationState.ampaTrafficking || 0,
    
    // Endocannabinoid
    endoLevel: animationState.endoLevel,
    retrogradeSignal: animationState.retrogradeSignal,
    
    // Cleft
    cleftGlutamate: animationState.cleftGlutamate,
    cleftGaba: animationState.cleftGaba,
    
    // Stats
    fps: currentFPS,
    vesiclesReleased: animationState.vesiclesReleased,
    totalEpsps: animationState.totalEpsps,
    simTime: animationState.simTime,
  });
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
