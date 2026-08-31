/**
 * controls.js - UI controls and interactions
 * Handles all slider, button, and mouse interactions
 */

import { animationState, AP_TIMING } from './config.js';

// Callbacks object to be populated by main.js
let callbacks = {};

/**
 * Setup all UI controls with callbacks
 */
export function setupControls(callbackObj) {
  callbacks = callbackObj;
  
  setupAnimationControls();
  setupVoltageControls();
  setupVisualizationControls();
  setupChannelControls();
  setupSpeedControls();
}

/**
 * Animation play/pause/reset buttons
 */
function setupAnimationControls() {
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');
  const btnFlip = document.getElementById('btn-flip');
  const btnResetCam = document.getElementById('btn-reset-cam');
  
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      animationState.running = true;
      btnStart.classList.add('active');
      btnPause.classList.remove('active');
      if (callbacks.onStart) callbacks.onStart();
    });
  }
  
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      animationState.running = false;
      btnPause.classList.add('active');
      btnStart.classList.remove('active');
      if (callbacks.onPause) callbacks.onPause();
    });
  }
  
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (callbacks.onReset) callbacks.onReset();
    });
  }
  
  if (btnFlip) {
    btnFlip.addEventListener('click', () => {
      animationState.isFlipped = !animationState.isFlipped;
      btnFlip.textContent = animationState.isFlipped ? '🔄 Flip Back' : '🔄 Flip Membrane';
      if (callbacks.onFlip) callbacks.onFlip(animationState.isFlipped);
    });
  }
  
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      if (callbacks.onResetCamera) callbacks.onResetCamera();
    });
  }
}

/**
 * Voltage controls and action potential triggers
 */
function setupVoltageControls() {
  const btnDepolarize = document.getElementById('btn-depolarize');
  const btnHyperpolarize = document.getElementById('btn-hyperpolarize');
  const voltageSlider = document.getElementById('voltage-slider');
  const voltageVal = document.getElementById('voltage-val');
  
  if (btnDepolarize) {
    btnDepolarize.addEventListener('click', () => {
      if (callbacks.onTriggerAP) callbacks.onTriggerAP();
    });
  }
  
  if (btnHyperpolarize) {
    btnHyperpolarize.addEventListener('click', () => {
      if (callbacks.onHyperpolarize) callbacks.onHyperpolarize();
    });
  }
  
  if (voltageSlider) {
    voltageSlider.addEventListener('input', (e) => {
      const voltage = parseInt(e.target.value);
      animationState.targetVoltage = voltage;
      if (voltageVal) voltageVal.textContent = voltage + ' mV';
      if (callbacks.onVoltageChange) callbacks.onVoltageChange(voltage);
    });
  }
}

/**
 * Visualization toggles and parameters
 */
function setupVisualizationControls() {
  // Lipid tails toggle
  const lipidTailsToggle = document.getElementById('lipid-tails-toggle');
  if (lipidTailsToggle) {
    lipidTailsToggle.addEventListener('change', (e) => {
      animationState.showLipidTails = e.target.checked;
      if (callbacks.onLipidTailsToggle) callbacks.onLipidTailsToggle(e.target.checked);
    });
  }
  
  // Water toggle
  const waterToggle = document.getElementById('water-toggle');
  if (waterToggle) {
    waterToggle.addEventListener('change', (e) => {
      if (callbacks.onWaterToggle) {
        callbacks.onWaterToggle(e.target.checked);
      }
    });
  }
  
  // Lipid density
  const lipidDensitySlider = document.getElementById('lipid-density-slider');
  const lipidDensityVal = document.getElementById('lipid-density-val');
  if (lipidDensitySlider) {
    lipidDensitySlider.addEventListener('input', (e) => {
      const density = parseInt(e.target.value) / 100;
      animationState.lipidDensity = density;
      if (lipidDensityVal) lipidDensityVal.textContent = e.target.value + '%';
      if (callbacks.onLipidDensityChange) callbacks.onLipidDensityChange(density);
    });
  }
  
  // Membrane flexibility
  const flexibilitySlider = document.getElementById('flexibility-slider');
  const flexibilityVal = document.getElementById('flexibility-val');
  if (flexibilitySlider) {
    flexibilitySlider.addEventListener('input', (e) => {
      const flex = parseInt(e.target.value) / 100;
      animationState.membraneFlexibility = flex;
      if (flexibilityVal) flexibilityVal.textContent = e.target.value + '%';
    });
  }
  
  // Brownian motion
  const brownianSlider = document.getElementById('brownian-slider');
  const brownianVal = document.getElementById('brownian-val');
  if (brownianSlider) {
    brownianSlider.addEventListener('input', (e) => {
      const intensity = parseInt(e.target.value) / 100;
      animationState.brownianIntensity = intensity;
      if (brownianVal) brownianVal.textContent = e.target.value + '%';
    });
  }
}

/**
 * Channel parameter controls
 */
