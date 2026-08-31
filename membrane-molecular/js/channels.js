/**
 * channels.js - Voltage-gated ion channels and Na+/K+-ATPase pumps
 * 
 * REALISTIC MOLECULAR STRUCTURES with CONFORMATIONAL CHANGES
 * - Nav channels open with S4 voltage sensor movement
 * - Kv channels with tetramer gate opening
 * - Na+/K+-ATPase with E1-E2 conformational cycle
 * 
 * ION TRANSIT: Ions actually flow through open channels
 * REGIONAL: Soma-proximal region has fewer voltage-gated channels
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, channelGroup, ionGroup,
  SCALE, COLORS, BROWNIAN,
  navChannels, kvChannels, pumps, leakChannels,
  NAV_STATES, KV_STATES, PUMP_STATES,
  CHANNEL_COUNTS,
  animationState, AP_TIMING,
  getMembraneSurfaceY, getNavOpenProbability, getKvOpenProbability,
  MEMBRANE_ORIENTATION
} from './config.js';
import { clearSpaceForChannel } from './membrane.js';

// Import compartmental voltages from electrophysiology (loaded dynamically)
let compartments = null;

// Lazy load compartments when first needed
function getCompartments() {
  if (compartments === null) {
    try {
      // Dynamic import handled by the module system
      import('./electrophysiology.js').then(ephys => {
        compartments = ephys.compartments;
      }).catch(() => {
        console.warn('Electrophysiology module not available');
      });
    } catch (e) {
      // Fallback
    }
  }
  return compartments;
}

/**
 * Get voltage for a channel based on its X position
 * Channels in different regions see different compartmental voltages
 */
function getVoltageForPosition(x) {
  const comps = getCompartments();
  if (!comps || !animationState.useHHModel) {
    return animationState.voltage;
  }
  
  // Soma region: X < -30
  if (x < -30) {
    return comps.soma.voltage;
  }
  // Axon region: X > 30
  else if (x > 30) {
    return comps.axon.voltage;
  }
  // Hillock region: -30 < X < 30
  else {
    return comps.hillock.voltage;
  }
}

// Materials
const materials = {};

// Ion transit arrays (ions moving through channels)
export const transitingIons = [];

// ADP molecules (created when ATP is used by pump)
export const adpMolecules = [];

/**
 * Initialize materials
 */
