/**
 * scene.js - Three.js scene setup, camera, lighting, environment
 * Creates an immersive synaptic environment with anatomically accurate structures
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, camera, container,
  synapseGroup, presynapticGroup, postsynapticGroup,
  cleftGroup, astrocyteGroup, vesicleGroup,
  ionGroup, ntGroup, receptorGroup, channelGroup,
  SCALE, COLORS, POSITIONS, ASTROCYTE, CHANNEL_COUNTS, animationState
} from './config.js';

export let renderer;

// Environment elements
let extracellularRegion;
let intracellularRegion;
let cleftRegion;

// Structure groups for visibility toggling
export const structureGroups = {
  // Dome bodies (cytoplasm)
  terminalDome: new THREE.Group(),
  spineDome: new THREE.Group(),
  // Membrane faces (can be shown independently)
  presynapticMembrane: new THREE.Group(),
  postsynapticMembrane: new THREE.Group(),
  // Other structures
  vesicles: vesicleGroup,
  astrocyte: astrocyteGroup,
  caChannels: new THREE.Group(),
  axonSegment: new THREE.Group(),
  dendriteSegment: new THREE.Group(),
};

// Ca2+ channel meshes for state updates
export const caChannelMeshes = [];

/**
 * Initialize the Three.js scene
 */
export function initScene() {
  // Dark synaptic background
  scene.background = new THREE.Color(COLORS.background);
  
  // NO fog - keep all objects visible at all distances
  scene.fog = null;

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;  // Slightly brighter
  container.appendChild(renderer.domElement);

  // Camera initial position - angled view for dome synapse
  camera.position.set(45, 25, 60);
  camera.lookAt(0, 0, 0);

  // Create lighting
  setupLighting();

  // Create environment regions
  createEnvironmentRegions();

  // Create synaptic structures
  createSynapticStructures();

  // Create astrocyte wrapping
  createAstrocyteProcess();
  
  // Add scale ruler showing cleft width
  createScaleRuler();

  // Assemble groups
  synapseGroup.add(presynapticGroup);
  synapseGroup.add(postsynapticGroup);
  synapseGroup.add(cleftGroup);
  synapseGroup.add(astrocyteGroup);
  astrocyteGroup.visible = animationState.showAstrocyte;  // Start invisible by default
  synapseGroup.add(vesicleGroup);
  synapseGroup.add(ionGroup);
  synapseGroup.add(ntGroup);
  synapseGroup.add(receptorGroup);
  synapseGroup.add(channelGroup);
  
  scene.add(synapseGroup);

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

/**
 * Setup lighting for clear molecular visualization with depth cues
 */
function setupLighting() {
  // Brighter ambient for visibility
  const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambientLight);

  // Key light from above-front (main illumination)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(30, 50, 40);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 150;
  keyLight.shadow.camera.left = -40;
  keyLight.shadow.camera.right = 40;
  keyLight.shadow.camera.top = 40;
  keyLight.shadow.camera.bottom = -40;
  scene.add(keyLight);

  // Fill light from opposite side
  const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  fillLight.position.set(-30, 20, -30);
  scene.add(fillLight);

  // Rim light from behind for edge definition
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  rimLight.position.set(0, -10, -50);
  scene.add(rimLight);

  // Subtle colored accents for presynaptic (warm) and postsynaptic (cool)
  const preLight = new THREE.PointLight(0xff8866, 0.4, 35);
  preLight.position.set(0, 10, 0);
  scene.add(preLight);

  const postLight = new THREE.PointLight(0x6688ff, 0.4, 35);
  postLight.position.set(0, -15, 0);
  scene.add(postLight);

  // Hemisphere light for natural sky/ground gradient
  const hemiLight = new THREE.HemisphereLight(0x88aaff, 0xff8866, 0.3);
  scene.add(hemiLight);
}

/**
 * Create semi-transparent regions representing compartments
 */
