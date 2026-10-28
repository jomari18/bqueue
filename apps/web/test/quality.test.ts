import { describe, expect, it } from "vitest";
import { qualityFor } from "../src/landing/ticket3d/quality";

describe("3D quality by screen width", () => {
  it("caps the pixel ratio at 1.5 on every screen", () => {
    expect(qualityFor(375)).toEqual({ dpr: [1, 1.5] });
    expect(qualityFor(1440)).toEqual({ dpr: [1, 1.5] });
  });
});
