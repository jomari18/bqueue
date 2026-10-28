import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import fil from "../messages/fil.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

describe("messages (spec 12)", () => {
  const e = flatten(en as Tree);
  const f = flatten(fil as Tree);

  it("have the same keys in English and Filipino", () => {
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
  });

  it("use the same placeholders in both languages", () => {
    for (const [key, text] of e) expect(placeholders(f.get(key) ?? ""), key).toEqual(placeholders(text));
  });

  it("have no empty strings", () => {
    for (const [key, text] of [...e, ...f]) expect(text.trim(), key).not.toBe("");
  });
});
