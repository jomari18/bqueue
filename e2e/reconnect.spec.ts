import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { callNext, finishCall, openTv, startDemo, takeKioskNumber, useTestIp } from "./helpers";

test("the TV says it is reconnecting while the API restarts, then shows the next call", async ({ page, context }) => {
  test.setTimeout(180_000);
  const demo = await startDemo(page);
  const kiosk = await context.newPage();
  await useTestIp(kiosk);
  await takeKioskNumber(kiosk, demo.kioskLink, "General");
  await takeKioskNumber(kiosk, demo.kioskLink, "General");

  const tv = await openTv(context, demo.displayLink, "English");
  await expect(tv.getByText(demo.barangay.name)).toBeVisible();

  execSync("docker restart bq-api", { stdio: "ignore" });
  await expect(tv.getByText("Reconnecting…")).toBeVisible({ timeout: 30_000 });
  await expect(tv.getByText("Reconnecting…")).toBeHidden({ timeout: 90_000 });

  await page.bringToFront();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: /Call next|Served/ })).toBeVisible();
  }).toPass({ timeout: 60_000 });
  if (await page.getByRole("button", { name: "Served" }).isVisible()) await finishCall(page);
  const code = await callNext(page);
  await expect(tv.getByTestId("call-banner")).toContainText(code);
});
