/**
 * scene.js - Three.js scene setup, camera, lighting, environment
 * Creates an immersive molecular environment
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, camera, container,
  membraneGroup, ionGroup, channelGroup,
  SCALE, COLORS
} from './config.js';

export let renderer;

// Environment meshes
let extracellularRegion;
let intracellularRegion;

/**
 * Initialize the Three.js scene
 */
export function initScene() {
  // Dark background with slight blue tint (cytoplasm feel)
  scene.background = new THREE.Color(0x030810);
  
  // Add atmospheric fog for depth (reduced for larger view)
  scene.fog = new THREE.FogExp2(0x030810, 0.004);

  // Renderer setup with high quality
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
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Camera initial position (further back for larger patch)
  camera.position.set(0, 80, 150);
  camera.lookAt(0, 0, 0);

  // Create lighting
  setupLighting();

  // Create environment regions
  createEnvironmentRegions();

  // Add groups to scene
  scene.add(membraneGroup);
  scene.add(ionGroup);
  scene.add(channelGroup);

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

/**
 * Setup sophisticated lighting for molecular visualization
 */
function setupLighting() {
  // Ambient light - soft overall illumination
  const ambientLight = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambientLight);

  // Main key light from above-front (like a microscope light)
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(10, 40, 30);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 100;
  keyLight.shadow.camera.left = -50;
  keyLight.shadow.camera.right = 50;
  keyLight.shadow.camera.top = 50;
  keyLight.shadow.camera.bottom = -50;
  scene.add(keyLight);

  // Fill light from the side (cyan tint for aqueous environment)
  const fillLight = new THREE.DirectionalLight(0x00d4ff, 0.3);
  fillLight.position.set(-30, 10, -10);
  scene.add(fillLight);

  // Rim light from below (to see membrane from intracellular side)
  const rimLight = new THREE.DirectionalLight(0xff7b4a, 0.25);
  rimLight.position.set(0, -30, 0);
  scene.add(rimLight);

  // Point lights near channels for emphasis
  const channelLight1 = new THREE.PointLight(0xff4444, 0.5, 30);
  channelLight1.position.set(10, 5, 10);
  scene.add(channelLight1);

  const channelLight2 = new THREE.PointLight(0xffdd00, 0.5, 30);
  channelLight2.position.set(-10, 5, -10);
  scene.add(channelLight2);

  // Hemisphere light for natural ambient gradient
  const hemiLight = new THREE.HemisphereLight(0x4a9eff, 0x1a1a3e, 0.3);
  scene.add(hemiLight);
}

/**
 * Create semi-transparent regions representing extra/intracellular space
 */
function createEnvironmentRegions() {
  const halfWidth = SCALE.MEMBRANE_WIDTH / 2 + 20;
  const halfDepth = SCALE.MEMBRANE_DEPTH / 2 + 20;
  const regionHeight = 25;

  // Extracellular region (above membrane) - slight blue tint
  const extracellularGeo = new THREE.BoxGeometry(
    halfWidth * 2,
    regionHeight,
    halfDepth * 2
  );
  const extracellularMat = new THREE.MeshPhongMaterial({
    color: COLORS.extracellular,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    depthWrite: false,
  });
  extracellularRegion = new THREE.Mesh(extracellularGeo, extracellularMat);
  extracellularRegion.position.y = SCALE.MEMBRANE_THICKNESS / 2 + regionHeight / 2;
  scene.add(extracellularRegion);

  // Intracellular region (below membrane) - darker, warmer tint
  const intracellularGeo = new THREE.BoxGeometry(
    halfWidth * 2,
    regionHeight,
    halfDepth * 2
  );
  const intracellularMat = new THREE.MeshPhongMaterial({
    color: COLORS.intracellular,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    depthWrite: false,
  });
  intracellularRegion = new THREE.Mesh(intracellularGeo, intracellularMat);
  intracellularRegion.position.y = -SCALE.MEMBRANE_THICKNESS / 2 - regionHeight / 2;
  scene.add(intracellularRegion);

  // Add subtle grid planes to show scale
  createScaleGrids();

  // Add boundary indicators
  createBoundaryIndicators();
}

