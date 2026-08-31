/**
 * config.js - Global constants, parameters, and shared state
 * Synaptic transmission visualization
 * 
 * Physical constants based on actual molecular biology
 * Models a glutamatergic/GABAergic synapse with ~20nm cleft
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// ============================================================================
// SCENE SETUP
// ============================================================================

export const container = document.getElementById('canvas-container');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

export const defaultCameraPos = { distance: 75, angleX: 0.5, angleY: 0.35 };

// Raycaster for click detection
export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

// Reusable temp vectors
export const _tempVec3 = new THREE.Vector3();
export const _tempVec3_2 = new THREE.Vector3();
export const _tempVec3_3 = new THREE.Vector3();

// ============================================================================
// PHYSICAL SCALE CONSTANTS
// ============================================================================

// DOME SYNAPSE SCALE - two domes with flat faces meeting at cleft
export const SCALE = {
  NM_PER_UNIT: 10,              // 1 Three.js unit = 10 nanometers
  SYNAPSE_SCALE: 0.1,           // Overall scale factor
  
  // Synaptic dimensions (dome style)
  CLEFT_WIDTH: 6.0,             // Cleft width for visibility
  TERMINAL_RADIUS: 18,          // Terminal dome radius
  TERMINAL_HEIGHT: 18,          // Terminal dome height (same as radius for hemisphere)
  SPINE_RADIUS: 16,             // Spine dome radius
  SPINE_NECK_LENGTH: 14,        // Spine neck length
  SPINE_NECK_RADIUS: 2.5,       // Spine neck radius
  
  // Vesicle dimensions
  VESICLE_RADIUS: 1.2,          // Vesicle size (larger for visibility)
  ACTIVE_ZONE_RADIUS: 12.6,     // Active zone (70% of terminal)
  
  // Channel/receptor sizes
  CHANNEL_RADIUS: 0.7,          // Channel diameter
  RECEPTOR_RADIUS: 0.9,         // Receptor complex
  
  // Ion sizes (scaled for visibility)
  ION_RADIUS: 0.25,             // Ion size
  NT_RADIUS: 0.5,               // Neurotransmitter molecule (larger for visibility)
  
  // Astrocyte process
  ASTROCYTE_THICKNESS: 4,       // Process thickness
};

// ============================================================================
// SYNAPTIC GEOMETRY
// ============================================================================

// Positions for main structures
export const POSITIONS = {
  presynaptic: new THREE.Vector3(0, SCALE.CLEFT_WIDTH / 2 + SCALE.TERMINAL_HEIGHT / 2, 0),
  postsynaptic: new THREE.Vector3(0, -SCALE.CLEFT_WIDTH / 2 - SCALE.SPINE_RADIUS, 0),
  cleft: new THREE.Vector3(0, 0, 0),
  activeZone: new THREE.Vector3(0, SCALE.CLEFT_WIDTH / 2, 0),
  psd: new THREE.Vector3(0, -SCALE.CLEFT_WIDTH / 2, 0), // Postsynaptic density
};

// ============================================================================
// VESICLE POOLS
// ============================================================================

export const VESICLE_POOLS = {
  RRP: {                        // Readily Releasable Pool
    maxCount: 15,
    currentCount: 15,
    releaseProb: 0.15,          // Per AP probability
    refillRate: 15.0,           // Vesicles per second - VERY FAST for AP trains
  },
  RECYCLING: {                  // Recycling Pool
    maxCount: 100,
    currentCount: 100,
    mobilizationRate: 10.0,     // To RRP per second - VERY FAST
  },
  RESERVE: {                    // Reserve Pool
    maxCount: 300,
    currentCount: 300,
    mobilizationRate: 0.05,     // To recycling per second
  }
};

// Vesicle content
export const VESICLE_CONTENT = {
  ntCount: 5000,                // ~5000 NT molecules per vesicle
  types: {
    glutamate: { prob: 0.8, color: 0xff6b6b },
    gaba: { prob: 0.0, color: 0x5f27cd },
  }
};

// ============================================================================
// ION CONCENTRATIONS (mM)
// ============================================================================

export const ION_CONCENTRATIONS = {
  extracellular: {              // In cleft (similar to extracellular)
    Na: 145,
    K: 5,
    Cl: 120,
    Ca: 2,
    Mg: 1,
  },
  presynaptic: {
    Na: 15,
    K: 140,
    Cl: 10,
    Ca: 0.0001,                 // 100 nM resting
    CaAP: 0.01,                 // 10 μM during AP (100x increase)
  },
  postsynaptic: {
    Na: 15,
    K: 140,
    Cl: 10,
    Ca: 0.0001,
  }
};

// Visual ion counts (for rendering)
export const ION_VISUAL_COUNTS = {
  cleft: {
    Na: 80,                     // HIGH extracellular Na+ (like action-potential-3d)
    K: 15,                      // Low extracellular K+
    Cl: 60,                     // HIGH extracellular Cl-
    Ca: 20,                     // Extracellular Ca2+
  },
  presynaptic: {
    Na: 15,                     // Low intracellular Na+
    K: 100,                     // HIGH intracellular K+ (yellow, like action-potential-3d)
    Ca: 3,                      // Very low at rest
  },
  postsynaptic: {
    Na: 15,                     // Low intracellular Na+
    K: 80,                      // HIGH intracellular K+ (yellow, like action-potential-3d)
    Cl: 8,                      // Low intracellular Cl-
  }
};

// ============================================================================
// CHANNEL/RECEPTOR COUNTS
// ============================================================================

export const CHANNEL_COUNTS = {
  presynaptic: {
    CaV: 12,                    // Voltage-gated Ca2+ channels (P/Q type)
    CB1: 6,                     // Cannabinoid receptors
    K: 8,                       // K+ channels for repolarization
  },
  postsynaptic: {
    AMPA: 80,                   // AMPA receptors (clustered at PSD)
    NMDA: 20,                   // NMDA receptors
    GABAA: 20,                  // GABA-A receptors
    GABAB: 10,                  // GABA-B (metabotropic)
    mGluR: 15,                  // Metabotropic glutamate receptors
    Na: 30,                     // Nav channels on spine
    K: 20,                      // Kv channels
  }
};

// ============================================================================
// RECEPTOR PROPERTIES
// ============================================================================

export const RECEPTOR_PROPS = {
  AMPA: {
    Kd: 500,                    // μM dissociation constant
    tauRise: 0.5,               // ms rise time
    tauDecay: 5,                // ms decay time
    conductance: 10,            // pS single channel
    reversal: 0,                // mV reversal potential
    color: 0xff9f43,
  },
  NMDA: {
    Kd: 3,                      // μM (higher affinity)
    tauRise: 5,                 // ms (slower)
    tauDecay: 100,              // ms (much slower)
    conductance: 50,            // pS (larger)
    reversal: 0,
    mgBlock: true,              // Voltage-dependent Mg2+ block
    mgKd: 3.57,                 // mM
    mgVhalf: -20,               // mV
    color: 0xee5a24,
  },
  GABAA: {
    Kd: 10,
    tauRise: 0.5,
    tauDecay: 30,
    conductance: 30,
    reversal: -80,              // Cl- reversal
    color: 0x5f27cd,
  },
  GABAB: {
    Kd: 1,
    tauRise: 50,                // Slow metabotropic
    tauDecay: 200,
    color: 0x833471,
  },
  mGluR: {
    Kd: 10,
    tauRise: 100,
    tauDecay: 500,
    color: 0xff6b9d,
  },
  CB1: {
    Kd: 0.5,                    // nM range
    tauRise: 1000,              // Very slow
    tauDecay: 5000,
    color: 0x009432,
  }
};

// ============================================================================
// ACTION POTENTIAL PARAMETERS
// ============================================================================

export const AP_PARAMS = {
  // Presynaptic AP timing - SCALED UP for visualization (real AP is ~2ms)
  // These values are in VISUAL milliseconds, not real milliseconds
  duration: 400,                // Visual ms total AP duration
  riseDuration: 80,             // Visual ms depolarization
  fallDuration: 320,            // Visual ms repolarization
  peakVoltage: 40,              // mV
  restingVoltage: -70,          // mV
  
  // Ca2+ channel activation
  CaV_threshold: -20,           // mV activation threshold
  CaV_tauOpen: 20,              // Visual ms opening time constant
  CaV_tauClose: 50,             // Visual ms closing time constant
  
  // Ca2+ dynamics
  Ca_influxDuration: 150,       // Visual ms of Ca2+ entry
  Ca_peakConc: 100,             // μM peak [Ca2+] at active zone
  Ca_tauDecay: 500,             // Visual ms decay time constant
  
  // Vesicle release
  synaptotagmin_Kd: 20,         // μM Ca2+ binding affinity
  synaptotagmin_n: 4,           // Hill coefficient (cooperativity)
  fusionDelay: 30,              // Visual ms after Ca2+ binding
  
  // Refractory period
  absoluteRefractory: 200,      // Visual ms
  relativeRefractory: 500,      // Visual ms
};

// ============================================================================
// SNARE PROTEINS
// ============================================================================

export const SNARE_STATES = {
  UNPRIMED: 'unprimed',
  PRIMED: 'primed',             // SNARE complex formed, awaiting Ca2+
  TRIGGERED: 'triggered',       // Synaptotagmin bound Ca2+
  FUSING: 'fusing',             // Membrane fusion occurring
  FUSED: 'fused',               // Complete fusion
  RECYCLING: 'recycling',       // Endocytosis
};

export const SNARE_COLORS = {
  synaptobrevin: 0xff6b6b,      // VAMP - vesicle
  syntaxin: 0xffd93d,           // Plasma membrane
  snap25: 0x4a9eff,             // Plasma membrane
  synaptotagmin: 0xffffff,      // Ca2+ sensor
};

// ============================================================================
// ENDOCANNABINOID SYSTEM
// ============================================================================

export const ENDOCANNABINOID = {
  synthesisThreshold: -55,      // mV postsynaptic for synthesis (lowered to trigger easier)
  tauSynthesis: 100,            // ms to produce 2-AG
  tauDiffusion: 50,             // ms to reach presynaptic
  tauEffect: 500,               // ms of CB1 activation
  maxInhibition: 0.7,           // Maximum release probability reduction
  types: {
    '2-AG': { prob: 0.8, color: 0x2ed573 },
    'anandamide': { prob: 0.2, color: 0x26de81 },
  }
};

// ============================================================================
// ASTROCYTE
// ============================================================================

export const ASTROCYTE = {
  coverage: 0.6,                // Fraction of synapse wrapped
  glutamateUptake: 0.5,         // Fraction cleared per 10ms
  gababUptake: 0.3,
  color: 0x9980FA,
  opacity: 0.3,
};

// ============================================================================
// ANIMATION STATE
// ============================================================================

export const animationState = {
  running: true,
  time: 0,
  simTime: 0,                   // Simulated time in ms
  speed: 1.0,                   // Time multiplier
  
  // Presynaptic state
  preVoltage: -70,
  preCaConc: 0.0001,            // mM
  apActive: false,
  apStartTime: -1,
  apPhase: 'resting',
  
  // AP train mode
  trainMode: false,
  trainFrequency: 10,           // Hz
  lastAPTime: -1000,
  
  // Postsynaptic state
  postVoltage: -70,
  postCaConc: 0.0001,
  pspAmplitude: 0,
  epspActive: false,
  ipspActive: false,
  
  // Vesicle state
  rrpCount: 15,
  recyclingCount: 100,
  reserveCount: 300,
  releaseProbability: 0.15,
  
  // SNARE state
  snareState: 'primed',
  
  // Neurotransmitter
  ntType: 'glutamate',          // 'glutamate', 'gaba', 'mixed'
  cleftGlutamate: 0,
  cleftGaba: 0,
  
  // Receptor binding
  ampaBound: 0,
  nmdaBound: 0,
  mgBlock: 1.0,                 // 1.0 = full block, 0.0 = no block
  gabaaBound: 0,
  
  // Metabotropic state
  mglurActive: false,
  gababActive: false,
  gProteinCascade: 0,           // 0-100%
  
  // Endocannabinoid
  endoSynthesis: false,
  endoLevel: 0,
  cb1Activation: 0,             // 0-100%
  retrogradeSignal: false,
  
  // Visualization
  showIonFlow: true,
  showAstrocyte: false,  // Start with astrocytes hidden
  vesicleTrails: false,
  isFlipped: false,
  
  // Channel/receptor densities (as multipliers)
  caDensity: 1.0,
  ampaDensity: 1.0,
  nmdaMgBlock: 1.0,
  
  // Statistics
  vesiclesReleased: 0,
  totalEpsps: 0,
  totalIpsps: 0,
};

// ============================================================================
// GRAPH DATA
// ============================================================================

export const graphHistory = {
  preVoltage: [],
  preCa: [],
  postVoltage: [],
  cleftNT: [],
  receptorBinding: [],
  ionFlow: [],                  // Net ion flow (positive = depolarizing influx)
  ionFlowNa: [],                // Na+ influx component
  ionFlowK: [],                 // K+ efflux component
  ionFlowCl: [],                // Cl- flow (GABA)
  maxPoints: 200,
  sampleInterval: 2,            // ms between samples
  lastSampleTime: 0,
};

// ============================================================================
// THREE.JS GROUPS
// ============================================================================

export const synapseGroup = new THREE.Group();
export const presynapticGroup = new THREE.Group();
export const postsynapticGroup = new THREE.Group();
export const cleftGroup = new THREE.Group();
export const astrocyteGroup = new THREE.Group();
export const vesicleGroup = new THREE.Group();
export const ionGroup = new THREE.Group();
export const ntGroup = new THREE.Group();
export const receptorGroup = new THREE.Group();
export const channelGroup = new THREE.Group();

// ============================================================================
// DATA ARRAYS
// ============================================================================

// Vesicles
export const vesicles = {
  rrp: [],                      // Readily releasable (docked)
  recycling: [],                // Recycling pool
  reserve: [],                  // Reserve pool
  fusing: [],                   // Currently fusing
  recyclingBack: [],            // Being recycled via endocytosis
};

// Neurotransmitters in cleft
export const neurotransmitters = {
  glutamate: [],
  gaba: [],
  peptides: [],                 // Co-released neuropeptides
};

// Ions
export const ions = {
  cleft: {
    Na: [],
    K: [],
    Cl: [],
    Ca: [],
  },
  extracellular: {  // Ions floating around OUTSIDE the synapse
    Na: [],
    K: [],
    Cl: [],
    Ca: [],
    Mg: [],
  },
  presynaptic: {
    Na: [],
    K: [],
    Ca: [],
  },
  postsynaptic: {
    Na: [],
    K: [],
    Cl: [],
    Ca: [],
  },
  transiting: [],               // Ions moving through channels
};

// Endocannabinoids
export const endocannabinoids = [];

// Channels
export const channels = {
  presynaptic: {
    CaV: [],
    CB1: [],
    K: [],
  },
  postsynaptic: {
    AMPA: [],
    NMDA: [],
    GABAA: [],
    GABAB: [],
    mGluR: [],
    Na: [],
    K: [],
  }
};

// ============================================================================
// COLORS
// ============================================================================

export const COLORS = {
  // Structure colors
  presynaptic: 0x2d2d44,
  presynapticMembrane: 0xff6b6b,
  postsynaptic: 0x1a2a44,
  postsynapticMembrane: 0x4a9eff,
  psd: 0x3a8eef,
  activeZone: 0xff9f43,
  cleft: 0x0a1428,
  astrocyte: 0x9980FA,
  
  // Vesicle colors
  vesicleRRP: 0x2ed573,
  vesicleRecycling: 0x7bed9f,
  vesicleReserve: 0x1abc9c,
  vesicleFusing: 0xffffff,
  
  // Ion colors
  Na: 0xff4757,
  K: 0xffd93d,
  Cl: 0x3867d6,
  Ca: 0xffffff,
  Mg: 0x00d4ff,
  
  // NT colors
  glutamate: 0x00ff88,         // GREEN like action-potential-3d neurotransmitter
  gaba: 0x5f27cd,              // Purple for inhibitory
  
  // Receptor colors (imported from RECEPTOR_PROPS)
  
  // SNARE colors (imported from SNARE_COLORS)
  
  // Environment
  background: 0x040812,
  extracellular: 0x0a1428,
  intracellular: 0x050810,
};

// ============================================================================
// GEOMETRY/MATERIAL CACHE
// ============================================================================

export const geometryCache = {};
export const materialCache = {};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate Ca2+ channel open probability based on voltage
 * Uses Boltzmann equation
 */
