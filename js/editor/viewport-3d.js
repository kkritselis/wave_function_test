/**
 * Three.js viewport — renders the edited grid as low-poly terrain.
 */

import * as THREE from 'three';
import { FlyControls } from '../controls.js';
import { buildTerrainMesh } from '../terrain.js';

const TERRAIN_SEED = 42;
const DEFAULT_HEIGHT_SCALE = 0.22;
const SKYBOX_OPTIONS = [
  { id: 'none', label: 'Solid color', file: null },
  { id: 'day', label: 'Day', file: 'Skyboxes/skybox-day.png' },
  { id: 'morning', label: 'Morning', file: 'Skyboxes/skybox-morning.png' },
  { id: 'night', label: 'Night', file: 'Skyboxes/skybox-night.png' },
  { id: 'space', label: 'Space', file: 'Skyboxes/skybox-space.png' },
  { id: 'alien', label: 'Alien', file: 'Skyboxes/skybox-alien.png' },
];

export { SKYBOX_OPTIONS };

export class Viewport3D {
  constructor(container) {
    this.container = container;
    this.tileImages = null;
    this.tilePixelSize = 128;
    this.grid = null;
    this.heightScale = DEFAULT_HEIGHT_SCALE;
    this.wireframe = false;
    this.terrainMesh = null;
    this.skyboxTexture = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d8);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 800);
    this.resetCamera();

    this.controls = new FlyControls(this.camera, this.renderer.domElement);
    this.controls.connect();

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.1);
    this.sun.position.set(20, 40, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun);

    this.clock = new THREE.Clock();
    this._animating = false;
    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(container);

    this.resize();
    this.start();
  }

  resetCamera() {
    const gridSize = this.grid?.[0]?.length ?? 24;
    const height = 8 + gridSize * 0.25;
    const distance = 6 + gridSize * 0.5;
    this.camera.position.set(0, height, distance);
    this.camera.lookAt(0, 0, 0);
    this.controls?.euler.setFromQuaternion(this.camera.quaternion);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateSceneScale(gridSize) {
    this.scene.fog = new THREE.Fog(0x87b5d8, gridSize * 1.5, gridSize * 5);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = gridSize * 3;
    const extent = gridSize * 0.75;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  disposeTerrain() {
    if (!this.terrainMesh) return;
    this.scene.remove(this.terrainMesh);
    this.terrainMesh.geometry.dispose();
    this.terrainMesh.material.map?.dispose();
    this.terrainMesh.material.dispose();
    this.terrainMesh = null;
  }

  setTileImages(tileImages, tilePixelSize) {
    this.tileImages = tileImages;
    this.tilePixelSize = tilePixelSize;
  }

  setHeightScale(scale) {
    this.heightScale = scale;
    this.rebuildTerrain();
  }

  setWireframe(enabled) {
    this.wireframe = enabled;
    if (this.terrainMesh) {
      this.terrainMesh.material.wireframe = enabled;
    }
  }

  async setSkybox(skyboxId) {
    const option = SKYBOX_OPTIONS.find((entry) => entry.id === skyboxId) ?? SKYBOX_OPTIONS[0];

    if (this.skyboxTexture) {
      this.skyboxTexture.dispose();
      this.skyboxTexture = null;
    }

    if (!option.file) {
      this.scene.background = new THREE.Color(0x87b5d8);
      return;
    }

    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(option.file);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    this.skyboxTexture = texture;
    this.scene.background = texture;
  }

  setGrid(grid) {
    this.grid = grid;
    this.rebuildTerrain();
  }

  rebuildTerrain() {
    if (!this.grid?.length || !this.tileImages) return;

    const gridSize = Math.max(this.grid.length, this.grid[0].length);
    this.updateSceneScale(gridSize);
    this.disposeTerrain();

    this.terrainMesh = buildTerrainMesh(
      this.grid,
      this.tileImages,
      this.tilePixelSize,
      TERRAIN_SEED,
      this.heightScale
    );
    this.terrainMesh.material.wireframe = this.wireframe;
    this.scene.add(this.terrainMesh);
  }

  start() {
    if (this._animating) return;
    this._animating = true;

    const tick = () => {
      if (!this._animating) return;
      requestAnimationFrame(tick);
      const delta = this.clock.getDelta();
      this.controls.update(delta);
      this.renderer.render(this.scene, this.camera);
    };

    tick();
  }

  destroy() {
    this._animating = false;
    window.removeEventListener('resize', this._onResize);
    this._resizeObserver?.disconnect();
    this.controls.disconnect();
    this.disposeTerrain();
    if (this.skyboxTexture) this.skyboxTexture.dispose();
    this.renderer.dispose();
  }
}
