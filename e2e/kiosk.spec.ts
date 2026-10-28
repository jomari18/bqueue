import { expect, test } from "@playwright/test";
import { callNext, finishCall, sameOrigin, startDemo, takeKioskNumber, useTestIp } from "./helpers";

test("a walk-in number from the kiosk is followed on a phone through its QR", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const demo = await startDemo(page);

  const kiosk = await context.newPage();
  await useTestIp(kiosk);
  const { code, tracker } = await takeKioskNumber(kiosk, demo.kioskLink, "Documents");
  expect(tracker).toMatch(/^http:\/\/localhost:3100\/t#.+/);

  // The tracker opens without an account, as a phone that scanned the QR would.
  const phoneContext = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  const phone = await phoneContext.newPage();
  await useTestIp(phone);
  await phone.goto(sameOrigin(tracker));
  await expect(phone.getByText(code)).toBeVisible();
  await expect(phone.getByText(/ ahead · about |You're next/)).toBeVisible();

  await page.bringToFront();
  for (let i = 0; i < 30; i++) {
    if ((await callNext(page)) === code) break;
    await finishCall(page);
  }
  await expect(phone.getByText("Your turn! Counter 2")).toBeVisible();
  await phoneContext.close();
});
