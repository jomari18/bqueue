"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A QR code as an SVG image; `data-value` keeps the encoded link readable for tests and E2E. */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
      if (live) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    });
    return () => {
      live = false;
    };
  }, [value]);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a site image
    <img src={src ?? undefined} alt={label} data-value={value} width={size} height={size} className="rounded-input bg-surface" />
  );
}
