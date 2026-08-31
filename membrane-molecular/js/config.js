/**
 * config.js - Global constants, parameters, and shared state
 * Molecular-scale membrane visualization
 * 
 * Physical constants based on actual molecular biology at 37°C
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// ============================================================================
// SCENE SETUP
// ============================================================================

export const container = document.getElementById('canvas-container');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 500);

export const defaultCameraPos = { distance: 120, angleX: 0.3, angleY: 0.4 };

// Raycaster for click detection
export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

// Reusable temp vectors
export const _tempVec3 = new THREE.Vector3();
export const _tempVec3_2 = new THREE.Vector3();

// ============================================================================
// PHYSICAL SCALE CONSTANTS
// ============================================================================

// We're modeling a ~200nm × 200nm membrane patch (4x original)
// 1 unit = ~1 nm (nanometer) for easier mental math
export const SCALE = {
  NM_PER_UNIT: 1.0,           // 1 Three.js unit = 1 nanometer
  MEMBRANE_WIDTH: 200,         // 200nm patch width (4x)
  MEMBRANE_DEPTH: 200,         // 200nm patch depth (4x)
  MEMBRANE_THICKNESS: 7.5,     // ~7-8nm bilayer thickness
  
  // Molecular sizes (approximate) - spacing increased for performance
  LIPID_HEAD_DIAMETER: 0.9,    // ~0.9nm phosphate head
  LIPID_TAIL_LENGTH: 1.8,      // ~1.8nm each tail
  LIPID_SPACING: 2.0,          // Increased for performance (representative, not 1:1)
  
  CHOLESTEROL_LENGTH: 1.5,     // cholesterol is shorter
  
  // Channel sizes (Nav1.x, Kv channels)
  NAV_CHANNEL_DIAMETER: 15,    // ~12-15nm for Nav complex
  NAV_CHANNEL_HEIGHT: 12,      // spans membrane + extracellular domain
  KV_CHANNEL_DIAMETER: 10,     // ~8-10nm for Kv complex
  KV_CHANNEL_HEIGHT: 10,
  
  // Na+/K+-ATPase pump
  PUMP_DIAMETER: 8,            // ~8nm diameter
  PUMP_HEIGHT: 10,             // ~10nm height
  
  // Ion sizes (hydrated radii approximations)
  NA_ION_RADIUS: 0.25,         // ~0.2-0.3nm hydrated
  K_ION_RADIUS: 0.35,          // ~0.3-0.4nm hydrated
  CL_ION_RADIUS: 0.35,         // ~0.3-0.4nm hydrated
  CA_ION_RADIUS: 0.45,         // larger hydrated radius
  
  // ATP molecule
  ATP_SIZE: 1.5,               // ~1.5nm for ATP molecule
};

// ============================================================================
// MEMBRANE CURVATURE
// ============================================================================

// The membrane patch should have slight curvature (axon hillock surface)
export const MEMBRANE_CURVE = {
  radius: 200,      // Large radius = gentle curve (hillock is ~1-2μm diameter)
  intensity: 0.15,  // How much the curve affects the surface
};

// ============================================================================
// ION CONCENTRATIONS (mM) - Physiological values
// ============================================================================

export const ION_CONCENTRATIONS = {
  extracellular: {
    Na: 145,    // High Na+ outside
    K: 5,       // Low K+ outside
    Cl: 120,    // High Cl- outside
    Ca: 2,      // Calcium outside
  },
  intracellular: {
    Na: 15,     // Low Na+ inside
    K: 140,     // High K+ inside
    Cl: 10,     // Low Cl- inside
    Ca: 0.0001, // Very low Ca2+ inside (100nM)
  }
};

// Relative concentrations for visualization (normalized to show ratio)
// Extracellular has MORE Na+, less K+; Intracellular has MORE K+, less Na+
// Increased extracellular for visible ion flow
export const ION_VISUAL_COUNTS = {
  extracellular: {
    Na: 120,    // Many Na+ outside (increased for ion flow visibility)
    K: 15,      // Few K+ outside
    Cl: 80,     // Many Cl- outside
  },
  intracellular: {
    Na: 12,     // Few Na+ inside
    K: 100,     // Many K+ inside (increased for ion flow)
    Cl: 15,     // Few Cl- inside
    ATP: 30,    // ATP molecules inside
  }
};

// Membrane patch orientation
// The patch represents a section of axon hillock
// LEFT side (negative X) = toward SOMA (proximal)
// RIGHT side (positive X) = toward AXON TERMINAL (distal)
export const MEMBRANE_ORIENTATION = {
  somaDirection: new THREE.Vector3(-1, 0, 0),
  axonDirection: new THREE.Vector3(1, 0, 0),
  // Soma-proximal region has fewer voltage-gated channels
  somaProximalBoundary: 0, // X < 0 is soma-proximal
};

// ============================================================================
// ANIMATION STATE
// ============================================================================

export const animationState = {
  running: true,
  time: 0,
  simTime: 0,           // Simulated time in milliseconds
  speed: 1.0,           // Time multiplier
  brownianIntensity: 1.0,
  
  // Membrane voltage (-90 to +50 mV)
  voltage: -70,
  targetVoltage: -70,
  
  // Action potential state
  apPhase: 'resting',   // 'resting', 'depolarizing', 'peak', 'repolarizing', 'hyperpolarizing', 'refractory'
  apStartTime: -1,
  
  // Channel states tracking
  navOpenCount: 0,
  kvOpenCount: 0,
  
  // Visualization toggles
  showLipidTails: false,  // Start with tails OFF for performance
  showWater: false,
  lipidDensity: 1.0,
  membraneFlexibility: 0.7,
  
  // Channel parameters
  navThreshold: -55,
  navInactivationRate: 1.0,
  kvActivationDelay: 1.0,  // ms
  pumpRate: 100,           // ATP/second
  
  // Camera flip state
  isFlipped: false,
  
  // Electrophysiology mode
  useHHModel: true,       // Use full Hodgkin-Huxley model
  
  // Synaptic input
  epspRate: 2,            // Hz - spontaneous EPSP rate
  ipspRate: 1,            // Hz - spontaneous IPSP rate
  eiBalance: 1.0,         // E/I balance (>1 = more excitation)
  
  // Recording
  recordingMode: 'intracellular',
};

// ============================================================================
// ACTION POTENTIAL TIMING (ms)
// ============================================================================

export const AP_TIMING = {
  // Depolarization phase
  riseDuration: 0.5,        // Time to go from threshold to peak
  peakVoltage: 40,          // mV at peak
  
  // Repolarization
  fallDuration: 1.0,        // Time to return toward resting
  undershootVoltage: -80,   // Hyperpolarization overshoot
  
  // Recovery
  recoveryDuration: 2.0,    // Time to return to resting
  
  // Refractory periods
  absoluteRefractory: 1.5,  // ms - cannot fire
  relativeRefractory: 3.0,  // ms - harder to fire
  
  // Channel kinetics
  navOpenDelay: 0.1,        // ms after threshold
  navInactivateDelay: 0.8,  // ms after opening
  kvOpenDelay: 0.5,         // ms after threshold (delayed rectifier)
  kvCloseDelay: 2.0,        // ms - stays open longer
};

// ============================================================================
// CHANNEL/PUMP COUNTS PER PATCH
// ============================================================================

// Realistic density: ~100-500 Nav channels per μm²
// Our 200nm × 200nm patch = 0.04 μm² → ~4-20 channels
// Scaled up 4x for larger patch

export const CHANNEL_COUNTS = {
  navChannels: 24,     // Voltage-gated Na+ channels (4x for larger area)
  kvChannels: 18,      // Voltage-gated K+ channels (4x)
  pumps: 12,           // Na+/K+-ATPase pumps (4x)
  leakChannels: 8,     // Leak channels (always open)
};

// ============================================================================
// BROWNIAN MOTION PARAMETERS
// ============================================================================

// At 37°C, thermal energy kT ≈ 4.11 × 10^-21 J
// Lipid diffusion coefficient D ≈ 1 μm²/s in membrane
// Ion diffusion in water D ≈ 1000-2000 μm²/s

export const BROWNIAN = {
  lipidAmplitude: 0.15,       // nm-scale jiggle
  lipidFrequency: 5.0,        // oscillation frequency
  ionAmplitude: 0.8,          // Ions move more in solution
  ionVelocityBase: 2.0,       // Base random walk speed
  channelAmplitude: 0.08,     // Channels are more anchored
  atpAmplitude: 0.5,          // ATP floats in cytoplasm
};

// ============================================================================
// MEMBRANE GROUPS
// ============================================================================

export const membraneGroup = new THREE.Group();
export const ionGroup = new THREE.Group();
export const channelGroup = new THREE.Group();

// ============================================================================
// DATA ARRAYS
// ============================================================================

// Lipid bilayer
export const lipids = {
  outer: [],    // Outer leaflet (extracellular facing)
  inner: [],    // Inner leaflet (intracellular facing)
};

export const cholesterols = [];

// Channels and pumps
export const navChannels = [];
export const kvChannels = [];
export const pumps = [];
export const leakChannels = [];

// Ions
export const ions = {
  extracellular: {
    Na: [],
    K: [],
    Cl: [],
  },
  intracellular: {
    Na: [],
    K: [],
    Cl: [],
  },
  // Ions actively moving through channels
  transiting: [],
};

// ATP molecules (intracellular)
export const atpMolecules = [];

// Water molecules (optional)
export const waterMolecules = [];

// ============================================================================
// CHANNEL STATE ENUMS
// ============================================================================

export const NAV_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  INACTIVATED: 'inactivated',
};

export const KV_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
};

export const PUMP_STATES = {
  E1: 'E1',           // Facing intracellular, binds 3 Na+
  E1_ATP: 'E1_ATP',   // ATP bound
  E1P: 'E1P',         // Phosphorylated, releases Na+ outside
  E2P: 'E2P',         // Facing extracellular, binds 2 K+
  E2: 'E2',           // Releases K+ inside, cycle complete
};

// ============================================================================
// COLORS
// ============================================================================

export const COLORS = {
  // Membrane components
  lipidHead: 0x4a9eff,
  lipidTail: 0x2d5a87,
  cholesterol: 0xffd93d,
  
  // Channels
  navClosed: 0xff6b6b,
  navOpen: 0xff2020,
  navInactivated: 0x8b4444,
  kvClosed: 0xffd93d,
  kvOpen: 0xffb300,
  pump: 0x9b59b6,
  pumpActive: 0xc792ea,
  leakChannel: 0x888888,
  
  // Ions
  Na: 0xff4757,
  K: 0xfed330,
  Cl: 0x3867d6,
  Ca: 0xffffff,
  
  // Other
  atp: 0x26de81,
  adp: 0x888888,
  water: 0x74b9ff,
  
  // Environment
  extracellular: 0x1a1a3e,
  intracellular: 0x0a1428,
};

// ============================================================================
// GEOMETRY CACHE (for performance)
// ============================================================================

export const geometryCache = {
  lipidHead: null,
  lipidTail: null,
  ion: null,
  navChannel: null,
  kvChannel: null,
  pump: null,
  atp: null,
};

// ============================================================================
// MATERIAL CACHE
// ============================================================================

export const materialCache = {};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the Y position of the membrane surface at a given X, Z
 * Implements the gentle curvature of the axon hillock surface
 */
