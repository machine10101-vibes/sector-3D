import { morphClose, toLuma } from "./filters.js";
import { extractComponentsFast } from "./contours.js";
import { ensureCCW, orthogonalize, polygonArea, simplifyRdp, uniqueRing } from "./geometry.js";

function adaptiveThreshold(luma, width, height, sensitivity) {
  const { integ, stride } = (() => {
    const integ = new Float64Array((width + 1) * (height + 1));
    const stride = width + 1;
    for (let y = 1; y <= height; y++) {
      let row = 0;
      for (let x = 1; x <= width; x++) {
        row += luma[(y - 1) * width + (x - 1)];
        integ[y * stride + x] = integ[(y - 1) * stride + x] + row;
      }
    }
    return { integ, stride };
  })();
  const radius = Math.max(7, Math.round(Math.min(width, height) / 40));
  const mask = new Uint8Array(width * height);
  const bias = 8 + (1 - sensitivity) * 18;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const n = (x1 - x0) * (y1 - y0) || 1;
      const sum =
        integ[y1 * stride + x1] -
        integ[y0 * stride + x1] -
        integ[y1 * stride + x0] +
        integ[y0 * stride + x0];
      const mean = sum / n;
      mask[y * width + x] = luma[y * width + x] < mean - bias ? 1 : 0;
    }
  }
  return mask;
}

function invert(mask) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

function floodFromBorder(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (seen[i] || !mask[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }
  const rooms = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && !seen[i]) rooms[i] = 1;
  }
  return rooms;
}

/**
 * Extract enclosed rooms / masses from an architectural drawing.
 */
export function segmentBlueprint(imageData, params) {
  const { width, height } = imageData;
  const luma = toLuma(imageData);
  let walls = adaptiveThreshold(luma, width, height, params.sensitivity);
  walls = morphClose(walls, width, height, 1);
  const open = invert(walls);
  const rooms = floodFromBorder(open, width, height);
  const minArea = Math.max(40, params.minArea);
  const { components } = extractComponentsFast(rooms, width, height, minArea);

  const buildings = components
    .filter((c) => c.solidity > 0.18 && c.aspect < 14)
    .map((c) => {
      let ring = uniqueRing(c.contour);
      ring = simplifyRdp(ring, Math.max(1.2, params.simplify));
      ring = orthogonalize(ring, 10);
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
      const height = Math.max(3, params.wallHeight * params.heightScale);
      return {
        id: c.id,
        polygon: ring,
        height,
        area,
        centroid: c.centroid,
        roofColor: { r: 20, g: 40, b: 48 },
        className: area > 14000 ? "highrise" : area > 5000 ? "mid" : "lowrise",
        shadowLength: 0,
      };
    });

  const lights = buildings.map((b) => ({ x: b.centroid.x, y: b.centroid.y }));
  return { buildings, mask: rooms, walls, lights, luma, width, height };
}
