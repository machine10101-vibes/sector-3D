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

function labelAt(labels, width, height, x, y, id) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return labels[y * width + x] === id ? 1 : 0;
}

export function extractComponentsFast(mask, width, height, minArea, connectivity = 8) {
  const labels = new Int32Array(width * height);
  const components = [];
  let id = 0;
  const four = connectivity === 4;
  const deltas = four
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
    : [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ];

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
        for (const [dx, dy] of deltas) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (labels[ni] || !mask[ni]) continue;
          labels[ni] = id;
          stack.push(ni);
        }
      }
      if (area < minArea) continue;
      const contour = traceBoundaryLabel(labels, width, height, startX, startY, id);
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

function traceBoundaryLabel(labels, width, height, startX, startY, id) {
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
      if (labelAt(labels, width, height, nx, ny, id)) {
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