function initMaterials() {
  materials.navClosed = new THREE.MeshPhongMaterial({
    color: 0xe07060, emissive: 0x401810, emissiveIntensity: 0.2,
    shininess: 30, transparent: true, opacity: 0.92,
  });
  
  materials.navOpen = new THREE.MeshPhongMaterial({
    color: 0xff4030, emissive: 0x801000, emissiveIntensity: 0.5,
    shininess: 50, transparent: true, opacity: 0.95,
  });
  
  materials.navInactivated = new THREE.MeshPhongMaterial({
    color: 0x705050, emissive: 0x200808, emissiveIntensity: 0.1,
    shininess: 15, transparent: true, opacity: 0.8,
  });
  
  materials.voltageSensor = new THREE.MeshPhongMaterial({
    color: 0x4080ff, emissive: 0x2040aa, emissiveIntensity: 0.4, shininess: 60,
  });
  
  materials.voltageSensorActivated = new THREE.MeshPhongMaterial({
    color: 0x80ffff, emissive: 0x40a0ff, emissiveIntensity: 0.7, shininess: 80,
  });
  
  materials.kvClosed = new THREE.MeshPhongMaterial({
    color: 0xd4a030, emissive: 0x402800, emissiveIntensity: 0.2,
    shininess: 35, transparent: true, opacity: 0.92,
  });
  
  materials.kvOpen = new THREE.MeshPhongMaterial({
    color: 0xffc000, emissive: 0x804000, emissiveIntensity: 0.5,
    shininess: 50, transparent: true, opacity: 0.95,
  });
  
  materials.pump = new THREE.MeshPhongMaterial({
    color: 0x8060a0, emissive: 0x301040, emissiveIntensity: 0.15,
    shininess: 40, transparent: true, opacity: 0.9,
  });
  
  materials.pumpActive = new THREE.MeshPhongMaterial({
    color: 0xb080e0, emissive: 0x4020a0, emissiveIntensity: 0.4,
    shininess: 60, transparent: true, opacity: 0.95,
  });
  
  materials.betaSubunit = new THREE.MeshPhongMaterial({
    color: 0x60a080, emissive: 0x103020, emissiveIntensity: 0.2, shininess: 30,
  });
  
  materials.pore = new THREE.MeshPhongMaterial({
    color: 0x202020, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  
  materials.poreOpen = new THREE.MeshPhongMaterial({
    color: 0x404080, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
  });
  
  materials.selectivityFilter = new THREE.MeshPhongMaterial({
    color: 0xffcc00, emissive: 0x664400, emissiveIntensity: 0.5, shininess: 80,
  });
  
  // Ion materials for transit
  materials.naIon = new THREE.MeshPhongMaterial({
    color: COLORS.Na, emissive: COLORS.Na, emissiveIntensity: 0.8, shininess: 100,
  });
  
  materials.kIon = new THREE.MeshPhongMaterial({
    color: COLORS.K, emissive: COLORS.K, emissiveIntensity: 0.8, shininess: 100,
  });
  
  materials.adp = new THREE.MeshPhongMaterial({
    color: 0x808080, emissive: 0x404040, emissiveIntensity: 0.2, shininess: 40,
  });
}

/**
 * Create voltage-gated sodium (Nav) channel with conformational parts
 */
function createNavChannel(x, z) {
  const group = new THREE.Group();
  const surfaceY = getMembraneSurfaceY(x, z);
  
  // Store references for animation
  const voltageSensors = [];
  const domainHelices = [];
  const pLoops = [];
  
  const domainOffsets = [
    { x: 0, z: -4, scale: 1.0 },
    { x: 4, z: 0, scale: 1.1 },
    { x: 0, z: 4, scale: 0.95 },
    { x: -4, z: 0, scale: 1.05 },
  ];
  
  // Create domains with animatable parts
  for (let d = 0; d < 4; d++) {
    const offset = domainOffsets[d];
    const domainGroup = new THREE.Group();
    const helicesInDomain = [];
    
    // Transmembrane helices
    for (let h = 0; h < 6; h++) {
      const angle = (h / 6) * Math.PI * 2;
      const helixRadius = 1.8 * offset.scale;
      const hx = Math.cos(angle) * helixRadius;
      const hz = Math.sin(angle) * helixRadius;
      
      const helixGeo = new THREE.CylinderGeometry(0.5, 0.5, 8, 6);
      const helix = new THREE.Mesh(helixGeo, materials.navClosed.clone());
      helix.position.set(hx, 0, hz);
      helix.userData.baseX = hx;
      helix.userData.baseZ = hz;
      domainGroup.add(helix);
      helicesInDomain.push(helix);
    }
    domainHelices.push(helicesInDomain);
    
    // S4 voltage sensor (moves UP when activated)
    const s4Geo = new THREE.CylinderGeometry(0.4, 0.4, 6, 6);
    const s4 = new THREE.Mesh(s4Geo, materials.voltageSensor.clone());
    s4.position.set(2.5 * offset.scale, 0, 0);
    s4.userData.baseY = 0;
    s4.userData.domainIndex = d;
    domainGroup.add(s4);
    voltageSensors.push(s4);
    
    domainGroup.position.set(offset.x, 0, offset.z);
    domainGroup.userData.baseX = offset.x;
    domainGroup.userData.baseZ = offset.z;
    group.add(domainGroup);
  }
  
  // P-loops (move apart when open)
  for (let d = 0; d < 4; d++) {
    const offset = domainOffsets[d];
    const pLoopGeo = new THREE.TorusGeometry(1.5, 0.4, 6, 12, Math.PI);
    const pLoop = new THREE.Mesh(pLoopGeo, materials.navClosed.clone());
    pLoop.position.set(offset.x, 5, offset.z);
    pLoop.rotation.x = Math.PI / 2;
    pLoop.rotation.y = (d / 4) * Math.PI * 2;
    pLoop.userData.baseX = offset.x;
    pLoop.userData.baseZ = offset.z;
    group.add(pLoop);
    pLoops.push(pLoop);
  }
  
  // Central pore
  const poreGeo = new THREE.CylinderGeometry(1.0, 1.2, 10, 12, 1, true);
  const pore = new THREE.Mesh(poreGeo, materials.pore.clone());
  group.add(pore);
  
  // Selectivity filter
  const filterGeo = new THREE.TorusGeometry(0.8, 0.2, 6, 16);
  const filter = new THREE.Mesh(filterGeo, materials.selectivityFilter);
  filter.rotation.x = Math.PI / 2;
  filter.position.y = 2;
  group.add(filter);
  
  // Inactivation gate
  const ballGeo = new THREE.SphereGeometry(0.8, 6, 5);
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshPhongMaterial({
    color: 0xff6060, emissive: 0x801010, emissiveIntensity: 0.3,
  }));
  ball.position.set(3, -2, 3);
  ball.userData.restingPos = new THREE.Vector3(3, -2, 3);
  ball.userData.inactivatedPos = new THREE.Vector3(0, -1.5, 0);
  group.add(ball);
  
  // C-terminus
  const cTermGeo = new THREE.SphereGeometry(2, 6, 5);
  cTermGeo.scale(1.5, 0.5, 1.5);
  const cTerm = new THREE.Mesh(cTermGeo, materials.navClosed.clone());
  cTerm.position.y = -6;
  group.add(cTerm);
  
  group.position.set(x, surfaceY, z);
  channelGroup.add(group);
  
  clearSpaceForChannel(x, z, SCALE.NAV_CHANNEL_DIAMETER / 2 + 2);
  
  const channelData = {
    group: group,
    pore: pore,
    filter: filter,
    inactivationGate: ball,
    voltageSensors: voltageSensors,
    domainHelices: domainHelices,
    pLoops: pLoops,
    state: NAV_STATES.CLOSED,
    position: new THREE.Vector3(x, surfaceY, z),
    stateChangeTime: 0,
    openProbability: 0,
    conformationProgress: 0, // 0 = closed, 1 = fully open
    lastIonTransit: 0,
  };
  
  navChannels.push(channelData);
  return channelData;
}

/**
 * Create voltage-gated potassium (Kv) channel
 */
function createKvChannel(x, z) {
  const group = new THREE.Group();
  const surfaceY = getMembraneSurfaceY(x, z);
  
  const subunitGroups = [];
  const voltageSensors = [];
  
  // Four identical subunits
  for (let s = 0; s < 4; s++) {
    const angle = (s / 4) * Math.PI * 2;
    const sx = Math.cos(angle) * 3.5;
    const sz = Math.sin(angle) * 3.5;
    
    const subunitGroup = new THREE.Group();
    
    // TM helices
    for (let h = 0; h < 6; h++) {
      const hAngle = (h / 6) * Math.PI * 2;
      const hx = Math.cos(hAngle) * 1.2;
      const hz = Math.sin(hAngle) * 1.2;
      
      const helixGeo = new THREE.CylinderGeometry(0.45, 0.45, 7, 5);
      const helix = new THREE.Mesh(helixGeo, materials.kvClosed.clone());
      helix.position.set(hx, 0, hz);
      helix.userData.baseX = hx;
      helix.userData.baseZ = hz;
      subunitGroup.add(helix);
    }
    
    // S4 voltage sensor
    const s4Geo = new THREE.CylinderGeometry(0.35, 0.35, 5, 5);
    const s4 = new THREE.Mesh(s4Geo, materials.voltageSensor.clone());
    s4.position.set(1.8, 0, 0);
    s4.userData.baseY = 0;
    subunitGroup.add(s4);
    voltageSensors.push(s4);
    
    subunitGroup.position.set(sx, 0, sz);
    subunitGroup.rotation.y = angle + Math.PI;
    subunitGroup.userData.baseAngle = angle;
    subunitGroup.userData.baseRadius = 3.5;
    group.add(subunitGroup);
    subunitGroups.push(subunitGroup);
  }
  
  // T1 domain
  const t1Geo = new THREE.CylinderGeometry(2.5, 2, 3, 8);
  const t1 = new THREE.Mesh(t1Geo, materials.kvClosed.clone());
  t1.position.y = -6;
  group.add(t1);
  
  // Central pore
  const poreGeo = new THREE.CylinderGeometry(0.8, 1.0, 8, 12, 1, true);
  const pore = new THREE.Mesh(poreGeo, materials.pore.clone());
  group.add(pore);
  
  // Selectivity filter rings
  const filterRings = [];
  for (let site = 0; site < 4; site++) {
    const siteY = 1 + site * 0.6;
    const siteGeo = new THREE.TorusGeometry(0.5, 0.12, 5, 12);
    const siteMesh = new THREE.Mesh(siteGeo, materials.selectivityFilter.clone());
    siteMesh.rotation.x = Math.PI / 2;
    siteMesh.position.y = siteY;
    siteMesh.userData.baseRadius = 0.5;
    group.add(siteMesh);
    filterRings.push(siteMesh);
  }
  
  // Turret
  const turretGeo = new THREE.TorusGeometry(2, 0.5, 6, 16);
  const turret = new THREE.Mesh(turretGeo, materials.kvClosed.clone());
  turret.rotation.x = Math.PI / 2;
  turret.position.y = 4.5;
  turret.userData.baseRadius = 2;
  group.add(turret);
  
  group.position.set(x, surfaceY, z);
  channelGroup.add(group);
  
  clearSpaceForChannel(x, z, SCALE.KV_CHANNEL_DIAMETER / 2 + 1.5);
  
  const channelData = {
    group: group,
    pore: pore,
    t1Domain: t1,
    turret: turret,
    subunitGroups: subunitGroups,
    voltageSensors: voltageSensors,
    filterRings: filterRings,
    state: KV_STATES.CLOSED,
    position: new THREE.Vector3(x, surfaceY, z),
    stateChangeTime: 0,
    openProbability: 0,
    conformationProgress: 0,
    lastIonTransit: 0,
  };
  
  kvChannels.push(channelData);
  return channelData;
}

/**
 * Create Na+/K+-ATPase pump with full conformational animation
 */
function createPump(x, z) {
  const group = new THREE.Group();
  const surfaceY = getMembraneSurfaceY(x, z);
  
  // TM helices
  const tmHelices = [];
  const tmHelixPositions = [
    { x: 0, z: 0 }, { x: 1.2, z: 0.6 }, { x: 1.8, z: -0.5 },
    { x: 0.8, z: -1.5 }, { x: -0.5, z: -1.8 }, { x: -1.6, z: -0.8 },
    { x: -1.8, z: 0.5 }, { x: -1.0, z: 1.5 }, { x: 0.4, z: 1.8 }, { x: 1.5, z: 1.2 },
  ];
  
  for (let h = 0; h < 10; h++) {
    const pos = tmHelixPositions[h];
    const helixGeo = new THREE.CylinderGeometry(0.4, 0.4, 7, 5);
    const helix = new THREE.Mesh(helixGeo, materials.pump.clone());
    helix.position.set(pos.x, 0, pos.z);
    helix.userData.baseX = pos.x;
    helix.userData.baseZ = pos.z;
    group.add(helix);
    tmHelices.push(helix);
  }
  
  // Cytoplasmic domains
  const aDomainGeo = new THREE.SphereGeometry(1.8, 6, 5);
  aDomainGeo.scale(1.2, 0.8, 1);
  const aDomain = new THREE.Mesh(aDomainGeo, materials.pump.clone());
  aDomain.position.set(-2, -5, 0);
  aDomain.userData.e1Pos = new THREE.Vector3(-2, -5, 0);
  aDomain.userData.e2Pos = new THREE.Vector3(-3.5, -4, 0.5);
  group.add(aDomain);
  
  const nDomainGeo = new THREE.SphereGeometry(2, 6, 5);
  nDomainGeo.scale(1.1, 0.9, 0.9);
  const nDomain = new THREE.Mesh(nDomainGeo, materials.pump.clone());
  nDomain.position.set(2.5, -5.5, 1);
  nDomain.userData.e1Pos = new THREE.Vector3(2.5, -5.5, 1);
  nDomain.userData.e2Pos = new THREE.Vector3(1.5, -4.5, 0);
  group.add(nDomain);
  
  const pDomainGeo = new THREE.SphereGeometry(1.5, 6, 5);
  const pDomain = new THREE.Mesh(pDomainGeo, materials.pump.clone());
  pDomain.position.set(0, -6, -1.5);
  pDomain.userData.e1Pos = new THREE.Vector3(0, -6, -1.5);
  pDomain.userData.e2Pos = new THREE.Vector3(0.5, -5, -1);
  group.add(pDomain);
  
  // Beta subunit
  const betaTMGeo = new THREE.CylinderGeometry(0.35, 0.35, 6, 5);
  const betaTM = new THREE.Mesh(betaTMGeo, materials.betaSubunit);
  betaTM.position.set(3.5, 0.5, -1);
  group.add(betaTM);
  
  const betaEctoGeo = new THREE.SphereGeometry(1.5, 6, 5);
  betaEctoGeo.scale(1, 1.3, 0.8);
  const betaEcto = new THREE.Mesh(betaEctoGeo, materials.betaSubunit);
  betaEcto.position.set(4, 5, -1);
  group.add(betaEcto);
  
  // Ion binding site indicators
  const naSites = [];
  for (let i = 0; i < 3; i++) {
    const naBindGeo = new THREE.SphereGeometry(0.35, 5, 4);
    const naBind = new THREE.Mesh(naBindGeo, materials.naIon.clone());
    const angle = (i / 3) * Math.PI * 2;
    naBind.position.set(Math.cos(angle) * 0.6, -1, Math.sin(angle) * 0.6);
    naBind.visible = false;
    group.add(naBind);
    naSites.push(naBind);
  }
  
  const kSites = [];
  for (let i = 0; i < 2; i++) {
    const kBindGeo = new THREE.SphereGeometry(0.4, 5, 4);
    const kBind = new THREE.Mesh(kBindGeo, materials.kIon.clone());
    const angle = (i / 2) * Math.PI + Math.PI / 4;
    kBind.position.set(Math.cos(angle) * 0.5, 1, Math.sin(angle) * 0.5);
    kBind.visible = false;
    group.add(kBind);
    kSites.push(kBind);
  }
  
  // ATP binding site indicator
  const atpSiteGeo = new THREE.SphereGeometry(0.6, 5, 4);
  atpSiteGeo.scale(1.3, 0.6, 0.6);
  const atpSite = new THREE.Mesh(atpSiteGeo, new THREE.MeshPhongMaterial({
    color: 0x26de81, emissive: 0x10a050, emissiveIntensity: 0.4,
  }));
  atpSite.position.set(2.5, -5, 1);
  atpSite.visible = false;
  group.add(atpSite);
  
  group.position.set(x, surfaceY, z);
  channelGroup.add(group);
  
  clearSpaceForChannel(x, z, SCALE.PUMP_DIAMETER / 2 + 2);
  
  const pumpData = {
    group: group,
    aDomain: aDomain,
    nDomain: nDomain,
    pDomain: pDomain,
    tmHelices: tmHelices,
    naSites: naSites,
    kSites: kSites,
    atpSite: atpSite,
    state: PUMP_STATES.E1,
    position: new THREE.Vector3(x, surfaceY, z),
    cyclePhase: Math.random(),
    cycleSpeed: animationState.pumpRate / 100,
    conformationProgress: 0,
    ionTransitPhase: 0,
    lastATPUse: 0,
  };
  
  pumps.push(pumpData);
  return pumpData;
}

/**
 * Create directional indicators showing soma vs axon direction
 */
function createDirectionalIndicators() {
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  
  // Large arrow pointing toward axon (positive X)
  const arrowLength = 30;
  const arrowGeo = new THREE.ConeGeometry(3, 8, 8);
  const arrowMat = new THREE.MeshPhongMaterial({
    color: 0x00ff88, emissive: 0x008844, emissiveIntensity: 0.3,
  });
  const arrowHead = new THREE.Mesh(arrowGeo, arrowMat);
  arrowHead.position.set(halfWidth - 10, SCALE.MEMBRANE_THICKNESS / 2 + 25, 0);
  arrowHead.rotation.z = -Math.PI / 2;
  channelGroup.add(arrowHead);
  
  const shaftGeo = new THREE.CylinderGeometry(1, 1, arrowLength, 8);
  const shaft = new THREE.Mesh(shaftGeo, arrowMat);
  shaft.position.set(halfWidth - 10 - arrowLength / 2 - 4, SCALE.MEMBRANE_THICKNESS / 2 + 25, 0);
  shaft.rotation.z = Math.PI / 2;
  channelGroup.add(shaft);
  
  // "→ AXON" label
  const axonLabel = createTextSprite('→ AXON TERMINAL', 0x00ff88);
  axonLabel.position.set(halfWidth - 25, SCALE.MEMBRANE_THICKNESS / 2 + 35, 0);
  axonLabel.scale.set(20, 6, 1);
  channelGroup.add(axonLabel);
  
  // "← SOMA" label
  const somaLabel = createTextSprite('← SOMA (cell body)', 0xff8800);
  somaLabel.position.set(-halfWidth + 30, SCALE.MEMBRANE_THICKNESS / 2 + 35, 0);
  somaLabel.scale.set(20, 6, 1);
  channelGroup.add(somaLabel);
  
  // Dividing line showing soma-proximal vs hillock regions
  const dividerGeo = new THREE.BoxGeometry(0.5, 20, SCALE.MEMBRANE_DEPTH);
  const dividerMat = new THREE.MeshPhongMaterial({
    color: 0xffff00, emissive: 0x888800, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.4,
  });
  const divider = new THREE.Mesh(dividerGeo, dividerMat);
  divider.position.set(0, 0, 0);
  channelGroup.add(divider);
  
  // Region labels
  const hillockLabel = createTextSprite('AXON HILLOCK\n(High Nav/Kv density)', 0xff4444);
  hillockLabel.position.set(halfWidth / 2, SCALE.MEMBRANE_THICKNESS / 2 + 28, -halfDepth + 20);
  hillockLabel.scale.set(18, 8, 1);
  channelGroup.add(hillockLabel);
  
  const somaRegionLabel = createTextSprite('SOMA MEMBRANE\n(Few voltage-gated channels)', 0x8888ff);
  somaRegionLabel.position.set(-halfWidth / 2, SCALE.MEMBRANE_THICKNESS / 2 + 28, -halfDepth + 20);
  somaRegionLabel.scale.set(18, 8, 1);
  channelGroup.add(somaRegionLabel);
}

/**
 * Create text sprite
 */
function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(line, 256, 64 + (i - (lines.length - 1) / 2) * 40);
  });
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false,
  });
  return new THREE.Sprite(material);
}

