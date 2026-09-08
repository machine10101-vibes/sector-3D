import { createCanvas } from "../vision/filters.js";

function rand(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fillNoise(ctx, w, h, rng, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 40;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Synthetic nadir city whose footprints are known — used to prove reconstruction fidelity.
 */
export function generateHarborDistrict() {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size, size);
  const rng = rand(0x5ec70d);

  ctx.fillStyle = "#2a3a28";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(${20 + rng() * 40},${70 + rng() * 70},${20 + rng() * 30},${0.35 + rng() * 0.4})`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 8 + rng() * 28, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#161614";
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(0, 180);
  ctx.lineTo(size, 180);
  ctx.moveTo(0, 620);
  ctx.lineTo(size, 620);
  ctx.moveTo(240, 0);
  ctx.lineTo(240, size);
  ctx.moveTo(720, 0);
  ctx.lineTo(720, size);
  ctx.stroke();
  ctx.strokeStyle = "#8a867c";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(0, 180);
  ctx.lineTo(size, 180);
  ctx.moveTo(240, 0);
  ctx.lineTo(240, size);
  ctx.stroke();
  ctx.setLineDash([]);

  const blocks = [
    { x: 70, y: 40, w: 130, d: 90, h: 18, roof: "#c9c3b8" },
    { x: 70, y: 230, w: 90, d: 70, h: 12, roof: "#d8d2c4" },
    { x: 175, y: 250, w: 40, d: 110, h: 22, roof: "#b9b3a8" },
    { x: 280, y: 40, w: 70, d: 110, h: 36, roof: "#d0cfc8" },
    { x: 370, y: 30, w: 90, d: 70, h: 48, roof: "#e8e6df" },
    { x: 480, y: 40, w: 55, d: 120, h: 62, roof: "#f2f0ea" },
    { x: 555, y: 50, w: 80, d: 80, h: 44, roof: "#cdc8be" },
    { x: 280, y: 230, w: 160, d: 120, h: 28, roof: "#c2b8a8" },
    { x: 470, y: 220, w: 90, d: 70, h: 16, roof: "#d4cbb8" },
    { x: 580, y: 250, w: 100, d: 140, h: 20, roof: "#bbb4a6" },
    { x: 780, y: 40, w: 180, d: 110, h: 14, roof: "#9aa7a2" },
    { x: 780, y: 230, w: 70, d: 160, h: 40, roof: "#e4e1d8" },
    { x: 870, y: 240, w: 90, d: 80, h: 54, roof: "#f4f2ec" },
    { x: 60, y: 670, w: 140, d: 100, h: 10, roof: "#d5e04a" },
    { x: 70, y: 790, w: 90, d: 70, h: 8, roof: "#c8d63a" },
    { x: 280, y: 670, w: 80, d: 200, h: 32, roof: "#d9d4c8" },
    { x: 390, y: 680, w: 70, d: 90, h: 46, roof: "#eeeae2" },
    { x: 480, y: 670, w: 110, d: 140, h: 24, roof: "#cfc8ba" },
    { x: 620, y: 690, w: 60, d: 180, h: 58, roof: "#f7f4ee" },
    { x: 760, y: 670, w: 190, d: 90, h: 18, roof: "#b7c0bc" },
    { x: 780, y: 790, w: 80, d: 120, h: 34, roof: "#ddd8ce" },
    { x: 880, y: 800, w: 90, d: 70, h: 12, roof: "#d2c9a8" },
  ];

  const sun = { x: 0.55, y: 0.85 };
  for (const b of blocks) {
    const sl = b.h * 0.9;
    ctx.fillStyle = "rgba(8,10,12,0.55)";
    ctx.fillRect(b.x + sl * sun.x, b.y + sl * sun.y, b.w, b.d);
  }
  for (const b of blocks) {
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.d);
    ctx.strokeStyle = "rgba(30,30,30,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.d - 1);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(b.x + 6, b.y + 6, Math.max(8, b.w * 0.18), Math.max(8, b.d * 0.12));
  }

  fillNoise(ctx, size, size, rng, 0.04);

  const groundTruth = blocks.map((b, i) => ({
    id: i + 1,
    polygon: [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.d },
      { x: b.x, y: b.y + b.d },
    ],
    height: b.h,
  }));

  return {
    name: "Harbor District",
    sourceType: "satellite",
    canvas,
    groundTruth,
  };
}

export function generateFloorPlan() {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size, size);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 8;
  ctx.strokeRect(80, 80, 860, 860);

  const rooms = [
    { x: 80, y: 80, w: 300, d: 240 },
    { x: 380, y: 80, w: 260, d: 240 },
    { x: 640, y: 80, w: 300, d: 360 },
    { x: 80, y: 320, w: 300, d: 280 },
    { x: 380, y: 320, w: 260, d: 280 },
    { x: 80, y: 600, w: 560, d: 340 },
    { x: 640, y: 440, w: 300, d: 240 },
    { x: 640, y: 680, w: 140, d: 260 },
    { x: 780, y: 680, w: 160, d: 260 },
  ];

  ctx.lineWidth = 7;
  for (const r of rooms) ctx.strokeRect(r.x, r.y, r.w, r.d);

  ctx.fillStyle = "#111";
  ctx.fillRect(210, 76, 22, 12);
  ctx.fillRect(500, 76, 22, 12);

  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.strokeRect(40, 40, 940, 940);
  ctx.setLineDash([]);

  const groundTruth = rooms.map((r, i) => ({
    id: i + 1,
    polygon: [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.d },
      { x: r.x, y: r.y + r.d },
    ],
    height: 14,
  }));

  return {
    name: "Civic Floor Plan",
    sourceType: "blueprint",
    canvas,
    groundTruth,
  };
}

export function canvasToImage(canvas) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL("image/png");
  });
}
