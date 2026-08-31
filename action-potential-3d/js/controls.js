/**
 * controls.js - UI event handlers and control panel setup
 */

/**
 * Setup all UI controls with callbacks
 * @param {Object} callbacks - Object containing callback functions
 */
export function setupControls(callbacks) {
  // Animation controls
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnReset = document.getElementById('btn-reset');
  const btnResetCam = document.getElementById('btn-reset-cam');
  
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      if (callbacks.onStart) callbacks.onStart();
    });
  }
  
  if (btnStop) {
    btnStop.addEventListener('click', () => {
      if (callbacks.onStop) callbacks.onStop();
    });
  }
  
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (callbacks.onReset) callbacks.onReset();
    });
  }
  
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      if (callbacks.onResetCamera) callbacks.onResetCamera();
    });
  }
  
  // Loop checkbox
  const loopCheckbox = document.getElementById('loop-checkbox');
  if (loopCheckbox) {
    loopCheckbox.addEventListener('change', (e) => {
      if (callbacks.onLoopChange) callbacks.onLoopChange(e.target.checked);
    });
  }
  
  // Myelination toggle
  const myelinToggle = document.getElementById('myelin-toggle');
  if (myelinToggle) {
    myelinToggle.addEventListener('change', (e) => {
      if (callbacks.onMyelinToggle) callbacks.onMyelinToggle(e.target.checked);
    });
  }
  
  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      if (callbacks.onSpeedChange) callbacks.onSpeedChange(e.target.value);
    });
  }
  
  // Synaptic input buttons
  const btnExcite = document.getElementById('btn-excite');
  const btnInhibit = document.getElementById('btn-inhibit');
  
  if (btnExcite) {
    btnExcite.addEventListener('click', () => {
      if (callbacks.onExcite) callbacks.onExcite();
    });
  }
  
  if (btnInhibit) {
    btnInhibit.addEventListener('click', () => {
      if (callbacks.onInhibit) callbacks.onInhibit();
    });
  }
  
  // EPSP/IPSP rate sliders
  const epspSlider = document.getElementById('epsp-rate-slider');
  if (epspSlider) {
    epspSlider.addEventListener('input', (e) => {
      if (callbacks.onEpspRateChange) callbacks.onEpspRateChange(e.target.value);
    });
  }
  
  const ipspSlider = document.getElementById('ipsp-rate-slider');
  if (ipspSlider) {
    ipspSlider.addEventListener('input', (e) => {
      if (callbacks.onIpspRateChange) callbacks.onIpspRateChange(e.target.value);
    });
  }
  
  // Extracellular ion toggle
  const extracellularToggle = document.getElementById('extracellular-toggle');
  if (extracellularToggle) {
    extracellularToggle.addEventListener('change', (e) => {
      if (callbacks.onExtracellularToggle) callbacks.onExtracellularToggle(e.target.checked);
    });
  }
  
  // Ion opacity sliders
  const naOpacitySlider = document.getElementById('na-opacity-slider');
  if (naOpacitySlider) {
    naOpacitySlider.addEventListener('input', (e) => {
      if (callbacks.onIonOpacityChange) callbacks.onIonOpacityChange('Na', e.target.value);
    });
  }
  
  const kOpacitySlider = document.getElementById('k-opacity-slider');
  if (kOpacitySlider) {
    kOpacitySlider.addEventListener('input', (e) => {
      if (callbacks.onIonOpacityChange) callbacks.onIonOpacityChange('K', e.target.value);
    });
  }
  
  const clOpacitySlider = document.getElementById('cl-opacity-slider');
  if (clOpacitySlider) {
    clOpacitySlider.addEventListener('input', (e) => {
      if (callbacks.onIonOpacityChange) callbacks.onIonOpacityChange('Cl', e.target.value);
    });
  }
  
  const caOpacitySlider = document.getElementById('ca-opacity-slider');
  if (caOpacitySlider) {
    caOpacitySlider.addEventListener('input', (e) => {
      if (callbacks.onIonOpacityChange) callbacks.onIonOpacityChange('Ca', e.target.value);
    });
  }
  
  // Channel density sliders
  const naDensitySlider = document.getElementById('na-density-slider');
  if (naDensitySlider) {
    naDensitySlider.addEventListener('input', (e) => {
      if (callbacks.onChannelDensityChange) callbacks.onChannelDensityChange('Na', e.target.value);
    });
  }
  
  const kDensitySlider = document.getElementById('k-density-slider');
  if (kDensitySlider) {
    kDensitySlider.addEventListener('input', (e) => {
      if (callbacks.onChannelDensityChange) callbacks.onChannelDensityChange('K', e.target.value);
    });
  }
  
  // Propagation speed slider
  const propSpeedSlider = document.getElementById('prop-speed-slider');
  if (propSpeedSlider) {
    propSpeedSlider.addEventListener('input', (e) => {
      if (callbacks.onPropSpeedChange) callbacks.onPropSpeedChange(e.target.value);
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        if (callbacks.onStart) callbacks.onStart();
        break;
      case 'p':
        if (callbacks.onStop) callbacks.onStop();
        break;
      case 'r':
        if (callbacks.onReset) callbacks.onReset();
        break;
      case 'e':
        if (callbacks.onExcite) callbacks.onExcite();
        break;
      case 'i':
        if (callbacks.onInhibit) callbacks.onInhibit();
        break;
      case 'm':
        const toggle = document.getElementById('myelin-toggle');
        if (toggle) {
          toggle.checked = !toggle.checked;
          if (callbacks.onMyelinToggle) callbacks.onMyelinToggle(toggle.checked);
        }
        break;
    }
  });
}