function createEnvironmentRegions() {
  // Regions are now implicit through the structures themselves
  // This provides cleaner visualization without distracting boxes
  
  // Optional: add a very subtle floor plane for depth reference
  const floorGeo = new THREE.PlaneGeometry(100, 100);
  const floorMat = new THREE.MeshBasicMaterial({
    color: 0x0a1020,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -25;
  scene.add(floor);
}

/**
 * Create an organic-looking hemisphere with noise displacement
 * @param {number} radius - Base radius
 * @param {number} widthSeg - Width segments
 * @param {number} heightSeg - Height segments  
 * @param {number} noiseAmp - Noise amplitude (0-1, as fraction of radius)
 */
function createOrganicHemisphere(radius, widthSeg, heightSeg, noiseAmp) {
  const geo = new THREE.SphereGeometry(radius, widthSeg, heightSeg, 0, Math.PI * 2, 0, Math.PI * 0.5);
  
  // Apply organic noise to vertices
  const positions = geo.attributes.position;
  const vertex = new THREE.Vector3();
  
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    
    // Multi-frequency noise for organic look
    const noise1 = Math.sin(vertex.x * 0.3 + vertex.z * 0.4) * Math.cos(vertex.y * 0.2);
    const noise2 = Math.sin(vertex.x * 0.7 - vertex.z * 0.5 + 1.5) * 0.5;
    const noise3 = Math.cos(vertex.x * 1.2 + vertex.y * 0.8) * Math.sin(vertex.z * 0.9) * 0.3;
    
    const totalNoise = (noise1 + noise2 + noise3) * noiseAmp * radius;
    
    // Only displace outward (not the flat base)
    if (vertex.y > 0.1) {
      const dir = vertex.clone().normalize();
      vertex.add(dir.multiplyScalar(totalNoise));
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
  }
  
  geo.computeVertexNormals();
  return geo;
}

/**
 * Create the main synaptic structures - DOME SHAPES with flat cleft-facing surfaces
 * Dome body and membrane face are separate groups for independent toggling
 */
function createSynapticStructures() {
  // === SCALE ===
  const vesicleRadius = 1.0;
  const cleftWidth = 6.0;       // Wider cleft for clear separation
  const terminalRadius = 18;    // Terminal dome radius
  const spineRadius = 16;       // Spine dome radius
  const activeZoneRadius = terminalRadius * 0.7;  // Active zone region
  
  // Cleft boundaries - membranes face each other across this gap
  const preMembraneY = cleftWidth / 2;   // +3: Upper boundary of cleft (presynaptic side)
  const postMembraneY = -cleftWidth / 2; // -3: Lower boundary of cleft (postsynaptic side)
  
  // === PRESYNAPTIC TERMINAL (ABOVE CLEFT) ===
  // Hemisphere curving UPWARD, with flat base at preMembraneY
  
  // 1. Terminal DOME (cytoplasm body) - use organic noise for realistic shape
  const terminalGeo = createOrganicHemisphere(terminalRadius, 48, 32, 0.08);
  const terminalMat = new THREE.MeshPhongMaterial({
    color: 0x7799bb,
    emissive: 0x334455,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.45,  // More see-through
    side: THREE.DoubleSide,
    shininess: 20,
    specular: 0x222233,
    depthWrite: false,  // DON'T write to depth buffer - allows vesicles inside to be visible
  });
  const terminalDome = new THREE.Mesh(terminalGeo, terminalMat);
  // NO rotation - hemisphere naturally curves upward
  terminalDome.position.y = preMembraneY;  // Base at presynaptic membrane level
  terminalDome.userData.type = 'presynaptic';
  terminalDome.renderOrder = -1;  // Render FIRST (background)
  structureGroups.terminalDome.add(terminalDome);
  presynapticGroup.add(structureGroups.terminalDome);
  
  // 2. Presynaptic MEMBRANE face - at the cleft boundary, facing DOWN into cleft
  const preMembraneMat = new THREE.MeshPhongMaterial({
    color: 0xffaaaa,
    emissive: 0xcc4444,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    shininess: 40,
  });
  const preFaceGeo = new THREE.CircleGeometry(terminalRadius * 0.98, 48);
  const preFace = new THREE.Mesh(preFaceGeo, preMembraneMat);
  preFace.rotation.x = Math.PI / 2;  // Horizontal, facing down
  preFace.position.y = preMembraneY;  // At cleft boundary
  structureGroups.presynapticMembrane.add(preFace);
  
  // Active zone on presynaptic membrane - bright yellow region
  const activeZoneMat = new THREE.MeshPhongMaterial({
    color: 0xffcc33,
    emissive: 0xcc8800,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
    shininess: 60,
  });
  const activeZoneGeo = new THREE.CircleGeometry(activeZoneRadius, 48);
  const activeZone = new THREE.Mesh(activeZoneGeo, activeZoneMat);
  activeZone.rotation.x = Math.PI / 2;
  activeZone.position.y = preMembraneY - 0.1;  // Just below membrane surface
  activeZone.userData.type = 'activeZone';
  structureGroups.presynapticMembrane.add(activeZone);
  
  presynapticGroup.add(structureGroups.presynapticMembrane);
  
  // Store references
  presynapticGroup.userData.membrane = preFace;
  presynapticGroup.userData.activeZone = activeZone;
  presynapticGroup.userData.dome = terminalDome;
  
  // === AXON ===
  createOrganicAxon(preMembraneY, terminalRadius);

  // === Ca²⁺ CHANNELS - around larger active zone, embedded in presynaptic membrane ===
  createCaChannels(activeZoneRadius, preMembraneY, terminalRadius);
  
  // === CB1 RECEPTORS - on presynaptic terminal for retrograde endocannabinoid signaling ===
  createCB1Receptors(terminalRadius, preMembraneY);

  // === POSTSYNAPTIC SPINE (BELOW CLEFT) ===
  // Hemisphere curving DOWNWARD, with flat top at postMembraneY
  
  // 1. Spine DOME (cytoplasm body) - use organic noise, FLIP to curve downward
  const spineGeo = createOrganicHemisphere(spineRadius, 48, 32, 0.08);
  const spineHeadMat = new THREE.MeshPhongMaterial({
    color: 0x6688aa,
    emissive: 0x223344,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.45,  // More see-through
    side: THREE.DoubleSide,
    shininess: 20,
    specular: 0x222233,
    depthWrite: false,  // DON'T write to depth buffer - allows ions inside to be visible
  });
  const spineDome = new THREE.Mesh(spineGeo, spineHeadMat);
  spineDome.rotation.x = Math.PI;  // FLIP so it curves downward
  spineDome.position.y = postMembraneY;  // Base at postsynaptic membrane level
  spineDome.userData.type = 'postsynaptic';
  spineDome.renderOrder = -1;  // Render FIRST (background)
  structureGroups.spineDome.add(spineDome);
  postsynapticGroup.add(structureGroups.spineDome);
  
  // 2. Postsynaptic MEMBRANE face - at cleft boundary, facing UP into cleft
  const postMembraneMat = new THREE.MeshPhongMaterial({
    color: 0xaabbff,
    emissive: 0x4466aa,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    shininess: 40,
  });
  const postFaceGeo = new THREE.CircleGeometry(spineRadius * 0.98, 48);
  const postFace = new THREE.Mesh(postFaceGeo, postMembraneMat);
  postFace.rotation.x = -Math.PI / 2;  // Horizontal, facing up
  postFace.position.y = postMembraneY;  // At cleft boundary
  structureGroups.postsynapticMembrane.add(postFace);
  
  // Postsynaptic density (PSD) - distinct blue region where receptors cluster
  const psdMat = new THREE.MeshPhongMaterial({
    color: 0x99ccff,
    emissive: 0x4488cc,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
    shininess: 60,
  });
  const psdGeo = new THREE.CircleGeometry(activeZoneRadius, 48);
  const psd = new THREE.Mesh(psdGeo, psdMat);
  psd.rotation.x = -Math.PI / 2;
  psd.position.y = postMembraneY + 0.1;  // Just above membrane surface
  psd.userData.type = 'psd';
  structureGroups.postsynapticMembrane.add(psd);
  
  postsynapticGroup.add(structureGroups.postsynapticMembrane);
  
  // Store references
  postsynapticGroup.userData.membrane = postFace;
  postsynapticGroup.userData.psd = psd;
  postsynapticGroup.userData.dome = spineDome;
  
  // === SPINE NECK AND DENDRITE ===
  createOrganicDendrite(postMembraneY, spineRadius);

  // Update stored scale values
  SCALE.CLEFT_WIDTH = cleftWidth;
  SCALE.ACTIVE_ZONE_RADIUS = activeZoneRadius;
  SCALE.VESICLE_RADIUS = vesicleRadius;
  SCALE.TERMINAL_RADIUS = terminalRadius;
  SCALE.SPINE_RADIUS = spineRadius;
}

/**
 * Create LONG PROMINENT AXON connecting to the TOP of the terminal dome
 */
function createOrganicAxon(preMembraneY, terminalRadius) {
  const terminalTopY = preMembraneY + terminalRadius;
  
  const axonMat = new THREE.MeshPhongMaterial({
    color: 0x8899aa,
    emissive: 0x667788,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.7,
  });
  
  // Axon coming from upper-left
  const axonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-50, terminalTopY + 35, -18),
    new THREE.Vector3(-38, terminalTopY + 25, -12),
    new THREE.Vector3(-28, terminalTopY + 15, -6),
    new THREE.Vector3(-18, terminalTopY + 6, -2),
    new THREE.Vector3(-8, terminalTopY - 2, 0),
  ]);
  
  const axonGeo = new THREE.TubeGeometry(axonCurve, 40, 3.0, 14, false);
  const axonMesh = new THREE.Mesh(axonGeo, axonMat);
  structureGroups.axonSegment.add(axonMesh);
  
  // Collar
  const collarGeo = new THREE.SphereGeometry(5, 16, 12);
  const collar = new THREE.Mesh(collarGeo, axonMat.clone());
  collar.scale.set(1.2, 0.8, 1.2);
  collar.position.set(-6, terminalTopY - 3, 0);
  structureGroups.axonSegment.add(collar);
  
  // Myelin segments
  const myelinMat = new THREE.MeshPhongMaterial({
    color: 0xaabbcc,
    emissive: 0x889999,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.6,
  });
  
  for (let i = 0; i < 4; i++) {
    const t = 0.1 + i * 0.18;
    const pos = axonCurve.getPoint(t);
    const myelinGeo = new THREE.TorusGeometry(3.8, 0.8, 8, 18);
    const myelin = new THREE.Mesh(myelinGeo, myelinMat);
    myelin.position.copy(pos);
    const nextPos = axonCurve.getPoint(Math.min(t + 0.05, 1));
    myelin.lookAt(nextPos);
    structureGroups.axonSegment.add(myelin);
  }
  
  presynapticGroup.add(structureGroups.axonSegment);
}

