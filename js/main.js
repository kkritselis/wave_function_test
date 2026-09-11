import * as THREE from 'three';
import { loadTilesetSockets } from './wfc.js';
import { FlyControls } from './controls.js';
import { loadTileImages, buildTerrainMesh } from './terrain.js';
import { generateCity } from './city-gen.js';

const DEFAULT_SEED = 42;
const DEFAULT_GRID_SIZE = 24;
const DEFAULT_HEIGHT_SCALE = 22;
const CAMERA_HEIGHT = 14;
const CAMERA_DISTANCE = 18;

const statusEl = document.getElementById('status');
const seedInput = document.getElementById('seed-input');
const regenerateBtn = document.getElementById('regenerate-btn');
const grassSlider = document.getElementById('grass-slider');
const sandSlider = document.getElementById('sand-slider');
const gridSizeSlider = document.getElementById('grid-size-slider');
const grassValueEl = document.getElementById('grass-value');
const sandValueEl = document.getElementById('sand-value');
const gridSizeValueEl = document.getElementById('grid-size-value');
const heightSlider = document.getElementById('height-slider');
const heightValueEl = document.getElementById('height-value');
const wireframeToggle = document.getElementById('wireframe-toggle');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d8);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);

const controls = new FlyControls(camera, renderer.domElement);
controls.connect();

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e6, 1.1);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

let terrainMesh = null;
let tilesetData = null;
let tileImages = null;
let lastGrid = null;
let lastSeed = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function parseSeed(value) {
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  return hash || DEFAULT_SEED;
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function getGridSize() {
  return Math.max(8, Number(gridSizeSlider.value));
}

function getHeightScale() {
  return Number(heightSlider.value) / 100;
}

function updateSceneScale(gridSize) {
  scene.fog = new THREE.Fog(0x87b5d8, gridSize * 1.5, gridSize * 5);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = gridSize * 3;
  const extent = gridSize * 0.75;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.updateProjectionMatrix();
}

function disposeTerrain() {
  if (!terrainMesh) return;
  scene.remove(terrainMesh);
  terrainMesh.geometry.dispose();
  terrainMesh.material.map?.dispose();
  terrainMesh.material.dispose();
  terrainMesh = null;
}

function updateSliderLabels() {
  grassValueEl.textContent = `${grassSlider.value}%`;
  sandValueEl.textContent = `${sandSlider.value}%`;
  gridSizeValueEl.textContent = gridSizeSlider.value;
  heightValueEl.textContent = getHeightScale().toFixed(2);
}

function rebuildTerrainMesh() {
  if (!lastGrid || !tileImages || !tilesetData) return;

  const wireframe = wireframeToggle.checked;
  const texture = terrainMesh?.material.map ?? null;

  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
    terrainMesh = null;
  }

  terrainMesh = buildTerrainMesh(
    lastGrid,
    tileImages,
    tilesetData.meta.tileSize,
    lastSeed,
    getHeightScale()
  );

  if (texture) {
    terrainMesh.material.map?.dispose();
    terrainMesh.material.map = texture;
    terrainMesh.material.needsUpdate = true;
  }

  terrainMesh.material.wireframe = wireframe;
  scene.add(terrainMesh);
}

function setWireframe(enabled) {
  if (!terrainMesh) return;
  terrainMesh.material.wireframe = enabled;
}

async function generateCityscape(seed) {
  const grassPercent = Number(grassSlider.value);
  const sandPercent = Number(sandSlider.value);
  const gridSize = getGridSize();
  const tiles = loadTilesetSockets(tilesetData);

  setStatus('Generating city layout...');

  const { grid, stats } = generateCity({
    tiles,
    width: gridSize,
    height: gridSize,
    seed,
    grassPercent,
    sandPercent,
    blockSize: Math.max(3, Math.round(gridSize / 6)),
    buildingCount: Math.max(4, Math.round(gridSize / 2)),
  });

  setStatus(
    `Generated ${gridSize}x${gridSize} city (seed: ${seed}, ${stats.buildings} blocks, ${stats.roadCells} roads, ${stats.grassPlaced} grass, ${stats.sandPlaced} sand)`
  );

  lastGrid = grid;
  lastSeed = seed;

  disposeTerrain();
  updateSceneScale(gridSize);
  terrainMesh = buildTerrainMesh(
    grid,
    tileImages,
    tilesetData.meta.tileSize,
    seed,
    getHeightScale()
  );
  setWireframe(wireframeToggle.checked);
  scene.add(terrainMesh);
}

function resetCamera() {
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
}

async function init() {
  setStatus('Loading tileset...');

  const response = await fetch('./road-tileset.json');
  tilesetData = await response.json();

  setStatus('Loading tile textures...');
  const tiles = loadTilesetSockets(tilesetData);
  tileImages = await loadTileImages(tiles);

  gridSizeSlider.value = String(DEFAULT_GRID_SIZE);
  heightSlider.value = String(DEFAULT_HEIGHT_SCALE);
  seedInput.value = String(DEFAULT_SEED);
  updateSliderLabels();
  resetCamera();
  await generateCityscape(DEFAULT_SEED);
}

wireframeToggle.addEventListener('change', () => {
  setWireframe(wireframeToggle.checked);
});

grassSlider.addEventListener('input', updateSliderLabels);
sandSlider.addEventListener('input', updateSliderLabels);
gridSizeSlider.addEventListener('input', updateSliderLabels);
heightSlider.addEventListener('input', () => {
  updateSliderLabels();
  rebuildTerrainMesh();
});

regenerateBtn.addEventListener('click', () => {
  const seed = randomSeed();
  seedInput.value = String(seed);
  generateCityscape(seed);
});

seedInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const seed = parseSeed(seedInput.value);
    generateCityscape(seed);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update(delta);
  renderer.render(scene, camera);
}

init().then(() => {
  animate();
}).catch((err) => {
  console.error(err);
  setStatus(`Failed to load: ${err.message}`, true);
});