/**
 * Create all channels with regional distribution
 */
export function createAllChannels() {
  initMaterials();
  
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2;
  const margin = 25;
  
  // AXON HILLOCK REGION (X > 0): High density of Nav and Kv channels
  // This is where action potentials initiate
  const hillockNavCount = Math.floor(CHANNEL_COUNTS.navChannels * 0.85);
  const hillockKvCount = Math.floor(CHANNEL_COUNTS.kvChannels * 0.85);
  
  const hillockNavPositions = generateDistributedPositions(
    hillockNavCount, halfWidth - margin, halfDepth - margin, 28, [], 10, halfWidth - margin
  );
  for (const pos of hillockNavPositions) {
    createNavChannel(pos.x, pos.z);
  }
  
  const hillockKvPositions = generateDistributedPositions(
    hillockKvCount, halfWidth - margin, halfDepth - margin, 24, hillockNavPositions, 10, halfWidth - margin
  );
  for (const pos of hillockKvPositions) {
    createKvChannel(pos.x, pos.z);
  }
  
  // SOMA-PROXIMAL REGION (X < 0): Few voltage-gated channels
  // Mostly leak channels and pumps
  const somaNavCount = CHANNEL_COUNTS.navChannels - hillockNavCount;
  const somaKvCount = CHANNEL_COUNTS.kvChannels - hillockKvCount;
  
  const somaNavPositions = generateDistributedPositions(
    somaNavCount, halfWidth - margin, halfDepth - margin, 35, [], -halfWidth + margin, -10
  );
  for (const pos of somaNavPositions) {
    createNavChannel(pos.x, pos.z);
  }
  
  const somaKvPositions = generateDistributedPositions(
    somaKvCount, halfWidth - margin, halfDepth - margin, 35, somaNavPositions, -halfWidth + margin, -10
  );
  for (const pos of somaKvPositions) {
    createKvChannel(pos.x, pos.z);
  }
  
  // Pumps distributed evenly across both regions
  const allChannelPositions = [...hillockNavPositions, ...hillockKvPositions, ...somaNavPositions, ...somaKvPositions];
  const pumpPositions = generateDistributedPositions(
    CHANNEL_COUNTS.pumps, halfWidth - margin, halfDepth - margin, 22, allChannelPositions, -halfWidth + margin, halfWidth - margin
  );
  for (const pos of pumpPositions) {
    createPump(pos.x, pos.z);
  }
  
  // Add directional indicators
  createDirectionalIndicators();
}

