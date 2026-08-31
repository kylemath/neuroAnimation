/**
 * controls.js - UI controls and event handlers
 * 
 * Manages all user interface interactions including:
 * - Animation controls (start/stop/reset)
 * - Parameter sliders
 * - Neurotransmitter selection
 * - Visualization toggles
 */

import { animationState, VESICLE_POOLS, CHANNEL_COUNTS } from './config.js';

// Callback functions (set by main.js)
let callbacks = {};

/**
 * Setup all UI controls
 */
export function setupControls(cbs) {
  callbacks = cbs;
  
  // Animation controls
  setupAnimationControls();
  
  // AP controls
  setupAPControls();
  
  // NT selection
  setupNTControls();
  
  // Presynaptic modulation
  setupPresynapticControls();
  
  // Postsynaptic controls
  setupPostsynapticControls();
  
  // Visualization controls
  setupVisualizationControls();
  
  // Camera controls
  setupCameraControls();
}

/**
 * Setup animation start/stop/reset controls
 */
function setupAnimationControls() {
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');
  
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      if (callbacks.onStart) callbacks.onStart();
      btnStart.classList.add('active');
      btnPause.classList.remove('active');
    });
  }
  
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (callbacks.onPause) callbacks.onPause();
      btnPause.classList.add('active');
      btnStart.classList.remove('active');
    });
  }
  
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (callbacks.onReset) callbacks.onReset();
      btnStart.classList.add('active');
      btnPause.classList.remove('active');
    });
  }
}

/**
 * Setup action potential controls
 */
function setupAPControls() {
  const btnAP = document.getElementById('btn-ap');
  const btnTrain = document.getElementById('btn-train');
  const freqSlider = document.getElementById('ap-freq-slider');
  
  if (btnAP) {
    btnAP.addEventListener('click', () => {
      console.log('AP button clicked');
      if (callbacks.onTriggerAP) {
        callbacks.onTriggerAP();
        // Visual feedback
        btnAP.style.transform = 'scale(0.95)';
        setTimeout(() => {
          btnAP.style.transform = 'scale(1)';
        }, 100);
      } else {
        console.error('onTriggerAP callback not defined');
      }
    });
  } else {
    console.error('btn-ap element not found');
  }
  
  if (btnTrain) {
    btnTrain.addEventListener('click', () => {
      animationState.trainMode = !animationState.trainMode;
      btnTrain.classList.toggle('active', animationState.trainMode);
      if (callbacks.onTrainToggle) callbacks.onTrainToggle(animationState.trainMode);
    });
  }
  
  if (freqSlider) {
    freqSlider.addEventListener('input', (e) => {
      const freq = parseInt(e.target.value);
      animationState.trainFrequency = freq;
      document.getElementById('ap-freq-val').textContent = freq + ' Hz';
    });
  }
}

/**
 * Setup neurotransmitter selection
 */
function setupNTControls() {
  const btnGlutamate = document.getElementById('btn-glutamate');
  const btnGaba = document.getElementById('btn-gaba');
  const btnMixed = document.getElementById('btn-mixed');
  const contentSlider = document.getElementById('nt-content-slider');
  
  const ntButtons = [btnGlutamate, btnGaba, btnMixed];
  
  function setNTType(type, button) {
    animationState.ntType = type;
    ntButtons.forEach(btn => btn?.classList.remove('active'));
    button?.classList.add('active');
    if (callbacks.onNTTypeChange) callbacks.onNTTypeChange(type);
  }
  
  if (btnGlutamate) {
    btnGlutamate.addEventListener('click', () => setNTType('glutamate', btnGlutamate));
  }
  if (btnGaba) {
    btnGaba.addEventListener('click', () => setNTType('gaba', btnGaba));
  }
  if (btnMixed) {
    btnMixed.addEventListener('click', () => setNTType('mixed', btnMixed));
  }
  
  if (contentSlider) {
    contentSlider.addEventListener('input', (e) => {
      const count = parseInt(e.target.value);
      document.getElementById('nt-content-val').textContent = '~' + count;
      if (callbacks.onNTContentChange) callbacks.onNTContentChange(count);
    });
  }
}

