/**
 * Analyzes road texture tiles for Wave Function Collapse.
 *
 * Reads each PNG in roads/, extracts edge pixels (north/east/south/west),
 * logs summaries to the console, and writes road-tileset.json for WFC.
 *
 * Usage: node scripts/analyze-tiles.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const ROADS_DIR = path.join(ROOT, 'roads');
const OUTPUT_PATH = path.join(ROOT, 'road-tileset.json');

const EDGE_NAMES = ['north', 'east', 'south', 'west'];

function edgeHash(edge) {
  const str = edge.map((p) => `${p.r},${p.g},${p.b},${p.a}`).join('|');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function edgeToCompact(edge) {
  return edge.map((p) => [p.r, p.g, p.b, p.a]);
}

function summarizeEdge(edge) {
  const unique = new Map();
  for (const p of edge) {
    const key = `${p.r},${p.g},${p.b}`;
    unique.set(key, (unique.get(key) || 0) + 1);
  }
  const sorted = [...unique.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 4).map(([rgb, count]) => ({ rgb, count, pct: ((count / edge.length) * 100).toFixed(1) }));
}

async function extractEdges(imagePath) {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  const getPixel = (x, y) => {
    const i = (y * width + x) * channels;
    return {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      a: channels > 3 ? data[i + 3] : 255,
    };
  };

  const north = [];
  for (let x = 0; x < width; x++) north.push(getPixel(x, 0));

  const south = [];
  for (let x = 0; x < width; x++) south.push(getPixel(x, height - 1));

  const west = [];
  for (let y = 0; y < height; y++) west.push(getPixel(0, y));

  const east = [];
  for (let y = 0; y < height; y++) east.push(getPixel(width - 1, y));

  return { width, height, north, east, south, west };
}

function listTileFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function main() {
  if (!fs.existsSync(ROADS_DIR)) {
    console.error(`Roads directory not found: ${ROADS_DIR}`);
    process.exit(1);
  }

  const files = listTileFiles(ROADS_DIR);
  if (files.length === 0) {
    console.error(`No PNG files found in ${ROADS_DIR}`);
    process.exit(1);
  }

  console.log(`Analyzing ${files.length} tiles in ${ROADS_DIR}\n`);

  const socketRegistry = {};
  const tiles = [];
  let tileSize = null;

  for (const file of files) {
    const filePath = path.join(ROADS_DIR, file);
    const id = path.basename(file, path.extname(file));
    const edges = await extractEdges(filePath);

    if (tileSize === null) {
      tileSize = edges.width;
    } else if (edges.width !== tileSize || edges.height !== tileSize) {
      console.warn(`Warning: ${file} is ${edges.width}x${edges.height}, expected ${tileSize}x${tileSize}`);
    }

    const sockets = {};
    const edgePixels = {};
    const edgeSummaries = {};

    for (const name of EDGE_NAMES) {
      const edge = edges[name];
      const hash = edgeHash(edge);
      sockets[name] = hash;
      edgePixels[name] = edgeToCompact(edge);
      edgeSummaries[name] = summarizeEdge(edge);

      if (!socketRegistry[hash]) {
        socketRegistry[hash] = {
          id: hash,
          usedBy: [],
          dominantColors: summarizeEdge(edge),
        };
      }
      socketRegistry[hash].usedBy.push({ tile: id, edge: name });
    }

    console.log(`--- ${id} ---`);
    for (const name of EDGE_NAMES) {
      const summary = edgeSummaries[name]
        .map((s) => `rgb(${s.rgb}) ${s.pct}%`)
        .join(', ');
      console.log(`  ${name.padEnd(6)} socket=${sockets[name]}  [${summary}]`);
    }
    console.log('');

    tiles.push({
      id,
      file: path.join('roads', file).replace(/\\/g, '/'),
      sockets,
      edges: edgePixels,
    });
  }

  const socketList = Object.values(socketRegistry).map((s) => ({
    id: s.id,
    tileEdgeCount: s.usedBy.length,
    dominantColors: s.dominantColors,
    usedBy: s.usedBy,
  }));

  socketList.sort((a, b) => b.tileEdgeCount - a.tileEdgeCount);

  const adjacencyRules = {
    description: 'Tile A can sit above tile B when A.south === B.north. Tile A can sit left of tile B when A.east === B.west.',
    pairs: [
      { a: 'south', b: 'north', direction: 'vertical' },
      { a: 'east', b: 'west', direction: 'horizontal' },
    ],
  };

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceDir: 'roads',
      tileSize,
      tileCount: tiles.length,
      uniqueSockets: socketList.length,
    },
    adjacencyRules,
    sockets: socketList,
    tiles,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log('='.repeat(60));
  console.log(`Done. ${tiles.length} tiles, ${socketList.length} unique edge sockets.`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log('');
  console.log('Top socket patterns (by frequency):');
  for (const s of socketList.slice(0, 10)) {
    const colors = s.dominantColors.map((c) => c.rgb).join(' | ');
    console.log(`  ${s.id}  (${s.tileEdgeCount} edges)  ${colors}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
