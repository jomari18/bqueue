import { expect, type Page, test } from "@playwright/test";
import { callNext, finishCall, sameOrigin, startDemo, takeKioskNumber, useTestIp } from "./helpers";

/** The people ahead as the phone shows them: "N ahead · about M min", or 0 for "You're next". */
async function aheadOn(phone: Page): Promise<number> {
  const line = phone.getByText(/ ahead · about |You're next/).first();
  await expect(line).toBeVisible();
  const text = (await line.textContent()) ?? "";
  return text.includes("You're next") ? 0 : Number(text.match(/^(\d+) ahead/)?.[1]);
}

test("the resident's phone follows its place in line and says when it is their turn", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const demo = await startDemo(page);

  // Two walk-ins in the same lane first, so the resident always has people ahead to watch go by.
  const kiosk = await context.newPage();
  await useTestIp(kiosk);
  await takeKioskNumber(kiosk, demo.kioskLink, "General");
  await takeKioskNumber(kiosk, demo.kioskLink, "General");

  const phoneContext = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  await useTestIp(phone);
  await phone.goto(sameOrigin(demo.joinLink));
  await expect(phone.getByRole("heading", { name: "What do you need?" })).toBeVisible({ timeout: 30_000 });

  await phone.goto("/r/ticket");
  await phone.getByRole("button", { name: "General" }).click();
  const start = await aheadOn(phone);
  expect(start).toBeGreaterThanOrEqual(2);

  // Each call reaches the phone over the socket; the page is never reloaded. Priority and Documents numbers can
  // be called first, so not every call moves the resident.
  await page.bringToFront();
  const turn = phone.getByText("Your turn! Counter 2").first();
  let lowest = start;
  for (let i = 0; i < 40; i++) {
    if (i > 0) await finishCall(page);
    await callNext(page);
    await phone.waitForTimeout(500);
    if (await turn.isVisible()) break;
    lowest = Math.min(lowest, await aheadOn(phone));
  }
  expect(lowest).toBeLessThan(start);
  await expect(turn).toBeVisible();

  await phoneContext.close();
});