function setupChannelControls() {
  // Nav threshold
  const navThreshSlider = document.getElementById('nav-thresh-slider');
  const navThreshVal = document.getElementById('nav-thresh-val');
  if (navThreshSlider) {
    navThreshSlider.addEventListener('input', (e) => {
      const thresh = parseInt(e.target.value);
      animationState.navThreshold = thresh;
      if (navThreshVal) navThreshVal.textContent = thresh + ' mV';
    });
  }
  
  // Nav inactivation rate
  const navInactSlider = document.getElementById('nav-inact-slider');
  const navInactVal = document.getElementById('nav-inact-val');
  if (navInactSlider) {
    navInactSlider.addEventListener('input', (e) => {
      const rate = parseInt(e.target.value) / 100;
      animationState.navInactivationRate = rate;
      if (navInactVal) navInactVal.textContent = e.target.value + '%';
    });
  }
  
  // Kv activation delay
  const kvDelaySlider = document.getElementById('kv-delay-slider');
  const kvDelayVal = document.getElementById('kv-delay-val');
  if (kvDelaySlider) {
    kvDelaySlider.addEventListener('input', (e) => {
      const delay = parseFloat(e.target.value);
      animationState.kvActivationDelay = delay;
      if (kvDelayVal) kvDelayVal.textContent = delay.toFixed(1) + ' ms';
    });
  }
  
  // Pump rate
  const pumpRateSlider = document.getElementById('pump-rate-slider');
  const pumpRateVal = document.getElementById('pump-rate-val');
  if (pumpRateSlider) {
    pumpRateSlider.addEventListener('input', (e) => {
      const rate = parseInt(e.target.value);
      animationState.pumpRate = rate;
      if (pumpRateVal) pumpRateVal.textContent = rate;
    });
  }
}

/**
 * Simulation speed controls
 */
function setupSpeedControls() {
  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const exponent = parseFloat(e.target.value);
      const speed = Math.pow(10, exponent);
      animationState.speed = speed;
      
      // Format display
      let displayText;
      if (speed < 0.01) {
        displayText = (speed * 1000).toFixed(1) + 'ms/s';
      } else if (speed < 1) {
        displayText = speed.toFixed(2) + 'x (slow)';
      } else if (speed < 10) {
        displayText = speed.toFixed(1) + 'x';
      } else if (speed < 100) {
        displayText = Math.round(speed) + 'x';
      } else {
        displayText = Math.round(speed) + 'x (fast)';
      }
      
      if (speedVal) speedVal.textContent = displayText;
    });
  }
}

/**
 * Update UI displays based on current state
 */
export function updateUI(state) {
  // Update voltage display
  const voltageDisplay = document.getElementById('membrane-voltage');
  if (voltageDisplay) {
    voltageDisplay.innerHTML = Math.round(state.voltage) + '<span class="unit">mV</span>';
    
    // Color based on voltage
    if (state.voltage > 0) {
      voltageDisplay.style.color = '#ff4757';
      voltageDisplay.style.textShadow = '0 0 30px rgba(255, 71, 87, 0.6)';
    } else if (state.voltage > -55) {
      voltageDisplay.style.color = '#fed330';
      voltageDisplay.style.textShadow = '0 0 30px rgba(254, 211, 48, 0.6)';
    } else {
      voltageDisplay.style.color = '#00d4ff';
      voltageDisplay.style.textShadow = '0 0 30px rgba(0, 212, 255, 0.6)';
    }
  }
  
  // Update voltage marker position
  const voltageMarker = document.getElementById('voltage-marker');
  if (voltageMarker) {
    // Map -90 to +50 → 0% to 100%
    const percent = ((state.voltage + 90) / 140) * 100;
    voltageMarker.style.left = Math.max(0, Math.min(100, percent)) + '%';
  }
  
  // Update phase indicator
  const phaseIndicator = document.getElementById('phase-indicator');
  if (phaseIndicator) {
    phaseIndicator.textContent = state.phaseLabel;
    
    // Color based on phase
    if (state.voltage > 0) {
      phaseIndicator.style.color = '#ff4757';
    } else if (state.voltage > -55) {
      phaseIndicator.style.color = '#fed330';
    } else if (state.voltage < -75) {
      phaseIndicator.style.color = '#3867d6';
    } else {
      phaseIndicator.style.color = '#26de81';
    }
  }
  
  // Update channel counts
  const naOpenCount = document.getElementById('na-open-count');
  if (naOpenCount) {
    naOpenCount.textContent = state.navOpen + ' / ' + state.navTotal;
  }
  
  const kOpenCount = document.getElementById('k-open-count');
  if (kOpenCount) {
    kOpenCount.textContent = state.kvOpen + ' / ' + state.kvTotal;
  }
  
  const pumpCount = document.getElementById('pump-count');
  if (pumpCount) {
    pumpCount.textContent = state.pumpsActive + ' cycling';
  }
  
  // Update ATP count
  const atpCount = document.getElementById('atp-count');
  if (atpCount) {
    atpCount.textContent = state.atpCount;
  }
  
  // Update stats
  const fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.textContent = state.fps;
  
  const lipidCountEl = document.getElementById('lipid-count');
  if (lipidCountEl) lipidCountEl.textContent = state.lipidCount;
  
  const ionCountEl = document.getElementById('ion-count');
  if (ionCountEl) ionCountEl.textContent = state.ionCount;
  
  const simTimeEl = document.getElementById('sim-time');
  if (simTimeEl) simTimeEl.textContent = state.simTime.toFixed(2);
}

/**
 * Update voltage slider to match current voltage
 */
export function syncVoltageSlider(voltage) {
  const slider = document.getElementById('voltage-slider');
  const val = document.getElementById('voltage-val');
  
  if (slider) {
    slider.value = voltage;
  }
  if (val) {
    val.textContent = Math.round(voltage) + ' mV';
  }
}
