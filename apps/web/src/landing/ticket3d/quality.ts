export type Quality = { slats: number; resolution: number; samples: number; dpr: [number, number] };

/** Spec 11.4: phones get fewer slats and a smaller transmission buffer; the pixel ratio is capped at 1.5 everywhere. */
export function qualityFor(width: number): Quality {
  return width < 768 ? { slats: 8, resolution: 256, samples: 3, dpr: [1, 1.5] } : { slats: 14, resolution: 512, samples: 6, dpr: [1, 1.5] };
}
