/**
 * electrophysiology.js - Hodgkin-Huxley style membrane biophysics
 * 
 * Implements:
 * - Nernst equation for equilibrium potentials
 * - Goldman-Hodgkin-Katz (GHK) for resting potential
 * - Hodgkin-Huxley channel kinetics (m, h, n gates)
 * - Cable equation for spatial voltage spread
 * - EPSP/IPSP synaptic inputs
 * - E/I balance control
 * - Spontaneous oscillations and firing
 * 
 * Current propagates via LOCAL CIRCUIT CURRENTS:
 * When voltage changes at one point, ions flow through the intracellular
 * cytoplasm to adjacent regions, causing voltage changes there too.
 * This is passive (electrotonic) conduction for subthreshold signals,
 * and active regenerative conduction for action potentials.
 */

import { animationState, SCALE } from './config.js';

// ============================================================================
// PHYSICAL CONSTANTS
// ============================================================================

const CONSTANTS = {
  R: 8.314,           // Gas constant (J/(mol·K))
  F: 96485,           // Faraday constant (C/mol)
  T: 310,             // Temperature (K) = 37°C
  RT_F: 0.0267,       // RT/F at 37°C (V)
  RT_F_mV: 26.7,      // RT/F in mV
};

// ============================================================================
// ION CONCENTRATIONS (mM)
// ============================================================================

export const ionConcentrations = {
  // Extracellular
  Na_out: 145,
  K_out: 5,
  Cl_out: 120,
  Ca_out: 2,
  
  // Intracellular
  Na_in: 15,
  K_in: 140,
  Cl_in: 10,
  Ca_in: 0.0001,  // 100 nM
};

// ============================================================================
// EQUILIBRIUM POTENTIALS (Nernst Equation)
// ============================================================================

/**
 * Calculate Nernst equilibrium potential
 * E = (RT/zF) * ln([X]out/[X]in)
 * @param {number} z - Ion valence (+1 for Na/K, -1 for Cl, +2 for Ca)
 * @param {number} out - Extracellular concentration
 * @param {number} in_ - Intracellular concentration
 * @returns {number} Equilibrium potential in mV
 */
export function nernstPotential(z, out, in_) {
  return (CONSTANTS.RT_F_mV / z) * Math.log(out / in_);
}

// Pre-calculated equilibrium potentials
export const equilibriumPotentials = {
  E_Na: 0,  // Will be calculated
  E_K: 0,
  E_Cl: 0,
  E_Ca: 0,
  E_leak: -70,  // Mixed leak
};

function updateEquilibriumPotentials() {
  equilibriumPotentials.E_Na = nernstPotential(1, ionConcentrations.Na_out, ionConcentrations.Na_in);
  equilibriumPotentials.E_K = nernstPotential(1, ionConcentrations.K_out, ionConcentrations.K_in);
  equilibriumPotentials.E_Cl = nernstPotential(-1, ionConcentrations.Cl_out, ionConcentrations.Cl_in);
  equilibriumPotentials.E_Ca = nernstPotential(2, ionConcentrations.Ca_out, ionConcentrations.Ca_in);
}

// ============================================================================
// GOLDMAN-HODGKIN-KATZ EQUATION
// ============================================================================

/**
 * Calculate resting membrane potential using GHK equation
 * Vm = (RT/F) * ln((PK[K]o + PNa[Na]o + PCl[Cl]i) / (PK[K]i + PNa[Na]i + PCl[Cl]o))
 */
export function calculateGHKPotential(permeabilities) {
  const { P_K, P_Na, P_Cl } = permeabilities;
  
  const numerator = P_K * ionConcentrations.K_out + 
                    P_Na * ionConcentrations.Na_out + 
                    P_Cl * ionConcentrations.Cl_in;
                    
  const denominator = P_K * ionConcentrations.K_in + 
                      P_Na * ionConcentrations.Na_in + 
                      P_Cl * ionConcentrations.Cl_out;
  
  return CONSTANTS.RT_F_mV * Math.log(numerator / denominator);
}