/**
 * Setup presynaptic modulation controls
 */
function setupPresynapticControls() {
  const caDensitySlider = document.getElementById('ca-density-slider');
  const prSlider = document.getElementById('pr-slider');
  const cb1Slider = document.getElementById('cb1-slider');
  
  if (caDensitySlider) {
    caDensitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      animationState.caDensity = val / 100;
      document.getElementById('ca-density-val').textContent = val + '%';
    });
  }
  
  if (prSlider) {
    prSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      animationState.releaseProbability = val;
      VESICLE_POOLS.RRP.releaseProb = val;
      document.getElementById('pr-val').textContent = val.toFixed(2);
    });
  }
  
  if (cb1Slider) {
    cb1Slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      animationState.cb1Activation = val;
      document.getElementById('cb1-val').textContent = val + '%';
      if (callbacks.onCB1Change) callbacks.onCB1Change(val);
    });
  }
}

/**
 * Setup postsynaptic controls
 */
function setupPostsynapticControls() {
  const ampaDensitySlider = document.getElementById('ampa-density-slider');
  const mgBlockSlider = document.getElementById('mg-block-slider');
  const endoToggle = document.getElementById('endo-toggle');
  
  if (ampaDensitySlider) {
    ampaDensitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      animationState.ampaDensity = val / 100;
      document.getElementById('ampa-density-val').textContent = val + '%';
      if (callbacks.onAMPADensityChange) callbacks.onAMPADensityChange(val);
    });
  }
  
  if (mgBlockSlider) {
    mgBlockSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      animationState.nmdaMgBlock = val / 100;
      document.getElementById('mg-block-val').textContent = val + '%';
    });
  }
  
  if (endoToggle) {
    endoToggle.addEventListener('change', (e) => {
      animationState.endoSynthesis = e.target.checked;
      if (callbacks.onEndoToggle) callbacks.onEndoToggle(e.target.checked);
    });
  }
}

/**
 * Setup visualization controls
 */
function setupVisualizationControls() {
  const speedSlider = document.getElementById('speed-slider');
  const ionFlowToggle = document.getElementById('ion-flow-toggle');
  const astrocyteToggle = document.getElementById('astrocyte-toggle');
  const vesicleTrailsToggle = document.getElementById('vesicle-trails-toggle');
  
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      animationState.speed = val;
      document.getElementById('speed-val').textContent = val.toFixed(1) + 'x';
    });
  }
  
  if (ionFlowToggle) {
    ionFlowToggle.addEventListener('change', (e) => {
      animationState.showIonFlow = e.target.checked;
      if (callbacks.onIonFlowToggle) callbacks.onIonFlowToggle(e.target.checked);
    });
  }
  
  if (astrocyteToggle) {
    astrocyteToggle.addEventListener('change', (e) => {
      animationState.showAstrocyte = e.target.checked;
      if (callbacks.onAstrocyteToggle) callbacks.onAstrocyteToggle(e.target.checked);
    });
  }
  
  if (vesicleTrailsToggle) {
    vesicleTrailsToggle.addEventListener('change', (e) => {
      animationState.vesicleTrails = e.target.checked;
    });
  }
  
  // Main pre/post visibility toggles
  const toggleAllPre = document.getElementById('toggle-all-presynaptic');
  if (toggleAllPre) {
    toggleAllPre.addEventListener('change', (e) => {
      if (callbacks.onPresynapticToggle) callbacks.onPresynapticToggle(e.target.checked);
    });
  }
  
  const toggleAllPost = document.getElementById('toggle-all-postsynaptic');
  if (toggleAllPost) {
    toggleAllPost.addEventListener('change', (e) => {
      if (callbacks.onPostsynapticToggle) callbacks.onPostsynapticToggle(e.target.checked);
    });
  }
  
  // Membrane only mode toggle
  const toggleMembraneOnly = document.getElementById('toggle-membrane-only');
  if (toggleMembraneOnly) {
    toggleMembraneOnly.addEventListener('change', (e) => {
      if (callbacks.onMembraneOnlyToggle) callbacks.onMembraneOnlyToggle(e.target.checked);
    });
  }
  
  // Fine-grained structure visibility toggles
  setupVisibilityToggle('toggle-ca-channels', 'caChannels');
  setupVisibilityToggle('toggle-vesicles', 'vesicles');
}

