/* global window, document, requestAnimationFrame */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-2b');
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: path.join(output, 'video'),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const beginning = Date.now();
  try {
    await page.goto(
      (process.env.NEUROSCOPE_URL || 'http://127.0.0.1:4173') + '/#signal',
    );
    await page.locator('canvas[data-model]').waitFor();
    await page.waitForTimeout(1800);
    await page.evaluate(() => document.activeElement?.blur());
    const trimStart = (Date.now() - beginning) / 1000;
    await page.waitForTimeout(1200);
    const stops = await page.evaluate(() => {
      const ids = [
        'product',
        'capabilities',
        'how-it-works',
        'use-cases',
        'scientific-integrity',
        'documentation',
      ];
      return [
        ...ids.map(
          (id) =>
            document.getElementById(id).getBoundingClientRect().top +
            window.scrollY,
        ),
        document.querySelector('.marketing-final').getBoundingClientRect().top +
          window.scrollY,
        document.documentElement.scrollHeight - window.innerHeight,
      ];
    });
    for (const [index, top] of stops.entries()) {
      await page.evaluate(
        ({ top, duration }) =>
          new Promise((resolve) => {
            const from = window.scrollY,
              start = performance.now();
            function step(now) {
              const p = Math.min(1, (now - start) / duration);
              const ease = p * p * (3 - 2 * p);
              window.scrollTo({
                top: from + (top - from) * ease,
                behavior: 'instant',
              });
              if (p < 1) requestAnimationFrame(step);
              else resolve();
            }
            requestAnimationFrame(step);
          }),
        { top, duration: index === 1 ? 4200 : 2200 },
      );
      await page.waitForTimeout(index === 0 ? 1700 : 650);
    }
    fs.writeFileSync(
      path.join(output, 'video-trim.json'),
      JSON.stringify({
        startSeconds: trimStart,
        durationSeconds: (Date.now() - beginning) / 1000 - trimStart,
      }),
    );
  } finally {
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(output, 'homepage-scroll-source.webm'));
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