/**
 * Generate positions within X range
 */
function generateDistributedPositions(count, maxX, maxZ, minDist, avoid = [], minXRange = null, maxXRange = null) {
  const positions = [];
  const maxAttempts = 150;
  
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let found = false;
    
    while (!found && attempts < maxAttempts) {
      let x, z;
      if (minXRange !== null && maxXRange !== null) {
        x = minXRange + Math.random() * (maxXRange - minXRange);
      } else {
        x = (Math.random() - 0.5) * 2 * maxX;
      }
      z = (Math.random() - 0.5) * 2 * maxZ;
      
      let tooClose = false;
      for (const pos of positions) {
        if (Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (const pos of avoid) {
          if (Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2) < minDist * 0.7) {
            tooClose = true;
            break;
          }
        }
      }
      
      if (!tooClose) {
        positions.push({ x, z });
        found = true;
      }
      attempts++;
    }
    
    if (!found && minXRange !== null) {
      positions.push({
        x: minXRange + Math.random() * (maxXRange - minXRange),
        z: (Math.random() - 0.5) * 2 * maxZ
      });
    }
  }
  return positions;
}

/**
 * Create an ion transiting through a channel
 */
function createTransitIon(type, channel, direction) {
  const ionGeo = new THREE.SphereGeometry(type === 'Na' ? 0.4 : 0.5, 8, 6);
  const ion = new THREE.Mesh(ionGeo, type === 'Na' ? materials.naIon.clone() : materials.kIon.clone());
  
  const startY = direction === 'in' ? 12 : -12;
  const endY = direction === 'in' ? -12 : 12;
  
  ion.position.set(
    channel.position.x + (Math.random() - 0.5) * 2,
    startY,
    channel.position.z + (Math.random() - 0.5) * 2
  );
  
  ionGroup.add(ion);
  
  transitingIons.push({
    mesh: ion,
    type: type,
    channel: channel,
    direction: direction,
    startY: startY,
    endY: endY,
    progress: 0,
    speed: 2 + Math.random(),
  });
}

