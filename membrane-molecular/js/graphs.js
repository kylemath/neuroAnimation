/**
 * graphs.js - Oscilloscope-style voltage and current displays
 * 
 * Displays:
 * - Long-term voltage trace (seconds)
 * - Short-term oscilloscope view (milliseconds)
 * - Current traces (ionic currents)
 * - Different recording mode visualizations
 */

import { recordingState, compartments, equilibriumPotentials, getElectrophysiologyState } from './electrophysiology.js';
import { animationState } from './config.js';

// Canvas references
let longTermCanvas, shortTermCanvas, currentCanvas;
let longTermCtx, shortTermCtx, currentCtx;

// Graph dimensions
const GRAPH_PADDING = 30;
const GRID_COLOR = 'rgba(0, 212, 255, 0.15)';
const AXIS_COLOR = 'rgba(0, 212, 255, 0.5)';
const TRACE_COLORS = {
  soma: '#8888ff',
  hillock: '#00ff88',
  axon: '#ff8844',
  voltage: '#00d4ff',
  extracellular: '#ffdd00',
  threshold: '#ff4444',
};

/**
 * Initialize graph canvases
 */
export function initGraphs() {
  // Long-term trace
  longTermCanvas = document.getElementById('long-term-graph');
  if (longTermCanvas) {
    longTermCtx = longTermCanvas.getContext('2d');
    setupCanvas(longTermCanvas);
  }
  
  // Short-term oscilloscope
  shortTermCanvas = document.getElementById('short-term-graph');
  if (shortTermCanvas) {
    shortTermCtx = shortTermCanvas.getContext('2d');
    setupCanvas(shortTermCanvas);
  }
  
  // Current trace
  currentCanvas = document.getElementById('current-graph');
  if (currentCanvas) {
    currentCtx = currentCanvas.getContext('2d');
    setupCanvas(currentCanvas);
  }
}

function setupCanvas(canvas) {
  // Handle high DPI displays
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}

/**
 * Draw grid and axes
 */
function drawGrid(ctx, width, height, xRange, yRange, xLabel, yLabel) {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  
  // Vertical grid lines
  const xStep = (width - GRAPH_PADDING * 2) / 10;
  for (let i = 0; i <= 10; i++) {
    const x = GRAPH_PADDING + i * xStep;
    ctx.beginPath();
    ctx.moveTo(x, GRAPH_PADDING);
    ctx.lineTo(x, height - GRAPH_PADDING);
    ctx.stroke();
  }
  
  // Horizontal grid lines
  const yStep = (height - GRAPH_PADDING * 2) / 8;
  for (let i = 0; i <= 8; i++) {
    const y = GRAPH_PADDING + i * yStep;
    ctx.beginPath();
    ctx.moveTo(GRAPH_PADDING, y);
    ctx.lineTo(width - GRAPH_PADDING, y);
    ctx.stroke();
  }
  
  // Axes
  ctx.strokeStyle = AXIS_COLOR;
  ctx.lineWidth = 2;
  
  // Y axis
  ctx.beginPath();
  ctx.moveTo(GRAPH_PADDING, GRAPH_PADDING);
  ctx.lineTo(GRAPH_PADDING, height - GRAPH_PADDING);
  ctx.stroke();
  
  // X axis
  ctx.beginPath();
  ctx.moveTo(GRAPH_PADDING, height - GRAPH_PADDING);
  ctx.lineTo(width - GRAPH_PADDING, height - GRAPH_PADDING);
  ctx.stroke();
  
  // Labels
  ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  // Y-axis labels
  const yValues = [yRange[1], (yRange[0] + yRange[1]) / 2, yRange[0]];
  yValues.forEach((val, i) => {
    const y = GRAPH_PADDING + i * (height - GRAPH_PADDING * 2) / 2;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + '', GRAPH_PADDING - 5, y + 4);
  });
  
  // Axis titles
  ctx.textAlign = 'center';
  ctx.fillText(xLabel, width / 2, height - 5);
  
  ctx.save();
  ctx.translate(10, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

/**
 * Draw a line trace
 */
function drawTrace(ctx, data, width, height, xRange, yRange, color, lineWidth = 2) {
  if (data.length < 2) return;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const graphWidth = width - GRAPH_PADDING * 2;
  const graphHeight = height - GRAPH_PADDING * 2;
  
  ctx.beginPath();
  
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const x = GRAPH_PADDING + ((point.time - xRange[0]) / (xRange[1] - xRange[0])) * graphWidth;
    const y = height - GRAPH_PADDING - ((point.voltage - yRange[0]) / (yRange[1] - yRange[0])) * graphHeight;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
}

/**
 * Draw horizontal reference line (threshold, resting, etc.)
 */
function drawReferenceLine(ctx, voltage, width, height, yRange, color, label, dashed = true) {
  const graphHeight = height - GRAPH_PADDING * 2;
  const y = height - GRAPH_PADDING - ((voltage - yRange[0]) / (yRange[1] - yRange[0])) * graphHeight;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  
  if (dashed) {
    ctx.setLineDash([5, 5]);
  }
  
  ctx.beginPath();
  ctx.moveTo(GRAPH_PADDING, y);
  ctx.lineTo(width - GRAPH_PADDING, y);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  // Label
  ctx.fillStyle = color;
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, width - GRAPH_PADDING + 3, y + 3);
}

