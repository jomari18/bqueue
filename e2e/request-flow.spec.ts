import { expect, type Page, test } from "@playwright/test";
import { callNext, finishCall, sameOrigin, startDemo, switchRole } from "./helpers";

/** The resident's request card on "My requests", found by its one-off purpose. */
const myRequest = (page: Page, purpose: string) => page.locator("div.rounded-card").filter({ hasText: purpose });

test("a clearance goes from the resident's phone to the kapitan's signature, the counter and a valid QR", async ({ page }) => {
  test.setTimeout(150_000);
  await startDemo(page);
  const purpose = `E2E job application ${Date.now() % 100_000}`;

  // 1. Juan requests a Barangay Clearance.
  await switchRole(page, "Residente – Juan Dela Cruz");
  await page.waitForURL("**/r");
  await page.getByRole("button", { name: /^Barangay Clearance ·/ }).click();
  await page.getByLabel("Purpose", { exact: true }).fill(purpose);
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.waitForURL("**/r/requests");
  await expect(myRequest(page, purpose)).toBeVisible();

  // 2. Staff forward it.
  await switchRole(page, "Staff – Counter 2");
  await page.goto("/staff");
  const card = page.locator("article").filter({ hasText: purpose });
  await card.getByRole("button", { name: "Forward to the kapitan" }).click();
  await expect(card).toHaveCount(0);

  // 3. The kapitan approves and signs.
  await switchRole(page, "Kapitan");
  await page.waitForURL("**/kapitan");
  const approval = page.locator("article").filter({ hasText: purpose });
  await approval.getByRole("button", { name: "Approve and sign" }).click();
  await approval.getByRole("dialog").getByRole("button", { name: "Sign and approve" }).click();
  await expect(approval).toHaveCount(0);

  // 4. Juan sees it ready, live, and takes a pickup number.
  await switchRole(page, "Residente – Juan Dela Cruz");
  await page.goto("/r/requests");
  const mine = myRequest(page, purpose);
  await mine.getByRole("button", { name: "Get a number for pickup" }).click();
  await page.waitForURL("**/r/ticket");
  const pickupCode = (await page.locator("p.font-heading.text-6xl").filter({ hasText: /^D-\d{3}$/ }).first().textContent())!.trim();

  // 5. Staff call numbers until the pickup comes up, then release it with the ID check and the OR number.
  await switchRole(page, "Staff – Counter 2");
  await page.waitForURL("**/staff/counter");
  for (let i = 0; i < 30; i++) {
    const code = await callNext(page);
    if (code === pickupCode) break;
    await finishCall(page);
  }
  await page.getByRole("button", { name: "Release document" }).click();
  const release = page.getByRole("dialog", { name: "Release document" });
  await release.getByLabel("Valid ID shown").check();
  await release.getByLabel("OR number").fill("OR-2026001");
  await release.getByRole("button", { name: "Release", exact: true }).click();
  const print = release.getByRole("link", { name: "Print document" });
  await expect(print).toBeVisible();

  // 6. The print view carries a QR whose link says the document is valid.
  await page.goto((await print.getAttribute("href"))!);
  const qr = page.getByRole("img", { name: "Scan to verify this document" });
  await expect(qr).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(purpose)).toBeVisible();
  await page.goto(sameOrigin((await qr.getAttribute("data-value"))!));
  await expect(page.getByRole("heading", { name: "Valid document" })).toBeVisible();
});