/**
 * Create spine neck and dendrite connecting from BOTTOM of spine dome
 */
function createOrganicDendrite(postMembraneY, spineRadius) {
  const spineBottomY = postMembraneY - spineRadius;
  
  const dendriteMat = new THREE.MeshPhongMaterial({
    color: 0x6688bb,
    emissive: 0x445577,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.65,
  });
  
  // Spine neck
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, spineBottomY + 2, 0),
    new THREE.Vector3(1, spineBottomY - 6, 0.5),
    new THREE.Vector3(2, spineBottomY - 12, 0),
  ]);
  
  const neckGeo = new THREE.TubeGeometry(neckCurve, 16, 2.5, 10, false);
  const neckMesh = new THREE.Mesh(neckGeo, dendriteMat);
  structureGroups.dendriteSegment.add(neckMesh);
  
  // Main dendrite shaft
  const dendriteY = spineBottomY - 14;
  const dendriteShaftGeo = new THREE.CylinderGeometry(5, 5, 60, 16);
  const dendriteShaft = new THREE.Mesh(dendriteShaftGeo, dendriteMat);
  dendriteShaft.rotation.z = Math.PI / 2;
  dendriteShaft.position.y = dendriteY;
  dendriteShaft.position.x = 2;
  structureGroups.dendriteSegment.add(dendriteShaft);
  
  // Collar
  const neckCollarGeo = new THREE.SphereGeometry(4, 12, 10);
  const neckCollar = new THREE.Mesh(neckCollarGeo, dendriteMat.clone());
  neckCollar.scale.set(1.2, 0.6, 1.2);
  neckCollar.position.set(2, dendriteY + 2, 0);
  structureGroups.dendriteSegment.add(neckCollar);
  
  // Spine buds
  const budMat = dendriteMat.clone();
  budMat.opacity = 0.5;
  const budGeo = new THREE.SphereGeometry(2.5, 8, 6);
  
  const budPositions = [
    { x: 18, y: dendriteY + 2.5, z: 3 },
    { x: -14, y: dendriteY + 2.5, z: -2.5 },
    { x: 25, y: dendriteY + 2, z: -1.5 },
    { x: -22, y: dendriteY + 2, z: 2 },
  ];
  
  for (const pos of budPositions) {
    const bud = new THREE.Mesh(budGeo, budMat.clone());
    bud.position.set(pos.x, pos.y, pos.z);
    bud.scale.set(1 + Math.random() * 0.2, 0.6, 1 + Math.random() * 0.2);
    structureGroups.dendriteSegment.add(bud);
  }
  
  postsynapticGroup.add(structureGroups.dendriteSegment);
}

/**
 * Create voltage-gated Ca²⁺ channels in presynaptic membrane
 * REALISTIC MOLECULAR STRUCTURES with 4 domains and S4 voltage sensors
 * Based on CaV channel architecture (similar to Nav channels)
 * SCALED to match receptor sizes (~2-3 units diameter)
 */
function createCaChannels(activeZoneRadius, preMembraneY, terminalRadius) {
  const channelCount = CHANNEL_COUNTS.presynaptic.CaV;
  
  // SCALE FACTOR - channels should be ~2.5 units diameter (similar to receptors)
  const S = 0.4;  // Scale everything down by 40%
  
  // Materials for CaV channel
  const materials = {
    closed: new THREE.MeshPhongMaterial({
      color: 0x00aa77, emissive: 0x004433, emissiveIntensity: 0.2,
      shininess: 30, transparent: true, opacity: 0.9,
    }),
    open: new THREE.MeshPhongMaterial({
      color: 0x00ffaa, emissive: 0x00aa66, emissiveIntensity: 0.6,
      shininess: 50, transparent: true, opacity: 0.95,
    }),
    voltageSensor: new THREE.MeshPhongMaterial({
      color: 0x4080ff, emissive: 0x2040aa, emissiveIntensity: 0.4, shininess: 60,
    }),
    voltageSensorActivated: new THREE.MeshPhongMaterial({
      color: 0x80ffff, emissive: 0x40a0ff, emissiveIntensity: 0.8, shininess: 80,
    }),
    pore: new THREE.MeshPhongMaterial({
      color: 0x203020, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    }),
    poreOpen: new THREE.MeshPhongMaterial({
      color: 0x40ff80, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }),
    selectivityFilter: new THREE.MeshPhongMaterial({
      color: 0x00ffcc, emissive: 0x00aa88, emissiveIntensity: 0.6, shininess: 80,
    }),
  };
  
  // Distribute channels on TERMINAL BUTTON SIDES (not just active zone center)
  // Ca2+ channels cluster around the active zone perimeter and up the sides
  for (let i = 0; i < channelCount; i++) {
    const angle = (i / channelCount) * Math.PI * 2 + Math.random() * 0.4;
    // Position on outer rings of active zone and up the dome sides
    const ringNum = i % 3;  // 3 rings
    const baseRadius = activeZoneRadius * (0.7 + ringNum * 0.25);  // 70%, 95%, 120% of AZ radius
    const radius = baseRadius + (Math.random() - 0.5) * 2;  // Some random spread
    
    const channelGroup = new THREE.Group();
    
    // Store references for animation
    const voltageSensors = [];
    const domainHelices = [];
    const pLoops = [];
    
    // Four domains arranged around central pore (like Nav/CaV channels)
    // Scaled down domain positions
    const domainOffsets = [
      { x: 0, z: -1.0 * S, scale: 1.0 },
      { x: 1.0 * S, z: 0, scale: 1.0 },
      { x: 0, z: 1.0 * S, scale: 1.0 },
      { x: -1.0 * S, z: 0, scale: 1.0 },
    ];
    
    for (let d = 0; d < 4; d++) {
      const offset = domainOffsets[d];
      const domainGroup = new THREE.Group();
      
      // Transmembrane helices (6 per domain: S1-S6) - scaled down
      for (let h = 0; h < 6; h++) {
        const hAngle = (h / 6) * Math.PI * 2;
        const helixRadius = 0.5 * S * offset.scale;
        const hx = Math.cos(hAngle) * helixRadius;
        const hz = Math.sin(hAngle) * helixRadius;
        
        const helixGeo = new THREE.CylinderGeometry(0.15 * S, 0.15 * S, 2 * S, 6);
        const helix = new THREE.Mesh(helixGeo, materials.closed.clone());
        helix.position.set(hx, 0, hz);
        helix.userData.baseX = hx;
        helix.userData.baseZ = hz;
        domainGroup.add(helix);
      }
      
      // S4 voltage sensor (the blue helix that moves UP when voltage changes) - smaller
      const s4Geo = new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 1.6 * S, 6);
      const s4 = new THREE.Mesh(s4Geo, materials.voltageSensor.clone());
      s4.position.set(0.65 * S * offset.scale, 0, 0);
      s4.userData.baseY = 0;
      s4.userData.domainIndex = d;
      domainGroup.add(s4);
      voltageSensors.push(s4);
      
      domainGroup.position.set(offset.x * 2.5, 0, offset.z * 2.5);
      channelGroup.add(domainGroup);
    }
    
    // P-loops (pore-forming loops) - scaled down
    for (let d = 0; d < 4; d++) {
      const offset = domainOffsets[d];
      const pLoopGeo = new THREE.TorusGeometry(0.4 * S, 0.1 * S, 6, 10, Math.PI);
      const pLoop = new THREE.Mesh(pLoopGeo, materials.closed.clone());
      pLoop.position.set(offset.x * 1.5, 1.2 * S, offset.z * 1.5);
      pLoop.rotation.x = Math.PI / 2;
      pLoop.rotation.y = (d / 4) * Math.PI * 2;
      pLoop.userData.baseX = offset.x * 1.5;
      pLoop.userData.baseZ = offset.z * 1.5;
      channelGroup.add(pLoop);
      pLoops.push(pLoop);
    }
    
    // Central pore (ions flow through here) - scaled down
    const poreGeo = new THREE.CylinderGeometry(0.25 * S, 0.35 * S, 2.4 * S, 12, 1, true);
    const pore = new THREE.Mesh(poreGeo, materials.pore.clone());
    channelGroup.add(pore);
    
    // Selectivity filter - scaled down
    const filterGeo = new THREE.TorusGeometry(0.2 * S, 0.06 * S, 6, 16);
    const filter = new THREE.Mesh(filterGeo, materials.selectivityFilter);
    filter.rotation.x = Math.PI / 2;
    filter.position.y = 0.6 * S;
    channelGroup.add(filter);
    
    // Extracellular vestibule - scaled down, less prominent
    const vestibuleGeo = new THREE.SphereGeometry(0.6 * S, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const vestibule = new THREE.Mesh(vestibuleGeo, materials.closed.clone());
    vestibule.material.opacity = 0.4;
    vestibule.position.y = 1.4 * S;
    vestibule.rotation.x = Math.PI;
    channelGroup.add(vestibule);
    
    // Intracellular domain - scaled down, less cone-like
    const intraCellGeo = new THREE.CylinderGeometry(0.7 * S, 0.6 * S, 0.8 * S, 8);
    const intraCell = new THREE.Mesh(intraCellGeo, materials.closed.clone());
    intraCell.position.y = -1.6 * S;
    channelGroup.add(intraCell);
    
    // Position the whole channel ON THE CURVED DOME SURFACE
    // For channels on the sides of the terminal dome, we need to:
    // 1. Position on the spherical surface
    // 2. Rotate to be TANGENT to the dome (pointing outward from center)
    
    const channelX = Math.cos(angle) * radius;
    const channelZ = Math.sin(angle) * radius;
    
    // Calculate Y position on dome surface: y = sqrt(R² - r²) where r is horizontal distance
    const horizontalDist = Math.sqrt(channelX * channelX + channelZ * channelZ);
    const domeY = preMembraneY + Math.sqrt(Math.max(0, terminalRadius * terminalRadius - horizontalDist * horizontalDist)) * 0.3;
    
    channelGroup.position.set(channelX, domeY, channelZ);
    
    // ROTATE channel to align with dome surface normal
    // The channel should point outward from the dome center
    // Calculate the normal at this point on the dome
    const normal = new THREE.Vector3(channelX, domeY - preMembraneY, channelZ).normalize();
    
    // Create rotation to align channel's up axis with dome normal
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    channelGroup.setRotationFromQuaternion(quaternion);
    
    structureGroups.caChannels.add(channelGroup);
    
    // Store channel data for animation
    const channelData = {
      group: channelGroup,
      pore: pore,
      filter: filter,
      vestibule: vestibule,
      voltageSensors: voltageSensors,
      pLoops: pLoops,
      materials: materials,
      state: 'closed',
      conformationProgress: 0,  // 0 = closed, 1 = fully open
      scaleFactor: S,  // Store for animation scaling
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        preMembraneY + 0.4,
        Math.sin(angle) * radius
      ),
    };
    
    caChannelMeshes.push(channelData);
  }
  
  presynapticGroup.add(structureGroups.caChannels);
}

