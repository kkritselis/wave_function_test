/**
 * Bitmask autotile lookup for road tiles.
 * Mask bits: N=1, E=2, S=4, W=8
 */

export const BASE_TILES = {
  grass: 'roadTexture_25',
  sand: 'roadTexture_26',
};

const GRASS_SOCKET = '269b09b46318';
const SAND_SOCKET = 'f4ef47039709';

/** Sockets that represent asphalt road connections (excludes water, beach, sand). */
const ROAD_SOCKETS = new Set([
  '4a7de12cd35f',
  'caf4a8e96499',
  '51428589b4fa',
  '4a9836a2572c',
  '98fe29c46235',
  '22297cf4105d',
  '9ad494b16e72',
  'f58c1809c379',
  '87cf5e3098c2',
  '8d80f03842ac',
  '4023da10007d',
  '7b220a863b6d',
  '69da41fce148',
  '42b472f967af',
  '2f99fb1aa039',
]);

/** Prefer these tiles for each mask when available (avoids water/decorative false positives). */
const CURATED_BY_MASK = {
  1: ['roadTexture_34'],
  2: ['roadTexture_45'],
  3: ['roadTexture_14', 'roadTexture_16', 'roadTexture_18', 'roadTexture_20'],
  4: ['roadTexture_33'],
  5: ['roadTexture_01'],
  6: ['roadTexture_02', 'roadTexture_04', 'roadTexture_06', 'roadTexture_08'],
  7: ['roadTexture_27', 'roadTexture_29'],
  8: ['roadTexture_46'],
  9: ['roadTexture_15', 'roadTexture_17', 'roadTexture_19', 'roadTexture_21'],
  10: ['roadTexture_13'],
  11: ['roadTexture_39', 'roadTexture_41'],
  12: ['roadTexture_03', 'roadTexture_05', 'roadTexture_07', 'roadTexture_09'],
  13: ['roadTexture_28', 'roadTexture_30'],
  14: ['roadTexture_40', 'roadTexture_42'],
  15: ['roadTexture_10', 'roadTexture_11', 'roadTexture_12'],
};

export function isRoadSocket(socket) {
  return ROAD_SOCKETS.has(socket);
}

export function tileRoadMask(tile) {
  let mask = 0;
  if (isRoadSocket(tile.sockets.north)) mask |= 1;
  if (isRoadSocket(tile.sockets.east)) mask |= 2;
  if (isRoadSocket(tile.sockets.south)) mask |= 4;
  if (isRoadSocket(tile.sockets.west)) mask |= 8;
  return mask;
}

export function isAutotileCandidate(tile) {
  if (tile.id === BASE_TILES.grass || tile.id === BASE_TILES.sand) return false;

  const edges = [tile.sockets.north, tile.sockets.east, tile.sockets.south, tile.sockets.west];
  const hasRoad = edges.some((s) => isRoadSocket(s));
  const onlyGrassOrRoad = edges.every(
    (s) => isRoadSocket(s) || s === GRASS_SOCKET || s === SAND_SOCKET
  );

  return hasRoad && onlyGrassOrRoad;
}

export function rotateMaskClockwise(mask) {
  let rotated = 0;
  if (mask & 8) rotated |= 1;
  if (mask & 1) rotated |= 2;
  if (mask & 2) rotated |= 4;
  if (mask & 4) rotated |= 8;
  return rotated;
}

function addRotatedVariants(byMask, tile, id) {
  const baseMask = tileRoadMask(tile);
  if (baseMask === 0) return;

  for (let rotation = 0; rotation < 4; rotation++) {
    let mask = baseMask;
    for (let i = 0; i < rotation; i++) {
      mask = rotateMaskClockwise(mask);
    }
    if (!byMask[mask]) byMask[mask] = [];
    byMask[mask].push({ id, rotation });
  }
}

export function buildTileLookup(tiles) {
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const candidates = tiles.filter(isAutotileCandidate);
  const byMask = {};
  const curatedMasks = new Set(Object.keys(CURATED_BY_MASK).map(Number));

  for (const [maskKey, ids] of Object.entries(CURATED_BY_MASK)) {
    for (const id of ids) {
      const tile = tileById.get(id);
      if (tile) addRotatedVariants(byMask, tile, id);
    }
  }

  for (const tile of candidates) {
    if (Object.values(CURATED_BY_MASK).flat().includes(tile.id)) continue;

    const baseMask = tileRoadMask(tile);
    for (let rotation = 0; rotation < 4; rotation++) {
      let mask = baseMask;
      for (let i = 0; i < rotation; i++) {
        mask = rotateMaskClockwise(mask);
      }
      if (curatedMasks.has(mask)) continue;
      if (!byMask[mask]) byMask[mask] = [];
      byMask[mask].push({ id: tile.id, rotation });
    }
  }

  return byMask;
}

const FALLBACK_CHAIN = {
  1: [1],
  2: [2],
  3: [3],
  4: [4],
  5: [5],
  6: [6],
  7: [7],
  8: [8],
  9: [9],
  10: [10],
  11: [11],
  12: [12],
  13: [13],
  14: [14],
  15: [15],
};

const CANONICAL_TILE = {
  1: 'roadTexture_34',
  2: 'roadTexture_45',
  3: 'roadTexture_14',
  4: 'roadTexture_33',
  5: 'roadTexture_01',
  6: 'roadTexture_02',
  7: 'roadTexture_27',
  8: 'roadTexture_46',
  9: 'roadTexture_15',
  10: 'roadTexture_13',
  11: 'roadTexture_39',
  12: 'roadTexture_03',
  13: 'roadTexture_28',
  14: 'roadTexture_40',
  15: 'roadTexture_10',
};

export function pickTileForMask(lookup, mask, x, y) {
  const chain = FALLBACK_CHAIN[mask] ?? [mask];

  for (const candidateMask of chain) {
    const variants = lookup[candidateMask];
    if (!variants?.length) continue;

    const canonicalId = CANONICAL_TILE[candidateMask];
    if (canonicalId) {
      const canonicalVariants = variants
        .filter((v) => v.id === canonicalId)
        .sort((a, b) => a.rotation - b.rotation);
      if (canonicalVariants.length) return canonicalVariants[0];
    }

    const index = Math.abs((x * 73856093) ^ (y * 19349663)) % variants.length;
    return variants[index];
  }

  return { id: BASE_TILES.grass, rotation: 0 };
}

export function normalizeGridCell(cell) {
  if (!cell) return { id: BASE_TILES.grass, rotation: 0 };
  if (typeof cell === 'string') return { id: cell, rotation: 0 };
  return { id: cell.id, rotation: cell.rotation ?? 0 };
}