/**
 * Setup a visibility toggle checkbox
 */
function setupVisibilityToggle(elementId, structureName) {
  const toggle = document.getElementById(elementId);
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      if (callbacks.onStructureVisibilityChange) {
        callbacks.onStructureVisibilityChange(structureName, e.target.checked);
      }
    });
  }
}

/**
 * Setup camera controls
 */
function setupCameraControls() {
  const btnResetCam = document.getElementById('btn-reset-cam');
  const btnFlipView = document.getElementById('btn-flip-view');
  const btnResetPanels = document.getElementById('btn-reset-panels');
  
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      if (callbacks.onResetCamera) callbacks.onResetCamera();
    });
  }
  
  if (btnFlipView) {
    btnFlipView.addEventListener('click', () => {
      animationState.isFlipped = !animationState.isFlipped;
      btnFlipView.classList.toggle('active', animationState.isFlipped);
      if (callbacks.onFlipView) callbacks.onFlipView(animationState.isFlipped);
    });
  }
  
  if (btnResetPanels) {
    btnResetPanels.addEventListener('click', () => {
      if (callbacks.onResetPanels) callbacks.onResetPanels();
    });
  }
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

/**
 * Update all UI elements with current state
 */
export function updateUI(state) {
  // Presynaptic panel
  updatePresynapticUI(state);
  
  // Postsynaptic panel
  updatePostsynapticUI(state);
  
  // Cleft panel
  updateCleftUI(state);
  
  // Stats
  updateStats(state);
}

/**
 * Update presynaptic panel
 */
function updatePresynapticUI(state) {
  // Voltage display
  const voltageEl = document.getElementById('presynaptic-voltage');
  if (voltageEl) {
    voltageEl.innerHTML = state.preVoltage.toFixed(0) + '<span class="unit">mV</span>';
  }
  
  // Voltage bar marker
  const markerEl = document.getElementById('pre-voltage-marker');
  if (markerEl) {
    const normalizedV = (state.preVoltage + 90) / 130; // -90 to +40
    markerEl.style.left = Math.max(0, Math.min(100, normalizedV * 100)) + '%';
  }
  
  // Phase indicator
  const phaseEl = document.getElementById('pre-phase');
  if (phaseEl) {
    phaseEl.textContent = state.prePhase || 'Resting';
  }
  
  // Ca2+ stats
  const caChannelsEl = document.getElementById('ca-channels');
  if (caChannelsEl) {
    caChannelsEl.textContent = `${state.caChannelsOpen || 0} / ${CHANNEL_COUNTS.presynaptic.CaV} open`;
  }
  
  const caConcEl = document.getElementById('ca-concentration');
  if (caConcEl) {
    const concNM = state.preCaConc * 1000000; // Convert to nM
    caConcEl.textContent = concNM.toFixed(0) + ' nM';
  }
  
  // CB1 status
  const cb1StatusEl = document.getElementById('cb1-status');
  if (cb1StatusEl) {
    if (state.cb1Activation > 50) {
      cb1StatusEl.textContent = 'Active (' + state.cb1Activation + '%)';
      cb1StatusEl.style.color = '#2ed573';
    } else if (state.cb1Activation > 0) {
      cb1StatusEl.textContent = 'Partial (' + state.cb1Activation + '%)';
      cb1StatusEl.style.color = '#ffd93d';
    } else {
      cb1StatusEl.textContent = 'Inactive';
      cb1StatusEl.style.color = '';
    }
  }
  
  // Release probability
  const releaseProbEl = document.getElementById('release-prob');
  if (releaseProbEl) {
    releaseProbEl.textContent = (state.releaseProbability * 100).toFixed(0) + '%';
  }
  
  // Vesicle pools
  updateVesiclePoolUI(state);
  
  // SNARE status
  updateSNAREUI(state);
}

/**
 * Update vesicle pool displays
 */