// Store CB1 receptor meshes for animation
const cb1ReceptorMeshes = [];

/**
 * Create CB1 cannabinoid receptors on presynaptic terminal
 * CB1 receptors are GPCRs (7-TM receptors) that receive endocannabinoid signals
 * from the postsynaptic neuron (retrograde signaling)
 * Located on the presynaptic membrane, away from active zone
 */
function createCB1Receptors(terminalRadius, preMembraneY) {
  const cb1Count = CHANNEL_COUNTS.presynaptic.CB1;
  
  // CB1 receptor material - dark green (color from RECEPTOR_PROPS.CB1.color)
  const cb1Material = new THREE.MeshPhongMaterial({
    color: 0x009432,  // Dark green
    emissive: 0x004416,
    emissiveIntensity: 0.3,
    shininess: 40,
    transparent: true,
    opacity: 0.9,
  });
  
  const cb1ActiveMaterial = new THREE.MeshPhongMaterial({
    color: 0x00ff55,  // Bright green when activated
    emissive: 0x00ff55,
    emissiveIntensity: 0.6,
    shininess: 60,
    transparent: true,
    opacity: 0.95,
  });
  
  // Scale factor for 7-TM GPCR structure
  const S = 0.5;
  
  // Create CB1 receptor group
  if (!structureGroups.cb1Receptors) {
    structureGroups.cb1Receptors = new THREE.Group();
    structureGroups.cb1Receptors.name = 'CB1_Receptors';
  }
  
  // Position CB1 receptors on the sides of the terminal button (not active zone)
  // They should be distributed around the dome, away from the cleft-facing active zone
  for (let i = 0; i < cb1Count; i++) {
    const receptorGroup = new THREE.Group();
    
    // Angle around the terminal
    const angle = (i / cb1Count) * Math.PI * 2 + Math.PI / 6;  // Offset to avoid active zone
    
    // Radius - on the curved part of the terminal dome
    const radius = terminalRadius * 0.75;
    
    // Height on the dome - CB1s are scattered higher on the terminal button
    const heightFactor = 0.4 + (i % 3) * 0.2;  // Vary height
    const yPos = preMembraneY + terminalRadius * heightFactor;
    
    // Create 7-TM GPCR structure (characteristic serpentine receptor)
    // Main body - 7 transmembrane helices represented as a cylinder cluster
    const bodyRadius = 1.2 * S;
    const bodyHeight = 2.5 * S;
    
    // Core cylinder
    const coreGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius * 0.9, bodyHeight, 7);
    const core = new THREE.Mesh(coreGeo, cb1Material.clone());
    receptorGroup.add(core);
    
    // 7 helices around the core (7-TM structure)
    const helixGeo = new THREE.CylinderGeometry(0.25 * S, 0.25 * S, bodyHeight * 0.9, 6);
    for (let h = 0; h < 7; h++) {
      const helixAngle = (h / 7) * Math.PI * 2;
      const helixRadius = bodyRadius * 0.7;
      const helix = new THREE.Mesh(helixGeo, cb1Material.clone());
      helix.position.set(
        Math.cos(helixAngle) * helixRadius,
        0,
        Math.sin(helixAngle) * helixRadius
      );
      receptorGroup.add(helix);
    }
    
    // Extracellular binding domain (where endocannabinoids bind)
    const bindingGeo = new THREE.SphereGeometry(0.6 * S, 8, 6);
    const binding = new THREE.Mesh(bindingGeo, cb1Material.clone());
    binding.position.y = bodyHeight / 2 + 0.3 * S;
    binding.scale.set(1.2, 0.6, 1.2);  // Flattened
    receptorGroup.add(binding);
    
    // Intracellular G-protein coupling domain
    const gProteinGeo = new THREE.CylinderGeometry(0.4 * S, 0.6 * S, 0.8 * S, 6);
    const gProtein = new THREE.Mesh(gProteinGeo, cb1Material.clone());
    gProtein.position.y = -bodyHeight / 2 - 0.4 * S;
    receptorGroup.add(gProtein);
    
    // Position on the dome surface
    // Calculate position on spherical surface of terminal dome
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    receptorGroup.position.set(x, yPos, z);
    
    // Rotate to align with dome surface (pointing outward/normal to surface)
    receptorGroup.lookAt(
      receptorGroup.position.x * 1.5,
      preMembraneY + terminalRadius,
      receptorGroup.position.z * 1.5
    );
    receptorGroup.rotation.x += Math.PI / 2;  // Align vertical axis
    
    structureGroups.cb1Receptors.add(receptorGroup);
    
    // Store for animation
    cb1ReceptorMeshes.push({
      group: receptorGroup,
      core: core,
      binding: binding,
      gProtein: gProtein,
      material: cb1Material,
      activeMaterial: cb1ActiveMaterial,
      activated: false,
    });
  }
  
  presynapticGroup.add(structureGroups.cb1Receptors);
  
  // CB1 receptors are always visible (they're part of the anatomy)
  // But they glow when endocannabinoid system is active
}

