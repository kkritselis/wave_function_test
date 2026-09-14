/**
 * 2D canvas renderer and interaction for the terrain grid.
 */

import { normalizeCell, DEFAULT_TILE_ID } from './grid-state.js';

function drawRotatedTile(ctx, img, x, y, size, rotation) {
  if (!rotation) {
    ctx.drawImage(img, x, y, size, size);
    return;
  }

  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rotation * (Math.PI / 2));
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

export class GridCanvas {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileImages = options.tileImages ?? new Map();
    this.defaultTileId = options.defaultTileId ?? DEFAULT_TILE_ID;

    this.grid = [];
    this.showGrid = true;
    this.cellSize = 24;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hoverCell = null;

    this.isPanning = false;
    this.panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
    this.spaceHeld = false;

    this.onCellAction = null;

    this._onResize = this.fitToViewport.bind(this);
    window.addEventListener('resize', this._onResize);

    this.bindEvents();
  }

  setGrid(grid) {
    this.grid = grid;
    this.draw();
  }

  setTileImages(tileImages) {
    this.tileImages = tileImages;
    this.draw();
  }

  setShowGrid(show) {
    this.showGrid = show;
    this.draw();
  }

  fitToViewport() {
    const parent = this.canvas.parentElement;
    if (!parent || !this.grid.length) return;

    const width = this.grid[0].length;
    const height = this.grid.length;
    const padding = 16;
    const availW = Math.max(1, parent.clientWidth - padding * 2);
    const availH = Math.max(1, parent.clientHeight - padding * 2);
    const fitSize = Math.floor(Math.min(availW / width, availH / height));
    this.cellSize = Math.max(8, Math.min(48, fitSize));

    const gridW = width * this.cellSize;
    const gridH = height * this.cellSize;
    this.offsetX = Math.floor((parent.clientWidth - gridW) / 2);
    this.offsetY = Math.floor((parent.clientHeight - gridH) / 2);

    this.resizeCanvas();
    this.draw();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(parent.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(parent.clientHeight * dpr));
    this.canvas.style.width = `${parent.clientWidth}px`;
    this.canvas.style.height = `${parent.clientHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  screenToCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left - this.offsetX;
    const y = clientY - rect.top - this.offsetY;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    if (
      row < 0 ||
      col < 0 ||
      row >= this.grid.length ||
      col >= this.grid[0].length
    ) {
      return null;
    }

    return { x: col, y: row };
  }

  draw() {
    const ctx = this.ctx;
    const parent = this.canvas.parentElement;
    const viewW = parent.clientWidth;
    const viewH = parent.clientHeight;

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, viewW, viewH);

    if (!this.grid.length) return;

    const gridW = this.grid[0].length;
    const gridH = this.grid.length;

    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const cell = normalizeCell(this.grid[y][x], this.defaultTileId);
        const img = this.tileImages.get(cell.id);
        const px = this.offsetX + x * this.cellSize;
        const py = this.offsetY + y * this.cellSize;

        if (img) {
          drawRotatedTile(ctx, img, px, py, this.cellSize, cell.rotation);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(px, py, this.cellSize, this.cellSize);
        }
      }
    }

    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= gridW; x++) {
        const px = this.offsetX + x * this.cellSize + 0.5;
        ctx.moveTo(px, this.offsetY);
        ctx.lineTo(px, this.offsetY + gridH * this.cellSize);
      }
      for (let y = 0; y <= gridH; y++) {
        const py = this.offsetY + y * this.cellSize + 0.5;
        ctx.moveTo(this.offsetX, py);
        ctx.lineTo(this.offsetX + gridW * this.cellSize, py);
      }
      ctx.stroke();
    }

    if (this.hoverCell) {
      const { x, y } = this.hoverCell;
      ctx.strokeStyle = 'rgba(74, 139, 229, 0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.offsetX + x * this.cellSize + 1,
        this.offsetY + y * this.cellSize + 1,
        this.cellSize - 2,
        this.cellSize - 2
      );
    }
  }

  bindEvents() {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const before = this.screenToCell(event.clientX, event.clientY);
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      this.cellSize = Math.max(8, Math.min(64, this.cellSize * factor));

      if (before) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        this.offsetX = mx - (before.x + 0.5) * this.cellSize;
        this.offsetY = my - (before.y + 0.5) * this.cellSize;
      }

      this.draw();
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
        this.isPanning = true;
        this.panStart = {
          x: event.clientX,
          y: event.clientY,
          offsetX: this.offsetX,
          offsetY: this.offsetY,
        };
        event.preventDefault();
        return;
      }

      if (event.button === 0 && this.onCellAction) {
        const cell = this.screenToCell(event.clientX, event.clientY);
        if (cell) {
          this.onCellAction(cell.x, cell.y, { continuous: true, button: 0 });
        }
      }

      if (event.button === 2 && this.onCellAction) {
        const cell = this.screenToCell(event.clientX, event.clientY);
        if (cell) {
          this.onCellAction(cell.x, cell.y, { continuous: true, button: 2, erase: true });
        }
      }
    });

    this.canvas.addEventListener('mousemove', (event) => {
      if (this.isPanning) {
        this.offsetX = this.panStart.offsetX + (event.clientX - this.panStart.x);
        this.offsetY = this.panStart.offsetY + (event.clientY - this.panStart.y);
        this.draw();
        return;
      }

      const cell = this.screenToCell(event.clientX, event.clientY);
      const changed =
        cell?.x !== this.hoverCell?.x ||
        cell?.y !== this.hoverCell?.y ||
        (!cell && this.hoverCell);

      this.hoverCell = cell;

      if (changed) this.draw();

      if (event.buttons === 1 && this.onCellAction && cell && !this.spaceHeld) {
        this.onCellAction(cell.x, cell.y, { continuous: true, button: 0 });
      }

      if (event.buttons === 2 && this.onCellAction && cell) {
        this.onCellAction(cell.x, cell.y, { continuous: true, button: 2, erase: true });
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isPanning = false;
      this.hoverCell = null;
      this.draw();
    });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !this.spaceHeld) {
        this.spaceHeld = true;
        this.canvas.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        this.spaceHeld = false;
        this.canvas.style.cursor = 'crosshair';
        this.isPanning = false;
      }
    });
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }
}
