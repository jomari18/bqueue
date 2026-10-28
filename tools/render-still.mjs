/**
 * Renders the landing's reeded-glass ticket at rest into apps/web/public/ticket-still.webp, the picture shown under
 * reduced motion, without WebGL, and while the scene loads (spec 11.4). Run it against a built app:
 *
 *   npm run build -w @bq/web
 *   npx -w @bq/web next start -p 3100        (leave it running)
 *   node tools/render-still.mjs [http://localhost:3100/]
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:3100/";
const out = new URL("../apps/web/public/ticket-still.webp", import.meta.url);

// Headless Chromium draws WebGL in software.
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  // Below the lg breakpoint the stage spans the page (848 px less 24 px padding a side = 800 px, so 800 x 600) and
  // the scene draws at its 1.5 pixel-ratio cap: a 1200 x 900 picture.
  const page = await browser.newPage({ viewport: { width: 848, height: 1400 }, deviceScaleFactor: 1.5, reducedMotion: "no-preference" });
  await page.goto(url);
  // The scene starts on the visitor's first move; a key press starts it without tilting the ticket as a mouse would.
  await page.keyboard.press("Shift");
  const canvas = page.locator("[data-testid=ticket-canvas] canvas");
  await canvas.waitFor();
  // The picture is square-cornered; the page rounds it wherever it shows it.
  await page.locator("[data-testid=ticket-canvas]").evaluate((stage) => (stage.parentElement.style.borderRadius = "0"));
  await page.waitForTimeout(3_000);
  const png = await canvas.screenshot();
  const webp = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return { data: canvas.toDataURL("image/webp", 0.82).split(",")[1], width: canvas.width, height: canvas.height };
  }, png.toString("base64"));
  await writeFile(out, Buffer.from(webp.data, "base64"));
  console.log(`Wrote ${out.pathname} (${webp.width} x ${webp.height}, ${Math.round((webp.data.length * 3) / 4 / 1024)} KB)`);
} finally {
  await browser.close();
}
