// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/features/print/print.css", import.meta.url), "utf8");

describe("print stylesheet", () => {
  it("prints on A4 with 16 mm margins", () => {
    expect(css).toMatch(/@page\s*{[^}]*size:\s*A4/);
    expect(css).toMatch(/@page\s*{[^}]*margin:\s*16mm/);
  });
});