/**
 * Create ADP molecule when ATP is consumed
 */
function createADP(pump) {
  const adpGeo = new THREE.SphereGeometry(0.5, 5, 4);
  adpGeo.scale(1.2, 0.5, 0.5);
  const adp = new THREE.Mesh(adpGeo, materials.adp.clone());
  
  adp.position.copy(pump.position);
  adp.position.y -= 8;
  adp.position.x += (Math.random() - 0.5) * 3;
  adp.position.z += (Math.random() - 0.5) * 3;
  
  ionGroup.add(adp);
  
  adpMolecules.push({
    mesh: adp,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      -1 - Math.random(),
      (Math.random() - 0.5) * 2
    ),
    lifetime: 0,
    maxLifetime: 3 + Math.random() * 2,
  });
}

/**
 * Update all channels with conformational animations
 */
export function updateChannels(deltaTime) {
  const time = animationState.time;
  const simTime = animationState.simTime;
  
  // Update Nav channels - each channel uses voltage based on its position
  let navOpen = 0;
  for (const channel of navChannels) {
    const localVoltage = getVoltageForPosition(channel.position.x);
    updateNavChannel(channel, localVoltage, simTime, deltaTime, time);
    if (channel.state === NAV_STATES.OPEN) navOpen++;
  }
  animationState.navOpenCount = navOpen;
  
  // Update Kv channels - each channel uses voltage based on its position
  let kvOpen = 0;
  for (const channel of kvChannels) {
    const localVoltage = getVoltageForPosition(channel.position.x);
    updateKvChannel(channel, localVoltage, simTime, deltaTime, time);
    if (channel.state === KV_STATES.OPEN) kvOpen++;
  }
  animationState.kvOpenCount = kvOpen;
  
  // Update pumps
  for (const pump of pumps) {
    updatePump(pump, deltaTime, simTime);
  }
  
  // Update transiting ions
  updateTransitingIons(deltaTime);
  
  // Update ADP molecules
  updateADPMolecules(deltaTime);
  
  // Brownian motion
  applyChannelBrownianMotion(time);
}

