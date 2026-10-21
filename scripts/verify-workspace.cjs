/* global document, window -- browser callbacks */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-3a');
const url = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), viewports: [] };
  try {
    for (const [width, height] of [
      [1440, 1000],
      [1180, 900],
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
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      await page.waitForURL('**/app');
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await plot.waitFor();
      await page.waitForTimeout(400);
      assert.equal(
        (await plot.getAttribute('data-channels')).split(',').length,
        12,
      );
      assert.equal(await page.locator('canvas[data-model]').count(), 0);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      await page.screenshot({
        path: path.join(output, `${width}x${height}-workspace.png`),
        fullPage: true,
      });
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
      assert.equal(await plot.getAttribute('data-end'), '7.500000');
      await page.getByRole('button', { name: 'Pan later' }).click();
      assert.equal(await plot.getAttribute('data-start'), '5.000000');
      await plot.scrollIntoViewIfNeeded();
      const box = await plot.boundingBox();
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, {
        steps: 12,
      });
      await page.mouse.up();
      assert(
        Number(await plot.getAttribute('data-start')) > 5,
        'Drag panning must change the view',
      );
      const timeline = page.locator('.eeg-timeline-track');
      await timeline.scrollIntoViewIfNeeded();
      const tb = await timeline.boundingBox();
      await page.mouse.click(tb.x + tb.width * 0.65, tb.y + tb.height / 2);
      assert(
        Number(await plot.getAttribute('data-start')) > 60,
        'Overview click must navigate',
      );
      await page.getByRole('button', { name: 'Reset view' }).click();
      assert.equal(await plot.getAttribute('data-start'), '0.000000');
      assert.equal(await plot.getAttribute('data-end'), '10.000000');
      await page
        .getByLabel('Inspect channel', { exact: true })
        .selectOption('C3');
      await page.getByLabel('Inspect time in seconds').fill('1.25');
      const expected = await page.evaluate(async () => {
        const { createSyntheticSource } =
          await import('/src/features/eeg/synthetic.ts');
        return (await createSyntheticSource().readWindow(320, 321, ['C3']))
          .channels.C3[0];
      });
      await page.waitForTimeout(150);
      assert.equal(
        await page.getByTestId('amplitude-readout').textContent(),
        `${expected >= 0 ? '+' : ''}${expected.toFixed(2)} µV`,
      );
      await page
        .getByLabel('Amplitude range', { exact: true })
        .selectOption('100');
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      );
      const skipBox = await page.locator('.skip-link').boundingBox();
      assert(
        skipBox.y + skipBox.height < 0,
        'Unfocused skip link stays offscreen',
      );
      await page.screenshot({
        path: path.join(output, `${width}x${height}-inspection.png`),
        fullPage: true,
      });
      await plot.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await plot.getAttribute('data-start'), '2.500000');
      await page.keyboard.press('Home');
      assert.equal(await plot.getAttribute('data-start'), '0.000000');
      await page.keyboard.press('Shift+ArrowRight');
      assert.equal(
        Number(await page.getByLabel('Inspect time in seconds').inputValue()),
        0.003906,
      );
      const start = Date.now();
      for (let i = 0; i < 4; i++)
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .click();
      await page.waitForTimeout(200);
      assert.equal(
        Number(await plot.getAttribute('data-end')) -
          Number(await plot.getAttribute('data-start')),
        120,
      );
      const drawn = Number(await plot.getAttribute('data-rendered-points'));
      assert(
        drawn <= 24 * box.width,
        'Display point count must be bounded by viewport pixels',
      );
      assert(
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .isDisabled(),
      );
      assert(
        await page.getByRole('button', { name: 'Pan later' }).isDisabled(),
      );
      await page.getByRole('button', { name: 'Reset view' }).click();
      await page.getByRole('link', { name: 'Back to homepage' }).click();
      await page
        .getByRole('heading', { name: 'See beyond the signal.' })
        .waitFor();
      assert.deepEqual(errors, []);
      report.viewports.push({
        width,
        height,
        drawnFullRecording: drawn,
        zoomSequenceMs: Date.now() - start,
        checks: [
          'fresh homepage CTA to workspace',
          '12 channels',
          'individual/all/no channels',
          'zoom and pan',
          'pointer drag',
          'overview navigation',
          'reset',
          'original sample amplitude',
          'keyboard navigation and sample inspection',
          'full-recording point budget',
          'no overflow or console errors',
          'return home',
        ],
      });
      await context.close();
      console.log(`${width}x${height} passed`);
    }
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const modelRequests = [];
    page.on('request', (r) => {
      if (r.url().endsWith('.glb')) modelRequests.push(r.url());
    });
    await page.goto(url + '/app');
    await page
      .getByRole('group', { name: 'Interactive EEG waveform viewer' })
      .waitFor();
    assert.deepEqual(modelRequests, []);
    report.directRoute =
      'Direct /app entry with reduced motion works; no GLB requested';
    await page.close();
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
