/**
 * Procedural city layout: building footprints, arterial grid, A* connectors,
 * bitmask road autotiling, grass/sand fill.
 */

import { createRng } from './wfc.js';
import { BASE_TILES, buildTileLookup, pickTileForMask } from './tile-lookup.js';

export const CELL = {
  EMPTY: 0,
  ROAD: 1,
  BUILDING: 2,
};

const DIRS = [
  { bit: 1, dx: 0, dy: -1, name: 'north' },
  { bit: 2, dx: 1, dy: 0, name: 'east' },
  { bit: 4, dx: 0, dy: 1, name: 'south' },
  { bit: 8, dx: -1, dy: 0, name: 'west' },
];

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function inBounds(width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function createGrid(width, height, fill = CELL.EMPTY) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function rectanglesOverlap(a, b) {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function isOnArterial(x, y, spacing) {
  return x % spacing === 0 || y % spacing === 0;
}

function rectTouchesArterial(rect, spacing) {
  for (let py = rect.y; py < rect.y + rect.h; py++) {
    for (let px = rect.x; px < rect.x + rect.w; px++) {
      if (isOnArterial(px, py, spacing)) return true;
    }
  }
  return false;
}

function placeBuildings(cells, width, height, rng, options) {
  const {
    count = 10,
    minSize = 2,
    maxSize = 4,
    margin = 1,
    blockSize = 4,
  } = options;

  const buildings = [];
  const maxAttempts = count * 40;

  for (let attempt = 0; attempt < maxAttempts && buildings.length < count; attempt++) {
    const w = minSize + Math.floor(rng() * (maxSize - minSize + 1));
    const h = minSize + Math.floor(rng() * (maxSize - minSize + 1));
    const x = margin + Math.floor(rng() * (width - w - margin * 2));
    const y = margin + Math.floor(rng() * (height - h - margin * 2));
    const rect = { x, y, w, h };

    if (buildings.some((b) => rectanglesOverlap(b, rect))) continue;
    if (rectTouchesArterial(rect, blockSize)) continue;

    buildings.push(rect);
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        cells[py][px] = CELL.BUILDING;
      }
    }
  }

  return buildings;
}

function markArterialRoads(cells, width, height, spacing) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x % spacing === 0 || y % spacing === 0) {
        if (cells[y][x] !== CELL.BUILDING) {
          cells[y][x] = CELL.ROAD;
        }
      }
    }
  }
}

function findNearestRoad(cells, width, height, x, y) {
  let best = null;
  let bestDist = Infinity;

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      if (cells[gy][gx] !== CELL.ROAD) continue;
      const dist = Math.abs(gx - x) + Math.abs(gy - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: gx, y: gy };
      }
    }
  }

  return best;
}

function buildingConnectionPoints(building, cells, width, height) {
  const seen = new Set();
  const points = [];

  for (let py = building.y; py < building.y + building.h; py++) {
    for (let px = building.x; px < building.x + building.w; px++) {
      for (const dir of DIRS) {
        const nx = px + dir.dx;
        const ny = py + dir.dy;
        const key = `${nx},${ny}`;
        if (!inBounds(width, height, nx, ny)) continue;
        if (cells[ny][nx] === CELL.BUILDING || seen.has(key)) continue;
        seen.add(key);
        points.push({ x: nx, y: ny });
      }
    }
  }

  return points;
}

function aStar(cells, width, height, start, goal) {
  const key = (x, y) => `${x},${y}`;
  const open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
  const cameFrom = new Map();
  const gScore = new Map([[key(start.x, start.y), 0]]);

  const heuristic = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const cKey = key(current.x, current.y);

    if (current.x === goal.x && current.y === goal.y) {
      const path = [{ x: current.x, y: current.y }];
      let k = cKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.push(prev);
        k = key(prev.x, prev.y);
      }
      return path.reverse();
    }

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (!inBounds(width, height, nx, ny)) continue;

      const cell = cells[ny][nx];
      if (cell === CELL.BUILDING) continue;

      const nKey = key(nx, ny);
      const tentativeG = current.g + 1;
      if (tentativeG >= (gScore.get(nKey) ?? Infinity)) continue;

      cameFrom.set(nKey, { x: current.x, y: current.y });
      gScore.set(nKey, tentativeG);
      const f = tentativeG + heuristic(nx, ny);
      open.push({ x: nx, y: ny, g: tentativeG, f });
    }
  }

  return null;
}

function countRoadNeighbors(cells, width, height, x, y) {
  let count = 0;
  for (const dir of DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (inBounds(width, height, nx, ny) && cells[ny][nx] === CELL.ROAD) {
      count++;
    }
  }
  return count;
}

function connectBuildings(cells, width, height, buildings) {
  let paths = 0;

  for (const building of buildings) {
    const starts = buildingConnectionPoints(building, cells, width, height);
    if (starts.length === 0) continue;

    let bestPath = null;

    for (const start of starts) {
      if (cells[start.y][start.x] === CELL.ROAD) continue;

      const target = findNearestRoad(cells, width, height, start.x, start.y);
      if (!target) continue;
      if (target.x === start.x && target.y === start.y) continue;

      const path = aStar(cells, width, height, start, target);
      if (!path || path.length < 2) continue;

      if (!bestPath || path.length < bestPath.length) {
        bestPath = path;
      }
    }

    if (!bestPath) continue;

    for (const point of bestPath) {
      if (cells[point.y][point.x] === CELL.BUILDING) continue;
      cells[point.y][point.x] = CELL.ROAD;
    }
    paths++;
  }

  return paths;
}

