/* global window, document, innerWidth, requestAnimationFrame, getComputedStyle -- browser callbacks */
// Actual browser QA. Recording additionally requires Playwright's ffmpeg binary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-2a5b');
const url = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';
const states = [
  ['hero', 0],
  ['approach', 0.15],
  ['closeup', 0.26],
  ['bridge', 0.36],
  ['network', 0.5],
  ['field', 0.59],
  ['emergence', 0.76],
  ['signal', 1],
];
async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const root = document.querySelector('.neural-journey');
    const distance =
      root.offsetHeight - root.querySelector('.cinematic-hero').offsetHeight;
    window.scrollTo({
      top: root.offsetTop + distance * p,
      behavior: 'instant',
    });
  }, progress);
  await page.waitForTimeout(950);
}
async function timing(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let previous = performance.now();
        const samples = [];
        function frame(now) {
          samples.push(now - previous);
          previous = now;
          if (samples.length < 75) requestAnimationFrame(frame);
          else {
            samples.shift();
            samples.sort((a, b) => a - b);
            resolve({
              median: samples[Math.floor(samples.length * 0.5)],
              p95: samples[Math.floor(samples.length * 0.95)],
            });
          }
        }
        requestAnimationFrame(frame);
      }),
  );
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), viewports: [], checks: {} };
  try {
    // Reproduce the previous HTML's pre-CSS state, independently of video startup.
    const baselinePage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const baselineHTML = execFileSync('git', ['show', 'f803b29:index.html'], {
      encoding: 'utf8',
    });
    await baselinePage.route(url + '/', (route) =>
      route.fulfill({ contentType: 'text/html', body: baselineHTML }),
    );
    await baselinePage.route('**/src/main.tsx', (route) => route.abort());
    await baselinePage.goto(url);
    const baselineBackground = await baselinePage.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    assert.equal(baselineBackground, 'rgba(0, 0, 0, 0)');
    await baselinePage.screenshot({
      path: path.join(output, 'baseline-before-css.png'),
    });
    report.checks.baselineLoading =
      'Previous HTML has a transparent default background before application CSS; reproduced separately from recording startup';
    await baselinePage.close();
    // Hold the entry module to inspect the real HTML before application CSS/JS.
    const loadingContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const loadingPage = await loadingContext.newPage();
    let releaseEntry;
    const held = new Promise((resolve) => {
      releaseEntry = resolve;
    });
    await loadingPage.route('**/src/main.tsx', async (route) => {
      await held;
      await route.continue();
    });
    await loadingPage.goto(url, { waitUntil: 'commit' });
    await loadingPage.locator('body').waitFor({ state: 'attached' });
    const earlyBackground = await loadingPage.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    assert.equal(earlyBackground, 'rgb(8, 13, 20)');
    await loadingPage.screenshot({
      path: path.join(output, 'initial-html.png'),
    });
    let releaseModels;
    const heldModels = new Promise((resolve) => {
      releaseModels = resolve;
    });
    await loadingPage.route('**/*.glb', async (route) => {
      await heldModels;
      await route.continue();
    });
    releaseEntry();
    await loadingPage.locator('.neural-still img').waitFor();
    await loadingPage.waitForTimeout(250);
    await loadingPage.screenshot({
      path: path.join(output, 'loading-still.png'),
    });
    releaseModels();
    await loadingPage.locator('canvas[data-model]').waitFor();
    report.checks.initialLoading = { earlyBackground, entryModuleHeld: true };
    await loadingContext.close();
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
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(url);
      const canvas = page.locator('canvas[data-model]');
      await canvas.waitFor();
      await page.waitForTimeout(1500);
      const captures = [];
      for (const [name, progress] of states) {
        await scrollToProgress(page, progress);
        const data = await canvas.evaluate((c) => ({ ...c.dataset }));
        assert(
          Math.abs(Number(data.journey) - progress) < 0.002,
          `Progress mismatch at ${name}`,
        );
        assert.equal(data.hemispheres, '2');
        assert.equal(
          data.model,
          width === 390
            ? '/models/cortex-compact.glb'
            : '/models/cortex-full.glb',
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
          'Horizontal overflow',
        );
        const file = `${width}x${height}-${name}.png`;
        await page.screenshot({ path: path.join(output, file) });
        captures.push({ name, progress, file, data });
      }
      assert(
        Number(captures[1].data.cameraZ) < Number(captures[0].data.cameraZ),
        'Camera did not approach',
      );
      assert.equal(
        captures.find((c) => c.name === 'signal').data.waveform,
        '1.0000',
      );
      assert.equal(await page.locator('.signal-channel').count(), 6);
      assert.equal(
        await page.locator('.signal-content').evaluate((e) => e.inert),
        false,
      );
      assert.equal(
        await page
          .locator('.cinematic-actions')
          .evaluate((e) => e.closest('[data-hero-copy]').inert),
        true,
      );
      const motionBefore = await canvas.getAttribute('data-signal-motion');
      await page.waitForTimeout(650);
      assert.notEqual(
        await canvas.getAttribute('data-signal-motion'),
        motionBefore,
        'Settled traces should move',
      );
      await page
        .getByRole('button', { name: 'Pause sculpture motion' })
        .click();
      await page.waitForTimeout(150);
      const frozen = await canvas.getAttribute('data-signal-motion');
      await page.waitForTimeout(350);
      assert.equal(
        await canvas.getAttribute('data-signal-motion'),
        frozen,
        'Pause must freeze the waveform timeline',
      );
      await page
        .getByRole('button', { name: 'Resume sculpture motion' })
        .click();
      const endLabel = await page.locator('.signal-axis-end').boundingBox();
      const lastTick = await page
        .locator('[data-signal-tick="8"]')
        .boundingBox();
      assert(
        endLabel.y > lastTick.y + lastTick.height,
        'Time labels must not overlap the synthetic-study note',
      );
      const signalTiming = await timing(page);
      await scrollToProgress(page, 0.48);
      const networkTiming = await timing(page);
      await page
        .getByRole('button', { name: 'Pause sculpture motion' })
        .click();
      const paused = await canvas.getAttribute('data-activity');
      await scrollToProgress(page, 0.72);
      assert(
        Number(await canvas.getAttribute('data-waveform')) > 0.4,
        'Scroll should work while ambient motion is paused',
      );
      await page
        .getByRole('button', { name: 'Resume sculpture motion' })
        .click();
      for (const p of [0.5, 0.15, 0]) await scrollToProgress(page, p);
      const reversed = await canvas.evaluate((c) => ({ ...c.dataset }));
      assert.equal(reversed.network, '0.0000');
      assert.equal(reversed.waveform, '0.0000');
      assert(
        Math.abs(Number(reversed.cameraZ) - Number(captures[0].data.cameraZ)) <
          0.001,
      );
      assert.equal(
        await page.locator('.cinematic-content').evaluate((e) => e.inert),
        false,
      );
      await page.screenshot({
        path: path.join(output, `${width}x${height}-reversed.png`),
      });
      await page.getByRole('button', { name: 'Activate signal' }).click();
      await page.waitForTimeout(1000);
      assert(
        Number(await canvas.getAttribute('data-activity')) > 0.9,
        'Original activation control',
      );
      await page.getByRole('button', { name: 'Quiet signal' }).click();
      const stage = page.getByRole('group', { name: /360-degree rotation/ });
      await stage.focus();
      const rotation = await canvas.getAttribute('data-rotation');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      assert.notEqual(await canvas.getAttribute('data-rotation'), rotation);
      await page.keyboard.press('Home');
      const memory = Number(await canvas.getAttribute('data-geometries'));
      await scrollToProgress(page, 0.72);
      for (let i = 0; i < 3; i++) {
        await page.setViewportSize({ width: width - 20, height: height - 20 });
        await page.waitForTimeout(150);
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
      }
      assert(
        Number(await canvas.getAttribute('data-geometries')) <= memory + 1,
        'Geometry grew across resize',
      );
      await scrollToProgress(page, 1);
      await page.evaluate(() =>
        window.scrollBy({ top: innerWidth, behavior: 'instant' }),
      );
      await page.waitForTimeout(400);
      assert(
        await page
          .getByRole('heading', { name: 'Clarity, by design.' })
          .isVisible(),
        'Existing content remains reachable',
      );
      assert.deepEqual(errors, []);
      report.viewports.push({
        width,
        height,
        captures,
        signalTiming,
        networkTiming,
        reversed,
        pausedActivity: paused,
        checks: [
          'eight visual states',
          'moving waveforms and paused timeline',
          'camera approach',
          'six labeled signals',
          'hidden controls inert',
          'reverse to hero',
          'scroll while paused',
          'activate/quiet',
          'keyboard/reset',
          'bounded geometry after resize',
          'existing content reachable',
          'no overflow or console errors',
        ],
      });
      console.log(width, height, networkTiming, signalTiming);
      await context.close();
    }
    for (const mode of ['reduced', 'webgl-unavailable', 'model-failure']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
      });
      const page = await context.newPage();
      const requests = [];
      page.on('request', (r) => {
        if (r.url().endsWith('.glb')) requests.push(r.url());
      });
      if (mode === 'webgl-unavailable')
        await page.addInitScript(() => {
          Object.defineProperty(window, 'WebGL2RenderingContext', {
            value: undefined,
          });
        });
      if (mode === 'model-failure')
        await page.route('**/*.glb', (route) =>
          route.fulfill({ status: 503, body: 'QA failure' }),
        );
      await page.goto(url);
      await page.locator('.neural-journey--static').waitFor();
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(
        await page.locator('.signal-still .signal-trace').count(),
        6,
      );
      if (mode !== 'model-failure') assert.deepEqual(requests, []);
      await page.locator('#signal').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `${mode}-signals.png`) });
      report.checks[mode] =
        'Static anatomical hero and labeled synthetic signals remain in native document flow';
      await context.close();
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.locator('canvas[data-model]').waitFor();
    await scrollToProgress(page, 0.48);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.neural-journey--static').waitFor();
    assert.equal(
      await page.locator('.cinematic-content').evaluate((e) => e.inert),
      false,
    );
    report.checks.preferenceChange =
      'Changing to reduced motion during the transition restores static content and accessible controls';
    await context.close();
    if (process.env.NEUROSCOPE_RECORD === '1') {
      const recording = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        recordVideo: {
          dir: path.join(output, 'video'),
          size: { width: 1440, height: 900 },
        },
      });
      const page = await recording.newPage();
      const session = await recording.newCDPSession(page);
      await session.send('Emulation.setDefaultBackgroundColorOverride', {
        color: { r: 8, g: 13, b: 20, a: 1 },
      });
      await page.goto(url);
      await page.locator('canvas[data-model]').waitFor();
      await page.waitForTimeout(1500);
      for (const [from, to, duration] of [
        [0, 1, 10500],
        [1, 0, 7500],
      ]) {
        await page.evaluate(
          ({ from, to, duration }) =>
            new Promise((resolve) => {
              const root = document.querySelector('.neural-journey');
              const distance =
                root.offsetHeight -
                root.querySelector('.cinematic-hero').offsetHeight;
              const start = performance.now();
              function frame(now) {
                const t = Math.min(1, (now - start) / duration);
                const eased = t * t * (3 - 2 * t);
                window.scrollTo({
                  top: distance * (from + (to - from) * eased),
                  behavior: 'instant',
                });
                if (t < 1) requestAnimationFrame(frame);
                else resolve();
              }
              requestAnimationFrame(frame);
            }),
          { from, to, duration },
        );
        await page.waitForTimeout(1200);
      }
      const video = page.video();
      await recording.close();
      await video.saveAs(path.join(output, 'brain-to-signal.webm'));
      report.checks.recording =
        'Real browser recording, forward and reverse; not used by the website';
    }
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