// ============================================================================
// COMPARTMENTAL MODEL
// ============================================================================

/**
 * The membrane patch is divided into compartments:
 * - Soma-proximal (left side, X < 0): Receives synaptic input
 * - Axon hillock (center): High channel density, AP initiation
 * - Axon (right side, X > 0): Propagates AP toward terminal
 */

export const compartments = {
  soma: {
    name: 'Soma-proximal',
    voltage: -70,
    prevVoltage: -70,
    
    // Membrane properties
    capacitance: 1.0,      // µF/cm²
    area: 100 * 100,       // nm² (left half of patch)
    
    // Conductances (mS/cm²)
    g_leak: 0.3,
    g_Na: 5,               // Low Nav density
    g_K: 5,
    g_NaP: 0.1,            // Persistent sodium
    g_h: 0.05,             // HCN channels
    
    // Gating variables
    m: 0, h: 1, n: 0,      // HH gates
    m_NaP: 0,              // Persistent Na gate
    h_HCN: 0,              // HCN gate
    
    // Synaptic conductances
    g_AMPA: 0,             // Excitatory
    g_GABA: 0,             // Inhibitory
    
    // Coupling to adjacent compartment
    g_axial: 0.5,          // mS/cm² axial conductance
  },
  
  hillock: {
    name: 'Axon Hillock',
    voltage: -70,
    prevVoltage: -70,
    
    capacitance: 1.0,
    area: 50 * 200,        // nm² (middle strip)
    
    // High channel density - AP initiation zone
    g_leak: 0.3,
    g_Na: 120,             // Very high Nav density!
    g_K: 36,
    g_NaP: 0.3,
    g_h: 0.1,
    
    m: 0, h: 1, n: 0,
    m_NaP: 0,
    h_HCN: 0,
    
    g_AMPA: 0,
    g_GABA: 0,
    
    g_axial: 0.8,
  },
  
  axon: {
    name: 'Axon',
    voltage: -70,
    prevVoltage: -70,
    
    capacitance: 1.0,
    area: 50 * 200,
    
    g_leak: 0.3,
    g_Na: 80,              // High Nav for propagation
    g_K: 24,
    g_NaP: 0.1,
    g_h: 0.02,
    
    m: 0, h: 1, n: 0,
    m_NaP: 0,
    h_HCN: 0,
    
    g_AMPA: 0,
    g_GABA: 0,
    
    g_axial: 0.5,
  }
};

// ============================================================================
// HODGKIN-HUXLEY GATE KINETICS
// ============================================================================

/**
 * Rate functions for HH gating variables
 * All voltages in mV, rates in 1/ms
 */

// Sodium activation (m)
function alpha_m(V) {
  const dV = V + 40;
  if (Math.abs(dV) < 0.001) return 1.0;
  return 0.1 * dV / (1 - Math.exp(-dV / 10));
}

function beta_m(V) {
  return 4 * Math.exp(-(V + 65) / 18);
}

// Sodium inactivation (h)
function alpha_h(V) {
  return 0.07 * Math.exp(-(V + 65) / 20);
}

function beta_h(V) {
  return 1 / (1 + Math.exp(-(V + 35) / 10));
}

// Potassium activation (n)
function alpha_n(V) {
  const dV = V + 55;
  if (Math.abs(dV) < 0.001) return 0.1;
  return 0.01 * dV / (1 - Math.exp(-dV / 10));
}

function beta_n(V) {
  return 0.125 * Math.exp(-(V + 65) / 80);
}

// Persistent sodium (m_NaP) - activates at subthreshold
function m_NaP_inf(V) {
  return 1 / (1 + Math.exp(-(V + 52) / 5));
}

function tau_m_NaP(V) {
  return 1; // ms
}

// HCN (h_HCN) - activates on hyperpolarization
function h_HCN_inf(V) {
  return 1 / (1 + Math.exp((V + 80) / 10));
}

