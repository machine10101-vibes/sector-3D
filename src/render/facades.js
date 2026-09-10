import * as THREE from "three";

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const FLOORS = { highrise: 16, mid: 8, lowrise: 3 };
const BAYS = { highrise: 8, mid: 6, lowrise: 5 };
const BAY_M = { highrise: 3.55, mid: 3.9, lowrise: 4.5 };
const FLOOR_M = 3.2;

function rgb(c) {
  return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

function shade(color, amount) {
  const c = color.clone();
  c.offsetHSL(0, 0, amount);
  return c;
}

function quantizeColor(c) {
  const q = (v) => Math.round(v * 6) / 6;
  return `${q(c.r)}:${q(c.g)}:${q(c.b)}`;
}

function paintMaps(kind, wallColor, seed) {
  const floors = FLOORS[kind] || FLOORS.lowrise;
  const bays = BAYS[kind] || 5;
  const w = 256;
  const h = 512;
  const color = document.createElement("canvas");
  const rough = document.createElement("canvas");
  const metal = document.createElement("canvas");
  color.width = rough.width = metal.width = w;
  color.height = rough.height = metal.height = h;
  const ctx = color.getContext("2d");
  const rtx = rough.getContext("2d");
  const mtx = metal.getContext("2d");

  const masonry = wallColor.clone();
  ctx.fillStyle = rgb(masonry);
  ctx.fillRect(0, 0, w, h);
  rtx.fillStyle = "#d0d0d0";
  rtx.fillRect(0, 0, w, h);
  mtx.fillStyle = "#000000";
  mtx.fillRect(0, 0, w, h);

  // Weathering: dirtier at street level (canvas bottom = UV v=0 with flipY).
  const dirt = ctx.createLinearGradient(0, 0, 0, h);
  dirt.addColorStop(0, "rgba(255,255,255,0)");
  dirt.addColorStop(0.72, "rgba(0,0,0,0)");
  dirt.addColorStop(1, "rgba(20,16,12,0.28)");
  ctx.fillStyle = dirt;
  ctx.fillRect(0, 0, w, h);

  if (kind === "lowrise") {
    const brickH = 6;
    const brickW = 14;
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    rtx.fillStyle = "#c8c8c8";
    for (let y = 0; y < h; y += brickH) {
      ctx.fillRect(0, y, w, 1);
      rtx.fillRect(0, y, w, 1);
      const shift = ((y / brickH) | 0) % 2 ? brickW / 2 : 0;
      for (let x = -brickW; x < w; x += brickW) ctx.fillRect(x + shift, y, 1, brickH);
    }
    for (let i = 0; i < 180; i++) {
      const n = hash(seed * 19 + i);
      ctx.fillStyle = `rgba(255,255,255,${0.03 + n * 0.04})`;
      ctx.fillRect((n * w) | 0, (hash(i + 3) * h) | 0, 2, 2);
    }
  } else {
    for (let i = 0; i < 90; i++) {
      const n = hash(seed * 11 + i * 7);
      ctx.fillStyle = `rgba(0,0,0,${0.02 + n * 0.05})`;
      ctx.fillRect((n * w) | 0, (hash(i + 9) * h) | 0, 6 + n * 10, 3);
    }
  }

  const floorH = h / floors;
  const bayW = w / bays;
  const curtain = kind === "highrise";
  const ribbon = kind === "mid";
  const windowW = curtain ? 0.74 : ribbon ? 0.42 : 0.32;
  const windowH = curtain ? 0.68 : ribbon ? 0.44 : 0.38;
  const litChance = 0.985;
  const glassCool = 0.18 + hash(seed) * 0.1;

  for (let f = 0; f < floors; f++) {
    const ground = f === 0;
    const fy = h - (f + 1) * floorH;
    const isStore = ground && kind !== "highrise";
    const sill = ground && isStore ? floorH * 0.08 : floorH * (curtain ? 0.12 : 0.22);
    const hh = floorH * (isStore ? 0.82 : windowH);
    const ww = bayW * (isStore ? 0.72 : windowW);
    const frame = Math.max(1, Math.round(bayW * (curtain ? 0.04 : 0.07)));

    if (!curtain) {
      ctx.fillStyle = rgb(shade(masonry, -0.08));
      ctx.fillRect(0, fy + floorH - 2, w, 2);
      rtx.fillStyle = "#b8b8b8";
      rtx.fillRect(0, fy + floorH - 2, w, 2);
    }

    for (let b = 0; b < bays; b++) {
      const cx = b * bayW + (bayW - ww) / 2;
      const cy = fy + sill;
      if (ww < 2 || hh < 2) continue;
      const door = isStore && b === (Math.floor(bays * (0.3 + hash(seed) * 0.4)) % bays);
      const lit = hash(f * 17 + b * 31 + seed * 4 + kind.length) > litChance;
      if (door) {
        ctx.fillStyle = rgb(shade(masonry, -0.22));
        ctx.fillRect(cx, cy, ww, hh);
        ctx.fillStyle = "#1c2228";
        ctx.fillRect(cx + ww * 0.15, cy + hh * 0.08, ww * 0.7, hh * 0.86);
        rtx.fillStyle = "#2a2a2a";
        rtx.fillRect(cx + ww * 0.15, cy + hh * 0.08, ww * 0.7, hh * 0.86);
        mtx.fillStyle = "#3a3a3a";
        mtx.fillRect(cx + ww * 0.15, cy + hh * 0.08, ww * 0.7, hh * 0.86);
      } else if (lit) {
        ctx.fillStyle = "#e8c56a";
        ctx.fillRect(cx, cy, ww, hh);
        rtx.fillStyle = "#404040";
        rtx.fillRect(cx, cy, ww, hh);
      } else {
        const g = 38 + glassCool * 90;
        ctx.fillStyle = `rgb(${Math.round(g * 0.72)},${Math.round(g * 0.9)},${Math.round(g * 1.05 + 18)})`;
        ctx.fillRect(cx, cy, ww, hh);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(cx, cy, ww, Math.max(1, hh * 0.2));
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(cx + ww * 0.45, cy, ww * 0.55, hh);
        rtx.fillStyle = "#1c1c1c";
        rtx.fillRect(cx, cy, ww, hh);
        mtx.fillStyle = "#5a5a5a";
        mtx.fillRect(cx, cy, ww, hh);
      }
      ctx.fillStyle = rgb(shade(masonry, 0.08));
      ctx.fillRect(cx - frame, cy - 1, ww + frame * 2, 2);
      ctx.fillRect(cx - frame, cy + hh - 1, ww + frame * 2, 2);
      ctx.fillRect(cx - 1, cy, 2, hh);
      ctx.fillRect(cx + ww - 1, cy, 2, hh);
    }
  }

  // Cornice at roof (canvas top).
  ctx.fillStyle = rgb(shade(masonry, -0.12));
  ctx.fillRect(0, 0, w, Math.max(4, h * 0.018));
  rtx.fillStyle = "#aaa";
  rtx.fillRect(0, 0, w, 4);

  // Stone water table at street.
  ctx.fillStyle = rgb(shade(masonry, -0.18));
  ctx.fillRect(0, h - Math.max(8, h * 0.045), w, Math.max(8, h * 0.045));
  rtx.fillStyle = "#bfbfbf";
  rtx.fillRect(0, h - 10, w, 10);

  const map = new THREE.CanvasTexture(color);
  const roughnessMap = new THREE.CanvasTexture(rough);
  const metalnessMap = new THREE.CanvasTexture(metal);
  for (const tex of [map, roughnessMap, metalnessMap]) {
    tex.colorSpace = tex === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    tex.userData.shared = true;
  }
  return { map, roughnessMap, metalnessMap };
}

const cache = {};

export function facadeMaps(kind, wallColor, seed = 0) {
  const key = `${FLOORS[kind] ? kind : "lowrise"}:${quantizeColor(wallColor)}:${seed % 7}`;
  if (!cache[key]) cache[key] = paintMaps(FLOORS[kind] ? kind : "lowrise", wallColor, seed);
  return cache[key];
}

export function facadeTexture(kind, wallColor = new THREE.Color("#8a8680"), seed = 0) {
  return facadeMaps(kind, wallColor, seed).map;
}

export function wallColorFromRoof(roofCol) {
  const c = roofCol.clone();
  c.offsetHSL(0.01, -0.1, -0.05);
  c.lerp(new THREE.Color("#c4b7a6"), 0.38);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l < 0.34) c.setHSL(hsl.h, Math.min(0.18, hsl.s), 0.4);
  if (hsl.l > 0.72) c.setHSL(hsl.h, hsl.s, 0.58);
  return c;
}

export function facadeRepeats(edgeLength, roofY, kind) {
  const floors = FLOORS[kind] || FLOORS.lowrise;
  const bays = BAYS[kind] || 5;
  const bayM = BAY_M[kind] || 4.5;
  return {
    u: Math.max(0.2, edgeLength / (bayM * bays)),
    v: Math.max(0.2, roofY / (floors * FLOOR_M)),
  };
}
