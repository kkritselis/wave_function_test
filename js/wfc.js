/**
 * Wave Function Collapse solver using socket-based tile adjacency.
 */

const DIRECTIONS = [
  { name: 'north', dx: 0, dy: -1, myEdge: 'north', theirEdge: 'south' },
  { name: 'east', dx: 1, dy: 0, myEdge: 'east', theirEdge: 'west' },
  { name: 'south', dx: 0, dy: 1, myEdge: 'south', theirEdge: 'north' },
  { name: 'west', dx: -1, dy: 0, myEdge: 'west', theirEdge: 'east' },
];

export const BASE_TILES = {
  grass: 'roadTexture_25',
  sand: 'roadTexture_26',
};

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

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildCompatibility(tiles) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const compat = new Map();

  for (const tile of tiles) {
    const neighbors = {};
    for (const dir of DIRECTIONS) {
      const socket = tile.sockets[dir.myEdge];
      neighbors[dir.name] = tiles
        .filter((other) => other.sockets[dir.theirEdge] === socket)
        .map((other) => other.id);
    }
    compat.set(tile.id, neighbors);
  }

  return { byId, compat };
}

function shannonEntropy(options, allTiles, rng) {
  if (options.length <= 1) return 0;

  let entropy = 0;
  const total = options.length;

  for (const dir of DIRECTIONS) {
    const socketCounts = new Map();
    for (const tileId of options) {
      const socket = allTiles.byId.get(tileId).sockets[dir.myEdge];
      socketCounts.set(socket, (socketCounts.get(socket) || 0) + 1);
    }
    for (const count of socketCounts.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }

  return entropy + rng() * 0.01;
}

export class WFCSolver {
  constructor(tiles, width, height, seed = Date.now()) {
    this.tiles = tiles;
    this.width = width;
    this.height = height;
    this.rng = createRng(seed);
    this.seed = seed;
    this.allTiles = buildCompatibility(tiles);
    this.grid = [];
    this.collapsed = false;
    this.failed = false;
    this.fillExcluded = [];

    const allIds = tiles.map((t) => t.id);
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push({
          x,
          y,
          options: [...allIds],
          collapsed: false,
          tileId: null,
        });
      }
      this.grid.push(row);
    }
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.grid[y][x];
  }

  findLowestEntropyCell() {
    let best = null;
    let bestEntropy = Infinity;

    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.collapsed) continue;
        if (cell.options.length === 0) return { cell, entropy: -1 };
        const e = shannonEntropy(cell.options, this.allTiles, this.rng);
        if (e < bestEntropy) {
          bestEntropy = e;
          best = cell;
        }
      }
    }

    return best ? { cell: best, entropy: bestEntropy } : null;
  }

  excludeTilesFromOptions(tileIds) {
    const exclude = new Set(tileIds);
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.collapsed) continue;
        const filtered = cell.options.filter((id) => !exclude.has(id));
        if (filtered.length > 0) {
          cell.options = filtered;
        }
      }
    }
  }

  lockCell(x, y, tileId, { propagate = true } = {}) {
    const cell = this.getCell(x, y);
    if (!cell || cell.collapsed || !this.allTiles.byId.has(tileId)) return false;

    const previousOptions = cell.options;
    cell.options = [tileId];
    cell.collapsed = true;
    cell.tileId = tileId;
    cell.locked = true;

    if (propagate && !this.propagate(x, y)) {
      cell.options = previousOptions;
      cell.collapsed = false;
      cell.tileId = null;
      cell.locked = false;
      this.failed = false;
      return false;
    }

    return true;
  }

  applyLockedConstraints(excludedTileIds = []) {
    const excluded = new Set(excludedTileIds);
    const allIds = this.tiles.map((t) => t.id);

    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.collapsed) continue;

        let options = allIds.filter((id) => !excluded.has(id));

        for (const dir of DIRECTIONS) {
          const neighbor = this.getCell(cell.x + dir.dx, cell.y + dir.dy);
          if (!neighbor?.collapsed || !neighbor.tileId) continue;
          if (neighbor.tileId === BASE_TILES.sand) continue;

          const neighborTile = this.allTiles.byId.get(neighbor.tileId);
          const requiredSocket = neighborTile.sockets[dir.theirEdge];
          options = options.filter(
            (id) => this.allTiles.byId.get(id).sockets[dir.myEdge] === requiredSocket
          );
        }

        cell.options = options;
        if (options.length === 0) {
          return false;
        }
      }
    }

    return true;
  }

  resolveForcedCells() {
    const baseTileIds = new Set(Object.values(BASE_TILES));
    let changed = false;

    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.collapsed || cell.options.length !== 1) continue;
        if (baseTileIds.has(cell.options[0])) continue;
        this.collapseCell(cell);
        changed = true;
      }
    }

    return changed;
  }

  prepareForFill(excludedTileIds = []) {
    this.fillExcluded = excludedTileIds;
    this.failed = false;

    if (!this.applyLockedConstraints([])) {
      return false;
    }

    for (let pass = 0; pass < 50; pass++) {
      if (!this.resolveForcedCells()) {
        break;
      }
      if (!this.applyLockedConstraints([])) {
        return false;
      }
    }

    this.excludeTilesFromOptions(excludedTileIds);

    for (const row of this.grid) {
      for (const cell of row) {
        if (!cell.collapsed && cell.options.length === 0) {
          return false;
        }
      }
    }

    return true;
  }

  collapseCell(cell) {
    let pool = cell.options;
    if (pool.length > 1 && this.fillExcluded.length > 0) {
      const filtered = pool.filter((id) => !this.fillExcluded.includes(id));
      if (filtered.length > 0) pool = filtered;
    }

    const weights = pool.map(() => 1);
    let total = weights.length;
    let roll = this.rng() * total;
    let chosen = pool[pool.length - 1];

    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = pool[i];
        break;
      }
    }

    cell.options = [chosen];
    cell.collapsed = true;
    cell.tileId = chosen;
    return chosen;
  }

  propagate(startX, startY) {
    const queue = [{ x: startX, y: startY }];
    const visited = new Set();

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const cell = this.getCell(x, y);
      if (!cell || cell.options.length === 0) continue;

      for (const dir of DIRECTIONS) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        const neighbor = this.getCell(nx, ny);
        if (!neighbor || neighbor.collapsed) continue;

        const allowed = new Set();
        for (const tileId of cell.options) {
          const compatible = this.allTiles.compat.get(tileId)[dir.name];
          for (const id of compatible) allowed.add(id);
        }

        const before = neighbor.options.length;
        neighbor.options = neighbor.options.filter((id) => allowed.has(id));

        if (neighbor.options.length === 0) {
          this.failed = true;
          return false;
        }

        if (neighbor.options.length < before) {
          queue.push({ x: nx, y: ny });
        }
      }
    }

    return true;
  }

  run(maxAttempts = 3) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        this.rng = createRng(this.seed + attempt);
        this.reset();
      }

      while (true) {
        const result = this.findLowestEntropyCell();
        if (!result) {
          this.collapsed = true;
          return this.getResult();
        }

        const { cell, entropy } = result;
        if (entropy < 0) {
          this.failed = true;
          break;
        }

        this.collapseCell(cell);
        if (!this.propagate(cell.x, cell.y)) {
          this.failed = true;
          break;
        }
      }

      if (!this.failed) return this.getResult();
    }

    return this.getResult();
  }

  reset() {
    this.failed = false;
    this.collapsed = false;
    const allIds = this.tiles.map((t) => t.id);
    for (const row of this.grid) {
      for (const cell of row) {
        cell.options = [...allIds];
        cell.collapsed = false;
        cell.tileId = null;
      }
    }
  }

  getResult() {
    return this.grid.map((row) => row.map((cell) => cell.tileId));
  }
}

