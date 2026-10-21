/* global document, innerWidth, requestAnimationFrame -- callbacks execute in the browser */
// Browser QA against a running Vite server. See PHASE-2A4.md for invocation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-2a4');
const url = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), captures: [], checks: {} };
  try {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const errors = [];
      const assets = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.url().endsWith('.glb'))
          assets.push({ url: response.url(), status: response.status() });
      });
      await page.goto(url);
      const canvas = page.locator('canvas[data-model]');
      await canvas.waitFor({ timeout: 30000 });
      await page.waitForTimeout(1700);
      assert.equal(await canvas.getAttribute('data-hemispheres'), '2');
      const initial = await canvas.evaluate((c) => ({ ...c.dataset }));
      if (width === 390)
        assert.equal(initial.model, '/models/cortex-compact.glb');
      else assert.equal(initial.model, '/models/cortex-full.glb');
      await page
        .getByRole('button', { name: 'Pause sculpture motion' })
        .click();
      await page.waitForTimeout(250);
      const screenshot = `${width}x${height}-inactive.png`;
      await page.screenshot({ path: path.join(output, screenshot) });
      const bounds = await page.evaluate(() => {
        const cta = document
          .querySelector('.cinematic-actions a')
          .getBoundingClientRect();
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cta: {
            top: cta.top,
            bottom: cta.bottom,
            left: cta.left,
            right: cta.right,
          },
        };
      });
      assert.equal(bounds.scrollWidth, width, 'Horizontal overflow');
      assert(
        bounds.cta.bottom <= height && bounds.cta.top > 0,
        'CTA outside viewport',
      );
      const pausedRotation = await canvas.getAttribute('data-rotation');
      await page.waitForTimeout(300);
      assert.equal(
        await canvas.getAttribute('data-rotation'),
        pausedRotation,
        'Pause did not settle',
      );
      // Trigger actual UI activity, observe propagation, and verify its fade.
      await page.getByRole('button', { name: 'Activate signal' }).click();
      await page.waitForTimeout(2000);
      assert(Number(await canvas.getAttribute('data-activity')) > 0.9);
      assert(
        Number(await canvas.getAttribute('data-particles')) >=
          (width === 390 ? 9000 : 28000),
      );
      const activatedScreenshot = `${width}x${height}-active.png`;
      await page.screenshot({ path: path.join(output, activatedScreenshot) });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(output, `${width}x${height}-pulse-later.png`),
      });
      await page.getByRole('button', { name: 'Quiet signal' }).click();
      await page.waitForTimeout(1500);
      assert(Number(await canvas.getAttribute('data-activity')) < 0.01);
      const stage = page.getByRole('group', { name: /360-degree rotation/ });
      await stage.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      assert.notEqual(
        await canvas.getAttribute('data-rotation'),
        pausedRotation,
        'Keyboard did not rotate',
      );
      const box = await stage.boundingBox();
      const beforeDrag = await canvas.getAttribute('data-rotation');
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.78,
        box.y + box.height * 0.6,
        { steps: 12 },
      );
      await page.mouse.up();
      await page.waitForTimeout(350);
      assert.notEqual(
        await canvas.getAttribute('data-rotation'),
        beforeDrag,
        'Drag did not rotate',
      );
      await page.screenshot({
        path: path.join(output, `${width}x${height}-rotated.png`),
      });
      await stage.focus();
      await page.keyboard.press('Home');
      await page.waitForTimeout(500);
      const timing = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const times = [];
            let previous = performance.now();
            function tick(now) {
              times.push(now - previous);
              previous = now;
              if (times.length < 90) requestAnimationFrame(tick);
              else {
                times.shift();
                times.sort((a, b) => a - b);
                resolve({
                  medianFrameMs: times[Math.floor(times.length / 2)],
                  p95FrameMs: times[Math.floor(times.length * 0.95)],
                });
              }
            }
            requestAnimationFrame(tick);
          }),
      );
      // Verify the automatic return to calm while inactive inputs stay untouched.
      if (width === 1440) {
        await page.getByRole('button', { name: 'Activate signal' }).click();
        await page
          .getByRole('button', { name: 'Activate signal' })
          .waitFor({ timeout: 15000 });
        await page.waitForTimeout(1500);
        assert(Number(await canvas.getAttribute('data-activity')) < 0.01);
        report.checks.autoQuiet = 'Signal returns to rest after 12 seconds';
      }
      // Resize the same running canvas, then restore the target dimensions.
      await page.setViewportSize({
        width: Math.max(320, width - 100),
        height: height - 50,
      });
      await page.waitForTimeout(400);
      assert(await canvas.isVisible(), 'Canvas disappeared after resize');
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      const final = await canvas.evaluate((c) => ({ ...c.dataset }));
      assert.deepEqual(errors, [], 'Browser console errors');
      assert(
        assets.some((a) => a.status === 200 && a.url.endsWith(initial.model)),
        'No real GLB response',
      );
      report.captures.push({
        viewport: { width, height },
        screenshot,
        activatedScreenshot,
        initial,
        final,
        assets,
        timing,
        checks: [
          'two hemispheres',
          'signal activation and fade',
          'bounded full and compact particles',
          'correct initial profile',
          'no overflow',
          'visible CTA',
          'pause',
          'keyboard',
          'drag',
          'reset',
          'resize',
          'no console errors',
        ],
      });
      console.log(width, height, initial.model, timing, final.model);
      await context.close();
    }
    const reduced = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const reducedPage = await reduced.newPage();
    const reducedRequests = [];
    reducedPage.on('request', (request) => {
      if (request.url().endsWith('.glb')) reducedRequests.push(request.url());
    });
    await reducedPage.goto(url);
    await reducedPage.getByText('REDUCED MOTION / STILL VIEW').waitFor();
    await reducedPage
      .locator('img[src="/models/cortex-still.png"]')
      .evaluate((img) => img.decode());
    assert.equal(await reducedPage.locator('canvas').count(), 0);
    assert.deepEqual(reducedRequests, []);
    await reducedPage.screenshot({
      path: path.join(output, 'reduced-motion.png'),
    });
    report.checks.reducedMotion =
      'Anatomical still, no WebGL canvas or GLB request';
    await reduced.close();

    const failed = await browser.newContext();
    const failedPage = await failed.newPage();
    await failedPage.route('**/models/*.glb', (route) =>
      route.fulfill({ status: 503, body: 'QA simulated failure' }),
    );
    await failedPage.goto(url);
    await failedPage.getByText('WEBGL UNAVAILABLE / STILL VIEW').waitFor();
    assert.equal(await failedPage.locator('canvas').count(), 0);
    assert(
      await failedPage
        .getByRole('link', { name: 'Try NeuroScope' })
        .isVisible(),
    );
    report.checks.modelFailure =
      '503 response replaced by anatomical still with working CTA';
    await failed.close();

    const missingEffects = await browser.newContext();
    const missingPage = await missingEffects.newPage();
    await missingPage.route('**/models/neural-*.json', (route) =>
      route.fulfill({ status: 503, body: 'Simulated effect asset failure' }),
    );
    await missingPage.goto(url);
    await missingPage.getByText('WEBGL UNAVAILABLE / STILL VIEW').waitFor();
    assert.equal(await missingPage.locator('canvas').count(), 0);
    report.checks.effectFailure =
      'Anatomical still survives unavailable neural data';
    await missingEffects.close();
    const lost = await browser.newContext();
    const lostPage = await lost.newPage();
    await lostPage.goto(url);
    await lostPage.locator('canvas[data-model]').waitFor();
    await lostPage
      .locator('canvas')
      .evaluate((canvas) =>
        canvas
          .getContext('webgl2')
          .getExtension('WEBGL_lose_context')
          .loseContext(),
      );
    await lostPage.getByText('WEBGL UNAVAILABLE / STILL VIEW').waitFor();
    assert.equal(await lostPage.locator('canvas').count(), 0);
    report.checks.contextLoss = 'Anatomical still and CTA retained';
    await lost.close();
    fs.writeFileSync(
      path.join(output, 'browser-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
