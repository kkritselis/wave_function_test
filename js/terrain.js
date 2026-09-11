/**
 * Builds a low-poly terrain mesh and bakes WFC tile results into a texture.
 */

import * as THREE from 'three';

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function loadTileImages(tiles) {
  const map = new Map();
  await Promise.all(
    tiles.map(async (tile) => {
      const img = await loadImage(tile.file);
      map.set(tile.id, img);
    })
  );
  return map;
}

function drawTile(ctx, img, destX, destY, size, rotation = 0) {
  if (!rotation) {
    ctx.drawImage(img, destX, destY, size, size);
    return;
  }

  ctx.save();
  ctx.translate(destX + size / 2, destY + size / 2);
  ctx.rotate(rotation * (Math.PI / 2));
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

export function bakeTerrainTexture(grid, tileImages, tilePixelSize) {
  const height = grid.length;
  const width = grid[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = width * tilePixelSize;
  canvas.height = height * tilePixelSize;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      const tileId = typeof cell === 'string' ? cell : cell?.id;
      const rotation = typeof cell === 'string' ? 0 : (cell?.rotation ?? 0);
      const img = tileImages.get(tileId);
      if (img) {
        drawTile(ctx, img, x * tilePixelSize, y * tilePixelSize, tilePixelSize, rotation);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return { texture, canvas };
}

function hash2D(x, y, seed) {
  let h = (seed + x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x0 + 1, y0, seed);
  const n01 = hash2D(x0, y0 + 1, seed);
  const n11 = hash2D(x0 + 1, y0 + 1, seed);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return (ix0 + (ix1 - ix0) * sy) * 2 - 1;
}

function fbm2D(x, y, seed, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, y * frequency, seed + i * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / total;
}

export function createPolygonTerrain(gridWidth, gridHeight, tileSize, seed, heightScale = 0.22) {
  const vertsX = gridWidth + 1;
  const vertsZ = gridHeight + 1;
  const positions = [];
  const uvs = [];
  const indices = [];

  const noiseSeed = (seed ^ 0x9e3779b9) >>> 0;
  const noiseFrequency = 3.5 / Math.max(gridWidth, gridHeight);

  const heights = [];
  for (let z = 0; z < vertsZ; z++) {
    const row = [];
    for (let x = 0; x < vertsX; x++) {
      const sampleX = x * noiseFrequency;
      const sampleZ = z * noiseFrequency;
      const h = fbm2D(sampleX, sampleZ, noiseSeed) * heightScale;
      row.push(h);
    }
    heights.push(row);
  }

  for (let z = 0; z < vertsZ; z++) {
    for (let x = 0; x < vertsX; x++) {
      positions.push(x * tileSize, heights[z][x], z * tileSize);
      uvs.push(x / gridWidth, 1 - z / gridHeight);
    }
  }

  for (let z = 0; z < gridHeight; z++) {
    for (let x = 0; x < gridWidth; x++) {
      const a = z * vertsX + x;
      const b = a + 1;
      const c = a + vertsX;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export function buildTerrainMesh(grid, tileImages, tilePixelSize, seed, heightScale = 0.22) {
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;
  const tileSize = 1;
  const { texture } = bakeTerrainTexture(grid, tileImages, tilePixelSize);
  const geometry = createPolygonTerrain(gridWidth, gridHeight, tileSize, seed, heightScale);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.set(-gridWidth / 2, 0, -gridHeight / 2);

  return mesh;
}
