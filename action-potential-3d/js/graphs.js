/**
 * graphs.js - Graph drawing functions
 */

import {
  animationState, THRESHOLD, AXON_LENGTH, AXON_START, AXON_END,
  SOMA_POS, SOMA_RADIUS, HILLOCK_LENGTH, SALTATORY_SPEED_MULTIPLIER,
  apTimingData
} from './config.js';
import { getAxonVoltage } from './neuron-unmyelinated.js';
import { getMyelinatedAxonVoltage } from './neuron-myelinated.js';

// Access myelinated AP state from window (set by main.js)
const getMyelAPTriggered = () => window.myelAPTriggered || false;
const getMyelAPStartTime = () => window.myelAPStartTime || -1;
import { hillockVoltage } from './synaptic.js';

// Graph state - AP traces storage for overlaid display
const apTraces = [];  // Array of complete AP traces [{points: [], startTime: x}]
const MAX_AP_TRACES = 8;  // Keep up to 8 past APs for overlay

// Time range constants for AP waveform graph
// t=0 is when AP arrives at electrode (voltage starts rising)
const AP_GRAPH_T_MIN = -0.1;   // 100ms before AP arrival
const AP_GRAPH_T_MAX = 0.5;    // 500ms after AP arrival
const AP_GRAPH_T_RANGE = AP_GRAPH_T_MAX - AP_GRAPH_T_MIN;  // 600ms total

// Rolling buffer for continuous voltage recording (to capture pre-AP baseline)
const BUFFER_DURATION = 0.15;  // 150ms of history (enough for -100ms baseline)
const BUFFER_SAMPLE_RATE = 0.001;  // Sample every 1ms = 1000Hz for smooth waveform
const BUFFER_SIZE = Math.ceil(BUFFER_DURATION / BUFFER_SAMPLE_RATE);  // ~150 samples
const voltageBuffer = [];  // Circular buffer: [{t: absoluteTime, v: voltage}, ...]
let lastBufferSampleTime = 0;

// Current AP recording state
let currentAPTrace = [];
let isRecordingAP = false;
let peakRecorded = false;
let peakVoltage = -70;
let lastRecordTime = 0;
let apArrivalTime = -1;  // Time when AP arrived (t=0 reference)

const hillockGraphHistory = [];
const myelHillockGraphHistory = [];
const HILLOCK_GRAPH_MAX_POINTS = 500;  // More points for smoother trace
const HILLOCK_SAMPLE_INTERVAL = 0.01; // Faster sampling (100Hz) to catch AP peaks
let hillockGraphLastSample = 0;

// AP peak tracking for consistent all-or-none peaks
let lastUnmyelAPId = -1;  // Track which AP we've recorded the peak for
let lastMyelAPId = -1;
let unmyelPeakPending = false;  // Need to record a +40mV peak
let myelPeakPending = false;

// Myelinated hillock voltage
let myelHillockVoltage = -70;

/**
 * Set myelinated hillock voltage for graph
 */
export function setMyelHillockVoltage(v) {
  myelHillockVoltage = v;
}

/**
 * Get graph state for external updates
 */
export function getGraphState() {
  return {
    apTraces,
    currentAPTrace,
    hillockGraphHistory,
    myelHillockGraphHistory,
    hillockGraphLastSample,
    isRecordingAP,
    peakVoltage
  };
}

/**
 * Reset all graph state
 */
export function resetGraphs() {
  apTraces.length = 0;
  currentAPTrace.length = 0;
  voltageBuffer.length = 0;
  hillockGraphHistory.length = 0;
  myelHillockGraphHistory.length = 0;
  isRecordingAP = false;
  peakRecorded = false;
  peakVoltage = -70;
  lastRecordTime = 0;
  lastBufferSampleTime = 0;
  apArrivalTime = -1;
  hillockGraphLastSample = 0;
  // Reset AP peak tracking
  lastUnmyelAPId = -1;
  lastMyelAPId = -1;
  unmyelPeakPending = false;
  myelPeakPending = false;
}

