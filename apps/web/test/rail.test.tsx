import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconRail } from "../src/components/IconRail";
import { navFor } from "../src/lib/nav";
import { renderWithIntl } from "./support/render";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe("navigation rail", () => {
  it("shows staff exactly the board and the counter", () => {
    renderWithIntl(<IconRail items={navFor("STAFF")} active="/staff/counter" />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Board", "Counter"]);
    expect(screen.getByRole("link", { name: "Counter" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the kapitan five places and residents three", () => {
    expect(navFor("KAPITAN").map((i) => i.href)).toEqual(["/kapitan", "/staff", "/staff/counter", "/kapitan/reports", "/kapitan/settings"]);
    expect(navFor("RESIDENT").map((i) => i.href)).toEqual(["/r", "/r/requests", "/r/ticket"]);
  });
});