/**
 * Create subtle grid planes for scale reference
 */
function createScaleGrids() {
  const gridSize = SCALE.MEMBRANE_WIDTH + 10;
  const divisions = 10;

  // Grid above membrane (extracellular)
  const gridHelper1 = new THREE.GridHelper(gridSize, divisions, 0x00d4ff, 0x003344);
  gridHelper1.position.y = SCALE.MEMBRANE_THICKNESS / 2 + 15;
  gridHelper1.material.transparent = true;
  gridHelper1.material.opacity = 0.15;
  scene.add(gridHelper1);

  // Grid below membrane (intracellular)
  const gridHelper2 = new THREE.GridHelper(gridSize, divisions, 0xff7b4a, 0x331100);
  gridHelper2.position.y = -SCALE.MEMBRANE_THICKNESS / 2 - 15;
  gridHelper2.material.transparent = true;
  gridHelper2.material.opacity = 0.1;
  scene.add(gridHelper2);
}

/**
 * Create boundary indicators (nanometer scale bar)
 */
function createBoundaryIndicators() {
  // Scale bar - 50nm reference for larger patch
  const scaleBarGeo = new THREE.BoxGeometry(50, 0.5, 0.5);
  const scaleBarMat = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
  });
  const scaleBar = new THREE.Mesh(scaleBarGeo, scaleBarMat);
  scaleBar.position.set(
    -SCALE.MEMBRANE_WIDTH / 2 + 25,
    SCALE.MEMBRANE_THICKNESS / 2 + 22,
    -SCALE.MEMBRANE_DEPTH / 2 - 5
  );
  scene.add(scaleBar);

  // End caps
  const capGeo = new THREE.BoxGeometry(0.5, 3, 0.5);
  const cap1 = new THREE.Mesh(capGeo, scaleBarMat.clone());
  cap1.position.set(
    -SCALE.MEMBRANE_WIDTH / 2,
    SCALE.MEMBRANE_THICKNESS / 2 + 22,
    -SCALE.MEMBRANE_DEPTH / 2 - 5
  );
  scene.add(cap1);

  const cap2 = new THREE.Mesh(capGeo, scaleBarMat.clone());
  cap2.position.set(
    -SCALE.MEMBRANE_WIDTH / 2 + 50,
    SCALE.MEMBRANE_THICKNESS / 2 + 22,
    -SCALE.MEMBRANE_DEPTH / 2 - 5
  );
  scene.add(cap2);

  // Label (using sprite)
  const labelSprite = createTextSprite('50 nm', 0xffffff);
  labelSprite.position.set(
    -SCALE.MEMBRANE_WIDTH / 2 + 25,
    SCALE.MEMBRANE_THICKNESS / 2 + 26,
    -SCALE.MEMBRANE_DEPTH / 2 - 5
  );
  labelSprite.scale.set(12, 6, 1);
  scene.add(labelSprite);

  // Region labels
  const extraLabel = createTextSprite('EXTRACELLULAR', 0x00d4ff);
  extraLabel.position.set(0, SCALE.MEMBRANE_THICKNESS / 2 + 18, 0);
  extraLabel.scale.set(24, 6, 1);
  scene.add(extraLabel);

  const intraLabel = createTextSprite('INTRACELLULAR', 0xff7b4a);
  intraLabel.position.set(0, -SCALE.MEMBRANE_THICKNESS / 2 - 18, 0);
  intraLabel.scale.set(24, 6, 1);
  scene.add(intraLabel);
}

/**
 * Create text sprite for labels
 */
function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 28px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  return new THREE.Sprite(material);
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
 * Update camera position based on angles and flip state
 */
export function updateCamera(distance, angleX, angleY, isFlipped) {
  const flipMultiplier = isFlipped ? -1 : 1;
  
  camera.position.x = Math.sin(angleX) * distance;
  camera.position.y = Math.sin(angleY) * distance * flipMultiplier;
  camera.position.z = Math.cos(angleX) * distance;
  
  camera.lookAt(0, 0, 0);
  camera.up.set(0, flipMultiplier, 0);
}