/**
 * Update Nav channel with conformational changes
 */
function updateNavChannel(channel, voltage, simTime, deltaTime, time) {
  const threshold = animationState.navThreshold;
  const openProb = getNavOpenProbability(voltage, threshold);
  channel.openProbability = openProb;
  
  // Calculate voltage-dependent activation (even subthreshold)
  // This creates visual feedback for voltage changes
  const voltageNormalized = Math.max(0, Math.min(1, (voltage + 70) / 50)); // -70 to -20 maps to 0-1
  channel.voltageActivation = voltageNormalized;
  
  // State transitions - use scaled time for proper millisecond timing
  const dt = deltaTime * 60; // Scale up for faster response at normal speeds
  
  switch (channel.state) {
    case NAV_STATES.CLOSED:
      // Open probability increases significantly above threshold
      if (voltage > threshold && Math.random() < openProb * dt * 0.5) {
        channel.state = NAV_STATES.OPEN;
        channel.stateChangeTime = simTime;
      }
      // Animate toward closed but show voltage-dependent partial activation
      const closedTarget = voltageNormalized * 0.3; // Up to 30% activation when depolarized but not open
      channel.conformationProgress += (closedTarget - channel.conformationProgress) * dt * 0.1;
      break;
      
    case NAV_STATES.OPEN:
      // Inactivation timing in ms
      if (simTime - channel.stateChangeTime > 1.5 / animationState.navInactivationRate) {
        channel.state = NAV_STATES.INACTIVATED;
        channel.stateChangeTime = simTime;
      }
      // Animate toward full open conformation quickly
      channel.conformationProgress = Math.min(1, channel.conformationProgress + dt * 0.15);
      
      // Trigger ion transit more frequently when open
      if (simTime - channel.lastIonTransit > 0.3 && Math.random() < 0.4 * dt) {
        createTransitIon('Na', channel, 'in');
        channel.lastIonTransit = simTime;
      }
      break;
      
    case NAV_STATES.INACTIVATED:
      // Recovery from inactivation
      if (voltage < -60 && simTime - channel.stateChangeTime > 2) {
        if (Math.random() < 0.05 * dt) {
          channel.state = NAV_STATES.CLOSED;
          channel.stateChangeTime = simTime;
        }
      }
      // Slow return to closed conformation
      channel.conformationProgress = Math.max(0, channel.conformationProgress - dt * 0.05);
      break;
  }
  
  // Clamp conformation progress
  channel.conformationProgress = Math.max(0, Math.min(1, channel.conformationProgress));
  
  // Apply conformational changes
  applyNavConformation(channel, time);
}

/**
 * Apply Nav channel conformational changes
 */
function applyNavConformation(channel, time) {
  const t = channel.conformationProgress;
  const vAct = channel.voltageActivation || 0; // Voltage-dependent activation
  
  // S4 voltage sensors move UP when activated
  // They respond to voltage even at subthreshold (voltage activation)
  const sensorMovement = Math.max(t, vAct * 0.6); // Sensors show voltage response
  for (const s4 of channel.voltageSensors) {
    s4.position.y = s4.userData.baseY + sensorMovement * 2.5;
    // Color changes based on voltage activation level
    if (t > 0.5) {
      s4.material = materials.voltageSensorActivated;
    } else if (vAct > 0.3) {
      // Intermediate color for subthreshold depolarization
      s4.material.color.setHex(0x4080ff + Math.floor(vAct * 0x40) * 0x010100);
      s4.material.emissiveIntensity = 0.4 + vAct * 0.3;
    } else {
      s4.material = materials.voltageSensor;
    }
  }
  
  // Pore opens (domains move apart)
  if (channel.pore) {
    const poreOpen = Math.max(t * 0.5, vAct * 0.15);
    channel.pore.scale.set(1 + poreOpen, 1, 1 + poreOpen);
    channel.pore.material = t > 0.5 ? materials.poreOpen : materials.pore;
  }
  
  // P-loops move outward - respond to both voltage and state
  for (const pLoop of channel.pLoops) {
    const expansion = 1 + t * 0.3 + vAct * 0.1;
    pLoop.position.x = pLoop.userData.baseX * expansion;
    pLoop.position.z = pLoop.userData.baseZ * expansion;
  }
  
  // Inactivation gate position
  if (channel.inactivationGate) {
    if (channel.state === NAV_STATES.INACTIVATED) {
      channel.inactivationGate.position.lerp(channel.inactivationGate.userData.inactivatedPos, 0.1);
    } else {
      channel.inactivationGate.position.lerp(channel.inactivationGate.userData.restingPos, 0.1);
    }
  }
  
  // Update materials based on state
  const mat = channel.state === NAV_STATES.OPEN ? materials.navOpen :
              channel.state === NAV_STATES.INACTIVATED ? materials.navInactivated : materials.navClosed;
  channel.group.traverse(child => {
    if (child.isMesh && !child.userData.baseY && child.material !== materials.voltageSensor &&
        child.material !== materials.voltageSensorActivated && child !== channel.pore &&
        child !== channel.filter && child !== channel.inactivationGate) {
      child.material = mat.clone();
    }
  });
}

/**
 * Update Kv channel
 */
