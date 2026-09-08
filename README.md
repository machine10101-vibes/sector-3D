# SECTOR-3D

Exterior 3D cartography engine. Upload nadir **satellite / aerial imagery** or an architectural **blueprint**, and SECTOR-3D reconstructs a pixel-locked holographic city map in the neon wireframe language of a digital twin.

## Working program

After this repository is merged and GitHub Pages is enabled (Settings → Pages → GitHub Actions):

**https://machine10101-vibes.github.io/sector-3D/**

Until Pages is live, run it locally:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`).

## What it does

1. **Ingest** a satellite photograph, aerial raster, or floor-plan drawing (PNG / JPEG / WebP).
2. **Segment** structures:
   - Satellite mode masks vegetation, water, and shadow, then grows compact roof-like regions.
   - Blueprint mode thresholds ink, closes wall gaps, and extracts enclosed rooms from the interior.
3. **Fit footprints** with contour tracing, Douglas–Peucker simplification, and rectilinear snapping so city blocks stay orthogonal.
4. **Estimate height** from footprint mass plus cast-shadow length (satellite) or a calibrated wall height (blueprints).
5. **Extrude** every footprint in the exact pixel space of the source image — roofs keep source-aligned UVs, the ground plane is the original raster.
6. **Present** a bloom-lit hologram (cyan high-rises, lime low-rise, amber activity nodes) that can be orbited, compared against the source lock overlay, and exported.

Single-image photogrammetry cannot invent hidden facades. SECTOR-3D does not hallucinate streets that are not in the raster: every volume is an extrusion of a detected footprint registered to the source pixels. Tune sensitivity, minimum area, and height scale until the **Source lock** overlay matches the imagery, then apply the 3D hologram.

## Calibration districts

- **Harbor District** — synthetic nadir city with known building rectangles. Fidelity IoU is reported against ground truth.
- **Civic Floor Plan** — orthogonal rooms used to verify blueprint tracing.

## Export

- PNG capture of the 3D viewport
- GLB mesh of the reconstructed sector
- GeoJSON-like footprint collection in image coordinates

## Stack

Vite · Three.js (Unreal Bloom) · classical computer vision in the browser. No backend and no GPU service required.