function tau_h_HCN(V) {
  return 100 + 200 / (1 + Math.exp((V + 70) / 10)); // Slow kinetics
}

// ============================================================================
// SYNAPTIC CURRENTS
// ============================================================================

export const synapticState = {
  // EPSP parameters
  epspRate: 0,           // Hz - rate of spontaneous EPSPs
  epspAmplitude: 3,      // nS - AMPA conductance per event
  epspTau: 5,            // ms - decay time constant
  
  // IPSP parameters
  ipspRate: 0,           // Hz
  ipspAmplitude: 2,      // nS - GABA conductance per event
  ipspTau: 10,           // ms
  
  // E/I balance (1.0 = balanced, >1 = more excitation)
  eiBalance: 1.0,
  
  // Reversal potentials
  E_AMPA: 0,             // mV
  E_GABA: -70,           // mV
  
  // Spontaneous activity - reduced for more user control
  spontaneousRate: 2,    // Hz - baseline random EPSPs (synaptic noise)
  
  // Triggered events queue
  pendingEPSPs: [],
  pendingIPSPs: [],
};

/**
 * Trigger an EPSP on the soma compartment
 * Manual triggers are larger for visible effect
 * @param {number} amplitude - Optional custom amplitude (nS). Default uses 5x for reliable AP trigger.
 */
export function triggerEPSP(amplitude = null) {
  const amp = amplitude || synapticState.epspAmplitude * synapticState.eiBalance * 5; // 5x for reliable manual trigger
  synapticState.pendingEPSPs.push({
    time: animationState.simTime,
    amplitude: amp,
    tau: synapticState.epspTau,
  });
  console.log('EPSP triggered, amplitude:', amp, 'nS');
}

/**
 * Trigger an IPSP on the soma compartment
 */
export function triggerIPSP(amplitude = null) {
  const amp = amplitude || synapticState.ipspAmplitude * 3 / synapticState.eiBalance; // 3x for manual trigger
  synapticState.pendingIPSPs.push({
    time: animationState.simTime,
    amplitude: amp,
    tau: synapticState.ipspTau,
  });
  console.log('IPSP triggered, amplitude:', amp);
}

/**
 * Update synaptic conductances based on pending events
 */
function updateSynapticConductances(compartment, deltaTime) {
  const now = animationState.simTime;
  
  // Decay existing conductances
  compartment.g_AMPA *= Math.exp(-deltaTime / synapticState.epspTau);
  compartment.g_GABA *= Math.exp(-deltaTime / synapticState.ipspTau);
  
  // Add new EPSPs
  for (let i = synapticState.pendingEPSPs.length - 1; i >= 0; i--) {
    const epsp = synapticState.pendingEPSPs[i];
    const elapsed = now - epsp.time;
    if (elapsed >= 0 && elapsed < 0.5) {
      compartment.g_AMPA += epsp.amplitude;
      synapticState.pendingEPSPs.splice(i, 1);
    } else if (elapsed > 50) {
      synapticState.pendingEPSPs.splice(i, 1);
    }
  }
  
  // Add new IPSPs
  for (let i = synapticState.pendingIPSPs.length - 1; i >= 0; i--) {
    const ipsp = synapticState.pendingIPSPs[i];
    const elapsed = now - ipsp.time;
    if (elapsed >= 0 && elapsed < 0.5) {
      compartment.g_GABA += ipsp.amplitude;
      synapticState.pendingIPSPs.splice(i, 1);
    } else if (elapsed > 50) {
      synapticState.pendingIPSPs.splice(i, 1);
    }
  }
}

/**
 * Generate spontaneous synaptic events (background noise)
 * Creates membrane potential fluctuations and occasional threshold crossings
 */
