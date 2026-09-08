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
});
