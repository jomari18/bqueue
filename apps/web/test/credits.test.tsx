import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreditsContent } from "../src/features/credits/CreditsContent";
import NotFound from "../src/app/not-found";
import { renderWithIntl } from "./support/render";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "" });
  return { Inter: font, Sora: font, Noto_Serif: font };
});

const SPEC_CREDIT =
  'UI adapted from "Donka Help Desk — Internal Request System" by Dayse (Figma Community), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: forest green accent, new brand, barangay screens and content, icons.';
const SCENE_CREDIT =
  '3D scene inspired by "Reeded liquid glass – Prism hero section concept" on Spline, rebuilt from primitives; no files from it are used.';

describe("credits page", () => {
  it("carries the design credit word for word and the 3D inspiration", () => {
    renderWithIntl(<CreditsContent />);
    expect(screen.getByText(SPEC_CREDIT)).toBeInTheDocument();
    expect(screen.getByText(SCENE_CREDIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
  });

  it("names the fonts, the icons and their licences", () => {
    renderWithIntl(<CreditsContent />);
    for (const font of ["Sora", "Inter", "Noto Serif"]) expect(screen.getByText(new RegExp(`^${font}\\b`))).toBeInTheDocument();
    expect(screen.getAllByText(/SIL Open Font License 1\.1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Lucide/)).toHaveTextContent("ISC License");
  });
});

describe("404", () => {
  it("links home in English and Filipino", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Pumunta sa home page" })).toHaveAttribute("href", "/");
  });
});

describe("site metadata", () => {
  it("names the site and shares the social image", async () => {
    const { metadata } = await import("../src/app/layout");
    expect(metadata.title).toBe("B.Queue · Barangay requests and queue");
    expect(JSON.stringify(metadata.openGraph)).toContain("/og.png");
    expect(JSON.stringify(metadata.twitter)).toContain("/og.png");
  });
});
