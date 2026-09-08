/** Shared geometry helpers for footprint polygons. */

export function polygonArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return area / 2;
}

export function polygonCentroid(points) {
  const area = polygonArea(points);
  if (Math.abs(area) < 1e-8) {
    let x = 0;
    let y = 0;
    for (const p of points) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(points.length, 1);
    return { x: x / n, y: y / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const cross = points[j].x * points[i].y - points[i].x * points[j].y;
    cx += (points[j].x + points[i].x) * cross;
    cy += (points[j].y + points[i].y) * cross;
  }
  const f = 1 / (6 * area);
  return { x: cx * f, y: cy * f };
}

export function ensureCCW(points) {
  if (polygonArea(points) < 0) return points.slice().reverse();
  return points.slice();
}

export function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function perpendicularDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / len;
}

export function simplifyRdp(points, epsilon) {
  if (points.length <= 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      index = i;
      maxDist = dist;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyRdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

export function closeRing(points) {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) return points.slice();
  return points.concat([{ x: first.x, y: first.y }]);
}

export function uniqueRing(points) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 0.4) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.4) out.pop();
  }
  return out;
}

/**
 * Snap nearly-axis-aligned edges to 0/90° so city blocks stay rectilinear.
 */
export function orthogonalize(points, angleSnapDeg = 12) {
  if (points.length < 4) return points.slice();
  const snap = (angleSnapDeg * Math.PI) / 180;
  const result = points.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i < result.length; i++) {
    const a = result[i];
    const b = result[(i + 1) % result.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const angle = Math.atan2(dy, dx);
    const abs = Math.abs(angle);
    const dist90 = Math.min(abs, Math.abs(Math.PI - abs), Math.abs(Math.PI / 2 - abs));
    if (dist90 < snap) {
      if (Math.abs(dx) >= Math.abs(dy)) b.y = a.y;
      else b.x = a.x;
    }
  }
  return uniqueRing(result);
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isConvex(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0;
}

function triangleContains(p, a, b, c) {
  const b0 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const b1 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  const b2 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  return (b0 >= 0 && b1 >= 0 && b2 >= 0) || (b0 <= 0 && b1 <= 0 && b2 <= 0);
}

/**
 * Ear-clip a simple polygon into triangles. Returns index triples into `points`.
 */
export function earclip(points) {
  const pts = ensureCCW(uniqueRing(points));
  if (pts.length < 3) return { points: pts, indices: [] };
  if (pts.length === 3) return { points: pts, indices: [0, 1, 2] };

  const verts = pts.map((_, i) => i);
  const indices = [];
  let guard = 0;
  const max = pts.length * pts.length;

  while (verts.length > 3 && guard++ < max) {
    let clipped = false;
    for (let i = 0; i < verts.length; i++) {
      const i0 = verts[(i + verts.length - 1) % verts.length];
      const i1 = verts[i];
      const i2 = verts[(i + 1) % verts.length];
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      if (!isConvex(a, b, c)) continue;
      let ear = true;
      for (let j = 0; j < verts.length; j++) {
        const idx = verts[j];
        if (idx === i0 || idx === i1 || idx === i2) continue;
        if (triangleContains(pts[idx], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      indices.push(i0, i1, i2);
      verts.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (verts.length === 3) indices.push(verts[0], verts[1], verts[2]);
  return { points: pts, indices };
}

export function polygonIoU(a, b) {
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  const minX = Math.floor(Math.min(boxA.minX, boxB.minX));
  const minY = Math.floor(Math.min(boxA.minY, boxB.minY));
  const maxX = Math.ceil(Math.max(boxA.maxX, boxB.maxX));
  const maxY = Math.ceil(Math.max(boxA.maxY, boxB.maxY));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const step = Math.max(1, Math.round(Math.max(w, h) / 96));
  let inter = 0;
  let union = 0;
  for (let y = minY; y < maxY; y += step) {
    for (let x = minX; x < maxX; x += step) {
      const inA = pointInPolygon(x + 0.5, y + 0.5, a);
      const inB = pointInPolygon(x + 0.5, y + 0.5, b);
      if (inA || inB) union++;
      if (inA && inB) inter++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

export function meanIoU(predicted, truth) {
  if (!truth?.length || !predicted?.length) return 0;
  const used = new Set();
  let sum = 0;
  let n = 0;
  for (const gt of truth) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < predicted.length; i++) {
      if (used.has(i)) continue;
      const iou = polygonIoU(predicted[i].polygon, gt.polygon);
      if (iou > best) {
        best = iou;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && best > 0.15) used.add(bestIdx);
    sum += best;
    n++;
  }
  return n ? sum / n : 0;
}
