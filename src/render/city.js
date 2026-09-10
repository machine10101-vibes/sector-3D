import * as THREE from "three";
import { earclip, ensureCCW, polygonArea, polygonCentroid } from "../vision/geometry.js";
import { facadeMaps, facadeRepeats, wallColorFromRoof } from "./facades.js";
import { imageToUv, imageToWorld, worldSpan } from "./mapping.js";

export const CYAN = new THREE.Color("#00e5ff");
export const LIME = new THREE.Color("#d4ff00");
export const AMBER = new THREE.Color("#ffb300");

export { imageToWorld };

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

export function sourceTexture(canvas, anisotropy = 8) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.flipY = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function neonLines(style) {
  return style === "hologram" || style === "hybrid";
}

function isLit(style) {
  return style !== "hologram";
}

function insetRing(ring, px) {
  const c = polygonCentroid(ring);
  return ring.map((p) => {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
  });
}

function setUpNormals(geom) {
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr[i * 3 + 1] = 1;
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(arr, 3));
}

function addBuilding(group, building, width, height, metersPerPixel, style, photoTex, shadows) {
  const { points, indices } = earclip(building.polygon);
  if (indices.length < 3 || points.length < 3) return [];

  const roofY = Math.max(2.4, building.height * metersPerPixel * 1.12);
  const accent = accentFor(building);
  const neon = neonLines(style);
  const lit = isLit(style);
  const roofCol = building.roofColor
    ? new THREE.Color(building.roofColor.r / 255, building.roofColor.g / 255, building.roofColor.b / 255)
    : new THREE.Color("#c8c2b6");
  const wallCol = wallColorFromRoof(roofCol);
  const kind = roofY >= 30 ? "highrise" : roofY >= 13 ? "mid" : "lowrise";
  const toV = (p, y) => {
    const w = imageToWorld(p.x, p.y, width, height, metersPerPixel);
    return new THREE.Vector3(w.x, y, w.z);
  };
  const toUV = (p) => {
    const uv = imageToUv(p.x, p.y, width, height);
    return [uv.u, uv.v];
  };

  const insetPx = Math.max(0.55, 0.38 / metersPerPixel);
  const roofRing = insetRing(points, insetPx);
  let roofPts = points;
  let roofIdx = indices;
  try {
    const clipped = earclip(roofRing);
    if (clipped.indices.length >= 3) {
      roofPts = clipped.points;
      roofIdx = clipped.indices;
    }
  } catch {
    roofPts = points;
    roofIdx = indices;
  }

  const sidePos = [];
  const sideUv = [];
  const sideCol = [];
  const roofPos = [];
  const roofUv = [];
  const linePos = [];
  const parapetPos = [];
  const contactPos = [];

  for (let i = 0; i < roofIdx.length; i += 3) {
    const pa = roofPts[roofIdx[i]];
    const pb = roofPts[roofIdx[i + 1]];
    const pc = roofPts[roofIdx[i + 2]];
    const a = toV(pa, roofY);
    const b = toV(pb, roofY);
    const c = toV(pc, roofY);
    roofPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const ua = toUV(pa);
    const ub = toUV(pb);
    const uc = toUV(pc);
    roofUv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    linePos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, a.x, a.y, a.z);
  }

  const parapetH = Math.max(0.4, Math.min(1.15, roofY * 0.055));
  const aoBase = 0.78;
  const aoTop = 1;
  const n = points.length;
  const contactW = Math.max(0.7, Math.min(1.8, roofY * 0.08));
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const q0 = roofRing[i] || p0;
    const q1 = roofRing[(i + 1) % n] || p1;
    const b0 = toV(p0, 0);
    const b1 = toV(p1, 0);
    const t0 = toV(p0, roofY);
    const t1 = toV(p1, roofY);
    const edge = b0.distanceTo(b1);
    const rep = facadeRepeats(edge, roofY, kind);
    const u0 = 0;
    const u1 = rep.u;
    const v0 = 0;
    const v1 = rep.v;
    const pushWall = (a, b, c, ua, va, ub, vb, uc, vc, sa, sb, sc) => {
      sidePos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      sideUv.push(ua, va, ub, vb, uc, vc);
      sideCol.push(sa, sa, sa, sb, sb, sb, sc, sc, sc);
    };
    // Outward-facing winding for a CCW footprint viewed from +Y.
    pushWall(b0, t0, t1, u0, v0, u0, v1, u1, v1, aoBase, aoTop, aoTop);
    pushWall(b0, t1, b1, u0, v0, u1, v1, u1, v0, aoBase, aoTop, aoBase);

    const d0 = toV(p0, roofY + parapetH);
    const d1 = toV(p1, roofY + parapetH);
    const e0 = toV(q0, roofY + parapetH);
    const e1 = toV(q1, roofY + parapetH);
    const i0 = toV(q0, roofY);
    const i1 = toV(q1, roofY);
    const pushP = (a, b, c) => parapetPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pushP(t0, d0, d1);
    pushP(t0, d1, t1);
    pushP(d0, e0, e1);
    pushP(d0, e1, d1);
    pushP(e0, i0, i1);
    pushP(e0, i1, e1);

    const dx = b1.x - b0.x;
    const dz = b1.z - b0.z;
    const elen = Math.hypot(dx, dz) || 1;
    const nx = dz / elen;
    const nz = -dx / elen;
    const o0 = new THREE.Vector3(b0.x + nx * contactW, 0.025, b0.z + nz * contactW);
    const o1 = new THREE.Vector3(b1.x + nx * contactW, 0.025, b1.z + nz * contactW);
    const c0 = new THREE.Vector3(b0.x, 0.025, b0.z);
    const c1 = new THREE.Vector3(b1.x, 0.025, b1.z);
    contactPos.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, o1.x, o1.y, o1.z);
    contactPos.push(c0.x, c0.y, c0.z, o1.x, o1.y, o1.z, o0.x, o0.y, o0.z);

    linePos.push(b0.x, 0, b0.z, t0.x, roofY, t0.z);
    linePos.push(b0.x, 0, b0.z, b1.x, 0, b1.z);
  }

  const userData = {
    buildingId: building.id,
    building,
    accent: accent.getHex(),
  };
  const pick = [];

  const maps = facadeMaps(kind, wallCol, building.id || 0);
  const sideGeom = new THREE.BufferGeometry();
  sideGeom.setAttribute("position", new THREE.Float32BufferAttribute(sidePos, 3));
  sideGeom.setAttribute("uv", new THREE.Float32BufferAttribute(sideUv, 2));
  sideGeom.setAttribute("color", new THREE.Float32BufferAttribute(sideCol, 3));
  sideGeom.computeVertexNormals();
  const sideMat = lit
    ? new THREE.MeshStandardMaterial({
        map: maps.map,
        roughnessMap: maps.roughnessMap,
        metalnessMap: maps.metalnessMap,
        roughness: 1,
        metalness: 0.35,
        vertexColors: true,
        envMapIntensity: 0.85,
        side: THREE.FrontSide,
      })
    : new THREE.MeshBasicMaterial({
        map: maps.map,
        vertexColors: true,
        side: THREE.FrontSide,
      });
  const sideMesh = new THREE.Mesh(sideGeom, sideMat);
  sideMesh.castShadow = !!shadows;
  sideMesh.receiveShadow = !!shadows;
  sideMesh.userData = userData;
  group.add(sideMesh);
  pick.push(sideMesh);

  if (roofPos.length && photoTex) {
    const roofGeom = new THREE.BufferGeometry();
    roofGeom.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
    roofGeom.setAttribute("uv", new THREE.Float32BufferAttribute(roofUv, 2));
    setUpNormals(roofGeom);
    const roofMat = new THREE.MeshBasicMaterial({
      map: photoTex,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.castShadow = !!shadows;
    roofMesh.userData = userData;
    group.add(roofMesh);
    pick.push(roofMesh);
    if (shadows) {
      const roofCatch = new THREE.Mesh(
        roofGeom,
        new THREE.ShadowMaterial({ color: 0x1a1612, opacity: 0.28, depthWrite: false }),
      );
      roofCatch.receiveShadow = true;
      roofCatch.renderOrder = 2;
      roofCatch.userData = userData;
      group.add(roofCatch);
    }
  }

  if (parapetPos.length && lit) {
    const paraGeom = new THREE.BufferGeometry();
    paraGeom.setAttribute("position", new THREE.Float32BufferAttribute(parapetPos, 3));
    paraGeom.computeVertexNormals();
    const para = new THREE.Mesh(
      paraGeom,
      new THREE.MeshStandardMaterial({
        color: wallCol.clone().multiplyScalar(0.82),
        roughness: 0.8,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    para.castShadow = !!shadows;
    para.userData = userData;
    group.add(para);
  }

  if (contactPos.length && lit) {
    const contactGeom = new THREE.BufferGeometry();
    contactGeom.setAttribute("position", new THREE.Float32BufferAttribute(contactPos, 3));
    setUpNormals(contactGeom);
    const contact = new THREE.Mesh(
      contactGeom,
      new THREE.MeshBasicMaterial({
        color: 0x0c0c0a,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    contact.renderOrder = 1;
    contact.userData = userData;
    group.add(contact);
  }

  if (neon || !lit) {
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
    group.add(
      new THREE.LineSegments(
        lineGeom,
        new THREE.LineBasicMaterial({
          color: neon ? accent : 0x11161c,
          transparent: true,
          opacity: neon ? (style === "hologram" ? 0.88 : 0.32) : 0.12,
        }),
      ),
    );
  }

  return pick;
}

export function buildCityGroup(reconstruction, params, style, photoTex, shadows = false) {
  const group = new THREE.Group();
  group.name = "city";
  const { width, height, buildings, lights } = reconstruction;
  const mpp = params.metersPerPixel;
  const pickables = [];
  const tex = photoTex || sourceTexture(reconstruction.canvas);

  for (const b of buildings) {
    const meshes = addBuilding(group, b, width, height, mpp, style, tex, shadows);
    if (meshes?.length) pickables.push(...meshes);
  }

  const showLights = params.showLights !== false && style === "hologram" && lights?.length;
  if (showLights) {
    const sprite = glowSprite("rgba(255,179,0,1)");
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
          map: sprite,
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

function buildPhotoGround(reconstruction, params) {
  const { width, height, buildings } = reconstruction;
  const mpp = params.metersPerPixel;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, height);
  shape.lineTo(0, height);
  shape.closePath();

  for (const b of buildings) {
    if (!b.polygon?.length) continue;
    const ring = ensureCCW(insetRing(b.polygon, 0.45));
    if (Math.abs(polygonArea(ring)) < 8) continue;
    const hole = new THREE.Path();
    const cw = ring.slice().reverse();
    hole.moveTo(cw[0].x, cw[0].y);
    for (let i = 1; i < cw.length; i++) hole.lineTo(cw[i].x, cw[i].y);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geom = new THREE.ShapeGeometry(shape, 3);
  const pos = geom.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ix = pos.getX(i);
    const iy = pos.getY(i);
    const uv = imageToUv(ix, iy, width, height);
    uvs[i * 2] = uv.u;
    uvs[i * 2 + 1] = uv.v;
    const w = imageToWorld(ix, iy, width, height, mpp);
    pos.setXYZ(i, w.x, 0, w.z);
  }
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  setUpNormals(geom);
  return geom;
}

export function buildGround(reconstruction, params, style = "photo", shadows = false) {
  const group = new THREE.Group();
  const mpp = params.metersPerPixel;
  const { worldW, worldD } = worldSpan(reconstruction.width, reconstruction.height, mpp);
  const tex = sourceTexture(reconstruction.canvas);
  const neon = neonLines(style);
  const showPhoto = params.showGroundTexture !== false;

  let groundGeom;
  try {
    groundGeom = showPhoto ? buildPhotoGround(reconstruction, params) : new THREE.PlaneGeometry(worldW, worldD);
  } catch {
    groundGeom = new THREE.BufferGeometry();
    const p00 = imageToWorld(0, 0, reconstruction.width, reconstruction.height, mpp);
    const p10 = imageToWorld(reconstruction.width, 0, reconstruction.width, reconstruction.height, mpp);
    const p11 = imageToWorld(reconstruction.width, reconstruction.height, reconstruction.width, reconstruction.height, mpp);
    const p01 = imageToWorld(0, reconstruction.height, reconstruction.width, reconstruction.height, mpp);
    groundGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [p00.x, 0, p00.z, p10.x, 0, p10.z, p11.x, 0, p11.z, p00.x, 0, p00.z, p11.x, 0, p11.z, p01.x, 0, p01.z],
        3,
      ),
    );
    const u00 = imageToUv(0, 0, reconstruction.width, reconstruction.height);
    const u10 = imageToUv(reconstruction.width, 0, reconstruction.width, reconstruction.height);
    const u11 = imageToUv(reconstruction.width, reconstruction.height, reconstruction.width, reconstruction.height);
    const u01 = imageToUv(0, reconstruction.height, reconstruction.width, reconstruction.height);
    groundGeom.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        [u00.u, u00.v, u10.u, u10.v, u11.u, u11.v, u00.u, u00.v, u11.u, u11.v, u01.u, u01.v],
        2,
      ),
    );
    setUpNormals(groundGeom);
  }

  const groundMat = new THREE.MeshBasicMaterial({
    map: showPhoto ? tex : null,
    color: showPhoto ? 0xffffff : 0x071016,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  if (groundGeom instanceof THREE.PlaneGeometry) ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  if (shadows) {
    const catcher = new THREE.Mesh(
      groundGeom,
      new THREE.ShadowMaterial({ color: 0x161410, opacity: 0.34, depthWrite: false }),
    );
    catcher.receiveShadow = true;
    catcher.renderOrder = 1;
    catcher.position.y = 0.02;
    if (groundGeom instanceof THREE.PlaneGeometry) catcher.rotation.x = -Math.PI / 2;
    group.add(catcher);
  }

  const circuit = new THREE.GridHelper(Math.max(worldW, worldD), 48, 0x14505c, 0x0b1c24);
  circuit.position.y = 0.03;
  circuit.visible = params.showGrid === true;
  group.add(circuit);

  const rim = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        (() => {
          const a = imageToWorld(0, 0, reconstruction.width, reconstruction.height, mpp);
          const b = imageToWorld(reconstruction.width, 0, reconstruction.width, reconstruction.height, mpp);
          const c = imageToWorld(reconstruction.width, reconstruction.height, reconstruction.width, reconstruction.height, mpp);
          const d = imageToWorld(0, reconstruction.height, reconstruction.width, reconstruction.height, mpp);
          return [a.x, 0.04, a.z, b.x, 0.04, b.z, b.x, 0.04, b.z, c.x, 0.04, c.z, c.x, 0.04, c.z, d.x, 0.04, d.z, d.x, 0.04, d.z, a.x, 0.04, a.z];
        })(),
        3,
      ),
    ),
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: neon ? 0.45 : 0.12 }),
  );
  group.add(rim);

  if (style === "hologram") {
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldD),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    scan.rotation.x = -Math.PI / 2;
    scan.name = "scan";
    scan.userData.maxY = Math.max(18, ...reconstruction.buildings.map((b) => b.height * mpp * 1.12));
    group.add(scan);
  }

  group.userData.photoTexture = tex;
  return group;
}

export function pickBuildingAt(pickables, camera, ndc) {
  if (!pickables?.length) return null;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  return hits[0]?.object || null;
}
