import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageToggle } from "../src/components/LanguageToggle";
import { renderWithIntl } from "./support/render";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("language toggle", () => {
  it("saves Filipino in the locale cookie and re-renders", async () => {
    renderWithIntl(<LanguageToggle />);
    await userEvent.click(screen.getByRole("button", { name: "FIL" }));
    expect(document.cookie).toContain("NEXT_LOCALE=fil");
    expect(refresh).toHaveBeenCalled();
  });

  it("marks the current language", () => {
    renderWithIntl(<LanguageToggle />, { locale: "fil" });
    expect(screen.getByRole("button", { name: "FIL" })).toHaveAttribute("aria-pressed", "true");
  });
});