function updateKvChannel(channel, voltage, simTime, deltaTime, time) {
  const openProb = getKvOpenProbability(voltage);
  channel.openProbability = openProb;
  
  // Voltage-dependent activation for visual feedback
  const voltageNormalized = Math.max(0, Math.min(1, (voltage + 50) / 80)); // -50 to +30 maps to 0-1
  channel.voltageActivation = voltageNormalized;
  
  const dt = deltaTime * 60; // Scale for responsiveness
  
  switch (channel.state) {
    case KV_STATES.CLOSED:
      // Kv channels activate at more depolarized voltages with delay
      if (voltage > -30 && Math.random() < openProb * dt * 0.3) {
        channel.state = KV_STATES.OPEN;
        channel.stateChangeTime = simTime;
      }
      // Show voltage-dependent partial activation
      const closedTarget = voltageNormalized * 0.25;
      channel.conformationProgress += (closedTarget - channel.conformationProgress) * dt * 0.08;
      break;
      
    case KV_STATES.OPEN:
      // Kv stays open longer (delayed rectifier behavior)
      if (voltage < -60 && simTime - channel.stateChangeTime > 3) {
        if (Math.random() < 0.03 * dt) {
          channel.state = KV_STATES.CLOSED;
          channel.stateChangeTime = simTime;
        }
      }
      channel.conformationProgress = Math.min(1, channel.conformationProgress + dt * 0.1);
      
      // K+ efflux
      if (simTime - channel.lastIonTransit > 0.4 && Math.random() < 0.3 * dt) {
        createTransitIon('K', channel, 'out');
        channel.lastIonTransit = simTime;
      }
      break;
  }
  
  channel.conformationProgress = Math.max(0, Math.min(1, channel.conformationProgress));
  applyKvConformation(channel, time);
}

/**
 * Apply Kv channel conformational changes
 */
function applyKvConformation(channel, time) {
  const t = channel.conformationProgress;
  const vAct = channel.voltageActivation || 0;
  
  // S4 sensors move up - respond to voltage even when closed
  const sensorMove = Math.max(t, vAct * 0.5);
  for (const s4 of channel.voltageSensors) {
    s4.position.y = s4.userData.baseY + sensorMove * 2;
    if (t > 0.5) {
      s4.material = materials.voltageSensorActivated;
    } else if (vAct > 0.25) {
      s4.material.color.setHex(0x4080ff + Math.floor(vAct * 0x40) * 0x010100);
      s4.material.emissiveIntensity = 0.4 + vAct * 0.3;
    } else {
      s4.material = materials.voltageSensor;
    }
  }
  
  // Subunits rotate outward (gate opens) - slight voltage response
  for (const subunit of channel.subunitGroups) {
    const newRadius = subunit.userData.baseRadius + t * 0.8 + vAct * 0.2;
    const angle = subunit.userData.baseAngle;
    subunit.position.x = Math.cos(angle) * newRadius;
    subunit.position.z = Math.sin(angle) * newRadius;
  }
  
  // Pore expands
  if (channel.pore) {
    const poreOpen = t * 0.4 + vAct * 0.1;
    channel.pore.scale.set(1 + poreOpen, 1, 1 + poreOpen);
  }
  
  // Turret expands
  if (channel.turret) {
    channel.turret.scale.set(1 + t * 0.2 + vAct * 0.05, 1, 1 + t * 0.2 + vAct * 0.05);
  }
  
  // Filter rings expand
  for (const ring of channel.filterRings) {
    ring.scale.set(1 + t * 0.3 + vAct * 0.1, 1, 1 + t * 0.3 + vAct * 0.1);
  }
  
  // Update material
  const mat = channel.state === KV_STATES.OPEN ? materials.kvOpen : materials.kvClosed;
  channel.group.traverse(child => {
    if (child.isMesh && child.material !== materials.voltageSensor &&
        child.material !== materials.voltageSensorActivated && child !== channel.pore &&
        !channel.filterRings.includes(child)) {
      child.material = mat.clone();
    }
  });
}

/**
 * Update pump with E1-E2 cycle and ion transport
 */
function updatePump(pump, deltaTime, simTime) {
  pump.cyclePhase += deltaTime * pump.cycleSpeed * 0.2;
  if (pump.cyclePhase >= 1) {
    pump.cyclePhase = 0;
    // Use ATP -> create ADP
    if (simTime - pump.lastATPUse > 1) {
      createADP(pump);
      pump.lastATPUse = simTime;
    }
  }
  
  const phase = pump.cyclePhase;
  
  // Determine state based on phase
  if (phase < 0.25) {
    pump.state = PUMP_STATES.E1;
    pump.conformationProgress = phase * 4; // 0 to 1 within E1
    // Show Na+ binding (intracellular side)
    pump.naSites.forEach((site, i) => {
      site.visible = phase > 0.1 * (i + 1);
      site.position.y = -1 - (1 - pump.conformationProgress) * 2;
    });
    pump.kSites.forEach(site => site.visible = false);
    pump.atpSite.visible = phase > 0.15;
  } else if (phase < 0.5) {
    pump.state = PUMP_STATES.E1P;
    pump.conformationProgress = (phase - 0.25) * 4;
    // Na+ being pumped OUT
    pump.naSites.forEach((site, i) => {
      site.visible = true;
      site.position.y = -1 + pump.conformationProgress * 4;
    });
    if (pump.conformationProgress > 0.7) {
      // Release Na+ outside
      pump.naSites.forEach(site => site.visible = false);
    }
    pump.atpSite.visible = false;
  } else if (phase < 0.75) {
    pump.state = PUMP_STATES.E2P;
    pump.conformationProgress = (phase - 0.5) * 4;
    pump.naSites.forEach(site => site.visible = false);
    // K+ binding (extracellular side)
    pump.kSites.forEach((site, i) => {
      site.visible = pump.conformationProgress > 0.3 * (i + 1);
      site.position.y = 1 + (1 - pump.conformationProgress) * 2;
    });
  } else {
    pump.state = PUMP_STATES.E2;
    pump.conformationProgress = (phase - 0.75) * 4;
    // K+ being pumped IN
    pump.kSites.forEach((site, i) => {
      site.visible = true;
      site.position.y = 1 - pump.conformationProgress * 4;
    });
    if (pump.conformationProgress > 0.8) {
      pump.kSites.forEach(site => site.visible = false);
    }
  }
  
  // Conformational changes (E1 <-> E2)
  const isE2 = pump.state === PUMP_STATES.E2P || pump.state === PUMP_STATES.E2;
  const targetProgress = isE2 ? 1 : 0;
  
  // A domain rotation
  pump.aDomain.position.lerpVectors(pump.aDomain.userData.e1Pos, pump.aDomain.userData.e2Pos, 
    isE2 ? pump.conformationProgress : 1 - pump.conformationProgress);
  pump.aDomain.rotation.z = (isE2 ? 1 : 0) * 0.5;
  
  // N domain movement
  pump.nDomain.position.lerpVectors(pump.nDomain.userData.e1Pos, pump.nDomain.userData.e2Pos,
    isE2 ? pump.conformationProgress : 1 - pump.conformationProgress);
  
  // P domain
  pump.pDomain.position.lerpVectors(pump.pDomain.userData.e1Pos, pump.pDomain.userData.e2Pos,
    isE2 ? pump.conformationProgress : 1 - pump.conformationProgress);
  
  // Update material
  const active = pump.state === PUMP_STATES.E1P || pump.state === PUMP_STATES.E2P;
  const mat = active ? materials.pumpActive : materials.pump;
  pump.aDomain.material = mat.clone();
  pump.nDomain.material = mat.clone();
  pump.pDomain.material = mat.clone();
}

