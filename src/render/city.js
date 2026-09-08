import * as THREE from "three";
import { earclip } from "../vision/geometry.js";

export const CYAN = new THREE.Color("#00e5ff");
export const LIME = new THREE.Color("#d4ff00");
export const AMBER = new THREE.Color("#ffb300");

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

function accentFor(building) {
  return building.className === "lowrise" ? LIME : CYAN;
}

function glowSprite(color, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function addBuilding(group, building, width, height, metersPerPixel, style) {
  const { points, indices } = earclip(building.polygon);
  if (indices.length < 3 || points.length < 3) return null;

  const roofY = Math.max(2.4, building.height * metersPerPixel * 1.45);
  const accent = accentFor(building);
  const roofCol = new THREE.Color(
    building.roofColor.r / 255,
    building.roofColor.g / 255,
    building.roofColor.b / 255,
  );
  const face =
    style === "hybrid" ? roofCol.lerp(accent, 0.18) : accent.clone().multiplyScalar(style === "hologram" ? 0.07 : 0.12);

  const toV = (p, y) => {
    const w = imageToWorld(p.x, p.y, width, height, metersPerPixel);
    return new THREE.Vector3(w.x, y, w.z);
  };

  const positions = [];
  const colors = [];
  const linePos = [];

  const pushTri = (a, b, c, col) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b);
    linePos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, a.x, a.y, a.z);
  };

  for (let i = 0; i < indices.length; i += 3) {
    pushTri(toV(points[indices[i]], roofY), toV(points[indices[i + 1]], roofY), toV(points[indices[i + 2]], roofY), face);
  }

  const n = points.length;
  const floors = Math.max(2, Math.round(roofY / 3.2));
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const b0 = toV(p0, 0);
    const b1 = toV(p1, 0);
    const t0 = toV(p0, roofY);
    const t1 = toV(p1, roofY);
    pushTri(b0, b1, t1, face);
    pushTri(b0, t1, t0, face);
    for (let f = 1; f < floors; f++) {
      const y = (roofY * f) / floors;
      const a = toV(p0, y);
      const b = toV(p1, y);
      linePos.push(a.x, y, a.z, b.x, y, b.z);
    }
    const midCount = Math.max(1, Math.round(b0.distanceTo(b1) / 8));
    for (let m = 1; m < midCount; m++) {
      const t = m / midCount;
      const x0 = b0.x + (b1.x - b0.x) * t;
      const z0 = b0.z + (b1.z - b0.z) * t;
      linePos.push(x0, 0, z0, x0, roofY, z0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: style === "hologram" ? 0.28 : 0.78,
      side: THREE.DoubleSide,
      depthWrite: style !== "hologram",
    }),
  );
  mesh.userData = {
    buildingId: building.id,
    building,
    accent: accent.getHex(),
  };
  group.add(mesh);

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  group.add(
    new THREE.LineSegments(
      lineGeom,
      new THREE.LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.92,
      }),
    ),
  );
  return mesh;
}

export function buildCityGroup(reconstruction, params, style) {
  const group = new THREE.Group();
  group.name = "city";
  const { width, height, buildings, lights } = reconstruction;
  const mpp = params.metersPerPixel;
  const pickables = [];

  for (const b of buildings) {
    const mesh = addBuilding(group, b, width, height, mpp, style);
    if (mesh) pickables.push(mesh);
  }

  if (params.showLights !== false && lights?.length) {
    const tex = glowSprite("rgba(255,179,0,1)");
    const positions = [];
    for (const l of lights) {
      const w = imageToWorld(l.x, l.y, width, height, mpp);
      positions.push(w.x, 0.9, w.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    group.add(
      new THREE.Points(
        g,
        new THREE.PointsMaterial({
          map: tex,
          color: AMBER,
          size: 4.8,
          sizeAttenuation: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
  }

  group.userData.pickables = pickables;
  return group;
}

export function buildGround(reconstruction, params, style = "hologram") {
  const group = new THREE.Group();
  const mpp = params.metersPerPixel;
  const worldW = reconstruction.width * mpp;
  const worldD = reconstruction.height * mpp;

  const tex = new THREE.CanvasTexture(reconstruction.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldD),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: params.showGroundTexture ? (style === "hybrid" ? 0.78 : 0.32) : 0.06,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const circuit = new THREE.GridHelper(Math.max(worldW, worldD), 48, 0x14505c, 0x0b1c24);
  circuit.position.y = 0.04;
  circuit.visible = params.showGrid !== false;
  group.add(circuit);

  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(worldW, worldD)),
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45 }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.05;
  group.add(rim);

  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldD),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scan.rotation.x = -Math.PI / 2;
  scan.name = "scan";
  scan.userData.maxY = Math.max(18, ...reconstruction.buildings.map((b) => b.height * mpp * 1.45));
  group.add(scan);

  return group;
}

export function pickBuildingAt(pickables, camera, ndc) {
  if (!pickables?.length) return null;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  return hits[0]?.object || null;
}

