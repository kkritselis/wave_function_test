/**
 * City environment editor — 2D grid tools with live 3D preview.
 */

import { loadTileImages } from './terrain.js';
import { GridCanvas } from './editor/grid-canvas.js';
import { Viewport3D, SKYBOX_OPTIONS } from './editor/viewport-3d.js';
import {
  DEFAULT_TILE_ID,
  createCell,
  createGrid,
  resizeGrid,
  serializeMap,
  deserializeMap,
  normalizeCell,
  cellsEqual,
  HistoryStack,
} from './editor/grid-state.js';

const DEFAULT_GRID_SIZE = 24;

const statusEl = document.getElementById('status');
const toolbarEl = document.getElementById('toolbar');
const tileSearchEl = document.getElementById('tile-search');
const tilePaletteEl = document.getElementById('tile-palette');
const selectedTileCanvas = document.getElementById('selected-tile-canvas');
const selectedTileNameEl = document.getElementById('selected-tile-name');
const rotationDisplayEl = document.getElementById('rotation-display');
const showGridEl = document.getElementById('show-grid');
const gridCanvasEl = document.getElementById('grid-canvas');
const gridWidthEl = document.getElementById('grid-width');
const gridHeightEl = document.getElementById('grid-height');
const resizeGridBtn = document.getElementById('resize-grid-btn');
const clearGridBtn = document.getElementById('clear-grid-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const exportBtn = document.getElementById('export-btn');
const importInput = document.getElementById('import-input');
const canvasContainer = document.getElementById('canvas-container');
const heightSlider = document.getElementById('height-slider');
const heightValueEl = document.getElementById('height-value');
const wireframeToggle = document.getElementById('wireframe-toggle');
const skyboxSelect = document.getElementById('skybox-select');
const resetCameraBtn = document.getElementById('reset-camera-btn');

const selectedPreviewCtx = selectedTileCanvas.getContext('2d');

const state = {
  tiles: [],
  tileImages: new Map(),
  tilePixelSize: 128,
  grid: createGrid(DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE),
  tool: 'paint',
  selectedTileId: DEFAULT_TILE_ID,
  selectedRotation: 0,
  history: new HistoryStack(),
  strokeActive: false,
  lastPaintedKey: null,
};

let gridCanvas = null;
let viewport3d = null;
let viewportSyncTimer = null;

function getHeightScale() {
  return Number(heightSlider.value) / 100;
}

function updateHeightLabel() {
  heightValueEl.textContent = getHeightScale().toFixed(2);
}

function syncViewport3D(immediate = false) {
  if (!viewport3d) return;

  if (immediate) {
    if (viewportSyncTimer) {
      clearTimeout(viewportSyncTimer);
      viewportSyncTimer = null;
    }
    viewport3d.setGrid(state.grid);
    return;
  }

  if (viewportSyncTimer) clearTimeout(viewportSyncTimer);
  viewportSyncTimer = setTimeout(() => {
    viewportSyncTimer = null;
    viewport3d.setGrid(state.grid);
  }, 200);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function updateHistoryButtons() {
  undoBtn.disabled = !state.history.canUndo;
  redoBtn.disabled = !state.history.canRedo;
}

function commitGridChange() {
  state.history.push(state.grid);
  updateHistoryButtons();
  gridCanvas.setGrid(state.grid);
  syncViewport3D(true);
  setStatus(`${state.grid[0].length}x${state.grid.length} grid — tool: ${state.tool}`);
}

function beginStroke() {
  if (!state.strokeActive) {
    state.history.push(state.grid);
    state.strokeActive = true;
    state.lastPaintedKey = null;
  }
}

function endStroke() {
  if (state.strokeActive) {
    state.strokeActive = false;
    state.lastPaintedKey = null;
    updateHistoryButtons();
    syncViewport3D(true);
  }
}

function setTool(tool) {
  state.tool = tool;
  toolbarEl.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  setStatus(`${state.grid[0].length}x${state.grid.length} grid — tool: ${tool}`);
}

function updateSelectedPreview() {
  const img = state.tileImages.get(state.selectedTileId);
  selectedPreviewCtx.clearRect(0, 0, selectedTileCanvas.width, selectedTileCanvas.height);
  selectedPreviewCtx.fillStyle = '#222';
  selectedPreviewCtx.fillRect(0, 0, selectedTileCanvas.width, selectedTileCanvas.height);

  if (img) {
    selectedPreviewCtx.save();
    selectedPreviewCtx.translate(selectedTileCanvas.width / 2, selectedTileCanvas.height / 2);
    selectedPreviewCtx.rotate(state.selectedRotation * (Math.PI / 2));
    selectedPreviewCtx.drawImage(
      img,
      -selectedTileCanvas.width / 2,
      -selectedTileCanvas.height / 2,
      selectedTileCanvas.width,
      selectedTileCanvas.height
    );
    selectedPreviewCtx.restore();
  }

  selectedTileNameEl.textContent = state.selectedTileId;
  rotationDisplayEl.textContent = `Rot: ${state.selectedRotation * 90}°`;
}

function selectTile(tileId) {
  state.selectedTileId = tileId;
  tilePaletteEl.querySelectorAll('.palette-tile').forEach((el) => {
    el.classList.toggle('selected', el.dataset.tileId === tileId);
  });
  updateSelectedPreview();
}

function buildPalette(filter = '') {
  const query = filter.trim().toLowerCase();
  tilePaletteEl.innerHTML = '';

  const visible = state.tiles.filter((tile) =>
    !query || tile.id.toLowerCase().includes(query)
  );

  for (const tile of visible) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-tile';
    btn.dataset.tileId = tile.id;
    btn.title = tile.id;

    const img = state.tileImages.get(tile.id);
    if (img) {
      const thumb = document.createElement('img');
      thumb.src = img.src;
      thumb.alt = tile.id;
      btn.appendChild(thumb);
    }

    btn.addEventListener('click', () => {
      selectTile(tile.id);
      if (state.tool !== 'paint') setTool('paint');
    });

    tilePaletteEl.appendChild(btn);
  }

  selectTile(state.selectedTileId);
}

function floodFill(startX, startY, targetCell, replacementCell) {
  if (cellsEqual(targetCell, replacementCell)) return;

  const width = state.grid[0].length;
  const height = state.grid.length;
  const stack = [[startX, startY]];
  const visited = new Set();

  while (stack.length) {
    const [x, y] = stack.pop();
    const key = cellKey(x, y);
    if (visited.has(key)) continue;
    visited.add(key);

    const current = normalizeCell(state.grid[y][x]);
    if (!cellsEqual(current, targetCell)) continue;

    state.grid[y][x] = { ...replacementCell };

    if (x > 0) stack.push([x - 1, y]);
    if (x < width - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < height - 1) stack.push([x, y + 1]);
  }
}

function applyToolAt(x, y, options = {}) {
  const key = cellKey(x, y);
  if (options.continuous && key === state.lastPaintedKey) return;
  state.lastPaintedKey = key;

  const current = normalizeCell(state.grid[y][x]);

  if (options.erase || state.tool === 'erase') {
    const replacement = createCell(DEFAULT_TILE_ID, 0);
    if (cellsEqual(current, replacement)) return;
    state.grid[y][x] = replacement;
    gridCanvas.setGrid(state.grid);
    syncViewport3D();
    return;
  }

  if (state.tool === 'pick') {
    selectTile(current.id);
    state.selectedRotation = current.rotation;
    updateSelectedPreview();
    return;
  }

  if (state.tool === 'fill') {
    beginStroke();
    floodFill(
      x,
      y,
      current,
      createCell(state.selectedTileId, state.selectedRotation)
    );
    gridCanvas.setGrid(state.grid);
    endStroke();
    syncViewport3D(true);
    return;
  }

  const replacement = createCell(state.selectedTileId, state.selectedRotation);
  if (cellsEqual(current, replacement)) return;

  state.grid[y][x] = replacement;
  gridCanvas.setGrid(state.grid);
  syncViewport3D();
}

function handleCellAction(x, y, options) {
  if (state.tool === 'fill' && !options.continuous) {
    applyToolAt(x, y, options);
    return;
  }

  if (options.erase) {
    if (!state.strokeActive) beginStroke();
    applyToolAt(x, y, options);
    return;
  }

  if (state.tool === 'pick') {
    applyToolAt(x, y, options);
    return;
  }

  if (!state.strokeActive) beginStroke();
  applyToolAt(x, y, options);
}

function rotateSelection() {
  state.selectedRotation = (state.selectedRotation + 1) % 4;
  updateSelectedPreview();
}

function resizeGridFromInputs() {
  const width = Math.max(4, Math.min(128, Number(gridWidthEl.value) || DEFAULT_GRID_SIZE));
  const height = Math.max(4, Math.min(128, Number(gridHeightEl.value) || DEFAULT_GRID_SIZE));
  gridWidthEl.value = String(width);
  gridHeightEl.value = String(height);

  state.grid = resizeGrid(state.grid, width, height, DEFAULT_TILE_ID);
  state.history.clear();
  updateHistoryButtons();
  gridCanvas.setGrid(state.grid);
  gridCanvas.fitToViewport();
  syncViewport3D(true);
  viewport3d?.resetCamera();
  setStatus(`Resized to ${width}x${height}`);
}

function clearGrid() {
  if (!window.confirm('Clear the entire grid to grass?')) return;
  state.grid = createGrid(state.grid[0].length, state.grid.length, DEFAULT_TILE_ID);
  commitGridChange();
}

function exportMap() {
  const payload = serializeMap(state.grid, { tilePixelSize: state.tilePixelSize });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `environment-map-${payload.meta.gridWidth}x${payload.meta.gridHeight}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${payload.meta.gridWidth}x${payload.meta.gridHeight} map`);
}

