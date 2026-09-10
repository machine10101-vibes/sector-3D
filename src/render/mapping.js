/** Image pixel space ↔ world XZ ↔ texture UVs. Shared by ground and volumes so they stay locked. */

export function imageToWorld(x, y, width, height, metersPerPixel) {
  const worldW = width * metersPerPixel;
  const worldD = height * metersPerPixel;
  return {
    x: x * metersPerPixel - worldW / 2,
    z: y * metersPerPixel - worldD / 2,
    worldW,
    worldD,
  };
}

export function imageToUv(x, y, width, height) {
  return {
    u: x / Math.max(1, width),
    v: 1 - y / Math.max(1, height),
  };
}

export function worldSpan(width, height, metersPerPixel) {
  return {
    worldW: width * metersPerPixel,
    worldD: height * metersPerPixel,
    span: Math.max(width, height) * metersPerPixel,
  };
}
