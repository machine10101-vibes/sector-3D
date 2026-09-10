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
 * Bright chartreuse rooftops (common on industrial buildings) are not trees.
 */
export function isLimeRoof(r, g, b, hsv) {
  return hsv.h >= 38 && hsv.h <= 98 && hsv.v > 0.48 && b < 155 && g > 88 && (r + g) / 2 > 125;
}

/**
 * Leafy / olive ground. Tuned so Harbor-style #2a3a28 lawn counts as vegetation
 * while beige and lime roofs do not.
 */
export function isVegetation(r, g, b, hsv) {
  if (isLimeRoof(r, g, b, hsv)) return false;
  const gLead = g - Math.max(r, b);
  const olive =
    g > r &&
    g > b &&
    gLead >= 6 &&
    hsv.h > 48 &&
    hsv.h < 180 &&
    hsv.s > 0.07 &&
    hsv.v > 0.06 &&
    hsv.v < 0.74;
  const leafy =
    hsv.h > 68 &&
    hsv.h < 168 &&
    hsv.s > 0.16 &&
    hsv.v > 0.1 &&
    hsv.v < 0.78 &&
    g > r * 1.06 &&
    g > b * 1.04;
  return olive || leafy;
}

function isWater(r, g, b, hsv) {
  return hsv.h > 185 && hsv.h < 255 && hsv.s > 0.16 && hsv.v < 0.72 && b > r * 1.04 && b >= g * 0.9;
}

function isDeepShadow(hsv, sensitivity) {
  return hsv.v < 0.1 + (1 - sensitivity) * 0.08;
}

function isBareEarth(r, g, b, hsv) {
  return hsv.h > 16 && hsv.h < 52 && hsv.s > 0.16 && hsv.s < 0.58 && hsv.v > 0.1 && hsv.v < 0.4 && r > g && g >= b - 6;
}

function regionColorStats(imageData, component, labels) {
  const { data, width } = imageData;
  const { minX, minY, maxX, maxY } = component.bounds;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = Math.max(1, Math.round(Math.hypot(maxX - minX, maxY - minY) / 28));
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const i = y * width + x;
      if (labels && labels[i] !== component.id) continue;
      const p = i * 4;
      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      n++;
    }
  }
  n = Math.max(1, n);
  return { r: r / n, g: g / n, b: b / n };
}

function meanInComponent(arr, width, component, labels) {
  const { minX, minY, maxX, maxY } = component.bounds;
  let s = 0;
  let n = 0;
  const step = Math.max(1, Math.round(Math.hypot(maxX - minX, maxY - minY) / 32));
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const i = y * width + x;
      if (labels && labels[i] !== component.id) continue;
      s += arr[i];
      n++;
    }
  }
  return n ? s / n : 0;
}

function touchesBorder(c, width, height) {
  return c.bounds.minX <= 1 || c.bounds.minY <= 1 || c.bounds.maxX >= width - 2 || c.bounds.maxY >= height - 2;
}

function boundsRing(c) {
  const b = c.bounds;
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX + 1, y: b.minY },
    { x: b.maxX + 1, y: b.maxY + 1 },
    { x: b.minX, y: b.maxY + 1 },
  ];
}

function toBuilding(imageData, luma, shadow, mean, width, height, c, params) {
  let ring = uniqueRing(c.contour);
  const raw = ensureCCW(ring);
  const rawArea = Math.abs(polygonArea(raw)) || c.area;
  ring = uniqueRing(simplifyRdp(ring, Math.max(0.55, params.simplify * 0.75)));
  const snapped = uniqueRing(orthogonalize(ring, 8));
  const snapArea = Math.abs(polygonArea(ensureCCW(snapped)));
  if (snapped.length >= 4 && snapArea > rawArea * 0.82 && snapArea < rawArea * 1.18) ring = snapped;
  if (ring.length < 3) ring = boundsRing(c);
  ring = ensureCCW(ring);
  let area = Math.abs(polygonArea(ring)) || c.area;
  if (area < c.area * 0.55 || area > c.area * 1.35) {
    ring = ensureCCW(boundsRing(c));
    area = Math.abs(polygonArea(ring)) || c.area;
  }
  const roof = samplePatch(imageData, c.centroid.x, c.centroid.y, 4);
  const shadowLen = estimateShadowLength(luma, shadow, width, height, c, mean);
  const sizeHeight = Math.pow(Math.max(area, 1), 0.42) * 0.48;
  const shadowHeight = Math.min(36, shadowLen * params.sunFactor * 0.32);
  const extrusion = Math.max(5, (sizeHeight + shadowHeight) * params.heightScale);
  const cls = extrusion > 28 ? "highrise" : extrusion > 14 ? "mid" : "lowrise";
  return {
    id: c.id,
    polygon: ring,
    height: extrusion,
    area,
    centroid: c.centroid,
    roofColor: roof,
    className: cls,
    shadowLength: shadowLen,
  };
}

function rejectComponent(c, col, hsv, interiorStd, interiorMag, imgArea, width, height) {
  if (c.area > imgArea * 0.18) return true;
  if (c.solidity < 0.3) return true;
  if (c.aspect > 6.2) return true;
  if (isVegetation(col.r, col.g, col.b, hsv)) return true;
  if (touchesBorder(c, width, height) && c.aspect > 3.1 && c.solidity < 0.62) return true;
  const gray = hsv.s < 0.16 && hsv.v < 0.46;
  if (gray && c.aspect > 3.35) return true;
  if (gray && interiorMag > 38 && c.area > imgArea * 0.035) return true;
  if (interiorStd > 48 && c.solidity < 0.48) return true;
  if (hsv.v < 0.11) return true;
  return false;
}

