import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

// Small building blocks in Donka's style: white cards with large radii and soft shadows, pill tags, big buttons.

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "bg-raised text-text hover:bg-line",
  ghost: "text-accent-ink hover:bg-accent-tint",
  danger: "bg-danger text-on-accent hover:brightness-110",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-card bg-surface p-5 shadow-card ${className}`} />;
}

export function Pill({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" | "danger" | "warning" }) {
  const tones = {
    accent: "bg-accent-tint text-accent-ink",
    muted: "bg-raised text-muted",
    danger: "bg-raised text-danger",
    warning: "bg-raised text-warning",
  };
  return <span className={`inline-flex items-center rounded-pill px-3 py-1 text-sm font-medium ${tones[tone]}`}>{children}</span>;
}

/** Announces changes to screen readers (calls, status changes, errors; spec 11.6). */
export function LiveRegion({ children, assertive = false, className = "" }: { children: ReactNode; assertive?: boolean; className?: string }) {
  return (
    <div aria-live={assertive ? "assertive" : "polite"} aria-atomic="true" className={className}>
      {children}
    </div>
  );
}

/** The forest-green ticket stub with a bold "B." (spec 11.5). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M10 8h44a4 4 0 0 1 4 4v14a6 6 0 0 0 0 12v14a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V38a6 6 0 0 0 0-12V12a4 4 0 0 1 4-4z"
        fill="#1F7A4D"
      />
      <text x="32" y="42" textAnchor="middle" fontFamily="Sora, Inter, sans-serif" fontWeight="800" fontSize="26" fill="#FFFFFF">
        B.
      </text>
    </svg>
  );
}
