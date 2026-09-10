import { describe, expect, it } from "vitest";
import { Color } from "three";
import { facadeRepeats, wallColorFromRoof } from "./facades.js";

describe("facades", () => {
  it("cools roof color toward masonry for walls", () => {
    const roof = new Color("#e8e2d4");
    const wall = wallColorFromRoof(roof);
    expect(wall.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(roof.getHSL({ h: 0, s: 0, l: 0 }).l);
  });

  it("keeps very dark roofs from producing near-black masonry", () => {
    const wall = wallColorFromRoof(new Color("#1a1a18"));
    expect(wall.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.2);
  });

  it("scales window repeats with wall size", () => {
    const short = facadeRepeats(8, 8, "lowrise");
    const long = facadeRepeats(40, 40, "highrise");
    expect(long.u).toBeGreaterThan(short.u);
    expect(long.v).toBeGreaterThan(0.3);
  });

  it("maps a two-storey wall to about two texture floors", () => {
    const two = facadeRepeats(12, 6.4, "lowrise");
    expect(two.v).toBeGreaterThan(0.45);
    expect(two.v).toBeLessThan(0.9);
  });
});