export function loadTilesetSockets(tileset) {
  return tileset.tiles.map((t) => ({
    id: t.id,
    file: t.file,
    sockets: t.sockets,
  }));
}

/**
 * Pass 1: randomly lock grass and sand tiles on empty cells.
 * Percentages are applied to total grid size; sand only fills cells still empty after grass.
 */
function isAdjacentToTile(solver, x, y, tileId) {
  for (const dir of DIRECTIONS) {
    const neighbor = solver.getCell(x + dir.dx, y + dir.dy);
    if (neighbor?.collapsed && neighbor.tileId === tileId) {
      return true;
    }
  }
  return false;
}

function isAdjacentToGrass(solver, x, y) {
  return isAdjacentToTile(solver, x, y, BASE_TILES.grass);
}

function isAdjacentToSand(solver, x, y) {
  return isAdjacentToTile(solver, x, y, BASE_TILES.sand);
}

function canPlaceGrass(solver, x, y) {
  const cell = solver.getCell(x, y);
  if (!cell || cell.collapsed || isAdjacentToSand(solver, x, y)) return false;

  for (const dir of DIRECTIONS) {
    const neighbor = solver.getCell(x + dir.dx, y + dir.dy);
    if (!neighbor || neighbor.collapsed) continue;
    if (isAdjacentToSand(solver, neighbor.x, neighbor.y)) return false;
  }

  return true;
}