/**
 * Update CB1 receptor visuals based on endocannabinoid signaling
 */
export function updateCB1Visuals(cb1Activation, endoLevel) {
  const activationThreshold = 20;  // % activation to show visual change
  
  for (const receptor of cb1ReceptorMeshes) {
    const isActive = cb1Activation > activationThreshold || endoLevel > 0.3;
    
    if (isActive !== receptor.activated) {
      receptor.activated = isActive;
      
      // Update core and binding domain appearance
      const targetMat = isActive ? receptor.activeMaterial : receptor.material;
      receptor.core.material = targetMat.clone();
      receptor.binding.material = targetMat.clone();
      
      // Pulse effect when active
      if (isActive) {
        receptor.group.scale.setScalar(1.1);
      } else {
        receptor.group.scale.setScalar(1.0);
      }
    }
    
    // Continuous glow intensity based on activation level
    if (receptor.activated) {
      const intensity = 0.3 + (cb1Activation / 100) * 0.5;
      receptor.core.material.emissiveIntensity = intensity;
      receptor.binding.material.emissiveIntensity = intensity;
    }
  }
}

// Cleft visualization removed - the gap between domes IS the cleft
// No separate markers needed

/**
 * Create astrocyte processes wrapping around the synapse
 * Thicker, more organic processes that wrap around the cleft
 * Each astrocyte element uses a different blue hue to distinguish individual cells
 */
function createAstrocyteProcess() {
  const synapseRadius = 20;
  
  // Generate varying blue hues for each astrocyte element
  // Range from cyan (0x66ddff) to deep blue (0x4466ff) to purple-blue (0x8866ff)
  function getAstrocyteBlueHue(index, total) {
    // Create distinct blue hues by varying the RGB components
    const hueShift = (index / total) * 360;  // Spread across blue spectrum
    
    // Base blue color with variations
    // Hue ranges from 180 (cyan) to 270 (purple-blue)
    const hue = 200 + (index * 30) % 80;  // 200-280 range (blue to purple-blue)
    const saturation = 0.6 + (index % 3) * 0.1;
    const lightness = 0.55 + (index % 4) * 0.05;
    
    // Convert HSL to hex (approximate)
    const blueBase = Math.floor(180 + (index * 25) % 75);  // 180-255 blue
    const greenBase = Math.floor(100 + (index * 35) % 100);  // 100-200 green (for cyan tones)
    const redBase = Math.floor(50 + (index * 20) % 80);  // 50-130 red (for purple tones)
    
    return (redBase << 16) | (greenBase << 8) | blueBase;
  }
  
  function getEmissiveBlue(mainColor) {
    // Darken the main color for emissive
    const r = ((mainColor >> 16) & 0xFF) * 0.4;
    const g = ((mainColor >> 8) & 0xFF) * 0.4;
    const b = (mainColor & 0xFF) * 0.4;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }
  
  // End-feet (enlarged blobs at cleft perimeter) - each a different blue hue
  const endFootPositions = [
    { x: synapseRadius + 2, z: 4, scale: 1.2, yOff: 0 },
    { x: -synapseRadius - 1, z: -3, scale: 1.1, yOff: 0.5 },
    { x: 3, z: synapseRadius + 2, scale: 1.0, yOff: -0.5 },
    { x: -2, z: -synapseRadius - 2, scale: 0.95, yOff: 0 },
    { x: synapseRadius * 0.7, z: synapseRadius * 0.7, scale: 0.85, yOff: 0.3 },
    { x: -synapseRadius * 0.7, z: -synapseRadius * 0.7, scale: 0.9, yOff: -0.3 },
  ];
  
  // Pre-defined distinct blue hues for each astrocyte cell
  const astrocyteBlueHues = [
    { color: 0x55aaee, emissive: 0x2255aa },  // Sky blue
    { color: 0x66ccff, emissive: 0x3366bb },  // Cyan-blue
    { color: 0x7788ff, emissive: 0x3344aa },  // Periwinkle
    { color: 0x44bbdd, emissive: 0x225588 },  // Teal-blue
    { color: 0x8899ff, emissive: 0x4455aa },  // Lavender-blue
    { color: 0x5599cc, emissive: 0x2244aa },  // Steel blue
  ];
  
  for (let i = 0; i < endFootPositions.length; i++) {
    const pos = endFootPositions[i];
    const hue = astrocyteBlueHues[i % astrocyteBlueHues.length];
    
    const astroMat = new THREE.MeshPhongMaterial({
      color: hue.color,
      emissive: hue.emissive,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.55,
      shininess: 15,
    });
    
    const blobGeo = new THREE.SphereGeometry(5 * pos.scale, 16, 12);
    const blob = new THREE.Mesh(blobGeo, astroMat);
    blob.scale.set(1.4, 0.6, 1.3);  // Flattened, spread along cleft
    blob.position.set(pos.x, pos.yOff, pos.z);
    blob.rotation.y = Math.random() * Math.PI;
    blob.userData.astrocyteIndex = i;  // Track which cell this belongs to
    astrocyteGroup.add(blob);
  }
  
  // Thick connecting processes wrapping around cleft - varying blue hues
  // Process arm blue hues (distinct from end-feet)
  const processBlueHues = [
    { color: 0x4499dd, emissive: 0x224488 },  // Ocean blue
    { color: 0x5588ee, emissive: 0x2244aa },  // Cobalt
    { color: 0x3399cc, emissive: 0x115577 },  // Cerulean
    { color: 0x6699dd, emissive: 0x334488 },  // Cornflower
  ];
  
  // Multiple wrapping arms - each with different blue shade
  for (let i = 0; i < 4; i++) {
    const hue = processBlueHues[i % processBlueHues.length];
    const processMat = new THREE.MeshPhongMaterial({
      color: hue.color,
      emissive: hue.emissive,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.45,
    });
    
    const startAngle = i * Math.PI * 0.5 + 0.3;
    const arcPoints = [];
    const waveAmp = 1.5 + Math.random() * 0.5;
    
    for (let j = 0; j <= 12; j++) {
      const t = j / 12;
      const angle = startAngle + t * Math.PI * 0.6;
      const radius = synapseRadius + 3 + Math.sin(t * Math.PI * 2) * 1.5;
      const y = Math.sin(t * Math.PI * 2) * waveAmp;
      
      arcPoints.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      ));
    }
    
    const curve = new THREE.CatmullRomCurve3(arcPoints);
    const tubeGeo = new THREE.TubeGeometry(curve, 16, 2.0 + Math.random() * 0.5, 8, false);
    const tube = new THREE.Mesh(tubeGeo, processMat);
    tube.userData.astrocyteIndex = 6 + i;  // Continue indexing from end-feet
    astrocyteGroup.add(tube);
  }
  
  // Tendril blue hues (lighter, more transparent)
  const tendrilBlueHues = [
    { color: 0x77aaee, emissive: 0x335588 },  // Light steel blue
    { color: 0x66bbff, emissive: 0x336699 },  // Light cyan
    { color: 0x88aadd, emissive: 0x445577 },  // Light periwinkle
    { color: 0x55ccee, emissive: 0x226688 },  // Light teal
    { color: 0x7799ee, emissive: 0x334499 },  // Light slate
    { color: 0x44aadd, emissive: 0x225577 },  // Light azure
  ];
  
  // Add some vertical tendrils extending toward domes - each different blue
  for (let i = 0; i < 6; i++) {
    const hue = tendrilBlueHues[i % tendrilBlueHues.length];
    const tendrilMat = new THREE.MeshPhongMaterial({
      color: hue.color,
      emissive: hue.emissive,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.4,
    });
    
    const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
    const radius = synapseRadius + 1;
    const upward = i % 2 === 0;  // Alternate up and down
    
    const tendrilPoints = [
      new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
      new THREE.Vector3(Math.cos(angle + 0.1) * (radius + 2), upward ? 5 : -5, Math.sin(angle + 0.1) * (radius + 2)),
      new THREE.Vector3(Math.cos(angle + 0.2) * (radius + 1), upward ? 10 : -10, Math.sin(angle + 0.2) * (radius + 1)),
    ];
    
    const tendrilCurve = new THREE.CatmullRomCurve3(tendrilPoints);
    const tendrilGeo = new THREE.TubeGeometry(tendrilCurve, 8, 1.2, 6, false);
    const tendril = new THREE.Mesh(tendrilGeo, tendrilMat.clone());
    astrocyteGroup.add(tendril);
  }
}

