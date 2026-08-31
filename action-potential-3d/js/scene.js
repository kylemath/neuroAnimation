/**
 * scene.js - Three.js scene setup, camera, lighting
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import {
  scene, camera, container,
  neuronGroup, myelinatedNeuronGroup,
  AXON_RADIUS, SCALE_UNITS_PER_MM
} from './config.js';

export let renderer;
export let electrodeGroup;
export let scaleBarGroup;

/**
 * Initialize the Three.js scene
 */
export function initScene() {
  // Scene background and fog
  scene.background = new THREE.Color(0x0b0f17);
  scene.fog = new THREE.Fog(0x0b0f17, 80, 200);

  // Camera setup
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  // Renderer setup
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true, 
    logarithmicDepthBuffer: true 
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.sortObjects = true;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
  mainLight.position.set(20, 30, 20);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0x7ae1ff, 0.4);
  fillLight.position.set(-20, 10, -20);
  scene.add(fillLight);

  // Add neuron groups to scene
  scene.add(neuronGroup);
  scene.add(myelinatedNeuronGroup);

  // Create electrode visualization
  createElectrode();
  
  // Create scale bar
  createScaleBar();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

/**
 * Create the electrode visualization
 */
function createElectrode() {
  electrodeGroup = new THREE.Group();
  scene.add(electrodeGroup);

  const electrodeTipGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
  const electrodeTipMat = new THREE.MeshPhongMaterial({ 
    color: 0xcccccc, 
    emissive: 0x444444 
  });
  
  // Inner electrode (intracellular)
  const electrodeInner = new THREE.Mesh(electrodeTipGeo, electrodeTipMat);
  electrodeInner.rotation.x = Math.PI / 2;
  electrodeInner.position.set(0, AXON_RADIUS * 0.3, 0);
  electrodeGroup.add(electrodeInner);

  // Outer electrode (extracellular reference)
  const electrodeOuter = new THREE.Mesh(electrodeTipGeo, electrodeTipMat.clone());
  electrodeOuter.rotation.x = -Math.PI / 2;
  electrodeOuter.position.set(0, AXON_RADIUS + 1, 0);
  electrodeGroup.add(electrodeOuter);

  // Wires
  const wireGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 6);
  const wireMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  
  const wireInner = new THREE.Mesh(wireGeo, wireMat);
  wireInner.position.set(0, AXON_RADIUS * 0.3 - 1.8, 0);
  electrodeGroup.add(wireInner);

  const wireOuter = new THREE.Mesh(wireGeo, wireMat.clone());
  wireOuter.position.set(0, AXON_RADIUS + 2.8, 0);
  electrodeGroup.add(wireOuter);

  // Position electrode along axon
  electrodeGroup.position.x = 5;
}

/**
 * Create 3D scale bar showing 1mm
 */
function createScaleBar() {
  scaleBarGroup = new THREE.Group();
  const scaleBarLengthUnits = SCALE_UNITS_PER_MM;
  
  // Main bar
  const scaleBarGeo = new THREE.BoxGeometry(scaleBarLengthUnits, 0.15, 0.15);
  const scaleBarMat = new THREE.MeshPhongMaterial({ 
    color: 0xffffff, 
    emissive: 0xffffff, 
    emissiveIntensity: 0.6 
  });
  const scaleBarMesh = new THREE.Mesh(scaleBarGeo, scaleBarMat);
  scaleBarGroup.add(scaleBarMesh);
  
  // End caps
  const endCapGeo = new THREE.BoxGeometry(0.15, 1.5, 0.15);
  
  const endCapLeft = new THREE.Mesh(endCapGeo, scaleBarMat.clone());
  endCapLeft.position.x = -scaleBarLengthUnits / 2;
  scaleBarGroup.add(endCapLeft);
  
  const endCapRight = new THREE.Mesh(endCapGeo, scaleBarMat.clone());
  endCapRight.position.x = scaleBarLengthUnits / 2;
  scaleBarGroup.add(endCapRight);
  
  // Position relative to electrode
  scaleBarGroup.position.set(5 + scaleBarLengthUnits / 2 + 3, AXON_RADIUS + 4, 0);
  electrodeGroup.add(scaleBarGroup);
  
  // Create label using canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1 mm', 64, 32);
  
  const labelTexture = new THREE.CanvasTexture(canvas);
  const labelMat = new THREE.SpriteMaterial({ 
    map: labelTexture, 
    transparent: true,
    depthTest: false
  });
  const labelSprite = new THREE.Sprite(labelMat);
  labelSprite.scale.set(6, 3, 1);
  labelSprite.position.set(0, 1.5, 0);
  scaleBarGroup.add(labelSprite);
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
 * Update camera position based on angles
 */
export function updateCamera(distance, angleX, angleY, lookAtY = 0) {
  camera.position.x = Math.sin(angleX) * distance;
  camera.position.y = Math.sin(angleY) * distance * 0.5;
  camera.position.z = Math.cos(angleX) * distance;
  camera.lookAt(0, lookAtY, 0);
}

/**
 * Render the scene
 */
export function renderScene() {
  renderer.render(scene, camera);
}
