import { describe, expect, it } from "vitest";
import { qualityFor } from "../src/landing/ticket3d/quality";

describe("3D quality by screen width", () => {
  it("draws less on a phone", () => {
    expect(qualityFor(375)).toEqual({ slats: 8, resolution: 256, samples: 3, dpr: [1, 1.5] });
    expect(qualityFor(767).slats).toBe(8);
  });

  it("draws the full scene from 768 px", () => {
    expect(qualityFor(768)).toEqual({ slats: 14, resolution: 512, samples: 6, dpr: [1, 1.5] });
    expect(qualityFor(1440)).toEqual({ slats: 14, resolution: 512, samples: 6, dpr: [1, 1.5] });
  });
});