/**
 * Create a vertical scale ruler showing synaptic cleft width (~20nm)
 * Positioned parallel to the primary synapse direction
 */
function createScaleRuler() {
  const scaleGroup = new THREE.Group();
  scaleGroup.name = 'scaleRuler';
  
  // The cleft width in visual units is 6.0, representing ~20nm
  // Scale: 6.0 visual units = 20nm, so 1 visual unit ≈ 3.33nm
  const cleftWidth = SCALE.CLEFT_WIDTH;
  const rulerHeight = cleftWidth; // Spans the cleft exactly
  
  // Position the ruler to the side of the synapse, parallel to cleft direction
  const rulerX = 25;  // Positioned to the right side
  const rulerZ = 0;   // Centered on Z axis
  
  // Main vertical bar material - white with subtle glow
  const rulerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });
  
  // Vertical bar spanning the cleft
  const barThickness = 0.15;
  const barGeo = new THREE.BoxGeometry(barThickness, rulerHeight, barThickness);
  const verticalBar = new THREE.Mesh(barGeo, rulerMat);
  verticalBar.position.set(rulerX, 0, rulerZ);
  scaleGroup.add(verticalBar);
  
  // Top tick mark (at presynaptic membrane level)
  const tickLength = 1.5;
  const tickGeo = new THREE.BoxGeometry(tickLength, barThickness, barThickness);
  
  const topTick = new THREE.Mesh(tickGeo, rulerMat);
  topTick.position.set(rulerX - tickLength / 2 + barThickness / 2, cleftWidth / 2, rulerZ);
  scaleGroup.add(topTick);
  
  // Bottom tick mark (at postsynaptic membrane level)
  const bottomTick = new THREE.Mesh(tickGeo, rulerMat);
  bottomTick.position.set(rulerX - tickLength / 2 + barThickness / 2, -cleftWidth / 2, rulerZ);
  scaleGroup.add(bottomTick);
  
  // Middle reference markers (at 10nm intervals)
  const midTickGeo = new THREE.BoxGeometry(tickLength * 0.6, barThickness * 0.8, barThickness * 0.8);
  const midTickMat = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    transparent: true,
    opacity: 0.7,
  });
  
  // Center tick (10nm mark)
  const midTick = new THREE.Mesh(midTickGeo, midTickMat);
  midTick.position.set(rulerX - tickLength * 0.3 + barThickness / 2, 0, rulerZ);
  scaleGroup.add(midTick);
  
  // Create text label using a sprite
  // We'll use a canvas to create the text texture
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  
  // Clear canvas
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw text
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('~20 nm', canvas.width / 2, canvas.height / 2);
  
  // Add subtle text shadow for visibility
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText('~20 nm', canvas.width / 2, canvas.height / 2);
  
  // Create sprite texture and material
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
  });
  
  const textSprite = new THREE.Sprite(spriteMat);
  textSprite.position.set(rulerX + 3.5, 0, rulerZ);
  textSprite.scale.set(8, 2, 1);
  scaleGroup.add(textSprite);
  
  // Add small arrows pointing to the membranes
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
  });
  
  // Top arrow (pointing up to presynaptic)
  const arrowGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
  const topArrow = new THREE.Mesh(arrowGeo, arrowMat);
  topArrow.position.set(rulerX, cleftWidth / 2 + 0.4, rulerZ);
  topArrow.rotation.z = 0;  // Points up
  scaleGroup.add(topArrow);
  
  // Bottom arrow (pointing down to postsynaptic)
  const bottomArrow = new THREE.Mesh(arrowGeo, arrowMat);
  bottomArrow.position.set(rulerX, -cleftWidth / 2 - 0.4, rulerZ);
  bottomArrow.rotation.z = Math.PI;  // Points down
  scaleGroup.add(bottomArrow);
  
  // Add to scene (not to synapseGroup so it stays fixed)
  scene.add(scaleGroup);
  
  // Store reference for potential updates
  scaleGroup.userData.cleftWidth = cleftWidth;
}

/**
 * Add scale reference
 */
function addScaleReference() {
  // 100nm scale bar
  const scaleLength = 10; // 100nm
  const scaleGeo = new THREE.BoxGeometry(scaleLength, 0.2, 0.2);
  const scaleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
  });
  const scaleBar = new THREE.Mesh(scaleGeo, scaleMat);
  scaleBar.position.set(-25, 20, -20);
  scene.add(scaleBar);

  // End caps
  const capGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
  const cap1 = new THREE.Mesh(capGeo, scaleMat);
  cap1.position.set(-25 - scaleLength / 2, 20, -20);
  scene.add(cap1);
  const cap2 = new THREE.Mesh(capGeo, scaleMat);
  cap2.position.set(-25 + scaleLength / 2, 20, -20);
  scene.add(cap2);
}

/**
 * Update presynaptic visualization based on voltage
 */