/**
 * Draw the AP waveform graph with overlaid decaying traces
 * Most recent AP is thickest/brightest, older APs fade toward background
 * Records when wave REACHES electrode, not when AP fires
 */
export function drawAPGraph(electrodeVoltage) {
  const canvas = document.getElementById('ap-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const time = animationState.time;
  
  // Get electrode position and current voltage
  const electrodePos = document.getElementById('electrode-slider')?.value || 50;
  const electrodeX = AXON_START + (parseFloat(electrodePos) / 100) * AXON_LENGTH;
  const actualVoltage = getAxonVoltage(electrodeX, time);
  
  // === CONTINUOUS ROLLING BUFFER ===
  // Always record voltage to buffer (so we can look back when AP arrives)
  if (time - lastBufferSampleTime >= BUFFER_SAMPLE_RATE) {
    voltageBuffer.push({ t: time, v: actualVoltage });
    // Keep buffer size limited (circular buffer behavior)
    while (voltageBuffer.length > BUFFER_SIZE) {
      voltageBuffer.shift();
    }
    lastBufferSampleTime = time;
  }
  
  // === AP DETECTION AND RECORDING ===
  // Detect when AP arrives at electrode (voltage crosses above -60mV)
  if (!isRecordingAP && actualVoltage > -60 && animationState.apTriggered) {
    // AP is arriving - start recording
    isRecordingAP = true;
    peakRecorded = false;
    peakVoltage = -70;
    apArrivalTime = time;  // This is t=0
    lastRecordTime = time;
    
    // GRAB PRE-AP BASELINE FROM BUFFER
    // Convert buffer samples to negative time relative to AP arrival
    currentAPTrace.length = 0;
    voltageBuffer.forEach(sample => {
      const relativeTime = sample.t - apArrivalTime;  // Negative (before arrival)
      if (relativeTime >= AP_GRAPH_T_MIN && relativeTime < 0) {
        currentAPTrace.push({ t: relativeTime, v: sample.v });
      }
    });
  }
  
  // Record voltage during AP (positive time after arrival)
  if (isRecordingAP) {
    const timeSinceArrival = time - apArrivalTime;
    
    // Sample at ~1000Hz (every 1ms) for smooth waveform, or when peak is exceeded
    if (time - lastRecordTime >= 0.001 || actualVoltage > peakVoltage) {
      currentAPTrace.push({
        t: timeSinceArrival,
        v: actualVoltage
      });
      lastRecordTime = time;
      
      // Track peak
      if (actualVoltage > peakVoltage) {
        peakVoltage = actualVoltage;
        peakRecorded = true;
      }
    }
    
    // Stop recording after peak and return to near-resting, or after timeout
    const fullyRecovered = peakRecorded && actualVoltage > -72 && actualVoltage < -68;
    const timeout = timeSinceArrival > AP_GRAPH_T_MAX;
    
    if (fullyRecovered || timeout) {
      // Save trace if we captured a valid AP (peak > 0mV)
      if (currentAPTrace.length > 5 && peakVoltage > 0) {
        apTraces.push({
          points: [...currentAPTrace],
          peakV: peakVoltage,
          timestamp: time
        });
        while (apTraces.length > MAX_AP_TRACES) {
          apTraces.shift();
        }
      }
      isRecordingAP = false;
      currentAPTrace.length = 0;
    }
  }

  // Clear with dark background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fillRect(0, 0, w, h);

  // Voltage range: -90 to +50mV
  const vMin = -90;
  const vMax = 50;
  const vRange = vMax - vMin;
  
  // Time range for X axis - use module-level constants
  const tMin = AP_GRAPH_T_MIN;
  const tMax = AP_GRAPH_T_MAX;
  const tRange = AP_GRAPH_T_RANGE;

  // Draw grid lines
  ctx.strokeStyle = 'rgba(100, 120, 140, 0.2)';
  ctx.lineWidth = 0.5;
  for (let v = -80; v <= 40; v += 20) {
    const y = h - ((v - vMin) / vRange) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw threshold line
  ctx.strokeStyle = 'rgba(255, 184, 107, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 2]);
  const threshY = h - ((-55 - vMin) / vRange) * h;
  ctx.beginPath();
  ctx.moveTo(0, threshY);
  ctx.lineTo(w, threshY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw resting potential line
  ctx.strokeStyle = 'rgba(122, 225, 255, 0.4)';
  const restY = h - ((-70 - vMin) / vRange) * h;
  ctx.beginPath();
  ctx.moveTo(0, restY);
  ctx.lineTo(w, restY);
  ctx.stroke();

  // Draw overlaid AP traces - oldest first (so newest is on top)
  const totalTraces = apTraces.length + (currentAPTrace.length > 1 ? 1 : 0);
  
  // Draw old completed traces (fading)
  apTraces.forEach((trace, traceIdx) => {
    if (trace.points.length < 2) return;
    
    // Calculate fade: older traces are more faded
    const age = apTraces.length - traceIdx; // 1 for oldest, apTraces.length for newest completed
    const fadeRatio = (traceIdx + 1) / (apTraces.length + 1); // 0 to 1, higher = newer
    
    // Line thickness: newest = 3, oldest = 0.5
    const lineWidth = 0.5 + fadeRatio * 2.5;
    
    // Color: fade from bright green to dim cyan-gray
    const r = Math.floor(40 + fadeRatio * 40);  // 40-80
    const g = Math.floor(80 + fadeRatio * 127); // 80-207
    const b = Math.floor(80 + fadeRatio * 22);  // 80-102
    const alpha = 0.3 + fadeRatio * 0.5; // 0.3-0.8
    
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    
    let started = false;
    trace.points.forEach((pt) => {
      // Map time from [tMin, tMax] to [0, w]
      const x = ((pt.t - tMin) / tRange) * w;
      const y = h - ((Math.max(vMin, Math.min(vMax, pt.v)) - vMin) / vRange) * h;
      if (x >= 0 && x <= w) {
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
  });

  // Draw current AP trace (brightest, thickest)
  if (currentAPTrace.length > 1) {
    ctx.strokeStyle = '#51cf66';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#51cf66';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    
    let started = false;
    currentAPTrace.forEach((pt, i) => {
      // Map time from [tMin, tMax] to [0, w]
      const x = ((pt.t - tMin) / tRange) * w;
      const y = h - ((Math.max(vMin, Math.min(vMax, pt.v)) - vMin) / vRange) * h;
      if (x >= 0 && x <= w) {
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Labels
  ctx.fillStyle = '#9fb0c3';
  ctx.font = '9px sans-serif';
  ctx.fillText('+40mV', 2, 12);
  ctx.fillText('0mV', 2, h - ((0 - vMin) / vRange) * h + 3);
  ctx.fillText('thresh', w - 32, threshY - 2);
  ctx.fillText('-70mV', 2, restY + 10);
  ctx.fillText('-90mV', 2, h - 3);
  
  // Draw t=0 marker (AP arrival time)
  const t0X = ((0 - tMin) / tRange) * w;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(t0X, 0);
  ctx.lineTo(t0X, h);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Time labels
  ctx.fillText(`${Math.round(tMin * 1000)}ms`, 2, h - 3);
  ctx.fillText('0', t0X - 3, h - 3);  // Mark t=0
  ctx.fillText(`${Math.round(tMax * 1000)}ms`, w - 30, h - 3);
  
  // AP count indicator
  if (apTraces.length > 0 || currentAPTrace.length > 0) {
    ctx.fillStyle = '#51cf66';
    ctx.fillText(`APs: ${apTraces.length + (currentAPTrace.length > 1 ? 1 : 0)}`, w - 35, 24);
  }
}

/**
 * Draw the hillock voltage graph (long-scale with oscillations and AP spikes)
 */
export function drawHillockGraph() {
  const canvas = document.getElementById('hillock-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Sample and record voltage at regular intervals
  if (animationState.time - hillockGraphLastSample > HILLOCK_SAMPLE_INTERVAL) {
    // Record UNMYELINATED voltage
    let recordedVoltage = hillockVoltage;
    const hillockX = SOMA_POS.x + SOMA_RADIUS + HILLOCK_LENGTH / 2;

    // Track AP events using start time as unique ID
    const currentUnmyelAPId = animationState.apTriggered ? animationState.apStartTime : -1;
    
    // KEY: During AP passage through hillock, use the calculated AP voltage
    // APs always have the same peak (+40mV) - it's all-or-none
    if (animationState.apTriggered && animationState.apStartTime >= 0) {
      const timeSinceAP = animationState.time - animationState.apStartTime;
      const waveSpeed = 50 * (animationState.propSpeed / 100);
      const wavePos = AXON_START + timeSinceAP * waveSpeed;

      // Detect new AP arriving at hillock
      if (currentUnmyelAPId !== lastUnmyelAPId && Math.abs(wavePos - hillockX) < 15) {
        unmyelPeakPending = true;
        lastUnmyelAPId = currentUnmyelAPId;
      }

      // Get the actual AP voltage at hillock
      if (Math.abs(wavePos - hillockX) < 15) {
        const apVoltage = getAxonVoltage(hillockX, animationState.time);
        
        // If we have a pending peak and voltage is rising toward peak, inject +40mV
        if (unmyelPeakPending && apVoltage > 20) {
          recordedVoltage = 40;  // All-or-none: always +40mV peak
          unmyelPeakPending = false;
        } else if (apVoltage > recordedVoltage) {
          recordedVoltage = apVoltage;
        }
      }
    }

    hillockGraphHistory.push(recordedVoltage);
    if (hillockGraphHistory.length > HILLOCK_GRAPH_MAX_POINTS) {
      hillockGraphHistory.shift();
    }

    // Record MYELINATED voltage (if enabled)
    if (animationState.showMyelinatedNeuron) {
      let myelRecordedVoltage = myelHillockVoltage;
      
      const currentMyelAPId = getMyelAPTriggered() ? getMyelAPStartTime() : -1;

      if (getMyelAPTriggered() && getMyelAPStartTime() >= 0) {
        const timeSinceAP = animationState.time - getMyelAPStartTime();
        const myelWaveSpeed = 50 * (animationState.propSpeed / 100) * SALTATORY_SPEED_MULTIPLIER;
        const wavePos = AXON_START + timeSinceAP * myelWaveSpeed;

        // Detect new AP arriving at hillock
        if (currentMyelAPId !== lastMyelAPId && Math.abs(wavePos - hillockX) < 20) {
          myelPeakPending = true;
          lastMyelAPId = currentMyelAPId;
        }

        // Get the actual AP voltage at hillock
        if (Math.abs(wavePos - hillockX) < 20) {
          const apVoltage = getMyelinatedAxonVoltage(hillockX, animationState.time);
          
          // If we have a pending peak and voltage is rising toward peak, inject +40mV
          if (myelPeakPending && apVoltage > 20) {
            myelRecordedVoltage = 40;  // All-or-none: always +40mV peak
            myelPeakPending = false;
          } else if (apVoltage > myelRecordedVoltage) {
            myelRecordedVoltage = apVoltage;
          }
        }
      }

      myelHillockGraphHistory.push(myelRecordedVoltage);
      if (myelHillockGraphHistory.length > HILLOCK_GRAPH_MAX_POINTS) {
        myelHillockGraphHistory.shift();
      }
    }

    hillockGraphLastSample = animationState.time;
  }

  // Clear with dark background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, w, h);

  // Voltage range: -90mV to +50mV (to show APs)
  const vMin = -90;
  const vMax = 50;
  const vRange = vMax - vMin;

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 184, 107, 0.1)';
  ctx.lineWidth = 0.5;
  
  const gridVoltages = [-90, -70, -55, -40, 0, 40];
  gridVoltages.forEach(v => {
    const y = h - ((v - vMin) / vRange) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  // Resting potential line (-70mV)
  ctx.strokeStyle = 'rgba(122, 225, 255, 0.3)';
  ctx.setLineDash([2, 4]);
  const restY = h - ((-70 - vMin) / vRange) * h;
  ctx.beginPath();
  ctx.moveTo(0, restY);
  ctx.lineTo(w, restY);
  ctx.stroke();

  // Threshold line (-55mV) - prominent
  ctx.strokeStyle = 'rgba(255, 184, 107, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 2]);
  const threshY = h - ((-55 - vMin) / vRange) * h;
  ctx.beginPath();
  ctx.moveTo(0, threshY);
  ctx.lineTo(w, threshY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw MYELINATED voltage trace FIRST (so unmyelinated is on top)
  if (animationState.showMyelinatedNeuron && myelHillockGraphHistory.length > 1) {
    ctx.strokeStyle = '#51cf66';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#51cf66';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    
    for (let i = 0; i < myelHillockGraphHistory.length; i++) {
      const x = (i / HILLOCK_GRAPH_MAX_POINTS) * w;
      const v = myelHillockGraphHistory[i];
      const y = h - ((Math.max(vMin, Math.min(vMax, v)) - vMin) / vRange) * h;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Mark myelinated APs
    for (let i = 1; i < myelHillockGraphHistory.length; i++) {
      const v = myelHillockGraphHistory[i];
      const prevV = myelHillockGraphHistory[i - 1];
      if (v > 0 && prevV <= 0) {
        const x = (i / HILLOCK_GRAPH_MAX_POINTS) * w;
        const y = h - ((v - vMin) / vRange) * h;
        ctx.fillStyle = '#27ae60';
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw UNMYELINATED voltage trace
  if (hillockGraphHistory.length > 1) {
    ctx.strokeStyle = '#ffb86b';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffb86b';
    ctx.shadowBlur = 3;
    ctx.beginPath();

    for (let i = 0; i < hillockGraphHistory.length; i++) {
      const x = (i / HILLOCK_GRAPH_MAX_POINTS) * w;
      const v = hillockGraphHistory[i];
      const y = h - ((Math.max(vMin, Math.min(vMax, v)) - vMin) / vRange) * h;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Mark APs with bright dots
    for (let i = 1; i < hillockGraphHistory.length; i++) {
      const v = hillockGraphHistory[i];
      const prevV = hillockGraphHistory[i - 1];
      if (v > 0 && prevV <= 0) {
        const x = (i / HILLOCK_GRAPH_MAX_POINTS) * w;
        const y = h - ((v - vMin) / vRange) * h;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Current point marker (unmyelinated)
    const lastIdx = hillockGraphHistory.length - 1;
    const lastX = (lastIdx / HILLOCK_GRAPH_MAX_POINTS) * w;
    const lastV = hillockGraphHistory[lastIdx];
    const lastY = h - ((Math.max(vMin, Math.min(vMax, lastV)) - vMin) / vRange) * h;

    ctx.fillStyle = lastV > -55 ? '#51cf66' : '#ffb86b';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Labels
  ctx.fillStyle = '#9fb0c3';
  ctx.font = '8px sans-serif';
  ctx.fillText('+40', 2, 10);
  ctx.fillText('0', 2, h * 0.36);
  ctx.fillStyle = '#ffb86b';
  ctx.fillText('-55', 2, threshY - 2);
  ctx.fillStyle = '#7ae1ff';
  ctx.fillText('-70', 2, restY - 2);
  ctx.fillStyle = '#9fb0c3';
  ctx.fillText('-90', 2, h - 3);

  // Draw "Threshold" label
  ctx.fillStyle = 'rgba(255, 184, 107, 0.8)';
  ctx.font = '9px sans-serif';
  ctx.fillText('threshold', w - 45, threshY - 3);
}

/**
 * Draw speed comparison graph
 */
export function drawSpeedComparisonGraph() {
  const canvas = document.getElementById('speed-comparison-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, w, h);

  const unmyelDelays = apTimingData.unmyelinated.delays;
  const myelDelays = apTimingData.myelinated.delays;

  if (unmyelDelays.length === 0 && myelDelays.length === 0) {
    ctx.fillStyle = '#9fb0c3';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for action potentials...', w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }

  const allDelays = [...unmyelDelays, ...myelDelays];
  const maxDelay = Math.max(50, ...allDelays) * 1.1;
  const maxSamples = Math.max(unmyelDelays.length, myelDelays.length, 5);

  // Draw grid
  ctx.strokeStyle = 'rgba(122, 225, 255, 0.15)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = h - (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = '#9fb0c3';
    ctx.font = '8px sans-serif';
    const delayLabel = Math.round((i / 4) * maxDelay);
    ctx.fillText(delayLabel + 'ms', 2, y - 2);
  }

  // Draw unmyelinated line (red)
  if (unmyelDelays.length > 0) {
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 3;
    ctx.beginPath();

    for (let i = 0; i < unmyelDelays.length; i++) {
      const x = (i / (maxSamples - 1)) * (w - 20) + 10;
      const y = h - (unmyelDelays[i] / maxDelay) * (h - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff6b6b';
    for (let i = 0; i < unmyelDelays.length; i++) {
      const x = (i / (maxSamples - 1)) * (w - 20) + 10;
      const y = h - (unmyelDelays[i] / maxDelay) * (h - 10);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw myelinated line (green)
  if (myelDelays.length > 0) {
    ctx.strokeStyle = '#51cf66';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#51cf66';
    ctx.shadowBlur = 3;
    ctx.beginPath();

    for (let i = 0; i < myelDelays.length; i++) {
      const x = (i / (maxSamples - 1)) * (w - 20) + 10;
      const y = h - (myelDelays[i] / maxDelay) * (h - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#51cf66';
    for (let i = 0; i < myelDelays.length; i++) {
      const x = (i / (maxSamples - 1)) * (w - 20) + 10;
      const y = h - (myelDelays[i] / maxDelay) * (h - 10);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw average lines
  if (unmyelDelays.length > 1) {
    const avgY = h - (apTimingData.unmyelinated.avgDelay / maxDelay) * (h - 10);
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, avgY);
    ctx.lineTo(w, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (myelDelays.length > 1) {
    const avgY = h - (apTimingData.myelinated.avgDelay / maxDelay) * (h - 10);
    ctx.strokeStyle = 'rgba(81, 207, 102, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, avgY);
    ctx.lineTo(w, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Update display values
  const unmyelDisplay = document.getElementById('unmyel-delay');
  const myelDisplay = document.getElementById('myel-delay');
  const ratioDisplay = document.getElementById('speed-ratio');
  const apCountLabel = document.getElementById('ap-count-label');
  
  if (unmyelDisplay) unmyelDisplay.textContent = unmyelDelays.length > 0 ? apTimingData.unmyelinated.avgDelay.toFixed(1) : '--';
  if (myelDisplay) myelDisplay.textContent = myelDelays.length > 0 ? apTimingData.myelinated.avgDelay.toFixed(1) : '--';
  
  if (ratioDisplay && unmyelDelays.length > 0 && myelDelays.length > 0) {
    const ratio = apTimingData.unmyelinated.avgDelay / apTimingData.myelinated.avgDelay;
    ratioDisplay.textContent = ratio.toFixed(1);
  }
  
  if (apCountLabel) apCountLabel.textContent = 'AP #' + Math.max(unmyelDelays.length, myelDelays.length);
}

/**
 * Draw timing comparison graph
 */
export function drawTimingGraph() {
  const canvas = document.getElementById('timing-graph');
  if (!canvas || !animationState.showMyelinatedNeuron) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, w, h);

  // Layout
  const leftMargin = 8;
  const rightMargin = 8;
  const topMargin = 20;
  const bottomMargin = 8;
  const plotW = w - leftMargin - rightMargin;
  const plotH = h - topMargin - bottomMargin;

  // Calculate current AP positions (0 to 1 along axon)
  const unmyelWaveSpeed = 50 * (animationState.propSpeed / 100);
  const myelWaveSpeed = unmyelWaveSpeed * SALTATORY_SPEED_MULTIPLIER;

  let unmyelPos = 0;
  let myelPos = 0;

  if (animationState.apTriggered) {
    const timeSinceAP = animationState.time - animationState.apStartTime;
    unmyelPos = Math.min(1, (timeSinceAP * unmyelWaveSpeed) / AXON_LENGTH);
  }

  if (getMyelAPTriggered()) {
    const timeSinceAP = animationState.time - getMyelAPStartTime();
    myelPos = Math.min(1, (timeSinceAP * myelWaveSpeed) / AXON_LENGTH);
  }

  // Draw Y-axis labels
  ctx.fillStyle = '#9fb0c3';
  ctx.font = '8px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('0%', leftMargin, topMargin - 2);
  ctx.textAlign = 'right';
  ctx.fillText('100%', w - rightMargin, topMargin - 2);
  ctx.textAlign = 'center';
  ctx.fillText('50%', w / 2, topMargin - 2);

  // Draw horizontal track lines
  const unmyelY = topMargin + plotH * 0.3;
  const myelY = topMargin + plotH * 0.7;

  // Unmyelinated track (orange)
  ctx.strokeStyle = 'rgba(255, 184, 107, 0.3)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(leftMargin, unmyelY);
  ctx.lineTo(w - rightMargin, unmyelY);
  ctx.stroke();

  // Myelinated track (green)
  ctx.strokeStyle = 'rgba(81, 207, 102, 0.3)';
  ctx.beginPath();
  ctx.moveTo(leftMargin, myelY);
  ctx.lineTo(w - rightMargin, myelY);
  ctx.stroke();

  // Draw progress fill for unmyelinated
  if (unmyelPos > 0) {
    ctx.strokeStyle = 'rgba(255, 184, 107, 0.6)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(leftMargin, unmyelY);
    ctx.lineTo(leftMargin + unmyelPos * plotW, unmyelY);
    ctx.stroke();
  }

  // Draw progress fill for myelinated
  if (myelPos > 0) {
    ctx.strokeStyle = 'rgba(81, 207, 102, 0.6)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(leftMargin, myelY);
    ctx.lineTo(leftMargin + myelPos * plotW, myelY);
    ctx.stroke();
  }

  // Draw moving dots for current AP position
  const unmyelDotX = leftMargin + unmyelPos * plotW;
  ctx.fillStyle = unmyelPos > 0 ? '#ff6b6b' : 'rgba(255, 107, 107, 0.3)';
  ctx.beginPath();
  ctx.arc(unmyelDotX, unmyelY, 6, 0, Math.PI * 2);
  ctx.fill();

  const myelDotX = leftMargin + myelPos * plotW;
  ctx.fillStyle = myelPos > 0 ? '#51cf66' : 'rgba(81, 207, 102, 0.3)';
  ctx.beginPath();
  ctx.arc(myelDotX, myelY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Labels
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb86b';
  ctx.font = '9px sans-serif';
  ctx.fillText('Unmyel', leftMargin, unmyelY + 15);
  ctx.fillStyle = '#51cf66';
  ctx.fillText('Myel', leftMargin, myelY + 15);

  // Speed ratio indicator
  if (unmyelPos > 0.1 && myelPos > 0.1) {
    ctx.fillStyle = '#9fb0c3';
    ctx.textAlign = 'right';
    ctx.font = '10px sans-serif';
    const ratio = myelPos / Math.max(0.01, unmyelPos);
    ctx.fillText(`${ratio.toFixed(1)}x faster`, w - rightMargin, h - 2);
  }
}
