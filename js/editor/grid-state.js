/**
 * Grid data model for the environment editor.
 */

export const DEFAULT_TILE_ID = 'roadTexture_25';

export function createCell(id = DEFAULT_TILE_ID, rotation = 0) {
  return { id, rotation: rotation % 4 };
}

export function normalizeCell(cell, defaultId = DEFAULT_TILE_ID) {
  if (!cell) return createCell(defaultId, 0);
  if (typeof cell === 'string') return createCell(cell, 0);
  return createCell(cell.id ?? defaultId, cell.rotation ?? 0);
}

export function cellsEqual(a, b) {
  const na = normalizeCell(a);
  const nb = normalizeCell(b);
  return na.id === nb.id && na.rotation === nb.rotation;
}

export function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => ({ ...normalizeCell(cell) })));
}

export function createGrid(width, height, fillId = DEFAULT_TILE_ID) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => createCell(fillId, 0))
  );
}

export function resizeGrid(grid, newWidth, newHeight, fillId = DEFAULT_TILE_ID) {
  const oldHeight = grid.length;
  const oldWidth = grid[0]?.length ?? 0;
  const next = createGrid(newWidth, newHeight, fillId);

  for (let y = 0; y < Math.min(oldHeight, newHeight); y++) {
    for (let x = 0; x < Math.min(oldWidth, newWidth); x++) {
      next[y][x] = { ...normalizeCell(grid[y][x]) };
    }
  }

  return next;
}

export function serializeMap(grid, meta = {}) {
  return {
    version: 1,
    meta: {
      gridWidth: grid[0].length,
      gridHeight: grid.length,
      defaultTile: DEFAULT_TILE_ID,
      tilePixelSize: meta.tilePixelSize ?? 128,
      exportedAt: new Date().toISOString(),
    },
    terrain: grid.map((row) =>
      row.map((cell) => {
        const normalized = normalizeCell(cell);
        return { id: normalized.id, rotation: normalized.rotation };
      })
    ),
    objects: [],
  };
}

export function deserializeMap(data) {
  if (!data?.terrain?.length || !data.terrain[0]?.length) {
    throw new Error('Invalid map file: missing terrain grid.');
  }

  const grid = data.terrain.map((row) =>
    row.map((cell) => normalizeCell(cell, data.meta?.defaultTile ?? DEFAULT_TILE_ID))
  );

  return {
    grid,
    meta: data.meta ?? {},
    objects: Array.isArray(data.objects) ? data.objects : [],
  };
}

export class HistoryStack {
  constructor(limit = 80) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(grid) {
    this.undoStack.push(cloneGrid(grid));
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(currentGrid) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(cloneGrid(currentGrid));
    return this.undoStack.pop();
  }

  redo(currentGrid) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(cloneGrid(currentGrid));
    return this.redoStack.pop();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
