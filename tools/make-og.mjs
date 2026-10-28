/**
 * Makes apps/web/public/og.png, the 1200 x 630 card a shared link to the site shows: the mark, the name, the
 * tagline and the reeded-glass ticket still. Run it again after tools/render-still.mjs:
 *
 *   node tools/make-og.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const at = (path) => new URL(`../${path}`, import.meta.url);
const base64 = async (path) => (await readFile(at(path))).toString("base64");

const [still, bold, regular, logo] = await Promise.all([
  base64("apps/web/public/ticket-still.webp"),
  base64("node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2"),
  base64("node_modules/@fontsource/sora/files/sora-latin-400-normal.woff2"),
  readFile(at("apps/web/public/logo.svg"), "utf8"),
]);

const html = `<!doctype html>
<html>
  <head>
    <style>
      @font-face { font-family: Sora; font-weight: 700; src: url(data:font/woff2;base64,${bold}) format("woff2"); }
      @font-face { font-family: Sora; font-weight: 400; src: url(data:font/woff2;base64,${regular}) format("woff2"); }
      html, body { margin: 0; }
      body {
        box-sizing: border-box; width: 1200px; height: 630px; overflow: hidden; display: flex; align-items: center; gap: 48px;
        padding-left: 72px; background: radial-gradient(circle at 12% 100%, #E2F1E8, #F8F7F4 55%); color: #1A1A1A;
        font-family: Sora, sans-serif;
      }
      .copy { flex: 1; display: flex; flex-direction: column; gap: 24px; }
      .brand { display: flex; align-items: center; gap: 16px; color: #1F7A4D; font-size: 34px; font-weight: 700; }
      .brand svg { width: 64px; height: 64px; }
      h1 { margin: 0; font-size: 52px; font-weight: 700; line-height: 1.1; }
      p { margin: 0; font-size: 24px; color: #5F5E5A; }
      .chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .chips span { padding: 8px 18px; border-radius: 999px; background: #E2F1E8; color: #0F4029; font-size: 20px; }
      .picture { flex: none; width: 560px; height: 420px; overflow: hidden; border-radius: 32px 0 0 32px; }
      .picture img { display: block; width: 100%; height: 100%; object-fit: cover; }
    </style>
  </head>
  <body>
    <div class="copy">
      <div class="brand">${logo}B.Queue</div>
      <h1>No more lines at the barangay hall.</h1>
      <p>Barangay requests and a live queue, in one place.</p>
      <div class="chips"><span>Online requests</span><span>Live queue</span><span>QR verification</span></div>
    </div>
    <div class="picture"><img alt="" src="data:image/webp;base64,${still}" /></div>
  </body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluate((image) => image.decode());
  const out = at("apps/web/public/og.png");
  await writeFile(out, await page.screenshot({ type: "png" }));
  console.log(`Wrote ${out.pathname} (1200 x 630)`);
} finally {
  await browser.close();
}
