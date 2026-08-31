/**
 * config.js - Global constants, parameters, and shared state
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// ============================================================================
// SCENE SETUP
// ============================================================================

export const container = document.getElementById('canvas-container');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

export const defaultCameraPos = { distance: 70, angleX: 0, angleY: 0.3 };
export let cameraDistance = 70;
export let cameraAngleX = 0;
export let cameraAngleY = 0.3;

// Raycaster for click detection
export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

// Reusable temp vectors to reduce GC pressure
export const _tempVec3_1 = new THREE.Vector3();
export const _tempVec3_2 = new THREE.Vector3();
export const _tempVec3_3 = new THREE.Vector3();

// ============================================================================
// ANIMATION STATE
// ============================================================================

export const animationState = {
  running: true,
  time: 0,
  speed: 1.0,
  loop: true,
  showExtracellularIons: false,
  showMyelinatedNeuron: false,
  naDensity: 100,
  kDensity: 100,
  propSpeed: 100,
  epspRate: 50,
  ipspRate: 30,
  apTriggered: false,
  apStartTime: -1
};

// ============================================================================
// NEURON GEOMETRY PARAMETERS
// ============================================================================

export const SOMA_RADIUS = 5;
export const SOMA_POS = new THREE.Vector3(-35, 0, 0);
export const DENDRITE_COUNT = 14;
export const AXON_LENGTH = 55;
export const AXON_RADIUS = 1.2;
export const HILLOCK_LENGTH = 6;
export const TERMINAL_COUNT = 6;
export const THRESHOLD = -55;

// ============================================================================
// PHYSICAL SCALE
// ============================================================================

export const PHYSICAL_AXON_LENGTH_MM = 1.5;
export const SCALE_MM_PER_UNIT = PHYSICAL_AXON_LENGTH_MM / AXON_LENGTH;
export const SCALE_UNITS_PER_MM = AXON_LENGTH / PHYSICAL_AXON_LENGTH_MM;

// Realistic conduction velocities
export const REALISTIC_UNMYEL_VELOCITY_MM_S = 2000;
export const REALISTIC_MYEL_VELOCITY_MM_S = 120000;

// ============================================================================
// MYELINATED NEURON PARAMETERS
// ============================================================================

export const MYELIN_NEURON_OFFSET = -50;
export const MYELIN_SHEATH_COUNT = 4;
export const NODE_OF_RANVIER_COUNT = 4;
export const MYELIN_THICKNESS = 0.4;
export const SALTATORY_SPEED_MULTIPLIER = 6;
export const NODE_WIDTH = 3.0;
export const INITIAL_SEGMENT_LENGTH = 5;
export let showMyelinatedNeuron = false;

// ============================================================================
// BRANCHING PARAMETERS
// ============================================================================

export const MAX_BRANCH_DEPTH = 3;
export const BASE_BRANCH_LENGTH = 10;  // Longer terminal branches
export const PHI_INV = 0.618033988749895;

// Seeded random for reproducible branching
export let branchSeed = 12345;
export function seededRandom() {
  branchSeed = (branchSeed * 9301 + 49297) % 233280;
  return branchSeed / 233280;
}
export function resetBranchSeed() {
  branchSeed = 12345;
}

// ============================================================================
// AP TIMING TRACKING
// ============================================================================

export const apTimingData = {
  unmyelinated: { apStartTimes: [], ntReleaseTimes: [], delays: [], avgDelay: 0 },
  myelinated: { apStartTimes: [], ntReleaseTimes: [], delays: [], avgDelay: 0 }
};
export const MAX_TIMING_SAMPLES = 20;

// ============================================================================
// BIOPHYSICS: ION CONCENTRATIONS (mM)
// ============================================================================

export const ION_CONC = {
  Na_out: 145,
  K_out: 5,
  Cl_out: 120,
  soma: { Na: 15, K: 140, Cl: 10 },
  hillock: { Na: 15, K: 140, Cl: 10 },
  axon: { Na: 15, K: 140, Cl: 10 }
};

// Permeabilities (relative, K=1 at rest)
export const PERM = {
  rest: { K: 1.0, Na: 0.04, Cl: 0.45 },
  peak: { K: 0.2, Na: 15.0, Cl: 0.0 }
};

// Track ions in hillock for concentration-based AP triggering
export const hillockIons = { positive: 0, negative: 0 };
export const myelHillockIons = { positive: 0, negative: 0 };

// Myelinated neuron ion concentrations
export const myelION_CONC = {
  soma: { Na: 15, K: 140, Cl: 10 },
  hillock: { Na: 15, K: 140, Cl: 10 }
};

// Node of Ranvier voltages
export const nodeVoltages = [0, 0, 0];

// ============================================================================
// GRAPH DATA
// ============================================================================

export const apGraphHistory = [];
export const AP_GRAPH_MAX_POINTS = 100;
export let apGraphStartTime = -1;

export const hillockGraphHistory = [];
export const HILLOCK_GRAPH_MAX_POINTS = 500;
export const HILLOCK_GRAPH_TIME_WINDOW = 5.0;
export const HILLOCK_SAMPLE_INTERVAL = 0.01;

// ============================================================================
// NEURON GROUPS
// ============================================================================

export const neuronGroup = new THREE.Group();
export const myelinatedNeuronGroup = new THREE.Group();

// ============================================================================
// DATA ARRAYS - UNMYELINATED
// ============================================================================

export const dendrites = [];
export const dendriteData = [];
export const axonSegments = [];
export const axonPathData = [];
export const terminals = [];
export const channels = { sodium: [], potassium: [] };

export const segmentCount = 80;

// Axon position markers (set during neuron creation)
export let AXON_START = 0;
export let AXON_END = 0;
export let AXON_END_POS = null;

export function setAxonStart(value) { AXON_START = value; }
export function setAxonEnd(value) { AXON_END = value; }
export function setAxonEndPos(value) { AXON_END_POS = value; }

// ============================================================================
// DATA ARRAYS - MYELINATED
// ============================================================================

export const myelDendrites = [];
export const myelDendriteData = [];
export const myelAxonSegments = [];
export const myelAxonPathData = [];
export const myelTerminals = [];
export const nodesOfRanvier = [];
export const nodeChannels = { sodium: [], potassium: [] };
export const myelVoltageSegments = [];

// ============================================================================
// ION PARAMETERS
// ============================================================================

export const UNIFORM_ION_SIZE = 0.16;
export const EXTRACELLULAR_BOUNDS = {
  minX: -70, maxX: 45,
  minY: -50, maxY: 30,
  minZ: -40, maxZ: 40
};

export const CHANNEL_SPACING = 2.5;
export const CHANNELS_PER_RING = 6;

// ============================================================================
// ION ARRAYS
// ============================================================================

export const ambientNaIons = [];
export const ambientKIons = [];
export const ambientClIons = [];
export const ambientCaIons = [];
export const myelAmbientNaIons = [];
export const myelAmbientKIons = [];
export const myelAmbientClIons = [];
export const myelAmbientCaIons = [];

export const ions = [];
export const myelIons = [];
export const caInfluxIons = [];
export const myelCaInfluxIons = [];

// ============================================================================
// NEUROTRANSMITTERS
// ============================================================================

export const vesicles = [];
export const microNTs = [];
export const myelVesicles = [];
export const myelMicroNTs = [];

// ============================================================================
// SYNAPTIC INPUTS
// ============================================================================

export const synapticInputs = [];
export const myelSynapticInputs = [];

// ============================================================================
// UI OPACITY
// ============================================================================

export const ionOpacity = { Na: 0.5, K: 0.35, Cl: 0.4, Ca: 0.45 };
