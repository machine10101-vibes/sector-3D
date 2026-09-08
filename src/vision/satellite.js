import { localMeanStd, rgbToHsv, samplePatch, sobelMagnitude, toLuma, morphClose, morphOpen } from "./filters.js";
import { extractComponentsFast } from "./contours.js";
import { ensureCCW, orthogonalize, simplifyRdp, uniqueRing, polygonArea } from "./geometry.js";

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

/**
 * Segment building-like regions from a nadir satellite / aerial raster.
 */
export function segmentSatellite(imageData, params) {
  const { width, height, data } = imageData;
  const luma = toLuma(imageData);
  const { mean, std } = localMeanStd(luma, width, height, 7);
  const mag = sobelMagnitude(luma, width, height);
  const magThresh = percentile(Array.from(mag.filter((_, i) => i % 17 === 0)), 0.72);

  const veg = new Uint8Array(width * height);
  const water = new Uint8Array(width * height);
  const shadow = new Uint8Array(width * height);
  const score = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsv = rgbToHsv(r, g, b);
    const isVeg =
      hsv.h > 55 &&
      hsv.h < 165 &&
      hsv.s > 0.16 &&
      hsv.v > 0.1 &&
      g > r * 1.04 &&
      g > b * 0.85;
    const isWater = hsv.h > 185 && hsv.h < 255 && hsv.s > 0.18 && hsv.v < 0.72 && b > r * 1.05;
    const isShadow = hsv.v < 0.1 + (1 - params.sensitivity) * 0.08;
    veg[p] = isVeg ? 1 : 0;
    water[p] = isWater ? 1 : 0;
    shadow[p] = isShadow ? 1 : 0;

    const uniform = 1 - Math.min(1, std[p] / 28);
    const notGreen = isVeg ? 0 : 1;
    const notWater = isWater ? 0 : 1;
    const notShadow = isShadow ? 0 : 1;
    const structured = mag[p] < magThresh * 1.35 ? 1 : 0.45;
    const midTone = hsv.v > 0.16 && hsv.v < 0.96 ? 1 : 0.2;
    const roofLike = hsv.s < 0.55 ? 1 : 0.7;
    score[p] = notGreen * notWater * notShadow * (0.38 * uniform + 0.22 * structured + 0.25 * midTone + 0.15 * roofLike);
  }

  const cutoff = 0.28 + (1 - params.sensitivity) * 0.32;
  let mask = new Uint8Array(width * height);
  for (let i = 0; i < score.length; i++) mask[i] = score[i] >= cutoff ? 1 : 0;

  mask = morphOpen(mask, width, height, 1);
  mask = morphClose(mask, width, height, 2);

  const minArea = Math.max(24, params.minArea);
  let { components } = extractComponentsFast(mask, width, height, minArea);

  const imgArea = width * height;
  components = components.filter((c) => {
    if (c.area > imgArea * 0.18) return false;
    if (c.aspect > 7 && c.solidity < 0.5) return false;
    if (c.solidity < 0.22) return false;
    return true;
  });

  const buildings = components.map((c) => {
    let ring = uniqueRing(c.contour);
    ring = simplifyRdp(ring, params.simplify);
    ring = orthogonalize(ring, 14);
    ring = uniqueRing(ring);
    if (ring.length < 3) {
      const b = c.bounds;
      ring = [
        { x: b.minX, y: b.minY },
        { x: b.maxX + 1, y: b.minY },
        { x: b.maxX + 1, y: b.maxY + 1 },
        { x: b.minX, y: b.maxY + 1 },
      ];
    }
    ring = ensureCCW(ring);
    const area = Math.abs(polygonArea(ring)) || c.area;
    const roof = samplePatch(imageData, c.centroid.x, c.centroid.y, 4);
    const shadowLen = estimateShadowLength(luma, shadow, width, height, c, mean);
    const sizeHeight = Math.pow(area, 0.38) * 0.55;
    const shadowHeight = shadowLen * params.sunFactor;
    const height = Math.max(4, (sizeHeight + shadowHeight) * params.heightScale);
    const cls = height > 28 ? "highrise" : height > 14 ? "mid" : "lowrise";
    return {
      id: c.id,
      polygon: ring,
      height,
      area,
      centroid: c.centroid,
      roofColor: roof,
      className: cls,
      shadowLength: shadowLen,
    };
  });

  const lights = extractActivityLights(imageData, veg, water, mask, width, height);
  return { buildings, mask, veg, water, shadow, lights, luma, width, height };
}

function estimateShadowLength(luma, shadow, width, height, component, mean) {
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const { centroid, bounds } = component;
  let best = 0;
  for (const [dx, dy] of dirs) {
    let len = 0;
    let darkRun = 0;
    for (let t = 1; t < 80; t++) {
      const x = Math.round(centroid.x + dx * t);
      const y = Math.round(centroid.y + dy * t);
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      const inside =
        x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
      if (inside) continue;
      const i = y * width + x;
      const dark = shadow[i] || luma[i] < mean[i] * 0.72;
      if (dark) {
        darkRun++;
        len = t;
      } else if (darkRun > 2) {
        break;
      } else if (t > 6 && darkRun === 0) {
        break;
      }
    }
    if (len > best) best = len;
  }
  return best;
}

function extractActivityLights(imageData, veg, water, buildingMask, width, height) {
  const lights = [];
  const { data } = imageData;
  const step = Math.max(10, Math.round(Math.min(width, height) / 48));
  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) {
      const i = y * width + x;
      if (buildingMask[i] || veg[i] || water[i]) continue;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const v = (r + g + b) / 3;
      if (v > 40 && v < 170 && Math.abs(r - g) < 18) {
        lights.push({ x, y });
      }
    }
  }
  return lights.slice(0, 220);
}
