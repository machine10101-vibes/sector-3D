import { describe, expect, it } from "vitest";
import { imageToUv, imageToWorld, worldSpan } from "./mapping.js";

describe("pixel lock mapping", () => {
  const width = 200;
  const height = 100;
  const mpp = 0.5;

  it("places the image origin at the north-west world corner", () => {
    const w = imageToWorld(0, 0, width, height, mpp);
    expect(w.x).toBeCloseTo(-50);
    expect(w.z).toBeCloseTo(-25);
    expect(w.worldW).toBeCloseTo(100);
    expect(w.worldD).toBeCloseTo(50);
  });

  it("places the image center at world origin", () => {
    const w = imageToWorld(width / 2, height / 2, width, height, mpp);
    expect(w.x).toBeCloseTo(0);
    expect(w.z).toBeCloseTo(0);
  });

  it("maps image top to v=1 so CanvasTexture flipY samples the photo top", () => {
    const top = imageToUv(0, 0, width, height);
    const bottom = imageToUv(0, height, width, height);
    const right = imageToUv(width, 0, width, height);
    expect(top.u).toBeCloseTo(0);
    expect(top.v).toBeCloseTo(1);
    expect(bottom.v).toBeCloseTo(0);
    expect(right.u).toBeCloseTo(1);
  });

  it("keeps a roof pixel and its ground texel on the same world XZ", () => {
    const x = 40;
    const y = 18;
    const roof = imageToWorld(x, y, width, height, mpp);
    const ground = imageToWorld(x, y, width, height, mpp);
    expect(roof.x).toBeCloseTo(ground.x);
    expect(roof.z).toBeCloseTo(ground.z);
    const uv = imageToUv(x, y, width, height);
    expect(uv.u).toBeCloseTo(x / width);
    expect(uv.v).toBeCloseTo(1 - y / height);
  });

  it("reports a stable world span", () => {
    const s = worldSpan(width, height, mpp);
    expect(s.span).toBeCloseTo(100);
  });
});
