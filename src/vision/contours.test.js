import { describe, expect, it } from "vitest";
import { extractComponentsFast } from "./contours.js";

describe("contours", () => {
  it("extracts a compact rectangular blob", () => {
    const w = 24;
    const h = 24;
    const mask = new Uint8Array(w * h);
    for (let y = 6; y < 14; y++) {
      for (let x = 5; x < 16; x++) mask[y * w + x] = 1;
    }
    const { components } = extractComponentsFast(mask, w, h, 8);
    expect(components.length).toBe(1);
    expect(components[0].area).toBe(8 * 11);
    expect(components[0].contour.length).toBeGreaterThan(8);
  });

  it("keeps diagonally touching blobs separate with 4-connect", () => {
    const w = 16;
    const h = 16;
    const mask = new Uint8Array(w * h);
    mask[3 * w + 3] = 1;
    mask[3 * w + 4] = 1;
    mask[4 * w + 3] = 1;
    mask[4 * w + 4] = 1;
    mask[5 * w + 5] = 1;
    mask[5 * w + 6] = 1;
    mask[6 * w + 5] = 1;
    mask[6 * w + 6] = 1;
    const four = extractComponentsFast(mask, w, h, 1, 4).components;
    const eight = extractComponentsFast(mask, w, h, 1, 8).components;
    expect(four.length).toBe(2);
    expect(eight.length).toBe(1);
  });
});
