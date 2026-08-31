/**
 * graphs.js - Real-time graphs for voltage and concentration
 * 
 * Displays:
 * - Presynaptic voltage and Ca2+ concentration
 * - Postsynaptic potential (EPSP/IPSP)
 * - Cleft neurotransmitter concentration and receptor binding
 */

import { animationState, graphHistory, AP_PARAMS } from './config.js';

// Canvas contexts
let preCtx = null;
let postCtx = null;
let cleftCtx = null;
let ionFlowCtx = null;

// Canvas dimensions
let canvasWidth = 280;
let canvasHeight = 100;

// Colors
const COLORS = {
  background: '#0a1220',
  gridLine: 'rgba(0, 229, 255, 0.1)',
  gridMajor: 'rgba(0, 229, 255, 0.2)',
  preVoltage: '#ff6b6b',
  preCa: '#ffffff',
  postVoltage: '#4a9eff',
  threshold: '#ffa502',
  ntConc: '#ff6b6b',
  binding: '#ff9f43',
  axisLabel: 'rgba(255, 255, 255, 0.5)',
  // Ion flow colors
  ionFlowNet: '#00ff88',       // Net ion flow (green = depolarizing)
  ionFlowNa: '#ff6b6b',        // Na+ (red/pink)
  ionFlowK: '#ffd93d',         // K+ (yellow)
  ionFlowCl: '#4488ff',        // Cl- (blue)
  zeroLine: 'rgba(255, 255, 255, 0.3)',
};

/**
 * Initialize graphs
 */
export function initGraphs() {
  const preCanvas = document.getElementById('pre-graph');
  const postCanvas = document.getElementById('post-graph');
  const cleftCanvas = document.getElementById('cleft-graph');
  const ionFlowCanvas = document.getElementById('ion-flow-graph');
  
  if (preCanvas) {
    preCtx = preCanvas.getContext('2d');
    canvasWidth = preCanvas.width;
    canvasHeight = preCanvas.height;
  }
  
  if (postCanvas) {
    postCtx = postCanvas.getContext('2d');
  }
  
  if (cleftCanvas) {
    cleftCtx = cleftCanvas.getContext('2d');
  }
  
  if (ionFlowCanvas) {
    ionFlowCtx = ionFlowCanvas.getContext('2d');
  }
  
  // Initialize history arrays
  resetGraphHistory();
}

/**
 * Reset graph history
 */
export function resetGraphHistory() {
  graphHistory.preVoltage = [];
  graphHistory.preCa = [];
  graphHistory.postVoltage = [];
  graphHistory.cleftNT = [];
  graphHistory.receptorBinding = [];
  graphHistory.ionFlow = [];
  graphHistory.ionFlowNa = [];
  graphHistory.ionFlowK = [];
  graphHistory.ionFlowCl = [];
  graphHistory.lastSampleTime = 0;
}

/**
 * Sample current values for graph history
 */
export function sampleGraphData() {
  const time = animationState.simTime;
  
  // Check if it's time to sample
  if (time - graphHistory.lastSampleTime < graphHistory.sampleInterval) {
    return;
  }
  graphHistory.lastSampleTime = time;
  
  // Add samples
  graphHistory.preVoltage.push({
    time,
    value: animationState.preVoltage,
  });
  
  graphHistory.preCa.push({
    time,
    value: animationState.preCaConc * 10000, // Scale for visibility
  });
  
  graphHistory.postVoltage.push({
    time,
    value: animationState.postVoltage,
  });
  
  graphHistory.cleftNT.push({
    time,
    value: animationState.cleftGlutamate + animationState.cleftGaba,
  });
  
  graphHistory.receptorBinding.push({
    time,
    value: animationState.ampaBound + animationState.nmdaBound,
  });
  
  // Sample ion flow data (smoothed for visualization)
  const smoothedFlow = animationState.smoothedIonFlow || 0;
  const flowAccum = animationState.ionFlowAccumulator || { Na: 0, K: 0, Cl: 0, net: 0 };
  
  graphHistory.ionFlow.push({
    time,
    value: smoothedFlow,
  });
  
  graphHistory.ionFlowNa.push({
    time,
    value: flowAccum.Na || 0,
  });
  
  graphHistory.ionFlowK.push({
    time,
    value: flowAccum.K || 0,  // Negative for efflux
  });
  
  graphHistory.ionFlowCl.push({
    time,
    value: flowAccum.Cl || 0,  // Negative for inhibitory
  });
  
  // Trim to max points
  const maxPoints = graphHistory.maxPoints;
  if (graphHistory.preVoltage.length > maxPoints) {
    graphHistory.preVoltage.shift();
    graphHistory.preCa.shift();
    graphHistory.postVoltage.shift();
    graphHistory.cleftNT.shift();
    graphHistory.receptorBinding.shift();
    graphHistory.ionFlow.shift();
    graphHistory.ionFlowNa.shift();
    graphHistory.ionFlowK.shift();
    graphHistory.ionFlowCl.shift();
  }
}