/**
 * Draw long-term voltage trace
 */
export function drawLongTermGraph() {
  if (!longTermCtx) return;
  
  const canvas = longTermCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  // Clear
  longTermCtx.fillStyle = 'rgba(5, 8, 16, 0.95)';
  longTermCtx.fillRect(0, 0, width, height);
  
  // Time range: last 10 seconds
  const now = animationState.simTime;
  const xRange = [Math.max(0, now - 10000), now];
  const yRange = [-90, 50];
  
  // Draw grid
  drawGrid(longTermCtx, width, height, xRange, yRange, 'Time (s)', 'Vm (mV)');
  
  // Draw reference lines
  drawReferenceLine(longTermCtx, -70, width, height, yRange, 'rgba(0, 255, 136, 0.4)', 'Rest');
  drawReferenceLine(longTermCtx, -55, width, height, yRange, 'rgba(255, 68, 68, 0.4)', 'Thresh');
  drawReferenceLine(longTermCtx, equilibriumPotentials.E_Na, width, height, yRange, 'rgba(255, 71, 87, 0.3)', 'E_Na');
  drawReferenceLine(longTermCtx, equilibriumPotentials.E_K, width, height, yRange, 'rgba(254, 211, 48, 0.3)', 'E_K');
  
  // Draw trace
  drawTrace(longTermCtx, recordingState.longTermBuffer, width, height, xRange, yRange, TRACE_COLORS.voltage);
  
  // Recording mode label
  longTermCtx.fillStyle = 'rgba(0, 212, 255, 0.9)';
  longTermCtx.font = 'bold 11px monospace';
  longTermCtx.textAlign = 'left';
  longTermCtx.fillText(getRecordingModeLabel(), GRAPH_PADDING + 5, GRAPH_PADDING + 12);
  
  // Firing rate
  const state = getElectrophysiologyState();
  longTermCtx.fillText(`Rate: ${state.firingRate.toFixed(1)} Hz`, GRAPH_PADDING + 5, GRAPH_PADDING + 24);
}

/**
 * Draw short-term oscilloscope view
 */
export function drawShortTermGraph() {
  if (!shortTermCtx) return;
  
  const canvas = shortTermCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  // Clear
  shortTermCtx.fillStyle = 'rgba(5, 8, 16, 0.95)';
  shortTermCtx.fillRect(0, 0, width, height);
  
  // Time range: last 100ms
  const now = animationState.simTime;
  const xRange = [Math.max(0, now - 100), now];
  const yRange = [-90, 50];
  
  // Draw grid
  drawGrid(shortTermCtx, width, height, xRange, yRange, 'Time (ms)', 'Vm (mV)');
  
  // Draw reference lines
  drawReferenceLine(shortTermCtx, -70, width, height, yRange, 'rgba(0, 255, 136, 0.3)', '-70');
  drawReferenceLine(shortTermCtx, -55, width, height, yRange, 'rgba(255, 68, 68, 0.5)', 'Thresh');
  drawReferenceLine(shortTermCtx, 0, width, height, yRange, 'rgba(255, 255, 255, 0.2)', '0');
  
  // Draw trace with glow effect
  shortTermCtx.shadowColor = TRACE_COLORS.voltage;
  shortTermCtx.shadowBlur = 8;
  drawTrace(shortTermCtx, recordingState.shortTermBuffer, width, height, xRange, yRange, TRACE_COLORS.voltage, 2.5);
  shortTermCtx.shadowBlur = 0;
  
  // Oscilloscope label
  shortTermCtx.fillStyle = 'rgba(0, 212, 255, 0.9)';
  shortTermCtx.font = 'bold 10px monospace';
  shortTermCtx.textAlign = 'left';
  shortTermCtx.fillText('OSCILLOSCOPE', GRAPH_PADDING + 5, GRAPH_PADDING + 12);
  
  // Current voltage display
  const currentV = compartments.hillock.voltage;
  shortTermCtx.fillStyle = currentV > -55 ? '#ff4444' : '#00ff88';
  shortTermCtx.font = 'bold 14px monospace';
  shortTermCtx.textAlign = 'right';
  shortTermCtx.fillText(`${currentV.toFixed(1)} mV`, width - GRAPH_PADDING - 5, GRAPH_PADDING + 14);
}