export function updatePresynapticVisual(voltage, caConc) {
  const membrane = presynapticGroup.userData.membrane;
  const activeZone = presynapticGroup.userData.activeZone;
  const terminalDome = structureGroups.terminalDome;
  const axonSegment = structureGroups.axonSegment;
  
  if (!membrane || !activeZone) return;
  
  // Voltage-dependent color shift (-70 resting to +40 peak)
  const normalizedV = (voltage + 70) / 110; // -70 to +40 mapped to 0-1
  const t = Math.max(0, Math.min(1, normalizedV));
  
  // ████ DRAMATIC VISUAL FEEDBACK DURING AP ████
  
  // Membrane glow increases dramatically with depolarization
  membrane.material.emissiveIntensity = 0.15 + t * 0.85;
  
  // Active zone brightens significantly with Ca2+ influx
  const caFactor = Math.min(1, caConc * 20); // Enhanced visibility
  activeZone.material.emissiveIntensity = 0.2 + caFactor * 0.9;
  
  // AXON SEGMENT GLOW - like action-potential-3d propagation
  if (axonSegment && axonSegment.children) {
    axonSegment.traverse(child => {
      if (child.isMesh && child.material) {
        if (voltage > -40) {
          // AP propagating - bright red/orange glow
          child.material.emissive.setHex(0xff4422);
          child.material.emissiveIntensity = 0.3 + t * 0.5;
        } else {
          // Resting
          child.material.emissive.setHex(0x442211);
          child.material.emissiveIntensity = 0.1;
        }
      }
    });
  }
  
  // Color shift based on voltage phase
  if (voltage > 0) {
    // PEAK DEPOLARIZATION - bright red/white
    membrane.material.emissive.setHex(0xff2222);
    activeZone.material.emissive.setHex(0xffffff);
    activeZone.material.color.setHex(0xffaa00);
    
    // Pulse the terminal dome - VERY BRIGHT during peak
    if (terminalDome && terminalDome.children.length > 0) {
      const dome = terminalDome.children[0];
      if (dome && dome.material) {
        dome.material.emissiveIntensity = 0.7;
        dome.material.emissive.setHex(0xff4422);
      }
    }
  } else if (voltage > -40) {
    // DEPOLARIZING - orange/yellow
    membrane.material.emissive.setHex(0xff6644);
    activeZone.material.emissive.setHex(0xffcc00);
    activeZone.material.color.setHex(0xdd7700);
    
    if (terminalDome && terminalDome.children.length > 0) {
      const dome = terminalDome.children[0];
      if (dome && dome.material) {
        dome.material.emissiveIntensity = 0.3 + t * 0.4;
        dome.material.emissive.setHex(0xdd6622);
      }
    }
  } else if (voltage < -75) {
    // HYPERPOLARIZED (refractory) - blue tint
    membrane.material.emissive.setHex(0x4466aa);
    activeZone.material.emissive.setHex(0x6688cc);
    activeZone.material.color.setHex(0xaa5500);
  } else {
    // RESTING - normal colors
    membrane.material.emissive.setHex(COLORS.presynapticMembrane);
    activeZone.material.emissive.setHex(COLORS.activeZone);
    activeZone.material.color.setHex(COLORS.activeZone);
    
    if (terminalDome && terminalDome.children.length > 0) {
      const dome = terminalDome.children[0];
      if (dome && dome.material) {
        dome.material.emissiveIntensity = 0.15;
        dome.material.emissive.setHex(0x663322);
      }
    }
  }
}

/**
 * Update postsynaptic visualization based on voltage/activity
 */
export function updatePostsynapticVisual(voltage, epspActive, ipspActive) {
  const membrane = postsynapticGroup.userData.membrane;
  const psd = postsynapticGroup.userData.psd;
  const spineHead = postsynapticGroup.userData.spineHead;
  const spineDome = structureGroups.spineDome;
  const dendriteSegment = structureGroups.dendriteSegment;
  
  if (!membrane || !psd) return;
  
  // Voltage-dependent effects
  const depolarization = Math.max(0, voltage + 70);  // 0 at rest, increases with EPSP
  const hyperpolarization = Math.max(0, -70 - voltage);  // Increases with IPSP
  
  // Base intensity
  let intensity = 0.2;
  let color = COLORS.postsynapticMembrane;
  
  if (epspActive || depolarization > 1) {
    // EPSP - BRIGHT RED/ORANGE glow - MORE VISIBLE
    intensity = 0.6 + depolarization * 0.08;
    color = 0xff4422;  // Bright red-orange
    
    // Spine head and dendrite glow BRIGHTLY
    if (spineDome && spineDome.children.length > 0) {
      const dome = spineDome.children[0];
      if (dome && dome.material) {
        dome.material.emissive.setHex(0xff6633);
        dome.material.emissiveIntensity = 0.5 + depolarization * 0.05;
      }
    }
    if (dendriteSegment && dendriteSegment.children.length > 0) {
      dendriteSegment.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.emissive.setHex(0xff4422);
          child.material.emissiveIntensity = 0.2 + depolarization * 0.02;
        }
      });
    }
  } else if (ipspActive && hyperpolarization > 0) {
    // IPSP - BLUE glow for hyperpolarization
    intensity = 0.4 + hyperpolarization * 0.03;
    color = 0x4488ff;  // Blue
    
    // Spine and dendrite blue
    if (spineDome && spineDome.children.length > 0) {
      const dome = spineDome.children[0];
      if (dome && dome.material) {
        dome.material.emissive.setHex(0x4488ff);
        dome.material.emissiveIntensity = 0.2 + hyperpolarization * 0.02;
      }
    }
    if (dendriteSegment && dendriteSegment.children.length > 0) {
      dendriteSegment.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.emissive.setHex(0x4488ff);
          child.material.emissiveIntensity = 0.15 + hyperpolarization * 0.015;
        }
      });
    }
  } else {
    // Resting - return to normal
    intensity = 0.2;
    color = COLORS.postsynapticMembrane;
    
    // Reset spine and dendrite
    if (spineDome && spineDome.children.length > 0) {
      const dome = spineDome.children[0];
      if (dome && dome.material) {
        dome.material.emissive.setHex(0x223344);
        dome.material.emissiveIntensity = 0.15;
      }
    }
    if (dendriteSegment && dendriteSegment.children.length > 0) {
      dendriteSegment.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.emissive.setHex(0x223344);
          child.material.emissiveIntensity = 0.1;
        }
      });
    }
  }
  
  membrane.material.emissive.setHex(color);
  membrane.material.emissiveIntensity = intensity;
  
  psd.material.emissive.setHex(epspActive ? 0xff6644 : ipspActive ? 0x4488ff : COLORS.psd);
  psd.material.emissiveIntensity = 0.3 + intensity * 0.5;
}

/**
 * Handle window resize
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Render the scene
 */
export function renderScene() {
  renderer.render(scene, camera);
}

/**
 * Update camera position
 */
export function updateCamera(distance, angleX, angleY, isFlipped) {
  const flipMult = isFlipped ? -1 : 1;
  
  camera.position.x = Math.sin(angleX) * distance;
  camera.position.y = Math.sin(angleY) * distance * flipMult;
  camera.position.z = Math.cos(angleX) * distance;
  
  camera.lookAt(0, 0, 0);
  camera.up.set(0, flipMult, 0);
}

/**
 * Toggle astrocyte visibility
 */
export function setAstrocyteVisible(visible) {
  astrocyteGroup.visible = visible;
}

/**
 * Toggle visibility of different structures
 */