/**
 * Update transiting ions
 */
function updateTransitingIons(deltaTime) {
  for (let i = transitingIons.length - 1; i >= 0; i--) {
    const ion = transitingIons[i];
    ion.progress += deltaTime * ion.speed;
    
    // Move through channel
    const t = Math.min(1, ion.progress);
    ion.mesh.position.y = ion.startY + (ion.endY - ion.startY) * easeInOutQuad(t);
    
    // Wiggle as it goes through
    ion.mesh.position.x = ion.channel.position.x + Math.sin(t * Math.PI * 4) * 0.3;
    ion.mesh.position.z = ion.channel.position.z + Math.cos(t * Math.PI * 3) * 0.3;
    
    // Pulse effect
    const scale = 1 + Math.sin(t * Math.PI) * 0.3;
    ion.mesh.scale.setScalar(scale);
    
    if (ion.progress >= 1) {
      ionGroup.remove(ion.mesh);
      transitingIons.splice(i, 1);
    }
  }
}

/**
 * Update ADP molecules (drift away and fade)
 */
function updateADPMolecules(deltaTime) {
  for (let i = adpMolecules.length - 1; i >= 0; i--) {
    const adp = adpMolecules[i];
    adp.lifetime += deltaTime;
    
    adp.mesh.position.add(adp.velocity.clone().multiplyScalar(deltaTime));
    adp.mesh.rotation.x += 0.02;
    adp.mesh.rotation.y += 0.01;
    
    // Fade out
    const fade = 1 - (adp.lifetime / adp.maxLifetime);
    adp.mesh.material.opacity = fade * 0.8;
    
    if (adp.lifetime >= adp.maxLifetime) {
      ionGroup.remove(adp.mesh);
      adpMolecules.splice(i, 1);
    }
  }
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Brownian motion
 */
function applyChannelBrownianMotion(time) {
  const amp = BROWNIAN.channelAmplitude * animationState.brownianIntensity * 0.3;
  
  for (const channel of navChannels) {
    const phase = channel.position.x * 0.1;
    channel.group.position.y = channel.position.y + Math.sin(time * 1.2 + phase) * amp;
  }
  
  for (const channel of kvChannels) {
    const phase = channel.position.x * 0.12;
    channel.group.position.y = channel.position.y + Math.sin(time * 1.3 + phase) * amp;
  }
  
  for (const pump of pumps) {
    const phase = pump.position.x * 0.08;
    pump.group.position.y = pump.position.y + Math.sin(time * 1.0 + phase) * amp * 0.5;
  }
}

export function getChannelCounts() {
  return {
    navOpen: animationState.navOpenCount,
    navTotal: navChannels.length,
    kvOpen: animationState.kvOpenCount,
    kvTotal: kvChannels.length,
    pumpsActive: pumps.filter(p => p.state === PUMP_STATES.E1P || p.state === PUMP_STATES.E2P).length,
    pumpsTotal: pumps.length,
  };
}

export function getChannelAtPosition(intersects) {
  for (const intersect of intersects) {
    let parent = intersect.object.parent;
    while (parent && parent !== scene) {
      for (const channel of navChannels) {
        if (channel.group === parent) return { type: 'nav', channel };
      }
      for (const channel of kvChannels) {
        if (channel.group === parent) return { type: 'kv', channel };
      }
      for (const pump of pumps) {
        if (pump.group === parent) return { type: 'pump', pump };
      }
      parent = parent.parent;
    }
  }
  return null;
}

export function toggleChannelState(channelInfo) {
  if (channelInfo.type === 'nav') {
    const channel = channelInfo.channel;
    const states = [NAV_STATES.CLOSED, NAV_STATES.OPEN, NAV_STATES.INACTIVATED];
    const idx = states.indexOf(channel.state);
    channel.state = states[(idx + 1) % 3];
    channel.stateChangeTime = animationState.simTime;
  } else if (channelInfo.type === 'kv') {
    const channel = channelInfo.channel;
    channel.state = channel.state === KV_STATES.CLOSED ? KV_STATES.OPEN : KV_STATES.CLOSED;
    channel.stateChangeTime = animationState.simTime;
  }
}