function generateSpontaneousEvents(deltaTime) {
  // Spontaneous EPSPs - more frequent for visible activity
  const epspProb = synapticState.spontaneousRate * deltaTime / 1000;
  if (Math.random() < epspProb) {
    // Spontaneous events vary in size
    const amp = synapticState.epspAmplitude * synapticState.eiBalance * (0.3 + Math.random() * 0.7);
    synapticState.pendingEPSPs.push({
      time: animationState.simTime,
      amplitude: amp,
      tau: synapticState.epspTau,
    });
  }
  
  // Spontaneous IPSPs (less frequent)
  const ipspProb = synapticState.spontaneousRate * 0.3 * deltaTime / 1000;
  if (Math.random() < ipspProb) {
    const amp = synapticState.ipspAmplitude / synapticState.eiBalance * (0.3 + Math.random() * 0.5);
    synapticState.pendingIPSPs.push({
      time: animationState.simTime,
      amplitude: amp,
      tau: synapticState.ipspTau,
    });
  }
}

// ============================================================================
// CURRENT CALCULATIONS
// ============================================================================

/**
 * Calculate all ionic currents for a compartment
 * Returns current in µA/cm²
 */
function calculateCurrents(comp) {
  const V = comp.voltage;
  const { E_Na, E_K, E_leak } = equilibriumPotentials;
  
  // Leak current
  const I_leak = comp.g_leak * (V - E_leak);
  
  // Voltage-gated sodium current (fast)
  const I_Na = comp.g_Na * Math.pow(comp.m, 3) * comp.h * (V - E_Na);
  
  // Voltage-gated potassium current (delayed rectifier)
  const I_K = comp.g_K * Math.pow(comp.n, 4) * (V - E_K);
  
  // Persistent sodium current
  const I_NaP = comp.g_NaP * comp.m_NaP * (V - E_Na);
  
  // HCN current (reversal ~ -30mV, mixed Na/K)
  const E_h = -30;
  const I_h = comp.g_h * comp.h_HCN * (V - E_h);
  
  // Synaptic currents
  const I_AMPA = comp.g_AMPA * (V - synapticState.E_AMPA);
  const I_GABA = comp.g_GABA * (V - synapticState.E_GABA);
  
  return {
    I_leak,
    I_Na,
    I_K,
    I_NaP,
    I_h,
    I_AMPA,
    I_GABA,
    I_total: I_leak + I_Na + I_K + I_NaP + I_h + I_AMPA + I_GABA,
  };
}

/**
 * Update gating variables using forward Euler
 */
function updateGates(comp, deltaTime) {
  const V = comp.voltage;
  const dt = deltaTime;
  
  // HH m gate (fast Na activation)
  const am = alpha_m(V);
  const bm = beta_m(V);
  comp.m += dt * (am * (1 - comp.m) - bm * comp.m);
  comp.m = Math.max(0, Math.min(1, comp.m));
  
  // HH h gate (Na inactivation)
  const ah = alpha_h(V);
  const bh = beta_h(V);
  comp.h += dt * (ah * (1 - comp.h) - bh * comp.h);
  comp.h = Math.max(0, Math.min(1, comp.h));
  
  // HH n gate (K activation)
  const an = alpha_n(V);
  const bn = beta_n(V);
  comp.n += dt * (an * (1 - comp.n) - bn * comp.n);
  comp.n = Math.max(0, Math.min(1, comp.n));
  
  // Persistent Na
  const m_inf = m_NaP_inf(V);
  const tau_mP = tau_m_NaP(V);
  comp.m_NaP += dt * (m_inf - comp.m_NaP) / tau_mP;
  
  // HCN
  const h_inf = h_HCN_inf(V);
  const tau_h = tau_h_HCN(V);
  comp.h_HCN += dt * (h_inf - comp.h_HCN) / tau_h;
}

// ============================================================================
// CABLE EQUATION / SPATIAL COUPLING
// ============================================================================

/**
 * Calculate axial current between two compartments
 * I_axial = g_axial * (V1 - V2)
 */
