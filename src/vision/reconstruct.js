import { drawImageContain } from "./filters.js";
import { segmentSatellite } from "./satellite.js";
import { segmentBlueprint } from "./blueprint.js";
import { meanIoU } from "./geometry.js";

export function defaultParams() {
  return {
    sensitivity: 0.62,
    minArea: 90,
    simplify: 2.2,
    heightScale: 1,
    wallHeight: 14,
    sunFactor: 0.85,
    metersPerPixel: 0.55,
  };
}

export async function reconstructFromImage(image, sourceType, params, onProgress) {
  const report = (label, t) => onProgress?.({ label, t });
  report("Normalizing raster", 0.08);
  await Promise.resolve();
  const raster = drawImageContain(image, 1280);
  report(sourceType === "blueprint" ? "Tracing enclosed masses" : "Segmenting structures", 0.35);
  await Promise.resolve();

  const segmented =
    sourceType === "blueprint"
      ? segmentBlueprint(raster.imageData, params)
      : segmentSatellite(raster.imageData, params);

  report("Fitting footprints", 0.78);
  const buildings = segmented.buildings.sort((a, b) => b.height - a.height);
  const coverage =
    buildings.reduce((s, b) => s + b.area, 0) / Math.max(1, raster.width * raster.height);

  report("Locked to source pixels", 1);
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
    sourceType,
  };
}

export function fidelityAgainst(reconstruction, groundTruth) {
  if (!groundTruth?.length) return null;
  const iou = meanIoU(reconstruction.buildings, groundTruth);
  return { meanIoU: iou, truthCount: groundTruth.length, predCount: reconstruction.buildings.length };
}