export function getCaVOpenProbability(voltage) {
  const threshold = AP_PARAMS.CaV_threshold;
  const k = 5; // Steepness factor
  return 1 / (1 + Math.exp(-(voltage - threshold) / k));
}

/**
 * Calculate vesicle release probability based on [Ca2+]
 * Uses Hill equation for synaptotagmin binding
 */
export function getReleaseProbability(caConc) {
  const Kd = AP_PARAMS.synaptotagmin_Kd;
  const n = AP_PARAMS.synaptotagmin_n;
  const basePr = animationState.releaseProbability;
  
  // Hill equation
  const caBinding = Math.pow(caConc, n) / (Math.pow(Kd, n) + Math.pow(caConc, n));
  
  // CB1 inhibition reduces release probability
  const cb1Factor = 1 - (animationState.cb1Activation / 100) * ENDOCANNABINOID.maxInhibition;
  
  return basePr * caBinding * cb1Factor;
}

/**
 * Calculate NMDA Mg2+ block RELIEF factor (0 = fully blocked, 1 = fully open)
 * 
 * The Mg2+ block is VOLTAGE-DEPENDENT:
 * - At resting potential (-70mV): ~95% blocked → relief ~0.05
 * - At depolarized potentials (>-20mV): block relieved → relief ~0.8-1.0
 * 
 * The slider allows forcing block relief for testing (simulates Mg-free solution)
 */
