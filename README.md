# Cityscape Generator

A browser-based procedural city generator built with Three.js. It lays out building blocks and an arterial road grid, autotiles road textures from a curated tileset, fills remaining cells with grass and sand, and renders the result on a low-poly terrain mesh with subtle height noise.

## Features

- Seeded procedural generation (numeric or text seeds)
- Arterial road grid with connected intersections (no orphan road islands)
- Bitmask autotiling for straights, corners, T-junctions, and crossroads
- Grass and sand fill with adjustable percentages
- Low-poly terrain mesh with FBM height noise
- Live terrain height slider (rebuilds geometry without regenerating layout)
- Wireframe toggle for inspecting the mesh
- Fly camera controls (WASD, mouse look, E/C for altitude)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Controls

| Input | Action |
| --- | --- |
| Seed + Enter | Regenerate with a specific seed |
| Regenerate | Generate a new random seed |
| Grid size | Map width/height in tiles (8–64). Larger grids expand in world space. |
| Grass / Sand | Percent of empty cells filled with each terrain type |
| Terrain height | Height noise amplitude (0.00–0.80) |
| Wireframe | Toggle mesh wireframe overlay |
| Click canvas | Capture mouse for look controls |
| W A S D | Move |
| E / C | Raise / lower camera |
| Mouse | Look around |

## How generation works

1. **Building footprints** — Random rectangles are placed in block interiors, avoiding arterial lines.
2. **Arterial grid** — Roads are stamped on a regular spacing (`blockSize`, derived from grid size).
3. **Network cleanup** — Disconnected components, interior spurs, and edge dead-ends are removed so all roads form one navigable network.
4. **Autotiling** — Each road cell gets a texture based on its neighbor bitmask (N=1, E=2, S=4, W=8). Curated tile lists per mask avoid water and decorative false matches.
5. **Terrain fill** — Remaining empty cells receive grass or sand based on the sliders. Building cells become grass.
6. **Rendering** — Tile IDs are baked into a canvas texture, mapped onto a subdivided plane with seeded FBM height noise.

## Tile analysis

Road PNGs live in `roads/` (96 tiles at 128×128). The analyzer reads edge pixels, assigns socket IDs, and writes `road-tileset.json` for the app.

```bash
npm run analyze-tiles
```

Key base tiles:

| Tile | ID | Use |
| --- | --- | --- |
| Grass | `roadTexture_25` | Default fill |
| Sand | `roadTexture_26` | Sand fill |

Re-run the analyzer after adding or editing tiles in `roads/`.

## Project structure

```
index.html          App shell and HUD controls
css/style.css       HUD styling
js/
  main.js           Three.js scene, UI wiring, generation trigger
  city-gen.js       City layout: blocks, arterial grid, autotile, fill
  tile-lookup.js    Bitmask autotile map and tile picking
  terrain.js        Texture baking, heightmap noise, mesh builder
  controls.js       Fly camera controls
  wfc.js            Seeded RNG and WFC solver (legacy, unused by main app)
scripts/
  analyze-tiles.js  PNG edge analysis → road-tileset.json
roads/              Source tile PNGs
road-tileset.json   Generated tile metadata and socket data
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
