import { drawImageContain } from "./filters.js";
import { inferSourceType, segmentSatellite } from "./satellite.js";
import { segmentBlueprint } from "./blueprint.js";
import { meanIoU } from "./geometry.js";

export function defaultParams() {
  return {
    sensitivity: 0.68,
    minArea: 70,
    simplify: 1,
    heightScale: 1,
    wallHeight: 14,
    sunFactor: 0.85,
    metersPerPixel: 0.55,
  };
}

export { inferSourceType };

export async function reconstructFromImage(image, sourceType, params, onProgress) {
  const report = (label, t) => onProgress?.({ label, t });
  report("Normalizing raster", 0.08);
  await Promise.resolve();
  const raster = drawImageContain(image, 1920);
  const mode = sourceType === "auto" ? inferSourceType(raster.imageData) : sourceType;
  report(mode === "blueprint" ? "Tracing enclosed masses" : "Locking roofs to source pixels", 0.35);
  await Promise.resolve();

  const segmented =
    mode === "blueprint"
      ? segmentBlueprint(raster.imageData, params)
      : segmentSatellite(raster.imageData, params);

  report("Extruding footprints", 0.78);
  const buildings = segmented.buildings.sort((a, b) => b.height - a.height);
  const coverage =
    buildings.reduce((s, b) => s + b.area, 0) / Math.max(1, raster.width * raster.height);

  report(`Locked ${buildings.length} structures to source pixels`, 1);
  return {
    width: raster.width,
    height: raster.height,
    scale: raster.scale,
    canvas: raster.canvas,
    imageData: raster.imageData,
    buildings,
    lights: segmented.lights,
    mask: segmented.mask,
    coverage,
    sourceType: mode,
    sun: segmented.sun || null,
  };
}

export function fidelityAgainst(reconstruction, groundTruth) {
  if (!groundTruth?.length) return null;
  const iou = meanIoU(reconstruction.buildings, groundTruth);
  return { meanIoU: iou, truthCount: groundTruth.length, predCount: reconstruction.buildings.length };
}
