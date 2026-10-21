/* global window, document, requestAnimationFrame */
// Phase 3D.2: actual UI, real backend, and measured local timings. No injected app state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const origin = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';
const output = path.resolve('work/phase-3d2');
const report = {
  conditions:
    'Local development build, fresh Chrome contexts, no CPU/network throttling; emulated devices',
  layouts: [],
  performance: {},
};
const button = (p, n) => p.getByRole('button', { name: n, exact: true });
async function settled(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('.eeg-plot') &&
      !document
        .querySelector('.eeg-plot-note')
        ?.textContent.includes('Updating window'),
  );
  await page.waitForTimeout(50);
}
async function scroll(page, y) {
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: 'instant' }),
    y,
  );
  await page.waitForTimeout(300);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  report.browser = browser.version();
  try {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1024, 768],
      [768, 1024],
      [390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width <= 768,
        hasTouch: width <= 768,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const start = performance.now();
      await page.goto(origin);
      await page.locator('canvas[data-model]').waitFor();
      await page.locator('.cinematic-hero--ready').waitFor();
      const readyMs = performance.now() - start;
      await page.waitForTimeout(1100);
      const hero = await page.evaluate(() => {
        const rect = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          copy: rect('.cinematic-content'),
          activity: rect('.hero-activity'),
          title: rect('.cinematic-title h1'),
          stage: rect('.neural-stage'),
        };
      });
      await page.screenshot({ path: path.join(output, `${width}-hero.png`) });
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const deltas = [];
            let previous;
            const begin = performance.now();
            function frame(now) {
              if (previous) deltas.push(now - previous);
              previous = now;
              if (now - begin < 1500) requestAnimationFrame(frame);
              else resolve(deltas);
            }
            requestAnimationFrame(frame);
          }),
      );
      const sorted = frames.toSorted((a, b) => a - b);
      for (const p of [0.5, 1]) {
        const distance = await page
          .locator('.neural-journey')
          .evaluate(
            (el) =>
              el.offsetHeight -
              el.querySelector('.cinematic-hero').offsetHeight,
          );
        await scroll(page, distance * p);
        await page.waitForTimeout(600);
        await page.screenshot({
          path: path.join(output, `${width}-journey-${p}.png`),
        });
      }
      const productTop = await page
        .locator('#product')
        .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      await scroll(page, productTop - 350);
      await page.screenshot({
        path: path.join(output, `${width}-handoff.png`),
      });
      for (const id of [
        'product',
        'capabilities',
        'how-it-works',
        'use-cases',
        'scientific-integrity',
        'documentation',
      ]) {
        await page.locator('#' + id).scrollIntoViewIfNeeded();
        await page
          .locator('#' + id + ' img')
          .evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          ),
          false,
        );
      }
      await scroll(page, 0);
      await page.waitForTimeout(600);
      assert.equal(
        await page.locator('.neural-journey').getAttribute('data-chapter'),
        'sculpture',
      );
      const open = performance.now();
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      await settled(page);
      const workspaceMs = performance.now() - open;
      await page.screenshot({
        path: path.join(output, `${width}-workspace.png`),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      report.layouts.push({
        width,
        height,
        hero,
        homeReadyMs: readyMs,
        workspaceMs,
        frameIntervalMedianMs: sorted[Math.floor(sorted.length / 2)],
        frameIntervalP95Ms: sorted[Math.floor(sorted.length * 0.95)],
        frameCount: frames.length,
        errors,
      });
      await context.close();
      console.log(`${width}: responsive journey captured`);
    }
    // Backend performance, rapid request replacement and explicit read-failure recovery.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(origin + '/app');
    await settled(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics
          .filter((m) =>
            [
              'JSHeapUsedSize',
              'JSHeapTotalSize',
              'Nodes',
              'Documents',
            ].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      );
    report.performance.beforeEDF = await heap();
    const backendPid = execFileSync(
      'lsof',
      ['-t', '-iTCP:8000', '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    ).trim();
    const rss = () =>
      Number(
        execFileSync('ps', ['-o', 'rss=', '-p', backendPid], {
          encoding: 'utf8',
        }).trim(),
      );
    report.performance.backendIdleRSSKiB = rss();
    let peak = rss();
    const monitor = setInterval(() => {
      peak = Math.max(peak, rss());
    }, 100);
    try {
      const started = performance.now();
      await page
        .getByLabel('Choose EDF recording', { exact: true })
        .setInputFiles(path.resolve('work/backend/S001R01.edf'));
      await page.getByText('EDF ready', { exact: false }).waitFor();
      await settled(page);
      report.performance.uploadAndFirstWindowMs = performance.now() - started;
      report.performance.afterEDF = await heap();
      const timings = [];
      for (let i = 0; i < 8; i++) {
        const t = performance.now();
        await button(page, i % 2 ? 'Pan earlier' : 'Pan later').click();
        await settled(page);
        timings.push(performance.now() - t);
      }
      report.performance.navigationMs = timings;
      // Rapid actions intentionally overlap outstanding remote reads, then settle on a known state.
      for (let i = 0; i < 6; i++) {
        await button(page, 'Zoom in').click();
        await button(page, 'Pan later').click();
        await button(page, 'Zoom out').click();
      }
      const controls = page.getByRole('complementary', {
        name: 'Channel controls',
      });
      await controls
        .getByRole('button', { name: 'Deselect all', exact: true })
        .click();
      for (let i = 0; i < 8; i++)
        await controls.getByRole('checkbox').nth(i).check();
      for (let i = 0; i < 7; i++)
        await controls.getByRole('checkbox').nth(i).uncheck();
      await button(page, 'Reset view').click();
      await settled(page);
      assert.equal(
        await page.locator('.eeg-plot').getAttribute('data-channels'),
        'ch007',
      );
      assert.equal(
        await page.locator('.eeg-plot').getAttribute('data-start'),
        '0.000000',
      );
      await page
        .getByLabel('Inspect time in seconds', { exact: true })
        .fill('1.25');
      await page
        .getByLabel('Inspect time in seconds', { exact: true })
        .press('Tab');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="amplitude-readout"]')
            ?.textContent.includes('µV') &&
          !document
            .querySelector('[data-testid="amplitude-readout"]')
            ?.textContent.includes('—'),
      );
      report.performance.finalProbe = await page
        .getByTestId('amplitude-readout')
        .textContent();
      report.performance.afterRapidNavigation = await heap();
      await page.screenshot({
        path: path.join(output, 'real-edf-rapid-navigation.png'),
        fullPage: true,
      });
      await page.locator('.eeg-export-panel > summary').click();
      await button(page, 'Use visible channels for CSV').click();
      const exports = [];
      for (const [label, ext] of [
        ['Export Visualization (PNG)', 'png'],
        ['Export EEG Data (CSV)', 'csv'],
      ]) {
        const t = performance.now(),
          event = page.waitForEvent('download');
        await button(page, label).click();
        const file = await event;
        await file.saveAs(path.join(output, `performance-export.${ext}`));
        exports.push({
          kind: ext,
          ms: performance.now() - t,
          bytes: fs.statSync(path.join(output, `performance-export.${ext}`))
            .size,
        });
      }
      report.performance.exports = exports;
      await button(page, 'Delete EDF').click();
      await page.getByText('Synthetic EEG', { exact: true }).waitFor();
    } finally {
      clearInterval(monitor);
      report.performance.backendPeakSampledRSSKiB = peak;
    }
    await context.close();
    for (const [width, height] of [
      [1024, 768],
      [768, 1024],
      [390, 844],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: 'reduce',
      });
      await page.goto(origin);
      await page
        .getByAltText('Still view of the anatomical cerebral cortex')
        .waitFor();
      await page.screenshot({
        path: path.join(output, `${width}-reduced-motion.png`),
      });
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      await settled(page);
      await page.close();
    }
    fs.writeFileSync(
      path.join(output, 'product-browser.json'),
      JSON.stringify(report, null, 2),
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