async function importMap(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const { grid, meta } = deserializeMap(data);

  state.grid = grid;
  state.tilePixelSize = meta.tilePixelSize ?? state.tilePixelSize;
  gridWidthEl.value = String(grid[0].length);
  gridHeightEl.value = String(grid.length);
  state.history.clear();
  updateHistoryButtons();
  gridCanvas.setGrid(state.grid);
  gridCanvas.fitToViewport();
  syncViewport3D(true);
  viewport3d?.resetCamera();
  setStatus(`Imported ${grid[0].length}x${grid.length} map`);
}

function bindUi() {
  toolbarEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.tool-btn');
    if (!btn) return;
    setTool(btn.dataset.tool);
  });

  tileSearchEl.addEventListener('input', () => {
    buildPalette(tileSearchEl.value);
  });

  showGridEl.addEventListener('change', () => {
    gridCanvas.setShowGrid(showGridEl.checked);
  });

  resizeGridBtn.addEventListener('click', resizeGridFromInputs);
  clearGridBtn.addEventListener('click', clearGrid);

  undoBtn.addEventListener('click', () => {
    const prev = state.history.undo(state.grid);
    if (!prev) return;
    state.grid = prev;
    gridCanvas.setGrid(state.grid);
    syncViewport3D(true);
    updateHistoryButtons();
  });

  redoBtn.addEventListener('click', () => {
    const next = state.history.redo(state.grid);
    if (!next) return;
    state.grid = next;
    gridCanvas.setGrid(state.grid);
    syncViewport3D(true);
    updateHistoryButtons();
  });

  exportBtn.addEventListener('click', exportMap);

  heightSlider.addEventListener('input', () => {
    updateHeightLabel();
    viewport3d?.setHeightScale(getHeightScale());
  });

  wireframeToggle.addEventListener('change', () => {
    viewport3d?.setWireframe(wireframeToggle.checked);
  });

  skyboxSelect.addEventListener('change', () => {
    viewport3d?.setSkybox(skyboxSelect.value);
  });

  resetCameraBtn.addEventListener('click', () => {
    viewport3d?.resetCamera();
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      await importMap(file);
    } catch (err) {
      console.error(err);
      setStatus(`Import failed: ${err.message}`, true);
    }
  });

  window.addEventListener('mouseup', endStroke);

  window.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea')) return;

    switch (event.key.toLowerCase()) {
      case 'b':
        setTool('paint');
        break;
      case 'e':
        setTool('erase');
        break;
      case 'i':
        setTool('pick');
        break;
      case 'g':
        setTool('fill');
        break;
      case 'r':
        rotateSelection();
        break;
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (event.shiftKey) {
            redoBtn.click();
          } else {
            undoBtn.click();
          }
        }
        break;
      case 'y':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          redoBtn.click();
        }
        break;
      case 's':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          exportMap();
        }
        break;
      default:
        break;
    }
  });
}