function canPlaceSand(solver, x, y) {
  const cell = solver.getCell(x, y);
  if (!cell || cell.collapsed || isAdjacentToGrass(solver, x, y)) return false;

  for (const dir of DIRECTIONS) {
    const neighbor = solver.getCell(x + dir.dx, y + dir.dy);
    if (!neighbor || neighbor.collapsed) continue;

    for (const dir2 of DIRECTIONS) {
      const adjacent = solver.getCell(neighbor.x + dir2.dx, neighbor.y + dir2.dy);
      if (adjacent?.collapsed && adjacent.tileId === BASE_TILES.grass) {
        return false;
      }
    }
  }

  return true;
}

export function placeBaseLayer(solver, { grassPercent = 0, sandPercent = 0 }) {
  const cells = [];
  for (let y = 0; y < solver.height; y++) {
    for (let x = 0; x < solver.width; x++) {
      cells.push({ x, y });
    }
  }

  shuffleInPlace(cells, solver.rng);

  const total = cells.length;
  const grassTarget = Math.round(total * (grassPercent / 100));
  const sandTarget = Math.round(total * (sandPercent / 100));

  let sandPlaced = 0;
  for (const { x, y } of cells) {
    if (sandPlaced >= sandTarget) break;
    if (!canPlaceSand(solver, x, y)) continue;
    if (solver.lockCell(x, y, BASE_TILES.sand, { propagate: false })) {
      sandPlaced++;
    }
  }

  if (sandPlaced < sandTarget) {
    const retryCells = [...cells];
    shuffleInPlace(retryCells, solver.rng);
    for (const { x, y } of retryCells) {
      if (sandPlaced >= sandTarget) break;
      if (!canPlaceSand(solver, x, y)) continue;
      if (solver.lockCell(x, y, BASE_TILES.sand, { propagate: false })) {
        sandPlaced++;
      }
    }
  }

  let grassPlaced = 0;
  for (const { x, y } of cells) {
    if (grassPlaced >= grassTarget) break;
    if (!canPlaceGrass(solver, x, y)) continue;
    if (solver.lockCell(x, y, BASE_TILES.grass, { propagate: false })) {
      grassPlaced++;
    }
  }

  if (grassPlaced < grassTarget) {
    const retryCells = [...cells];
    shuffleInPlace(retryCells, solver.rng);
    for (const { x, y } of retryCells) {
      if (grassPlaced >= grassTarget) break;
      if (!canPlaceGrass(solver, x, y)) continue;
      if (solver.lockCell(x, y, BASE_TILES.grass, { propagate: false })) {
        grassPlaced++;
      }
    }
  }

  return { grassPlaced, sandPlaced, sandTarget, grassTarget };
}