export function setStructureVisibility(structureName, visible) {
  switch(structureName) {
    case 'caChannels':
      structureGroups.caChannels.visible = visible;
      break;
    case 'vesicles':
      vesicleGroup.visible = visible;
      break;
    case 'astrocyte':
      astrocyteGroup.visible = visible;
      break;
  }
}

/**
 * Toggle ALL presynaptic structures visibility
 * (terminal dome, membrane, active zone, Ca channels, axon)
 */
export function setPresynapticVisible(visible) {
  console.log('setPresynapticVisible called with:', visible);
  presynapticGroup.visible = visible;
}

/**
 * Toggle ALL postsynaptic structures visibility
 * (spine dome, membrane, PSD, receptors, dendrite)
 */
export function setPostsynapticVisible(visible) {
  console.log('setPostsynapticVisible called with:', visible);
  postsynapticGroup.visible = visible;
}

/**
 * Show only membrane faces (hide dome bodies, axon, dendrite)
 * In this mode: show both presynaptic and postsynaptic membranes facing the cleft
 * with their embedded channels and receptors
 */
export function setMembraneOnlyMode(enabled) {
  if (enabled) {
    // Hide cytoplasm domes and connecting structures
    structureGroups.terminalDome.visible = false;
    structureGroups.spineDome.visible = false;
    structureGroups.axonSegment.visible = false;
    structureGroups.dendriteSegment.visible = false;
    
    // Show membrane faces and their embedded components
    structureGroups.presynapticMembrane.visible = true;
    structureGroups.postsynapticMembrane.visible = true;
    structureGroups.caChannels.visible = true;
    
    // Optionally hide astrocyte for cleaner view
    astrocyteGroup.visible = false;
    
    console.log('Membrane-only mode: ON - showing cleft membranes');
  } else {
    // Restore all structures
    structureGroups.terminalDome.visible = true;
    structureGroups.spineDome.visible = true;
    structureGroups.axonSegment.visible = true;
    structureGroups.dendriteSegment.visible = true;
    structureGroups.presynapticMembrane.visible = true;
    structureGroups.postsynapticMembrane.visible = true;
    structureGroups.caChannels.visible = true;
    astrocyteGroup.visible = animationState.showAstrocyte;
    
    console.log('Membrane-only mode: OFF - showing full structures');
  }
}

/**
 * Get current visibility state
 */
export function getStructureVisibility() {
  return {
    presynaptic: presynapticGroup.visible,
    postsynaptic: postsynapticGroup.visible,
    caChannels: structureGroups.caChannels.visible,
    astrocyte: astrocyteGroup.visible,
    vesicles: vesicleGroup.visible,
  };
}

/**
 * Update Ca²⁺ channel visualization based on voltage/state
 * MOLECULAR CONFORMATIONAL ANIMATION:
 * - S4 voltage sensors move UP when depolarized
 * - P-loops move apart to open the pore
 * - Pore expands when channel opens
 * - Color changes indicate activation state
 */
export function updateCaChannelVisuals(voltage, isAPActive) {
  const threshold = -20;  // CaV activation threshold
  const voltageNormalized = Math.max(0, Math.min(1, (voltage + 40) / 80)); // -40 to +40 maps to 0-1
  
  let openCount = 0;
  
  for (const channelData of caChannelMeshes) {
    // Skip if this is an old-style simple mesh (backward compatibility)
    if (!channelData.group) {
      // Old-style channel handling
      const channel = channelData;
      const shouldOpen = isAPActive && voltage > threshold && Math.random() < voltageNormalized;
      if (shouldOpen && channel.material) {
        channel.material.color.setHex(0x00ffff);
        channel.material.emissiveIntensity = 1.0;
        channel.userData.state = 'open';
        openCount++;
      }
      continue;
    }
    
    // Calculate target conformation based on voltage
    const shouldBeOpen = isAPActive && voltage > threshold;
    const targetConformation = shouldBeOpen ? 1.0 : voltageNormalized * 0.3;
    
    // Initialize conformationProgress if needed
    if (channelData.conformationProgress === undefined) {
      channelData.conformationProgress = 0;
    }
    
    // Smoothly interpolate conformation (faster opening, slower closing)
    const lerpSpeed = shouldBeOpen ? 0.12 : 0.05;
    channelData.conformationProgress += (targetConformation - channelData.conformationProgress) * lerpSpeed;
    channelData.conformationProgress = Math.max(0, Math.min(1, channelData.conformationProgress));
    
    const t = channelData.conformationProgress;
    channelData.state = t > 0.5 ? 'open' : 'closed';
    if (t > 0.5) openCount++;
    
    // ANIMATE S4 VOLTAGE SENSORS - move UP when depolarized
    const S = channelData.scaleFactor || 0.4;  // Use stored scale factor
    if (channelData.voltageSensors) {
      const sensorMovement = t * 0.7 * S; // Scaled movement
      for (const s4 of channelData.voltageSensors) {
        s4.position.y = s4.userData.baseY + sensorMovement;
        
        // Color changes based on activation
        if (t > 0.5) {
          s4.material = channelData.materials.voltageSensorActivated;
        } else {
          s4.material = channelData.materials.voltageSensor.clone();
          s4.material.emissiveIntensity = 0.4 + voltageNormalized * 0.3;
        }
      }
    }
    
    // ANIMATE P-LOOPS - move outward to open pore
    if (channelData.pLoops) {
      for (const pLoop of channelData.pLoops) {
        const expansion = 1 + t * 0.4;
        pLoop.position.x = pLoop.userData.baseX * expansion;
        pLoop.position.z = pLoop.userData.baseZ * expansion;
        
        // Update material color
        const mat = t > 0.5 ? channelData.materials.open : channelData.materials.closed;
        pLoop.material = mat.clone();
      }
    }
    
    // ANIMATE PORE - expands when open
    if (channelData.pore) {
      const poreExpansion = 1 + t * 0.6;
      channelData.pore.scale.set(poreExpansion, 1, poreExpansion);
      channelData.pore.material = t > 0.5 ? channelData.materials.poreOpen : channelData.materials.pore;
    }
    
    // SELECTIVITY FILTER glows brighter when open
    if (channelData.filter) {
      channelData.filter.material.emissiveIntensity = 0.4 + t * 0.6;
      const scale = 1 + t * 0.2;
      channelData.filter.scale.set(scale, scale, scale);
    }
    
    // VESTIBULE changes opacity
    if (channelData.vestibule) {
      channelData.vestibule.material.opacity = 0.3 + t * 0.3;
      if (channelData.vestibule.material.emissive) {
        channelData.vestibule.material.emissiveIntensity = t * 0.4;
      }
    }
    
    // Update all domain helices color based on state
    if (channelData.group) {
      const helixMat = t > 0.5 ? channelData.materials.open : channelData.materials.closed;
      channelData.group.traverse(child => {
        if (child.isMesh && 
            child !== channelData.pore && 
            child !== channelData.filter &&
            child !== channelData.vestibule &&
            !channelData.voltageSensors?.includes(child) &&
            !channelData.pLoops?.includes(child)) {
          // Update helix materials
          if (child.material && 
              child.material !== channelData.materials.voltageSensor &&
              child.material !== channelData.materials.voltageSensorActivated &&
              child.material !== channelData.materials.selectivityFilter) {
            child.material = helixMat.clone();
          }
        }
      });
    }
  }
  
  return openCount;
}