function updateVesiclePoolUI(state) {
  const rrpCountEl = document.getElementById('rrp-count');
  const rrpFillEl = document.getElementById('rrp-fill');
  const recyclingCountEl = document.getElementById('recycling-count');
  const recyclingFillEl = document.getElementById('recycling-fill');
  const reserveCountEl = document.getElementById('reserve-count');
  const reserveFillEl = document.getElementById('reserve-fill');
  
  if (rrpCountEl) {
    rrpCountEl.textContent = state.rrpCount || 0;
  }
  if (rrpFillEl) {
    rrpFillEl.style.width = ((state.rrpCount || 0) / VESICLE_POOLS.RRP.maxCount * 100) + '%';
  }
  
  if (recyclingCountEl) {
    recyclingCountEl.textContent = state.recyclingCount || 0;
  }
  if (recyclingFillEl) {
    const maxVisual = 50;
    recyclingFillEl.style.width = Math.min(100, (state.recyclingCount || 0) / maxVisual * 100) + '%';
  }
  
  if (reserveCountEl) {
    reserveCountEl.textContent = state.reserveCount || 0;
  }
  if (reserveFillEl) {
    const maxVisual = 50;
    reserveFillEl.style.width = Math.min(100, (state.reserveCount || 0) / maxVisual * 100) + '%';
  }
}

/**
 * Update SNARE status display
 */
function updateSNAREUI(state) {
  const snareStateEl = document.getElementById('snare-state');
  const components = document.querySelectorAll('.snare-component');
  
  if (snareStateEl) {
    snareStateEl.textContent = state.snareState || 'Primed - Awaiting Ca²⁺';
  }
  
  // Highlight active components based on state
  components.forEach(comp => {
    if (state.snareState === 'triggered' || state.snareState === 'fusing') {
      comp.classList.add('active');
    } else {
      comp.classList.remove('active');
    }
  });
}

/**
 * Update postsynaptic panel
 */
function updatePostsynapticUI(state) {
  // Voltage display
  const voltageEl = document.getElementById('postsynaptic-voltage');
  if (voltageEl) {
    voltageEl.innerHTML = state.postVoltage.toFixed(0) + '<span class="unit">mV</span>';
  }
  
  // Voltage bar marker
  const markerEl = document.getElementById('post-voltage-marker');
  if (markerEl) {
    const normalizedV = (state.postVoltage + 90) / 130;
    markerEl.style.left = Math.max(0, Math.min(100, normalizedV * 100)) + '%';
  }
  
  // Phase indicator
  const phaseEl = document.getElementById('post-phase');
  if (phaseEl) {
    phaseEl.textContent = state.postPhase || 'Resting';
  }
  
  // PSP indicators
  const epspEl = document.getElementById('epsp-indicator');
  const ipspEl = document.getElementById('ipsp-indicator');
  
  if (epspEl) {
    const epspVal = Math.max(0, state.pspAmplitude || 0);
    epspEl.querySelector('span').textContent = epspVal.toFixed(1);
    epspEl.style.opacity = epspVal > 0.5 ? 1 : 0.5;
  }
  
  if (ipspEl) {
    const ipspVal = Math.abs(Math.min(0, state.pspAmplitude || 0));
    ipspEl.querySelector('span').textContent = ipspVal.toFixed(1);
    ipspEl.style.opacity = ipspVal > 0.5 ? 1 : 0.5;
  }
  
  // Receptor binding
  const ampaEl = document.getElementById('ampa-bound');
  const nmdaEl = document.getElementById('nmda-bound');
  const gabaaEl = document.getElementById('gabaa-bound');
  
  if (ampaEl) {
    ampaEl.textContent = `${state.ampaBound || 0}/${state.ampaTotal || 8} bound`;
  }
  
  if (nmdaEl) {
    const mgStatus = state.nmdaMgBlock > 0.5 ? ' (Mg²⁺ block)' : ' (unblocked)';
    nmdaEl.textContent = `${state.nmdaBound || 0}/${state.nmdaTotal || 6} bound${mgStatus}`;
  }
  
  if (gabaaEl) {
    gabaaEl.textContent = `${state.gabaaBound || 0}/${state.gabaaTotal || 4} bound`;
  }
  
  // Metabotropic status
  const mglurEl = document.getElementById('mglur-status');
  const gababEl = document.getElementById('gabab-status');
  const gproteinEl = document.getElementById('gprotein-state');
  
  if (mglurEl) {
    mglurEl.textContent = state.mglurActive ? 'Active' : 'Inactive';
    mglurEl.style.color = state.mglurActive ? '#ff6b9d' : '';
  }
  
  if (gababEl) {
    gababEl.textContent = state.gababActive ? 'Active' : 'Inactive';
    gababEl.style.color = state.gababActive ? '#833471' : '';
  }
  
  if (gproteinEl) {
    if (state.gProteinCascade > 50) {
      gproteinEl.textContent = 'Active cascade';
      gproteinEl.style.color = '#a55eea';
    } else if (state.gProteinCascade > 0) {
      gproteinEl.textContent = 'Activating...';
      gproteinEl.style.color = '#ffd93d';
    } else {
      gproteinEl.textContent = 'Idle';
      gproteinEl.style.color = '';
    }
  }
  
  // Synaptic Plasticity Panel (LTP/LTD)
  updatePlasticityPanel(state);
  
  // Endocannabinoid system
  const agLevelEl = document.getElementById('2ag-level');
  const retroEl = document.getElementById('retrograde-status');
  
  if (agLevelEl) {
    if (state.endoLevel > 50) {
      agLevelEl.textContent = 'High';
      agLevelEl.style.color = '#2ed573';
    } else if (state.endoLevel > 0) {
      agLevelEl.textContent = 'Moderate';
      agLevelEl.style.color = '#ffd93d';
    } else {
      agLevelEl.textContent = 'Low';
      agLevelEl.style.color = '';
    }
  }
  
  if (retroEl) {
    retroEl.textContent = state.retrogradeSignal ? 'Active → CB1' : 'None';
    retroEl.style.color = state.retrogradeSignal ? '#2ed573' : '';
  }
}