export function getMembraneSurfaceY(x, z) {
  const r2 = x * x + z * z;
  const curve = MEMBRANE_CURVE.intensity * (r2 / (MEMBRANE_CURVE.radius * MEMBRANE_CURVE.radius));
  return -curve;
}

/**
 * Get voltage-dependent channel open probability
 * Uses Boltzmann distribution
 */
export function getNavOpenProbability(voltage, threshold = -55) {
  // Steepness factor (mV)
  const k = 6;
  const v50 = threshold;
  return 1 / (1 + Math.exp(-(voltage - v50) / k));
}

export function getKvOpenProbability(voltage) {
  // Kv channels activate at slightly more depolarized potentials
  const k = 8;
  const v50 = -30;
  return 1 / (1 + Math.exp(-(voltage - v50) / k));
}

/**
 * Get phase label based on voltage
 */
export function getPhaseLabel(voltage, apPhase) {
  if (apPhase === 'refractory') return 'Refractory Period';
  if (voltage > 20) return 'Peak (Na⁺ Inactivating)';
  if (voltage > -40) return 'Depolarizing (Na⁺ Influx)';
  if (voltage > -55) return 'Threshold Reached';
  if (voltage > -70) return 'EPSP / Subthreshold';
  if (voltage > -80) return 'Resting State';
  return 'Hyperpolarized (K⁺ Efflux)';
}
