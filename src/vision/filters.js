/** Raster helpers and classical image filters used by reconstruction. */

export function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return { canvas, ctx };
}

export function drawImageContain(img, maxEdge = 1280) {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(2, Math.round(img.width * scale));
  const height = Math.max(2, Math.round(img.height * scale));
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { canvas, ctx, imageData, width, height, scale };
}

export function toLuma(imageData) {
  const { data, width, height } = imageData;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return luma;
}

export function integralAndSquare(src, width, height) {
  const integ = new Float64Array((width + 1) * (height + 1));
  const sq = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y++) {
    let row = 0;
    let rowSq = 0;
    for (let x = 1; x <= width; x++) {
      const v = src[(y - 1) * width + (x - 1)];
      row += v;
      rowSq += v * v;
      const idx = y * stride + x;
      integ[idx] = integ[idx - stride] + row;
      sq[idx] = sq[idx - stride] + rowSq;
    }
  }
  return { integ, sq, stride };
}

export function rectSum(integ, stride, x0, y0, x1, y1) {
  return (
    integ[y1 * stride + x1] -
    integ[y0 * stride + x1] -
    integ[y1 * stride + x0] +
    integ[y0 * stride + x0]
  );
}

export function localMeanStd(src, width, height, radius = 6) {
  const { integ, sq, stride } = integralAndSquare(src, width, height);
  const mean = new Float32Array(width * height);
  const std = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const n = (x1 - x0) * (y1 - y0) || 1;
      const s = rectSum(integ, stride, x0, y0, x1, y1);
      const s2 = rectSum(sq, stride, x0, y0, x1, y1);
      const m = s / n;
      mean[y * width + x] = m;
      std[y * width + x] = Math.sqrt(Math.max(0, s2 / n - m * m));
    }
  }
  return { mean, std };
}

export function sobelMagnitude(luma, width, height) {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -luma[i - width - 1] +
        luma[i - width + 1] -
        2 * luma[i - 1] +
        2 * luma[i + 1] -
        luma[i + width - 1] +
        luma[i + width + 1];
      const gy =
        -luma[i - width - 1] -
        2 * luma[i - width] -
        luma[i - width + 1] +
        luma[i + width - 1] +
        2 * luma[i + width] +
        luma[i + width + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

export function dilate(mask, width, height, radius = 1) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

export function erode(mask, width, height, radius = 1) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 1;
      for (let dy = -radius; dy <= radius && on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          on = 0;
          break;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

export function morphOpen(mask, width, height, radius = 1) {
  return dilate(erode(mask, width, height, radius), width, height, radius);
}

export function morphClose(mask, width, height, radius = 1) {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

export function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function samplePatch(imageData, cx, cy, radius = 3) {
  const { data, width, height } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx) - radius);
  const x1 = Math.min(width - 1, Math.floor(cx) + radius);
  const y0 = Math.max(0, Math.floor(cy) - radius);
  const y1 = Math.min(height - 1, Math.floor(cy) + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  n = Math.max(n, 1);
  return { r: r / n, g: g / n, b: b / n };
}