/**
 * Update floating plasticity panel with CaMKII/Calcineurin pathway
 */
function updatePlasticityPanel(state) {
  const spineCaEl = document.getElementById('spine-ca');
  const ampaPlasticityEl = document.getElementById('ampa-plasticity');
  const ampaPlasticityMiniEl = document.getElementById('ampa-plasticity-mini');
  const plasticityStateEl = document.getElementById('plasticity-state');
  const caMeterBar = document.getElementById('ca-meter-bar');
  const ampaMeterBar = document.getElementById('ampa-meter-bar');
  
  // NEW: Pathway elements
  const camkiiEl = document.getElementById('camkii-level');
  const calcineurinEl = document.getElementById('calcineurin-level');
  const traffickingEl = document.getElementById('ampa-trafficking');
  const ampaDensityResultEl = document.getElementById('ampa-density-result');
  
  const ca = state.spineCa || 0;
  const plasticity = state.ampaPlasticity || 1.0;
  const camkii = state.camkiiActive || 0;
  const calcineurin = state.calcineurinActive || 0;
  const trafficking = state.ampaTrafficking || 0;
  
  // Ca2+ meter (0-5 scale, clamped to 100%)
  if (caMeterBar) {
    const caPercent = Math.min(100, (ca / 5) * 100);
    caMeterBar.style.width = `${caPercent}%`;
  }
  
  // Ca2+ value
  if (spineCaEl) {
    spineCaEl.textContent = ca.toFixed(2);
    if (ca > 1.0) {
      spineCaEl.style.color = '#2ecc71';  // LTP zone
    } else if (ca > 0.3) {
      spineCaEl.style.color = '#f1c40f';  // LTD zone  
    } else {
      spineCaEl.style.color = '#3498db';  // Low
    }
  }
  
  // AMPA meter (0.5x to 2x = 0% to 100%, with 1x at 50%)
  if (ampaMeterBar) {
    const ampaPercent = ((plasticity - 0.5) / 1.5) * 100;
    ampaMeterBar.style.width = `${Math.max(0, Math.min(100, ampaPercent))}%`;
  }
  
  // AMPA value
  const ampaPercentVal = (plasticity * 100).toFixed(0);
  if (ampaPlasticityEl) {
    ampaPlasticityEl.textContent = `${ampaPercentVal}%`;
    if (plasticity > 1.1) {
      ampaPlasticityEl.style.color = '#2ecc71';
    } else if (plasticity < 0.9) {
      ampaPlasticityEl.style.color = '#e74c3c';
    } else {
      ampaPlasticityEl.style.color = '#7ae1ff';
    }
  }
  
  // Mini display
  if (ampaPlasticityMiniEl) {
    ampaPlasticityMiniEl.textContent = `${ampaPercentVal}%`;
    ampaPlasticityMiniEl.style.color = ampaPlasticityEl?.style.color || '';
  }
  
  // CaMKII activation (LTP pathway)
  if (camkiiEl) {
    camkiiEl.textContent = `${camkii.toFixed(1)}%`;
    if (camkii > 30) {
      camkiiEl.style.color = '#2ecc71';
    } else if (camkii > 10) {
      camkiiEl.style.color = '#f1c40f';
    } else {
      camkiiEl.style.color = '';
    }
  }
  
  // Calcineurin activation (LTD pathway)
  if (calcineurinEl) {
    calcineurinEl.textContent = `${calcineurin.toFixed(1)}%`;
    if (calcineurin > 30) {
      calcineurinEl.style.color = '#e74c3c';
    } else if (calcineurin > 10) {
      calcineurinEl.style.color = '#f1c40f';
    } else {
      calcineurinEl.style.color = '';
    }
  }
  
  // AMPA trafficking (net receptor movement)
  if (traffickingEl) {
    if (trafficking > 0.01) {
      traffickingEl.textContent = `↑ Insertion`;
      traffickingEl.style.color = '#2ecc71';
    } else if (trafficking < -0.005) {
      traffickingEl.textContent = `↓ Removal`;
      traffickingEl.style.color = '#e74c3c';
    } else {
      traffickingEl.textContent = `— Stable`;
      traffickingEl.style.color = '';
    }
  }
  
  // Net AMPA density result
  if (ampaDensityResultEl) {
    ampaDensityResultEl.textContent = `${ampaPercentVal}%`;
    if (plasticity > 1.1) {
      ampaDensityResultEl.style.color = '#2ecc71';
    } else if (plasticity < 0.9) {
      ampaDensityResultEl.style.color = '#e74c3c';
    } else {
      ampaDensityResultEl.style.color = '#7ae1ff';
    }
  }
  
  // UPDATE THE AMPA DENSITY SLIDER to reflect plasticity!
  const ampaDensitySlider = document.getElementById('ampa-density-slider');
  const ampaDensityValEl = document.getElementById('ampa-density-val');
  if (ampaDensitySlider && ampaDensityValEl) {
    const sliderVal = Math.round(plasticity * 100);
    ampaDensitySlider.value = sliderVal;
    ampaDensityValEl.textContent = `${sliderVal}%`;
    // Color the value based on plasticity
    if (plasticity > 1.05) {
      ampaDensityValEl.style.color = '#2ecc71';
    } else if (plasticity < 0.95) {
      ampaDensityValEl.style.color = '#e74c3c';
    } else {
      ampaDensityValEl.style.color = '';
    }
  }
  
  // Plasticity state
  if (plasticityStateEl) {
    if (camkii > 15) {
      plasticityStateEl.textContent = '⚡ CaMKII active → LTP';
      plasticityStateEl.style.color = '#2ecc71';
    } else if (calcineurin > 20) {
      plasticityStateEl.textContent = '⏬ Calcineurin active → LTD';
      plasticityStateEl.style.color = '#e74c3c';
    } else if (plasticity > 1.1) {
      plasticityStateEl.textContent = '📈 LTP (potentiated)';
      plasticityStateEl.style.color = '#2ecc71';
    } else if (plasticity < 0.9) {
      plasticityStateEl.textContent = '📉 LTD (depressed)';
      plasticityStateEl.style.color = '#e74c3c';
    } else if (ca > 1.2) {
      plasticityStateEl.textContent = '🔥 High Ca²⁺...';
      plasticityStateEl.style.color = '#f1c40f';
    } else if (ca > 0.4) {
      plasticityStateEl.textContent = '⏳ Mod Ca²⁺...';
      plasticityStateEl.style.color = '#f1c40f';
    } else {
      plasticityStateEl.textContent = '— Baseline';
      plasticityStateEl.style.color = '';
    }
  }
  
  // Draw plasticity graph
  drawPlasticityGraph(state);
}