function splitOversized(plateaus, width, height, minArea, imgArea) {
  const first = extractComponentsFast(plateaus, width, height, minArea, 4);
  const outMask = new Uint8Array(plateaus.length);
  let changed = false;
  for (const c of first.components) {
    if (c.area < imgArea * 0.07) {
      for (let i = 0; i < first.labels.length; i++) if (first.labels[i] === c.id) outMask[i] = 1;
      continue;
    }
    const sub = new Uint8Array(plateaus.length);
    for (let i = 0; i < first.labels.length; i++) if (first.labels[i] === c.id) sub[i] = 1;
    const opened = morphOpen(sub, width, height, 2);
    const parts = extractComponentsFast(opened, width, height, minArea, 4).components;
    if (parts.length > 1) {
      changed = true;
      for (let i = 0; i < opened.length; i++) if (opened[i]) outMask[i] = 1;
    } else {
      for (let i = 0; i < first.labels.length; i++) if (first.labels[i] === c.id) outMask[i] = 1;
    }
  }
  if (!changed) return { plateaus, components: first.components, labels: first.labels };
  const next = extractComponentsFast(outMask, width, height, minArea, 4);
  return { plateaus: outMask, components: next.components, labels: next.labels };
}

/**
 * Segment building-like roof plateaus from a nadir satellite / aerial raster.
 * Vegetation, water, shadow, and bare earth are ground. Strong interior edges
 * are not used as global barriers — those punched holes in real rooftops.
 */
export function segmentSatellite(imageData, params) {
  const { width, height, data } = imageData;
  const luma = toLuma(imageData);
  const { mean, std } = localMeanStd(luma, width, height, 7);
  const coarseR = Math.max(16, Math.round(Math.min(width, height) / 24));
  const { mean: coarseMean } = localMeanStd(luma, width, height, coarseR);
  const mag = sobelMagnitude(luma, width, height);
  const magSamples = [];
  for (let i = 0; i < mag.length; i += 19) magSamples.push(mag[i]);
  const magThresh = percentile(magSamples, 0.8 - params.sensitivity * 0.05);

  const veg = new Uint8Array(width * height);
  const water = new Uint8Array(width * height);
  const shadow = new Uint8Array(width * height);
  const ground = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsv = rgbToHsv(r, g, b);
    const isVeg = isVegetation(r, g, b, hsv);
    const isW = isWater(r, g, b, hsv);
    const isSh = isDeepShadow(hsv, params.sensitivity);
    const isEarth = isBareEarth(r, g, b, hsv);
    const darkRidge = mag[p] > magThresh && luma[p] < coarseMean[p] * 0.9 && hsv.v < 0.55;
    veg[p] = isVeg ? 1 : 0;
    water[p] = isW ? 1 : 0;
    shadow[p] = isSh ? 1 : 0;
    ground[p] = isVeg || isW || isSh || isEarth || darkRidge ? 1 : 0;
  }

  const sealedGround = morphClose(ground, width, height, 1);
  let plateaus = new Uint8Array(width * height);
  for (let i = 0; i < plateaus.length; i++) plateaus[i] = sealedGround[i] ? 0 : 1;
  plateaus = morphClose(plateaus, width, height, 1);
  plateaus = morphOpen(plateaus, width, height, 1);

  const minArea = Math.max(24, params.minArea);
  const imgArea = width * height;
  const split = splitOversized(plateaus, width, height, minArea, imgArea);
  plateaus = split.plateaus;
  const { components, labels } = split;

  const kept = [];
  for (const c of components) {
    const col = regionColorStats(imageData, c, labels);
    const hsv = rgbToHsv(col.r, col.g, col.b);
    const interiorStd = meanInComponent(std, width, c, labels);
    const interiorMag = meanInComponent(mag, width, c, labels);
    if (rejectComponent(c, col, hsv, interiorStd, interiorMag, imgArea, width, height)) continue;
    kept.push(c);
  }

  const buildings = kept.map((c, idx) => {
    const b = toBuilding(imageData, luma, shadow, mean, width, height, c, params);
    b.id = idx + 1;
    return b;
  });

  const mask = new Uint8Array(width * height);
  for (const b of buildings) {
    const seedX = Math.max(0, Math.min(width - 1, Math.round(b.centroid.x)));
    const seedY = Math.max(0, Math.min(height - 1, Math.round(b.centroid.y)));
    mask[seedY * width + seedX] = 1;
    for (const p of b.polygon) {
      const x = Math.max(0, Math.min(width - 1, Math.round(p.x)));
      const y = Math.max(0, Math.min(height - 1, Math.round(p.y)));
      mask[y * width + x] = 1;
    }
  }

  const lights = extractActivityLights(imageData, veg, water, sealedGround, width, height);
  return { buildings, mask: plateaus, veg, water, shadow, lights, luma, width, height };
}

export function inferSourceType(imageData) {
  const { data } = imageData;
  let sat = 0;
  let luma = 0;
  let bright = 0;
  let n = 0;
  const step = Math.max(4, Math.floor(data.length / 4 / 2500) * 4);
  for (let i = 0; i < data.length; i += step) {
    const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    sat += hsv.s;
    luma += hsv.v;
    if (hsv.v > 0.82 && hsv.s < 0.12) bright++;
    n++;
  }
  n = Math.max(1, n);
  if (luma / n > 0.7 && sat / n < 0.14 && bright / n > 0.35) return "blueprint";
  return "satellite";
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
      const inside = x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
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