async function init() {
  setStatus('Loading tileset...');

  const response = await fetch('./road-tileset.json');
  const tilesetData = await response.json();
  state.tilePixelSize = tilesetData.meta?.tileSize ?? 128;
  state.tiles = tilesetData.tiles.map(({ id, file }) => ({ id, file }));

  setStatus('Loading tile images...');
  state.tileImages = await loadTileImages(state.tiles);

  gridCanvas = new GridCanvas(gridCanvasEl, {
    tileImages: state.tileImages,
    defaultTileId: DEFAULT_TILE_ID,
  });
  gridCanvas.onCellAction = handleCellAction;
  gridCanvas.setShowGrid(showGridEl.checked);
  gridCanvas.setGrid(state.grid);
  gridCanvas.fitToViewport();

  viewport3d = new Viewport3D(canvasContainer);
  viewport3d.setTileImages(state.tileImages, state.tilePixelSize);
  viewport3d.setHeightScale(getHeightScale());
  viewport3d.setGrid(state.grid);

  for (const option of SKYBOX_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    skyboxSelect.appendChild(el);
  }
  skyboxSelect.value = 'day';
  viewport3d.setSkybox('day');

  buildPalette();
  updateSelectedPreview();
  updateHeightLabel();
  bindUi();
  updateHistoryButtons();

  setStatus(`Ready — ${state.grid[0].length}x${state.grid.length} grid, ${state.tiles.length} tiles`);
}

init().catch((err) => {
  console.error(err);
  setStatus(`Failed to load: ${err.message}`, true);
});