export function getNMDAMgBlock(voltage) {
  const mg = ION_CONCENTRATIONS.extracellular.Mg;
  const Kd = RECEPTOR_PROPS.NMDA.mgKd;
  
  // Voltage-dependent unblocking
  // This gives the FRACTION OF CHANNELS UNBLOCKED (relief)
  // At -70mV: ~0.05 (5% unblocked)
  // At -40mV: ~0.25 (25% unblocked)  
  // At -20mV: ~0.60 (60% unblocked)
  // At 0mV:   ~0.85 (85% unblocked)
  const voltageRelief = 1 / (1 + (mg / Kd) * Math.exp(-0.062 * voltage));
  
  // Slider acts as minimum relief (100% = force full block, 0% = force full relief for testing)
  // When slider at 100%, use pure voltage-dependent block
  // When slider at 0%, force channels open (simulates Mg-free solution)
  const sliderForceRelief = 1 - animationState.nmdaMgBlock;  // 0% slider → 1.0 relief
  
  // Take the MAX of voltage relief and slider-forced relief
  const finalRelief = Math.max(voltageRelief, sliderForceRelief);
  
  // Debug
  if (Math.random() < 0.001 && animationState.nmdaBound > 0) {
    console.log(`🔵 NMDA Mg block: V=${voltage.toFixed(1)}mV, voltageRelief=${voltageRelief.toFixed(2)}, slider=${animationState.nmdaMgBlock.toFixed(2)}, finalRelief=${finalRelief.toFixed(2)}`);
  }
  
  return finalRelief;
}

/**
 * Calculate receptor binding based on cleft [NT]
 */
export function getReceptorBinding(ntConc, receptorType) {
  const props = RECEPTOR_PROPS[receptorType];
  if (!props) return 0;
  
  // Simple Michaelis-Menten binding
  return ntConc / (props.Kd + ntConc);
}

/**
 * Get phase label for display
 */
export function getPrePhaseLabel(voltage, phase) {
  if (phase === 'depolarizing' && voltage > 0) return 'Peak (Ca²⁺ influx)';
  if (phase === 'depolarizing') return 'Depolarizing';
  if (phase === 'repolarizing') return 'Repolarizing';
  if (phase === 'refractory') return 'Refractory';
  if (voltage < -75) return 'Hyperpolarized';
  return 'Resting';
}

export function getPostPhaseLabel(voltage, epsp, ipsp) {
  if (epsp > 5) return 'EPSP Active';
  if (ipsp > 2) return 'IPSP Active';
  if (voltage > -55) return 'Depolarized';
  if (voltage < -75) return 'Hyperpolarized';
  return 'Resting';
}

/**
 * Smooth step function for animations
 */
export function smoothStep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Ease functions
 */
export function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

export function easeInQuad(t) {
  return t * t;
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
