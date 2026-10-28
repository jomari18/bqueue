export type Quality = { dpr: [number, number] };

/** The pixel ratio is capped at 1.5 on every screen, which keeps phones fast. */
export function qualityFor(_width: number): Quality {
  return { dpr: [1, 1.5] };
}
