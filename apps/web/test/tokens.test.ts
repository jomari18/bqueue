// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Spec 11.2: every text pair passes WCAG AA, so a later token change cannot break contrast unnoticed.
// Runs in node so import.meta.url is a file URL (Vitest stubs CSS imports).
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`missing --${name}`);
  return m[1]!;
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("design tokens", () => {
  it("are the values of spec 11.2", () => {
    expect(token("accent")).toBe("#1F7A4D");
    expect(token("accent-tint")).toBe("#E2F1E8");
    expect(token("accent-ink")).toBe("#0F4029");
    expect(token("bg")).toBe("#F8F7F4");
  });

  it.each(["text", "muted", "accent", "danger", "warning", "accent-ink"])("--%s reads on every background", (fg) => {
    for (const bg of ["bg", "surface", "raised", "accent-tint"]) {
      expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps text on the accent readable", () => {
    expect(contrast(token("on-accent"), token("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});