// Plasticity graph history
const plasticityHistory = {
  ampaDensity: [],
  binding: [],
  current: [],
  maxPoints: 100,
};

/**
 * Draw plasticity effect graph
 */
function drawPlasticityGraph(state) {
  const canvas = document.getElementById('plasticity-graph');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  // Add current values to history
  plasticityHistory.ampaDensity.push(state.ampaPlasticity || 1.0);
  plasticityHistory.binding.push((state.ampaBound || 0) * (state.ampaPlasticity || 1.0));
  // Estimate current from binding * conductance * driving force
  const estimatedCurrent = (state.ampaBound || 0) * (state.ampaPlasticity || 1.0) * 0.5;
  plasticityHistory.current.push(estimatedCurrent);
  
  // Trim history
  if (plasticityHistory.ampaDensity.length > plasticityHistory.maxPoints) {
    plasticityHistory.ampaDensity.shift();
    plasticityHistory.binding.shift();
    plasticityHistory.current.shift();
  }
  
  // Clear
  ctx.fillStyle = 'rgba(10, 15, 25, 0.9)';
  ctx.fillRect(0, 0, w, h);
  
  // Draw baseline at 1.0 (100%)
  const baselineY = h * 0.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, baselineY);
  ctx.lineTo(w, baselineY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw traces
  const drawTrace = (data, color, scale, yOffset) => {
    if (data.length < 2) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
      const x = (i / plasticityHistory.maxPoints) * w;
      // Scale: 0.5-2.0 maps to bottom-top of canvas
      const normalized = (data[i] - yOffset) * scale;
      const y = h - Math.max(0, Math.min(h, normalized * h));
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  
  // AMPA density (green) - scale 0.5-2.0 to 0-1
  drawTrace(plasticityHistory.ampaDensity, '#2ecc71', 0.67, 0.5);
  
  // Binding (yellow) - scale 0-20 to 0-1
  drawTrace(plasticityHistory.binding, '#f1c40f', 0.05, 0);
  
  // Current (red) - scale 0-10 to 0-1
  drawTrace(plasticityHistory.current, '#e74c3c', 0.1, 0);
  
  // Labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '8px monospace';
  ctx.fillText('200%', 2, 10);
  ctx.fillText('100%', 2, baselineY - 2);
  ctx.fillText('50%', 2, h - 2);
}

/**
 * Update cleft panel
 */
function updateCleftUI(state) {
  const gluEl = document.getElementById('glu-cleft');
  const gabaEl = document.getElementById('gaba-cleft');
  
  if (gluEl) {
    gluEl.textContent = (state.cleftGlutamate || 0).toFixed(0) + ' μM';
  }
  
  if (gabaEl) {
    gabaEl.textContent = (state.cleftGaba || 0).toFixed(0) + ' μM';
  }
}

/**
 * Update stats panel
 */
function updateStats(state) {
  const fpsEl = document.getElementById('fps');
  const vesiclesReleasedEl = document.getElementById('vesicles-released');
  const totalEpspsEl = document.getElementById('total-epsps');
  const simTimeEl = document.getElementById('sim-time');
  
  if (fpsEl) fpsEl.textContent = state.fps || 60;
  if (vesiclesReleasedEl) vesiclesReleasedEl.textContent = state.vesiclesReleased || 0;
  if (totalEpspsEl) totalEpspsEl.textContent = state.totalEpsps || 0;
  if (simTimeEl) simTimeEl.textContent = (state.simTime || 0).toFixed(2);
}
