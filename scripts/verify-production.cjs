/* global window, document, getComputedStyle -- browser callbacks */
// Run against npm run preview, not the Vite development server. No source imports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const url = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:4173';
const output = path.resolve('work/deployment');
async function progress(page, value) {
  await page.evaluate((p) => {
    const root = document.querySelector('.neural-journey');
    window.scrollTo({
      top:
        root.offsetTop +
        (root.offsetHeight -
          root.querySelector('.cinematic-hero').offsetHeight) *
          p,
      behavior: 'instant',
    });
  }, value);
  await page.waitForTimeout(900);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), origin: url, viewports: [] };
  try {
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const errors = [],
        requests = [],
        failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('request', (r) => requests.push(r.url()));
      page.on('response', (r) => {
        if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
      });
      const response = await page.goto(url);
      const html = await response.text();
      assert(
        !html.includes('/src/main.tsx') && !html.includes('@vite/client'),
        'Must test production HTML',
      );
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
        'rgb(8, 13, 20)',
      );
      const canvas = page.locator('canvas[data-model]');
      await canvas.waitFor();
      await page.waitForTimeout(700);
      const initialModel = await canvas.getAttribute('data-model');
      assert.equal(
        initialModel,
        `/models/cortex-${width === 390 ? 'compact' : 'full'}.glb`,
      );
      assert.equal(await canvas.getAttribute('data-hemispheres'), '2');
      for (const attr of ['rotation', 'draw-calls', 'frame-ms', 'geometries'])
        assert.equal(await canvas.getAttribute(`data-${attr}`), null);
      await page
        .getByRole('button', { name: 'Activate signal', exact: true })
        .click();
      assert.equal(
        await page
          .getByRole('button', { name: 'Quiet signal' })
          .getAttribute('aria-pressed'),
        'true',
      );
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(output, `${width}-home.png`) });
      await page.getByRole('button', { name: 'Quiet signal' }).click();
      for (const value of [0.26, 0.5, 1, 0.5, 0]) {
        await progress(page, value);
        assert(
          Math.abs(Number(await canvas.getAttribute('data-journey')) - value) <
            0.003,
        );
        if (value === 1) {
          assert.equal(await canvas.getAttribute('data-waveform'), '1.0000');
          assert.equal(
            await page.locator('.signal-content').evaluate((el) => el.inert),
            false,
          );
        }
        if (value === 0.5)
          await page.screenshot({
            path: path.join(output, `${width}-field.png`),
          });
      }
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await plot.waitFor();
      assert.equal(
        (await plot.getAttribute('data-channels')).split(',').length,
        12,
      );
      await page.getByRole('checkbox', { name: 'Fp1 Frontopolar' }).uncheck();
      assert(
        !(await plot.getAttribute('data-channels')).split(',').includes('Fp1'),
      );
      await page.getByRole('button', { name: 'Deselect all' }).click();
      await page.getByText('No channels selected', { exact: true }).waitFor();
      await page
        .getByRole('button', { name: 'Select all', exact: true })
        .click();
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      assert.equal(await plot.getAttribute('data-start'), '2.500000');
      await page.getByRole('button', { name: 'Pan later' }).click();
      assert.equal(await plot.getAttribute('data-start'), '5.000000');
      await page.getByRole('button', { name: 'Reset view' }).click();
      await page
        .getByLabel('Inspect channel', { exact: true })
        .selectOption('C3');
      await page.getByLabel('Inspect time in seconds').fill('1.25');
      assert.equal(
        await page.getByTestId('amplitude-readout').textContent(),
        '+4.08 µV',
      );
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      );
      await page.screenshot({
        path: path.join(output, `${width}-workspace.png`),
        fullPage: true,
      });
      await page.reload();
      await plot.waitFor();
      assert.equal(await plot.getAttribute('data-start'), '0.000000');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      assert(
        requests.some((r) => r.endsWith('.woff2')),
        'Local fonts loaded',
      );
      assert(
        !requests.some((r) => /\/src\/|@vite\/|@react-refresh/.test(r)),
        'No development requests',
      );
      assert(
        requests.every(
          (r) =>
            r.startsWith(url + '/') ||
            r.startsWith('data:') ||
            r.startsWith('blob:'),
        ),
        'No remote service requests',
      );
      assert.deepEqual(failed, []);
      assert.deepEqual(errors, []);
      report.viewports.push({
        width,
        height,
        model: initialModel,
        checks: [
          'production assets',
          'electrical interaction',
          'forward and reverse scroll',
          'homepage CTA',
          'channel visibility',
          'zoom/pan/reset',
          'sample readout',
          '/app refresh',
          'local fonts',
          'no development diagnostics',
          'no external requests or errors',
        ],
      });
      await context.close();
      console.log(`${width}: production flow passed`);
    }
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const models = [];
    page.on('request', (r) => {
      if (r.url().endsWith('.glb')) models.push(r.url());
    });
    for (const route of ['/app', '/app/']) {
      assert.equal((await page.goto(url + route)).status(), 200);
      await page.getByRole('heading', { name: /Signal explorer/ }).waitFor();
      await page.reload();
      await page
        .getByRole('group', { name: 'Interactive EEG waveform viewer' })
        .waitFor();
    }
    await page.goto(url);
    await page
      .getByRole('link', { name: 'Try NeuroScope', exact: true })
      .waitFor();
    await page.locator('.signal-still').waitFor();
    assert.deepEqual(models, []);
    for (const asset of [
      '/models/cortex-full.glb',
      '/models/cortex-compact.glb',
      '/models/ATTRIBUTION.md',
      '/THIRD-PARTY-NOTICES.txt',
    ]) {
      const response = await page.request.get(url + asset);
      assert.equal(response.status(), 200);
      if (asset.endsWith('.glb'))
        assert.equal((await response.body()).subarray(0, 4).toString(), 'glTF');
      else assert(!(await response.text()).includes('<!doctype html>'));
    }
    report.additional = [
      'fresh /app and /app/ plus refresh',
      'reduced-motion fallback without GLB',
      'binary GLB responses and accessible notices',
    ];
    fs.writeFileSync(
      path.join(output, 'production-report.json'),
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