function calculateAxialCurrent(comp1, comp2) {
  const g_avg = (comp1.g_axial + comp2.g_axial) / 2;
  return g_avg * (comp1.voltage - comp2.voltage);
}

// ============================================================================
// MAIN SIMULATION UPDATE
// ============================================================================

/**
 * Update the electrophysiology simulation
 * @param {number} deltaTime - Time step in ms
 */
export function updateElectrophysiology(deltaTime) {
  // Clamp timestep for stability
  const dt = Math.min(deltaTime, 0.1);
  
  // Update equilibrium potentials (in case concentrations change)
  updateEquilibriumPotentials();
  
  // Generate spontaneous synaptic events
  generateSpontaneousEvents(dt);
  
  // Update synaptic conductances on soma
  updateSynapticConductances(compartments.soma, dt);
  
  // Store previous voltages for cable equation
  compartments.soma.prevVoltage = compartments.soma.voltage;
  compartments.hillock.prevVoltage = compartments.hillock.voltage;
  compartments.axon.prevVoltage = compartments.axon.voltage;
  
  // Calculate axial currents (local circuit currents)
  const I_soma_hillock = calculateAxialCurrent(compartments.soma, compartments.hillock);
  const I_hillock_axon = calculateAxialCurrent(compartments.hillock, compartments.axon);
  
  // Update each compartment
  for (const name of ['soma', 'hillock', 'axon']) {
    const comp = compartments[name];
    
    // Update gating variables
    updateGates(comp, dt);
    
    // Calculate ionic currents
    const currents = calculateCurrents(comp);
    
    // Add axial currents
    let I_axial = 0;
    if (name === 'soma') {
      I_axial = -I_soma_hillock;  // Current leaving to hillock
    } else if (name === 'hillock') {
      I_axial = I_soma_hillock - I_hillock_axon;  // Current from soma, leaving to axon
    } else if (name === 'axon') {
      I_axial = I_hillock_axon;  // Current arriving from hillock
    }
    
    // Update voltage: dV/dt = (-I_ionic + I_axial) / C_m
    const dV = dt * (-currents.I_total + I_axial) / comp.capacitance;
    comp.voltage += dV;
    
    // Store currents for visualization
    comp.currents = currents;
  }
  
  // Update the main animation state voltage from hillock (primary recording site)
  animationState.voltage = compartments.hillock.voltage;
  
  // Record data for graphs
  recordVoltageData();
}

// ============================================================================
// RECORDING / DATA LOGGING
// ============================================================================

export const recordingState = {
  // Recording mode
  mode: 'intracellular',  // 'intracellular', 'patch_clamp', 'extracellular', 'field'
  
  // Voltage traces (circular buffers)
  longTermBuffer: [],     // ~10 seconds of data
  shortTermBuffer: [],    // ~100ms of data (oscilloscope)
  maxLongTermSamples: 1000,
  maxShortTermSamples: 200,
  
  // Current traces
  currentBuffer: [],
  
  // Spike detection
  lastSpikeTime: -1000,
  spikeCount: 0,
  firingRate: 0,
  spikeThreshold: -20,    // mV
  
  // Sample timing
  lastSampleTime: 0,
  longTermInterval: 10,   // ms between long-term samples
  shortTermInterval: 0.5, // ms between short-term samples
};

