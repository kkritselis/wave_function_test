# City Environment Editor

A browser-based tool for designing city terrain layouts by hand, previewing them in Three.js, and exporting JSON for use in a game. Paint road and terrain tiles on a 2D grid and see the result rendered on a low-poly 3D mesh in real time.

An earlier procedural generator (Wave Function Collapse / autotiled city layout) is still available at `index_old.html` for reference.

## Features

- **2D grid editor** — paint, erase, eyedropper, and flood-fill tools
- **Tile palette** — all 96 road/terrain textures from `roads/`, with search and rotation
- **Live 3D preview** — terrain mesh updates as you edit the grid
- **Export / import** — save and load layouts as JSON for your game
- **Viewport options** — terrain height, wireframe, skybox selection, fly camera
- **Undo / redo** — full edit history with keyboard shortcuts

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Editor controls

### 2D grid (left panel)

| Input | Action |
| --- | --- |
| Paint tool (B) | Place the selected tile |
| Erase tool (E) | Reset a cell to grass |
| Pick tool (I) | Copy tile from a cell |
| Fill tool (G) | Flood fill matching tiles |
| R | Rotate selected tile (0°, 90°, 180°, 270°) |
| Right-click drag | Erase while dragging |
| Scroll | Zoom the grid view |
| Space + drag | Pan the grid view |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Export JSON |

### 3D preview (right panel)

| Input | Action |
| --- | --- |
| Click view | Capture mouse for look controls |
| W A S D | Move |
| E / C | Raise / lower camera |
| Mouse | Look around |
| Terrain height | Adjust height noise amplitude |
| Wireframe | Toggle mesh wireframe |
| Skybox | Switch background (day, morning, night, space, alien) |
| Reset camera | Return to default view |

## Export format

Exported JSON includes terrain tile data and a placeholder `objects` array for future 3D props:

```json
{
  "version": 1,
  "meta": {
    "gridWidth": 24,
    "gridHeight": 24,
    "defaultTile": "roadTexture_25",
    "tilePixelSize": 128,
    "exportedAt": "2026-09-11T..."
  },
  "terrain": [
    [{ "id": "roadTexture_25", "rotation": 0 }]
  ],
  "objects": []
}
```

Each terrain cell has an `id` (matching a PNG in `roads/`) and a `rotation` (0–3, quarter turns clockwise).

## Assets

| Folder | Contents |
| --- | --- |
| `roads/` | 96 terrain/road tile PNGs (128×128) |
| `Skyboxes/` | Equirectangular skybox images for the 3D preview |
| `City Kit - Commercial/` | Kenney commercial building OBJ models |
| `City Kit - Industrial/` | Kenney industrial building OBJ models |
| `City Kit - Suburban/` | Kenney suburban building OBJ models |

3D object placement on the grid is planned; the `objects` array in exports is reserved for that.

## Tile analysis

Road PNGs in `roads/` are analyzed to produce socket metadata in `road-tileset.json`. Re-run after adding or editing tiles:

```bash
npm run analyze-tiles
```

Key base tiles:

| Tile | ID | Use |
| --- | --- | --- |
| Grass | `roadTexture_25` | Default fill |
| Sand | `roadTexture_26` | Sand / beach |

## Project structure

```
index.html              Environment editor (main app)
index_old.html          Legacy procedural city generator
css/
  editor.css            Editor layout and styling
  style.css             Legacy generator HUD styling
js/
  editor-main.js        Editor app bootstrap and UI wiring
  editor/
    grid-state.js       Grid data model, history, JSON export
    grid-canvas.js      2D canvas renderer and interaction
    viewport-3d.js      Three.js preview scene
  terrain.js            Texture baking, heightmap noise, mesh builder
  controls.js           Fly camera controls
  main.js               Legacy generator entry point
  city-gen.js           Legacy procedural layout
  tile-lookup.js        Bitmask autotile map
  wfc.js                WFC solver (legacy)
scripts/
  analyze-tiles.js      PNG edge analysis → road-tileset.json
roads/                  Source tile PNGs
Skyboxes/               Skybox images
road-tileset.json       Generated tile metadata and socket data
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start static dev server |
| `npm start` | Same as `dev` |
| `npm run analyze-tiles` | Regenerate `road-tileset.json` from `roads/` |

## Dependencies

- [three](https://threejs.org/) — 3D rendering
- [serve](https://github.com/vercel/serve) — Local static server
- [sharp](https://sharp.pixelplumbing.com/) — Tile edge analysis (dev script only)
