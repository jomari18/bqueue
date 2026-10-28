import { randomInt } from "node:crypto";
import { type BrowserContext, expect, type Page } from "@playwright/test";

export type DemoDevice = {
  barangay: { code: string; name: string; expiresAt: string };
  logins: { kapitan: { username: string }; staff: { username: string }; resident: { username: string } };
  displayLink: string;
  kioskLink: string;
  joinLink: string;
  joinExpiresAt: string;
};

/** Gives this page's API calls their own visitor IP, so the per-IP demo limit never trips across specs. */
export async function useTestIp(page: Page | BrowserContext): Promise<void> {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://localhost:3100") return route.continue();
    return route.continue({ headers: { ...route.request().headers(), "x-bq-test-ip": ip } });
  });
}

/** "Try the demo" from the landing; resolves once the staff counter opens, with the device's stored demo. */
export async function startDemo(page: Page): Promise<DemoDevice> {
  await useTestIp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await page.waitForURL("**/staff/counter", { timeout: 90_000 });
  const raw = await page.evaluate(() => localStorage.getItem("bq-demo"));
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as DemoDevice;
}

/** Replaces speech with a recorder: `window.__spoken` gets every sentence, and there is one fil-PH voice. */
export async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    const voice = { lang: "fil-PH", name: "Filipino (test)", default: true, localService: true, voiceURI: "fil-test" };
    // The real utterance only accepts a real SpeechSynthesisVoice, so the test voice needs a stand-in utterance too.
    class Utterance {
      text: string;
      lang = "";
      voice: unknown = null;
      rate = 1;
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [voice],
        speak: (u: SpeechSynthesisUtterance) => {
          w.__spoken.push(u.text);
          setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 10);
        },
        cancel: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    // The chime cannot play headless without a user gesture in every case; it resolves at once instead.
    HTMLMediaElement.prototype.play = function () {
      setTimeout(() => this.dispatchEvent(new Event("ended")), 10);
      return Promise.resolve();
    };
  });
}

/** Opens the TV link in its own page, with speech stubbed, and presses Start in the chosen language. */
export async function openTv(context: BrowserContext, displayLink: string, language: "Filipino" | "English" = "Filipino"): Promise<Page> {
  const tv = await context.newPage();
  await stubSpeech(tv);
  await tv.goto(sameOrigin(displayLink));
  await tv.getByRole("button", { name: language }).click();
  await tv.getByRole("button", { name: "Start display" }).click();
  return tv;
}

/** Demo links carry the API's SITE_ORIGIN; in E2E that is this web server, so only the path and hash matter. */
export function sameOrigin(link: string): string {
  const url = new URL(link);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Makes sure the staff counter is open, then presses "Call next" and returns the code it shows. */
export async function callNext(page: Page): Promise<string> {
  const open = page.getByRole("button", { name: "Open counter" });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.getByRole("button", { name: "Call next" }).click();
  const code = page.locator("p.font-heading.text-7xl");
  await expect(code).toHaveText(/^[PDG]-\d{3}$/);
  return (await code.textContent())!.trim();
}

/** Ends the current call at the counter so the next one can be called. */
export async function finishCall(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Served" }).click();
  await expect(page.getByRole("button", { name: "Call next" })).toBeVisible();
}

/** Switches the signed-in demo role from the demo panel. */
export async function switchRole(page: Page, role: "Kapitan" | "Staff – Counter 2" | "Residente – Juan Dela Cruz"): Promise<void> {
  await page.getByRole("group", { name: "Switch role" }).getByRole("button", { name: role }).click();
  await expect(page.getByRole("group", { name: "Switch role" }).getByRole("button", { name: role })).toHaveAttribute("aria-pressed", "true");
}

/** Takes a walk-in number at the kiosk page and returns its code and tracker link. */
export async function takeKioskNumber(page: Page, kioskLink: string, lane: "Priority" | "Documents" | "General"): Promise<{ code: string; tracker: string }> {
  await page.goto(sameOrigin(kioskLink));
  await page.getByRole("button", { name: new RegExp(`^${lane}`) }).click();
  const code = page.locator("p.font-heading.text-8xl");
  await expect(code).toHaveText(/^[PDG]-\d{3}$/);
  const tracker = await page.getByRole("img", { name: /Scan/ }).getAttribute("data-value");
  return { code: (await code.textContent())!.trim(), tracker: tracker! };
}