function findRoadComponents(cells, width, height) {
  const visited = createGrid(width, height, false);
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== CELL.ROAD || visited[y][x]) continue;

      const component = [];
      const stack = [{ x, y }];
      visited[y][x] = true;

      while (stack.length > 0) {
        const { x: cx, y: cy } = stack.pop();
        component.push({ x: cx, y: cy });

        for (const dir of DIRS) {
          const nx = cx + dir.dx;
          const ny = cy + dir.dy;
          if (!inBounds(width, height, nx, ny)) continue;
          if (cells[ny][nx] !== CELL.ROAD || visited[ny][nx]) continue;
          visited[ny][nx] = true;
          stack.push({ x: nx, y: ny });
        }
      }

      components.push(component);
    }
  }

  return components;
}

function pruneDeadEnds(cells, width, height) {
  let removed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y][x] !== CELL.ROAD) continue;
        if (countRoadNeighbors(cells, width, height, x, y) <= 1) {
          cells[y][x] = CELL.EMPTY;
          removed++;
          changed = true;
        }
      }
    }
  }

  return removed;
}

function stripNonArterialRoads(cells, width, height, spacing) {
  let removed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== CELL.ROAD) continue;
      if (isOnArterial(x, y, spacing)) continue;
      cells[y][x] = CELL.EMPTY;
      removed++;
    }
  }

  return removed;
}

function unifyRoadNetwork(cells, width, height) {
  let removed = 0;

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y][x] !== CELL.ROAD) continue;
        if (countRoadNeighbors(cells, width, height, x, y) === 0) {
          cells[y][x] = CELL.EMPTY;
          removed++;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const components = findRoadComponents(cells, width, height);
  if (components.length <= 1) return removed;

  components.sort((a, b) => b.length - a.length);

  for (let i = 1; i < components.length; i++) {
    for (const { x, y } of components[i]) {
      cells[y][x] = CELL.EMPTY;
      removed++;
    }
  }

  return removed;
}

function computeRoadMask(cells, x, y) {
  let mask = 0;
  for (const dir of DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (inBounds(cells[0].length, cells.length, nx, ny) && cells[ny][nx] === CELL.ROAD) {
      mask |= dir.bit;
    }
  }
  return mask;
}

function fillTerrainTiles(result, cells, width, height, rng, grassPercent, sandPercent) {
  const emptyCells = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] === CELL.EMPTY) {
        emptyCells.push({ x, y });
      } else if (cells[y][x] === CELL.BUILDING) {
        result[y][x] = BASE_TILES.grass;
      }
    }
  }

  shuffle(emptyCells, rng);

  const total = width * height;
  const sandTarget = Math.min(emptyCells.length, Math.round(total * (sandPercent / 100)));
  const grassTarget = Math.min(
    emptyCells.length,
    Math.round(total * (grassPercent / 100))
  );

  let sandPlaced = 0;
  let grassPlaced = 0;
  let cursor = 0;

  for (let i = 0; i < sandTarget && cursor < emptyCells.length; i++, cursor++) {
    const { x, y } = emptyCells[cursor];
    result[y][x] = BASE_TILES.sand;
    sandPlaced++;
  }

  for (let i = 0; i < grassTarget && cursor < emptyCells.length; i++, cursor++) {
    const { x, y } = emptyCells[cursor];
    result[y][x] = BASE_TILES.grass;
    grassPlaced++;
  }

  for (; cursor < emptyCells.length; cursor++) {
    const { x, y } = emptyCells[cursor];
    result[y][x] = BASE_TILES.grass;
  }

  return { sandPlaced, grassPlaced, emptyCells: emptyCells.length };
}

export function generateCity(options) {
  const {
    tiles,
    width = 24,
    height = 24,
    seed = 1,
    grassPercent = 25,
    sandPercent = 25,
    blockSize = 4,
    buildingCount = 12,
  } = options;

  const rng = createRng(seed);
  const lookup = buildTileLookup(tiles);
  const cells = createGrid(width, height);
  const result = createGrid(width, height, null);

  const buildings = placeBuildings(cells, width, height, rng, {
    count: buildingCount,
    blockSize,
  });
  markArterialRoads(cells, width, height, blockSize);
  const orphansRemoved = unifyRoadNetwork(cells, width, height);
  const spursRemoved = stripNonArterialRoads(cells, width, height, blockSize);
  const deadEndsRemoved = pruneDeadEnds(cells, width, height);

  let roadCells = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== CELL.ROAD) continue;
      roadCells++;
      const mask = computeRoadMask(cells, x, y);
      const pick = pickTileForMask(lookup, mask, x, y);
      result[y][x] = { id: pick.id, rotation: pick.rotation };
    }
  }

  const fillStats = fillTerrainTiles(result, cells, width, height, rng, grassPercent, sandPercent);

  return {
    grid: result,
    stats: {
      seed,
      buildings: buildings.length,
      orphansRemoved,
      spursRemoved,
      deadEndsRemoved,
      roadCells,
      blockSize,
      ...fillStats,
    },
  };
}
