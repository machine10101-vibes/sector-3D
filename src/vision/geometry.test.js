import { describe, expect, it } from "vitest";
import {
  earclip,
  ensureCCW,
  meanIoU,
  orthogonalize,
  polygonArea,
  simplifyRdp,
} from "./geometry.js";

describe("geometry", () => {
  it("computes signed area of a unit square", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea(sq.slice().reverse())).toBe(-100);
  });

  it("forces counter-clockwise winding", () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
    ];
    expect(polygonArea(ensureCCW(cw))).toBeGreaterThan(0);
  });

  it("simplifies a colinear polyline to endpoints", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: -0.01 },
      { x: 5, y: 0 },
    ];
    const simple = simplifyRdp(line, 0.5);
    expect(simple.length).toBe(2);
  });

  it("snaps near-axis edges", () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0.2 },
      { x: 10.1, y: 8 },
      { x: 0, y: 8 },
    ];
    const ortho = orthogonalize(poly, 12);
    expect(Math.abs(ortho[1].y - ortho[0].y)).toBeLessThan(0.01);
  });

  it("earclips a square into two triangles", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 8 },
      { x: 0, y: 8 },
    ];
    const { indices } = earclip(sq);
    expect(indices.length).toBe(6);
  });

  it("scores overlapping footprints with high IoU", () => {
    const a = [
      {
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
    ];
    const b = [
      {
        polygon: [
          { x: 1, y: 1 },
          { x: 11, y: 1 },
          { x: 11, y: 11 },
          { x: 1, y: 11 },
        ],
      },
    ];
    expect(meanIoU(a, b)).toBeGreaterThan(0.6);
  });
});
