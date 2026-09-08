const NEIGH = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function at(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return mask[y * width + x];
}

export function extractComponentsFast(mask, width, height, minArea) {
  const labels = new Int32Array(width * height);
  const components = [];
  let id = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || labels[start]) continue;
      id++;
      const stack = [start];
      labels[start] = id;
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let cx = 0;
      let cy = 0;
      let startX = x;
      let startY = y;
      while (stack.length) {
        const i = stack.pop();
        const px = i % width;
        const py = (i / width) | 0;
        area++;
        cx += px;
        cy += py;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        if (py < startY || (py === startY && px < startX)) {
          startX = px;
          startY = py;
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (labels[ni] || !mask[ni]) continue;
            labels[ni] = id;
            stack.push(ni);
          }
        }
      }
      if (area < minArea) continue;
      const contour = traceBoundary(mask, width, height, startX, startY);
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      components.push({
        id,
        contour,
        area,
        centroid: { x: cx / area + 0.5, y: cy / area + 0.5 },
        bounds: { minX, minY, maxX, maxY, width: bw, height: bh },
        aspect: Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)),
        solidity: area / Math.max(1, bw * bh),
      });
    }
  }
  return { labels, components };
}

function traceBoundary(mask, width, height, startX, startY) {
  const points = [];
  let x = startX;
  let y = startY;
  let dir = 4;
  const sx = startX;
  const sy = startY;
  let guard = 0;
  const max = width * height * 8;
  do {
    points.push({ x: x + 0.5, y: y + 0.5 });
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + k) % 8;
      const nx = x + NEIGH[nd][0];
      const ny = y + NEIGH[nd][1];
      if (at(mask, width, height, nx, ny)) {
        x = nx;
        y = ny;
        dir = (nd + 6) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while ((x !== sx || y !== sy) && guard < max);
  return points;
}
