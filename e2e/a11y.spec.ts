import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { openTv, sameOrigin, startDemo, switchRole, useTestIp } from "./helpers";

/** No serious or critical axe violations on the page as it is now. */
async function expectAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test("the main screens have no serious accessibility violations", async ({ page, context }) => {
  test.setTimeout(150_000);
  await useTestIp(page);
  await page.goto("/");
  await expectAccessible(page, "landing");

  const demo = await startDemo(page);
  await expectAccessible(page, "counter");

  await switchRole(page, "Kapitan");
  await page.waitForURL("**/kapitan");
  await expect(page.getByRole("heading", { name: "For your approval" })).toBeVisible();
  await expectAccessible(page, "approvals");

  await switchRole(page, "Residente – Juan Dela Cruz");
  await page.waitForURL("**/r");
  await expect(page.getByRole("heading", { name: "What do you need?" })).toBeVisible();
  await expectAccessible(page, "resident home");
  await page.goto("/r/ticket");
  await expect(page.getByRole("heading", { name: "My ticket" })).toBeVisible();
  await expectAccessible(page, "my ticket");

  const tv = await openTv(context, demo.displayLink, "English");
  await expect(tv.getByText(demo.barangay.name)).toBeVisible();
  await expectAccessible(tv, "tv");

  const kiosk = await context.newPage();
  await useTestIp(kiosk);
  await kiosk.goto(sameOrigin(demo.kioskLink));
  await expect(kiosk.getByRole("button", { name: /^General/ })).toBeVisible();
  await expectAccessible(kiosk, "kiosk");

  const verify = await context.newPage();
  await verify.goto("/verify/ABCDE-FGHJK");
  await expect(verify.getByRole("heading", { name: "No document has this code" })).toBeVisible();
  await expectAccessible(verify, "verify result");
});

test("with reduced motion the landing shows only the still picture", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.keyboard.press("Shift");
  await page.mouse.move(200, 200);
  await expect(page.getByRole("img", { name: "A green B.Queue ticket" })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("ticket-canvas")).toHaveCount(0);
  await context.close();
});
