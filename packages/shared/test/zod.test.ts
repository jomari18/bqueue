import { describe, expect, it } from "vitest";
import { z } from "../src/zod.js";

// Only the browser parses without zod's compiled parsers (the site's CSP refuses eval); the API keeps them.
describe("zod outside the browser", () => {
  it("keeps the compiled parsers for the API", () => {
    expect(z.string().safeParse(1).success).toBe(false);
    expect(z.config().jitless).not.toBe(true);
  });
});