function recordVoltageData() {
  const now = animationState.simTime;
  
  // Get voltage based on recording mode
  let voltage;
  switch (recordingState.mode) {
    case 'intracellular':
      voltage = compartments.hillock.voltage;
      break;
    case 'patch_clamp':
      // Whole-cell patch clamp - typically at soma
      voltage = compartments.soma.voltage;
      break;
    case 'extracellular':
      // Extracellular recording - sees derivative (spike shape different)
      voltage = (compartments.hillock.voltage - compartments.hillock.prevVoltage) * 10;
      break;
    case 'field':
      // Local field potential - average of region
      voltage = (compartments.soma.voltage + compartments.hillock.voltage + compartments.axon.voltage) / 3;
      break;
    default:
      voltage = compartments.hillock.voltage;
  }
  
  // Short-term buffer (high resolution)
  if (now - recordingState.lastSampleTime >= recordingState.shortTermInterval) {
    recordingState.shortTermBuffer.push({ time: now, voltage });
    if (recordingState.shortTermBuffer.length > recordingState.maxShortTermSamples) {
      recordingState.shortTermBuffer.shift();
    }
    
    // Long-term buffer (lower resolution)
    if (recordingState.shortTermBuffer.length % 20 === 0) {
      recordingState.longTermBuffer.push({ time: now, voltage });
      if (recordingState.longTermBuffer.length > recordingState.maxLongTermSamples) {
        recordingState.longTermBuffer.shift();
      }
    }
    
    recordingState.lastSampleTime = now;
  }
  
  // Spike detection
  if (voltage > recordingState.spikeThreshold && 
      compartments.hillock.prevVoltage <= recordingState.spikeThreshold &&
      now - recordingState.lastSpikeTime > 2) {  // Minimum ISI
    recordingState.spikeCount++;
    recordingState.lastSpikeTime = now;
    
    // Calculate firing rate (exponential moving average)
    const isi = now - recordingState.lastSpikeTime;
    if (isi > 0) {
      const instantRate = 1000 / isi;  // Hz
      recordingState.firingRate = 0.9 * recordingState.firingRate + 0.1 * instantRate;
    }
  }
}

// ============================================================================
// PARAMETER SETTERS
// ============================================================================

export function setEIBalance(balance) {
  synapticState.eiBalance = balance;
}

export function setEPSPRate(rate) {
  synapticState.epspRate = rate;
}

export function setIPSPRate(rate) {
  synapticState.ipspRate = rate;
}

export function setSpontaneousRate(rate) {
  synapticState.spontaneousRate = rate;
}

export function setRecordingMode(mode) {
  recordingState.mode = mode;
}

export function setChannelDensity(channel, region, value) {
  if (compartments[region]) {
    compartments[region][`g_${channel}`] = value;
  }
}

/**
 * Reset all compartments to resting state
 */
export function resetElectrophysiology() {
  for (const name of ['soma', 'hillock', 'axon']) {
    const comp = compartments[name];
    comp.voltage = -70;
    comp.prevVoltage = -70;
    comp.m = 0;
    comp.h = 1;
    comp.n = 0;
    comp.m_NaP = 0;
    comp.h_HCN = 0;
    comp.g_AMPA = 0;
    comp.g_GABA = 0;
  }
  
  recordingState.longTermBuffer = [];
  recordingState.shortTermBuffer = [];
  recordingState.spikeCount = 0;
  recordingState.firingRate = 0;
  recordingState.lastSpikeTime = -1000;
  
  synapticState.pendingEPSPs = [];
  synapticState.pendingIPSPs = [];
}

/**
 * Get current state for UI display
 */
export function getElectrophysiologyState() {
  return {
    soma: {
      voltage: compartments.soma.voltage,
      m: compartments.soma.m,
      h: compartments.soma.h,
      n: compartments.soma.n,
      g_AMPA: compartments.soma.g_AMPA,
      g_GABA: compartments.soma.g_GABA,
    },
    hillock: {
      voltage: compartments.hillock.voltage,
      m: compartments.hillock.m,
      h: compartments.hillock.h,
      n: compartments.hillock.n,
    },
    axon: {
      voltage: compartments.axon.voltage,
      m: compartments.axon.m,
      h: compartments.axon.h,
      n: compartments.axon.n,
    },
    firingRate: recordingState.firingRate,
    spikeCount: recordingState.spikeCount,
    E_Na: equilibriumPotentials.E_Na,
    E_K: equilibriumPotentials.E_K,
    recordingMode: recordingState.mode,
  };
}

// Initialize equilibrium potentials
updateEquilibriumPotentials();
