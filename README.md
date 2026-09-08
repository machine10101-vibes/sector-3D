# SECTOR-3D

Exterior 3D cartography engine. Upload nadir **satellite / aerial imagery** or an architectural **blueprint**, and SECTOR-3D reconstructs a pixel-locked holographic city map in the neon wireframe language of a digital twin.

## Working program

**https://machine10101-vibes.github.io/sector-3D/**

Local:

```bash
npm install
npm run dev
```

## What it does

1. **Ingest** a satellite photograph, aerial raster, or floor-plan drawing (PNG / JPEG / WebP).
2. **Segment** structures:
   - Satellite mode masks vegetation, water, and shadow, then grows compact roof-like regions.
   - Blueprint mode thresholds ink, closes wall gaps, and extracts enclosed rooms from the interior.
3. **Fit footprints** with contour tracing, Douglas–Peucker simplification, and rectilinear snapping so city blocks stay orthogonal.
4. **Estimate height** from footprint mass plus cast-shadow length (satellite) or a calibrated wall height (blueprints).
5. **Extrude** every footprint in the exact pixel space of the source image — roofs keep source-aligned UVs, the ground plane is the original raster.
6. **Present** a bloom-lit hologram (cyan high-rises, lime low-rise, amber activity nodes) that can be orbited, compared against the source lock overlay, and exported.

Use **Source lock** or **Split** until footprints match the imagery, click a volume to inspect it, then export PNG / GLB / JSON.

## Calibration districts

- **Harbor District** — synthetic nadir city with known building rectangles. Fidelity IoU is reported against ground truth.
- **Civic Floor Plan** — orthogonal rooms used to verify blueprint tracing.

Harbor District loads automatically on launch.

## Stack

Vite · Three.js (Unreal Bloom) · classical computer vision in the browser. No backend required.
