import * as THREE from "three";

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const FLOORS = { highrise: 18, mid: 9, lowrise: 4 };
const BAYS = { highrise: 10, mid: 8, lowrise: 6 };

function paintFacade(kind) {
  const floors = FLOORS[kind] || FLOORS.lowrise;
  const bays = BAYS[kind] || 6;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d8d4cc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const floorH = canvas.height / floors;
  const bayW = canvas.width / bays;
  const mullion = Math.max(2, Math.round(bayW * 0.12));
  const sill = Math.max(3, Math.round(floorH * 0.18));
  const litChance = kind === "highrise" ? 0.78 : kind === "mid" ? 0.9 : 0.97;

  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const x = b * bayW + mullion;
      const y = f * floorH + sill;
      const ww = bayW - mullion * 2;
      const hh = floorH - sill * 1.45;
      if (ww < 2 || hh < 2) continue;
      const lit = hash(f * 17 + b * 31 + kind.length * 4) > litChance;
      if (lit) ctx.fillStyle = "#f0d089";
      else {
        const cool = 0.22 + hash(f * 9 + b) * 0.12;
        ctx.fillStyle = `rgb(${Math.round(70 * cool + 40)},${Math.round(90 * cool + 52)},${Math.round(110 * cool + 62)})`;
      }
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, ww, Math.max(1, hh * 0.18));
    }
    ctx.fillStyle = "rgba(40,44,48,0.22)";
    ctx.fillRect(0, (f + 1) * floorH - 2, canvas.width, 2);
  }
  ctx.fillStyle = "rgba(30,32,36,0.18)";
  for (let b = 0; b < bays; b++) ctx.fillRect(Math.round(b * bayW), 0, 2, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  return tex;
}

const cache = {};

export function facadeTexture(kind) {
  const key = FLOORS[kind] ? kind : "lowrise";
  if (!cache[key]) cache[key] = paintFacade(key);
  return cache[key];
}

export function wallColorFromRoof(roofCol) {
  const c = roofCol.clone();
  c.offsetHSL(0.02, -0.12, -0.16);
  c.lerp(new THREE.Color("#8a8680"), 0.28);
  return c;
}

export function facadeRepeats(edgeLength, roofY, kind) {
  const floors = FLOORS[kind] || FLOORS.lowrise;
  const bays = BAYS[kind] || 6;
  return {
    u: Math.max(0.35, edgeLength / (bays * 3.4)),
    v: Math.max(0.35, roofY / (floors * 3.15)),
  };
}
