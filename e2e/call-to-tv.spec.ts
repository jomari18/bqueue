import { expect, test } from "@playwright/test";
import { callNext, openTv, startDemo, takeKioskNumber, useTestIp } from "./helpers";

test("a call at the counter shows and speaks on the TV within a second", async ({ page, context }) => {
  const demo = await startDemo(page);

  const kiosk = await context.newPage();
  await useTestIp(kiosk);
  await takeKioskNumber(kiosk, demo.kioskLink, "Documents");

  const tv = await openTv(context, demo.displayLink, "Filipino");
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await expect(tv.getByText(demo.barangay.name)).toBeVisible();

  await page.bringToFront();
  const answered = page.waitForResponse((r) => r.url().endsWith("/call-next") && r.request().method() === "POST");
  const code = await callNext(page);
  const at = Date.now();
  await answered;

  const banner = tv.getByTestId("call-banner");
  await expect(banner).toContainText(code, { timeout: 1_000 });
  expect(Date.now() - at).toBeLessThan(1_500);

  await expect.poll(() => tv.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | "))).toMatch(/^Numero [PDG], .+, sa Counter 2\.$/);

  const size = await banner.locator(".tv-number").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(160);
});
