/* global requestAnimationFrame -- callback runs in the browser */
// Capture the actual inactive WebGL canvas, preserving transparency for fallbacks.
const fs = require('node:fs');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 1000 },
      deviceScaleFactor: 1,
    });
    await page.goto(process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173');
    await page.locator('canvas[data-model]').waitFor();
    await page.addStyleTag({
      content:
        '.neural-stage {position:fixed!important;inset:0 auto auto 0!important;width:900px!important;height:900px!important;}',
    });
    await page.waitForTimeout(1000);
    const png = await page
      .locator('canvas')
      .evaluate(
        (canvas) =>
          new Promise((resolve) =>
            requestAnimationFrame(() => resolve(canvas.toDataURL('image/png'))),
          ),
      );
    fs.writeFileSync(
      'public/models/cortex-still.png',
      Buffer.from(png.split(',')[1], 'base64'),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
