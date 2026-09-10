import { describe, expect, it } from "vitest";
import { rgbToHsv } from "./filters.js";
import { meanIoU } from "./geometry.js";
import { defaultParams } from "./reconstruct.js";
import { inferSourceType, isLimeRoof, isVegetation, segmentSatellite } from "./satellite.js";
import { HARBOR_BLOCKS, HARBOR_SIZE } from "../samples/demo.js";

function makeImage(width, height, rgb = [42, 58, 40]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function fillRect(img, x, y, w, h, rgb) {
  const { data, width, height } = img;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(width, Math.round(x + w));
  const y1 = Math.min(height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * width + xx) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function blockTruth(blocks) {
  return blocks.map((b) => ({
    polygon: [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.d },
      { x: b.x, y: b.y + b.d },
    ],
  }));
}

function paintHarbor(size = HARBOR_SIZE) {
  const img = makeImage(size, size, [42, 58, 40]);
  fillRect(img, 0, 166, size, 28, [22, 22, 20]);
  fillRect(img, 0, 606, size, 28, [22, 22, 20]);
  fillRect(img, 226, 0, 28, size, [22, 22, 20]);
  fillRect(img, 706, 0, 28, size, [22, 22, 20]);
  for (const b of HARBOR_BLOCKS) fillRect(img, b.x, b.y, b.w, b.d, hexToRgb(b.roof));
  return img;
}

describe("satellite vegetation", () => {
  it("treats olive lawn as vegetation and lime roofs as buildings", () => {
    const olive = rgbToHsv(42, 58, 40);
    expect(isVegetation(42, 58, 40, olive)).toBe(true);
    const lime = rgbToHsv(213, 224, 74);
    expect(isLimeRoof(213, 224, 74, lime)).toBe(true);
    expect(isVegetation(213, 224, 74, lime)).toBe(false);
    const beige = rgbToHsv(201, 195, 184);
    expect(isVegetation(201, 195, 184, beige)).toBe(false);
  });
});

describe("segmentSatellite", () => {
  it("locks compact roofs and rejects roads plus parking", () => {
    const img = makeImage(320, 320, [42, 58, 40]);
    fillRect(img, 0, 148, 320, 24, [22, 22, 20]);
    fillRect(img, 148, 0, 24, 320, [22, 22, 20]);
    const roofs = [
      { x: 24, y: 24, w: 70, d: 50, rgb: [201, 195, 184] },
      { x: 200, y: 28, w: 60, d: 80, rgb: [232, 230, 223] },
      { x: 24, y: 200, w: 90, d: 50, rgb: [213, 224, 74] },
    ];
    for (const r of roofs) fillRect(img, r.x, r.y, r.w, r.d, r.rgb);
    fillRect(img, 200, 188, 112, 28, [92, 94, 90]);

    const { buildings } = segmentSatellite(img, defaultParams());
    expect(buildings.length).toBeGreaterThanOrEqual(3);
    expect(buildings.length).toBeLessThanOrEqual(5);
    const iou = meanIoU(buildings, blockTruth(roofs.map((r) => ({ ...r, w: r.w, d: r.d }))));
    expect(iou).toBeGreaterThan(0.7);
    const parkingHits = buildings.filter((b) => b.centroid.x > 198 && b.centroid.y > 180 && b.centroid.y < 230);
    expect(parkingHits.length).toBe(0);
  });

  it("recovers Harbor District footprints with high IoU", () => {
    const img = paintHarbor();
    const { buildings } = segmentSatellite(img, defaultParams());
    expect(buildings.length).toBeGreaterThanOrEqual(20);
    expect(buildings.length).toBeLessThanOrEqual(24);
    const iou = meanIoU(buildings, blockTruth(HARBOR_BLOCKS));
    expect(iou).toBeGreaterThan(0.9);
  });

  it("infers satellite vs blueprint source types", () => {
    const sat = paintHarbor(256);
    expect(inferSourceType(sat)).toBe("satellite");
    const bp = makeImage(200, 200, [244, 241, 234]);
    expect(inferSourceType(bp)).toBe("blueprint");
  });
});