/**
 * Draw compartmental voltage comparison
 */
export function drawCompartmentGraph() {
  if (!currentCtx) return;
  
  const canvas = currentCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  // Clear
  currentCtx.fillStyle = 'rgba(5, 8, 16, 0.95)';
  currentCtx.fillRect(0, 0, width, height);
  
  const state = getElectrophysiologyState();
  
  // Draw compartment voltage bars
  const barWidth = (width - GRAPH_PADDING * 2) / 4;
  const maxHeight = height - GRAPH_PADDING * 2;
  const yRange = [-90, 50];
  
  const compartmentData = [
    { name: 'Soma', voltage: state.soma.voltage, color: TRACE_COLORS.soma },
    { name: 'Hillock', voltage: state.hillock.voltage, color: TRACE_COLORS.hillock },
    { name: 'Axon', voltage: state.axon.voltage, color: TRACE_COLORS.axon },
  ];
  
  currentCtx.font = '9px monospace';
  currentCtx.textAlign = 'center';
  
  compartmentData.forEach((comp, i) => {
    const x = GRAPH_PADDING + (i + 0.5) * barWidth;
    const normalizedV = (comp.voltage - yRange[0]) / (yRange[1] - yRange[0]);
    const barHeight = normalizedV * maxHeight;
    const y = height - GRAPH_PADDING - barHeight;
    
    // Bar
    currentCtx.fillStyle = comp.color;
    currentCtx.globalAlpha = 0.7;
    currentCtx.fillRect(x - barWidth * 0.35, y, barWidth * 0.7, barHeight);
    currentCtx.globalAlpha = 1;
    
    // Border
    currentCtx.strokeStyle = comp.color;
    currentCtx.lineWidth = 2;
    currentCtx.strokeRect(x - barWidth * 0.35, y, barWidth * 0.7, barHeight);
    
    // Labels
    currentCtx.fillStyle = comp.color;
    currentCtx.fillText(comp.name, x, height - GRAPH_PADDING + 12);
    currentCtx.fillText(`${comp.voltage.toFixed(0)}mV`, x, y - 5);
  });
  
  // Threshold line
  const threshY = height - GRAPH_PADDING - ((-55 - yRange[0]) / (yRange[1] - yRange[0])) * maxHeight;
  currentCtx.strokeStyle = 'rgba(255, 68, 68, 0.6)';
  currentCtx.setLineDash([4, 4]);
  currentCtx.beginPath();
  currentCtx.moveTo(GRAPH_PADDING, threshY);
  currentCtx.lineTo(width - GRAPH_PADDING, threshY);
  currentCtx.stroke();
  currentCtx.setLineDash([]);
  
  // Gating variables
  const gateY = 20;
  currentCtx.font = '8px monospace';
  currentCtx.fillStyle = '#888';
  currentCtx.textAlign = 'left';
  currentCtx.fillText(`m=${state.hillock.m.toFixed(2)} h=${state.hillock.h.toFixed(2)} n=${state.hillock.n.toFixed(2)}`, GRAPH_PADDING, gateY);
  
  // Title
  currentCtx.fillStyle = 'rgba(0, 212, 255, 0.9)';
  currentCtx.font = 'bold 10px monospace';
  currentCtx.textAlign = 'right';
  currentCtx.fillText('COMPARTMENTS', width - GRAPH_PADDING, gateY);
}

/**
 * Get readable label for recording mode
 */
function getRecordingModeLabel() {
  switch (recordingState.mode) {
    case 'intracellular':
      return '📍 Intracellular (Sharp Electrode)';
    case 'patch_clamp':
      return '🔬 Whole-Cell Patch Clamp';
    case 'extracellular':
      return '📡 Extracellular Recording';
    case 'field':
      return '🌊 Local Field Potential';
    default:
      return recordingState.mode;
  }
}

/**
 * Update all graphs
 */
export function updateGraphs() {
  drawLongTermGraph();
  drawShortTermGraph();
  drawCompartmentGraph();
}

/**
 * Handle window resize
 */
export function resizeGraphs() {
  if (longTermCanvas) setupCanvas(longTermCanvas);
  if (shortTermCanvas) setupCanvas(shortTermCanvas);
  if (currentCanvas) setupCanvas(currentCanvas);
}

// Listen for resize
window.addEventListener('resize', resizeGraphs);