/**
 * Draw all graphs
 */
export function drawGraphs() {
  drawPresynapticGraph();
  drawPostsynapticGraph();
  drawCleftGraph();
  drawIonFlowGraph();
}

/**
 * Draw presynaptic voltage and Ca2+ graph
 */
function drawPresynapticGraph() {
  if (!preCtx) return;
  
  const ctx = preCtx;
  const w = canvasWidth;
  const h = canvasHeight;
  
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  
  // Draw grid
  drawGrid(ctx, w, h);
  
  // Draw threshold line
  const thresholdY = voltageToY(-55, h, -90, 50);
  ctx.strokeStyle = COLORS.threshold;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(w, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw resting potential line
  const restingY = voltageToY(-70, h, -90, 50);
  ctx.strokeStyle = 'rgba(122, 225, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, restingY);
  ctx.lineTo(w, restingY);
  ctx.stroke();
  
  // Draw voltage trace
  if (graphHistory.preVoltage.length > 1) {
    ctx.strokeStyle = COLORS.preVoltage;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const data = graphHistory.preVoltage;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = voltageToY(data[i].value, h, -90, 50);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  
  // Draw Ca2+ trace (secondary axis)
  if (graphHistory.preCa.length > 1) {
    ctx.strokeStyle = COLORS.preCa;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    
    const data = graphHistory.preCa;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    // Ca2+ normalized 0-100 μM to 0-h
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = h - (data[i].value / 100) * h * 0.8;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  // Axis labels
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '8px monospace';
  ctx.fillText('+40', 2, 10);
  ctx.fillText('-55', 2, thresholdY - 2);
  ctx.fillText('-90', 2, h - 2);
}

/**
 * Draw postsynaptic potential graph
 */
function drawPostsynapticGraph() {
  if (!postCtx) return;
  
  const ctx = postCtx;
  const w = canvasWidth;
  const h = canvasHeight;
  
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  
  // Draw grid
  drawGrid(ctx, w, h);
  
  // PSP Y-axis range: -90mV to 0mV (physiological limits)
  // -90mV = K+ reversal (max hyperpolarization)
  // 0mV = cation reversal for AMPA/NMDA (max depolarization)
  const vMin = -90;
  const vMax = 0;
  
  // Draw AP threshold line (~-55mV at axon hillock)
  const thresholdY = voltageToY(-55, h, vMin, vMax);
  ctx.strokeStyle = COLORS.threshold;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(w, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw resting line at -70mV
  const restingY = voltageToY(-70, h, vMin, vMax);
  ctx.strokeStyle = 'rgba(74, 158, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, restingY);
  ctx.lineTo(w, restingY);
  ctx.stroke();
  
  // Draw GABA reversal line at -80mV (IPSP floor)
  const gabaRevY = voltageToY(-80, h, vMin, vMax);
  ctx.strokeStyle = 'rgba(155, 89, 182, 0.3)';
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(0, gabaRevY);
  ctx.lineTo(w, gabaRevY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw voltage trace
  if (graphHistory.postVoltage.length > 1) {
    ctx.strokeStyle = COLORS.postVoltage;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const data = graphHistory.postVoltage;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = voltageToY(data[i].value, h, vMin, vMax);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  
  // Fill EPSP regions (above resting)
  ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
  if (graphHistory.postVoltage.length > 1) {
    ctx.beginPath();
    const data = graphHistory.postVoltage;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    ctx.moveTo(0, restingY);
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = voltageToY(Math.max(-70, data[i].value), h, vMin, vMax);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, restingY);
    ctx.closePath();
    ctx.fill();
  }
  
  // Axis labels showing physiological limits
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '8px monospace';
  ctx.fillText('0', 2, 10);  // Cation reversal (AMPA/NMDA)
  ctx.fillText('-55', 2, thresholdY - 2);  // AP threshold
  ctx.fillText('-70', 2, restingY + 10);  // Resting
  ctx.fillText('-90', 2, h - 2);  // K+ reversal
}

/**
 * Draw cleft concentration and binding graph
 */
function drawCleftGraph() {
  if (!cleftCtx) return;
  
  const ctx = cleftCtx;
  const w = canvasWidth;
  const h = canvasHeight;
  
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  
  // Draw grid
  drawGrid(ctx, w, h);
  
  // Draw NT concentration trace
  if (graphHistory.cleftNT.length > 1) {
    ctx.strokeStyle = COLORS.ntConc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const data = graphHistory.cleftNT;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    // Find max for scaling
    let maxNT = 10;
    for (const d of data) {
      if (d.value > maxNT) maxNT = d.value;
    }
    maxNT = Math.max(maxNT, 50);
    
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = h - (data[i].value / maxNT) * h * 0.9;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Fill under curve
    ctx.fillStyle = 'rgba(255, 107, 107, 0.15)';
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  
  // Draw receptor binding trace
  if (graphHistory.receptorBinding.length > 1) {
    ctx.strokeStyle = COLORS.binding;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    const data = graphHistory.receptorBinding;
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const timeRange = Math.max(endTime - startTime, 100);
    
    // DYNAMIC Y-axis scaling based on actual peak in data
    let peakBinding = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i].value > peakBinding) peakBinding = data[i].value;
    }
    // Use at least 10, but scale up to fit peak with 10% headroom
    const maxBinding = Math.max(10, Math.ceil(peakBinding * 1.1));
    
    for (let i = 0; i < data.length; i++) {
      const x = ((data[i].time - startTime) / timeRange) * w;
      const y = h - (data[i].value / maxBinding) * h * 0.9;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  
  // Axis labels
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '8px monospace';
  ctx.fillText('[NT]', 2, 10);
  ctx.fillText('0', 2, h - 2);
}

/**
 * Draw ion flow graph (4th graph)
 * Shows net ion flux: Na+ influx, K+ efflux, Cl- (GABA)
 * Positive = depolarizing (Na+ in), Negative = hyperpolarizing (K+ out, Cl- in)
 */
function drawIonFlowGraph() {
  if (!ionFlowCtx) return;
  
  const ctx = ionFlowCtx;
  const w = canvasWidth;
  const h = canvasHeight;
  
  // Clear
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  
  // Draw grid
  drawGrid(ctx, w, h);
  
  // Zero line (center) - no net flow
  const zeroY = h / 2;
  ctx.strokeStyle = COLORS.zeroLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(w, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Find scaling for ion flow (dynamic based on data)
  let maxAbsFlow = 5;  // Minimum scale
  for (const d of graphHistory.ionFlow) {
    if (Math.abs(d.value) > maxAbsFlow) maxAbsFlow = Math.abs(d.value);
  }
  maxAbsFlow = Math.max(maxAbsFlow, 5) * 1.2;  // 20% headroom
  
  // Helper to convert flow value to Y coordinate
  // Positive flow (influx) = above center, Negative (efflux) = below center
  const flowToY = (flow) => {
    const normalized = flow / maxAbsFlow;  // -1 to +1
    return zeroY - normalized * (h * 0.45);  // Use 90% of height
  };
  
  // Time range setup
  const data = graphHistory.ionFlow;
  if (data.length < 2) return;
  
  const startTime = data[0].time;
  const endTime = data[data.length - 1].time;
  const timeRange = Math.max(endTime - startTime, 100);
  
  // Draw Na+ flow (red) - typically positive (influx)
  if (graphHistory.ionFlowNa.length > 1) {
    ctx.strokeStyle = COLORS.ionFlowNa;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    
    for (let i = 0; i < graphHistory.ionFlowNa.length; i++) {
      const x = ((graphHistory.ionFlowNa[i].time - startTime) / timeRange) * w;
      const y = flowToY(graphHistory.ionFlowNa[i].value);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  // Draw K+ flow (yellow) - typically negative (efflux)
  if (graphHistory.ionFlowK.length > 1) {
    ctx.strokeStyle = COLORS.ionFlowK;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    
    for (let i = 0; i < graphHistory.ionFlowK.length; i++) {
      const x = ((graphHistory.ionFlowK[i].time - startTime) / timeRange) * w;
      const y = flowToY(graphHistory.ionFlowK[i].value);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  // Draw Cl- flow (blue) - negative when GABA active (inhibitory)
  if (graphHistory.ionFlowCl.length > 1) {
    ctx.strokeStyle = COLORS.ionFlowCl;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    
    for (let i = 0; i < graphHistory.ionFlowCl.length; i++) {
      const x = ((graphHistory.ionFlowCl[i].time - startTime) / timeRange) * w;
      const y = flowToY(graphHistory.ionFlowCl[i].value);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  // Draw NET ion flow (green, thicker) - smoothed total
  if (graphHistory.ionFlow.length > 1) {
    ctx.strokeStyle = COLORS.ionFlowNet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < graphHistory.ionFlow.length; i++) {
      const x = ((graphHistory.ionFlow[i].time - startTime) / timeRange) * w;
      const y = flowToY(graphHistory.ionFlow[i].value);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Fill positive area (depolarizing)
    ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    for (let i = 0; i < graphHistory.ionFlow.length; i++) {
      const x = ((graphHistory.ionFlow[i].time - startTime) / timeRange) * w;
      const rawY = flowToY(graphHistory.ionFlow[i].value);
      const y = Math.min(rawY, zeroY);  // Only above zero line
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, zeroY);
    ctx.closePath();
    ctx.fill();
    
    // Fill negative area (hyperpolarizing)
    ctx.fillStyle = 'rgba(68, 136, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    for (let i = 0; i < graphHistory.ionFlow.length; i++) {
      const x = ((graphHistory.ionFlow[i].time - startTime) / timeRange) * w;
      const rawY = flowToY(graphHistory.ionFlow[i].value);
      const y = Math.max(rawY, zeroY);  // Only below zero line
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, zeroY);
    ctx.closePath();
    ctx.fill();
  }
  
  // Axis labels
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '8px monospace';
  ctx.fillText('Influx↑', 2, 10);
  ctx.fillText('0', 2, zeroY + 3);
  ctx.fillText('Efflux↓', 2, h - 2);
}

/**
 * Draw grid lines
 */
function drawGrid(ctx, w, h) {
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;
  
  // Horizontal lines
  const hLines = 4;
  for (let i = 1; i < hLines; i++) {
    const y = (i / hLines) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  
  // Vertical lines
  const vLines = 6;
  for (let i = 1; i < vLines; i++) {
    const x = (i / vLines) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

/**
 * Convert voltage to Y coordinate
 */
function voltageToY(voltage, height, minV, maxV) {
  const normalized = (voltage - minV) / (maxV - minV);
  return height - normalized * height;
}

/**
 * Clear all graphs
 */
export function clearGraphs() {
  if (preCtx) {
    preCtx.fillStyle = COLORS.background;
    preCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  if (postCtx) {
    postCtx.fillStyle = COLORS.background;
    postCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  if (cleftCtx) {
    cleftCtx.fillStyle = COLORS.background;
    cleftCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  if (ionFlowCtx) {
    ionFlowCtx.fillStyle = COLORS.background;
    ionFlowCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  
  resetGraphHistory();
}
