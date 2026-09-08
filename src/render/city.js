import * as THREE from "three";
import { earclip } from "../vision/geometry.js";

const CYAN = new THREE.Color("#00e5ff");
const LIME = new THREE.Color("#d4ff00");
const AMBER = new THREE.Color("#ffb300");

function imageToWorld(x, y, width, height, metersPerPixel) {
  const worldW = width * metersPerPixel;
  const worldD = height * metersPerPixel;
  return {
    x: x * metersPerPixel - worldW / 2,
    z: y * metersPerPixel - worldD / 2,
    worldW,
    worldD,
  };
}

function buildingColor(building) {
  return building.className === "lowrise" ? LIME : CYAN;
}

function addTriangulatedBuilding(group, building, width, height, metersPerPixel, style) {
  const { points, indices } = earclip(building.polygon);
  if (indices.length < 3 || points.length < 3) return;

  const roofY = building.height * metersPerPixel * 1.15;
  const positions = [];
  const colors = [];
  const uvs = [];
  const linePos = [];
  const accent = buildingColor(building);
  const roof = new THREE.Color(
    building.roofColor.r / 255,
    building.roofColor.g / 255,
    building.roofColor.b / 255,
  );
  const face = style === "hybrid" ? roof.lerp(accent, 0.22) : accent.clone().multiplyScalar(0.09);

  const toV = (p, y) => {
    const w = imageToWorld(p.x, p.y, width, height, metersPerPixel);
    return new THREE.Vector3(w.x, y, w.z);
  };

  const pushTri = (a, b, c, col) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b);
    uvs.push(0, 0, 1, 0, 0, 1);
    linePos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, a.x, a.y, a.z);
  };

  for (let i = 0; i < indices.length; i += 3) {
    const a = toV(points[indices[i]], roofY);
    const b = toV(points[indices[i + 1]], roofY);
    const c = toV(points[indices[i + 2]], roofY);
    pushTri(a, b, c, face);
  }

  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const b0 = toV(p0, 0);
    const b1 = toV(p1, 0);
    const t0 = toV(p0, roofY);
    const t1 = toV(p1, roofY);
    pushTri(b0, b1, t1, face);
    pushTri(b0, t1, t0, face);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const meshMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: style === "hologram" ? 0.22 : 0.62,
    side: THREE.DoubleSide,
    depthWrite: style !== "hologram",
  });
  const mesh = new THREE.Mesh(geom, meshMat);
  mesh.userData.buildingId = building.id;
  group.add(mesh);

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.95,
  });
  group.add(new THREE.LineSegments(lineGeom, lineMat));
}

export function buildCityGroup(reconstruction, params, style) {
  const group = new THREE.Group();
  group.name = "city";
  const { width, height, buildings, lights } = reconstruction;
  const mpp = params.metersPerPixel;

  for (const b of buildings) {
    addTriangulatedBuilding(group, b, width, height, mpp, style);
  }

  if (params.showLights !== false) {
    const pts = [];
    for (const l of lights) {
      const w = imageToWorld(l.x, l.y, width, height, mpp);
      pts.push(w.x, 0.6, w.z);
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.PointsMaterial({
        color: AMBER,
        size: 2.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
      });
      group.add(new THREE.Points(g, m));
    }
  }

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
      opacity: params.showGroundTexture ? (style === "hybrid" ? 0.72 : 0.38) : 0.08,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  group.add(ground);

  if (params.showGrid) {
    const grid = new THREE.GridHelper(Math.max(worldW, worldD), 32, 0x12303a, 0x0d1c24);
    grid.position.y = 0.02;
    group.add(grid);
  }

  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(worldW, worldD)),
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35 }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  group.add(rim);

  return group;
}

export { CYAN, LIME, AMBER, imageToWorld };
