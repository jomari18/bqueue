import { expect, test } from "@playwright/test";
import { startDemo, switchRole, useTestIp } from "./helpers";

test("the resident home switches to Filipino", async ({ page }) => {
  await startDemo(page);
  await switchRole(page, "Residente – Juan Dela Cruz");
  await page.waitForURL("**/r");
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "FIL" }).click();
  await expect(page.getByRole("heading", { name: "Ano ang kailangan mo?" })).toBeVisible();
  await page.getByRole("button", { name: /^Barangay Clearance ·/ }).click();
  await expect(page.getByRole("button", { name: "Ipadala ang request" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ticket ko" })).toBeVisible();
});

test("a wrong sign-in is explained in Filipino", async ({ page, context }) => {
  await useTestIp(page);
  await context.addCookies([{ name: "NEXT_LOCALE", value: "fil", url: "http://localhost:3100" }]);
  await page.goto("/login");
  await page.getByLabel("Username").fill("walangganito.zzzz");
  await page.getByLabel("Password o PIN").fill("not-the-right-password");
  await page.getByRole("button", { name: "Mag-sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Mali ang username o password." })).toBeVisible();
});
