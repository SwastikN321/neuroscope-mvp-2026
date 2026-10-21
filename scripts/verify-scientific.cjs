/* global window, document, CanvasRenderingContext2D */
// Passively records real Canvas draw calls and exercises real browser controls.
// Reference values are produced by the separate stdlib EDF byte decoder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-3d1');
const cases = JSON.parse(
  fs.readFileSync(path.join(output, 'browser-oracles.json')),
);
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const reports = [];
  const uploaded = new Set();
  try {
    for (const testcase of cases) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      let navigations = 0;
      page.on('load', () => {
        navigations++;
      });
      page.on('response', (response) => {
        if (
          response.request().method() === 'POST' &&
          response.url().endsWith('/api/recordings') &&
          response.status() === 201
        ) {
          uploaded.add(response.headers()['location']);
        }
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.addInitScript(() => {
        window.scientificTraces = [];
        const proto = CanvasRenderingContext2D.prototype,
          paths = new WeakMap();
        for (const name of [
          'beginPath',
          'moveTo',
          'lineTo',
          'stroke',
          'clearRect',
        ]) {
          const original = proto[name];
          proto[name] = function (...args) {
            if (this.canvas.closest('.eeg-plot')) {
              if (name === 'clearRect') window.scientificTraces = [];
              if (name === 'beginPath') paths.set(this, []);
              if (name === 'moveTo' || name === 'lineTo')
                paths.get(this)?.push(args);
              if (name === 'stroke' && Math.abs(this.lineWidth - 1.15) < 0.0001)
                window.scientificTraces.push({
                  color: this.strokeStyle,
                  points: paths.get(this) || [],
                });
            }
            return original.apply(this, args);
          };
        }
      });
      const button = (name) => page.getByRole('button', { name, exact: true });
      const field = (name) => page.getByLabel(name, { exact: true });
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      const ready = async () => {
        await plot.waitFor();
        await page.waitForFunction(
          () =>
            !document
              .querySelector('.eeg-plot-note')
              ?.textContent.includes('Updating window'),
        );
        await page.waitForTimeout(200);
        assert.equal(
          await page.locator('.eeg-load-state[role="alert"]').count(),
          0,
        );
      };
      const capture = async (stage) => {
        await ready();
        const snapshot = await plot.evaluate((el) => ({
          width: el.clientWidth,
          height: el.clientHeight,
          start: Number(el.dataset.start),
          end: Number(el.dataset.end),
          ids: el.dataset.channels.split(','),
          traces: window.scientificTraces,
          amplitude: Number(
            document.querySelector('[aria-label="Amplitude range"]').value,
          ),
        }));
        assert.equal(
          snapshot.traces.length,
          snapshot.ids.length,
          'Waveform strokes captured',
        );
        assert.ok(
          snapshot.ids.every((id) => id.startsWith('ch')),
          'EDF session retained',
        );
        fs.writeFileSync(
          path.join(output, `${testcase.case}-${stage}-traces.json`),
          JSON.stringify(snapshot),
        );
      };
      const download = async (name, file) => {
        const event = page.waitForEvent('download');
        await button(name).click();
        const d = await event;
        assert.equal(await d.failure(), null);
        await d.saveAs(path.join(output, file));
      };
      await page.goto('http://127.0.0.1:5173/app');
      await ready();
      const start = Date.now();
      await field('Choose EDF recording').setInputFiles(testcase.file);
      await page
        .getByText('EDF ready', { exact: false })
        .waitFor({ timeout: 60000 });
      await ready();
      const uploadAndViewMs = Date.now() - start;
      const controls = page.getByRole('complementary', {
        name: 'Channel controls',
      });
      assert.equal(
        await controls.getByRole('checkbox').count(),
        testcase.channels.length,
      );
      for (let i = 0; i < testcase.channels.length; i++)
        assert.ok(
          (
            await controls
              .getByRole('checkbox')
              .nth(i)
              .getAttribute('aria-label')
          ).startsWith(testcase.channels[i].label + ' '),
        );
      await button('Deselect all').click();
      const selected = testcase.channels.slice(0, 4);
      for (let i = 0; i < selected.length; i++)
        await controls.getByRole('checkbox').nth(i).check();
      await field('Amplitude range').selectOption('200');
      await capture('initial');
      await button('Zoom in').click();
      await capture('zoom');
      assert.equal(await plot.getAttribute('data-start'), '2.500000');
      await button('Pan later').click();
      await capture('pan');
      assert.equal(await plot.getAttribute('data-start'), '5.000000');
      const inspections = [];
      // Include nonadjacent/last channel, then restore original visibility.
      if (testcase.channels.length > 4)
        await controls.getByRole('checkbox').last().check();
      for (const p of testcase.probes) {
        await field('Inspect channel').selectOption(p.id);
        await field('Inspect time in seconds').fill(String(p.time));
        await field('Inspect time in seconds').press('Tab');
        await ready();
        const expected = `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)} µV`;
        await page.waitForFunction(
          (text) =>
            document.querySelector('[data-testid="amplitude-readout"]')
              ?.textContent === text,
          expected,
        );
        const shown = Number(
          await field('Inspect time in seconds').inputValue(),
        );
        assert.ok(Math.abs(shown - p.time) <= 0.00000051);
        inspections.push({
          ...p,
          displayTime: shown,
          displayAmplitude: await page
            .getByTestId('amplitude-readout')
            .textContent(),
        });
      }
      if (testcase.channels.length > 4)
        await controls.getByRole('checkbox').last().uncheck();
      await button('Reset view').click();
      await ready();
      // Wide views use original extrema; capture all points for independent post-validation.
      while (await button('Zoom out').isEnabled())
        await button('Zoom out').click();
      await capture('wide');
      await button('Reset view').click();
      await ready();
      const navigation = Date.now();
      await field('Recording position').focus();
      await page.keyboard.press('End');
      await capture('end');
      const endNavigationMs = Date.now() - navigation;
      assert.equal(
        Number(await plot.getAttribute('data-end')),
        testcase.duration,
      );
      await page.screenshot({
        path: path.join(output, `${testcase.case}-end.png`),
        fullPage: true,
      });
      await button('Reset view').click();
      await ready();
      const annotate = async (type, label, time, end, channel) => {
        await button(`Add ${type}`).click();
        await field('Annotation channel').selectOption(channel);
        await field('Annotation start seconds').fill(String(time));
        if (end !== undefined)
          await field('Annotation end seconds').fill(String(end));
        await field('Annotation label').fill(label);
        await button('Save in session').click();
        await button(`Edit ${label}`).waitFor();
      };
      await annotate('point', 'Native point', 1.113, undefined, selected[0].id);
      await annotate(
        'interval',
        'Native interval',
        2.237,
        3.413,
        selected[1].id,
      );
      await annotate('point', 'First boundary', 0, undefined, selected[0].id);
      await annotate(
        'interval',
        'Final boundary',
        testcase.duration - 0.1,
        testcase.duration,
        selected[1].id,
      );
      // Edit and delete independently exercised on native real/mixed-rate sources.
      await button('Edit Native interval').click();
      await field('Annotation end seconds').fill('3.517');
      await button('Update annotation').click();
      await annotate('point', 'Delete test', 0.31, undefined, selected[0].id);
      await button('Delete Delete test').click();
      await page.locator('.eeg-export-panel > summary').click();
      await button('Use visible channels for CSV').click();
      await download(
        'Export Visualization (PNG)',
        `${testcase.case}-export.png`,
      );
      await field('CSV interval').selectOption('custom');
      await field('CSV start seconds').fill('.113');
      await field('CSV end seconds').fill('1.237');
      await download('Export EEG Data (CSV)', `${testcase.case}-export.csv`);
      await download(
        'Export Annotations (JSON)',
        `${testcase.case}-export.json`,
      );
      const exported = JSON.parse(
        fs.readFileSync(path.join(output, `${testcase.case}-export.json`)),
      );
      assert.equal(exported.annotations.length, 4);
      for (const a of exported.annotations)
        await button(`Delete ${a.label}`).click();
      await field('Choose annotation JSON').setInputFiles(
        path.join(output, `${testcase.case}-export.json`),
      );
      await button('Confirm import').click();
      for (const a of exported.annotations) {
        const row = page.locator(`[data-annotation-id="${a.id}"]`);
        assert.equal(
          Number(await row.getAttribute('data-start-time')),
          a.startTime,
        );
      }
      await button('Zoom in').click();
      await button('Pan later').click();
      await button('Reset view').click();
      await ready();
      await download(
        'Export Annotations (JSON)',
        `${testcase.case}-restored.json`,
      );
      const restored = JSON.parse(
        fs.readFileSync(path.join(output, `${testcase.case}-restored.json`)),
      );
      assert.deepEqual(restored.annotations, exported.annotations);
      // Validate marker position from independently saved time, not a visual estimate.
      for (const a of exported.annotations.filter((a) => a.startTime < 10)) {
        const marker = page.locator(`[data-annotation-overlay="${a.id}"]`),
          box = await plot.boundingBox(),
          m = await marker.boundingBox();
        assert.ok(
          Math.abs(
            m.x - (box.x + 92 + (a.startTime / 10) * (box.width - 114)),
          ) < 1.1,
        );
      }
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      );
      await page.screenshot({
        path: path.join(output, `${testcase.case}-workspace.png`),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      assert.equal(
        navigations,
        1,
        'Run without concurrent Vite edits/builds: session must not reload',
      );
      reports.push({
        case: testcase.case,
        uploadAndViewMs,
        endNavigationMs,
        inspections,
        canvasStages: ['initial', 'zoom', 'pan', 'wide', 'end'],
        annotationRoundtrip: 'exact',
        status: 'PASS',
      });
      await button('Delete EDF').click();
      await context.close();
      console.log(`${testcase.case}: browser verified`);
    }
  } finally {
    await browser.close();
    for (const location of uploaded) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const response = await fetch(
          `http://127.0.0.1:5173/local-eeg${location}`,
          { method: 'DELETE' },
        );
        if (response.status !== 429) {
          assert.ok(response.ok || response.status === 404);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
  fs.writeFileSync(
    path.join(output, 'browser-report.json'),
    JSON.stringify(reports, null, 2),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
