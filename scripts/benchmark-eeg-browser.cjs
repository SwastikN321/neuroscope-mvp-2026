/* global window, document, requestAnimationFrame */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const results = [];
  try {
    for (const name of ['S001R03', 'six-hour', 'many', 'near-cap']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const errors = [];
      let requests = 0;
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (r) => {
        if (/\/(samples|display|windows)(\?|$)/.test(r.url())) requests++;
      });
      await page.addInitScript(() => {
        window.bench = { tasks: [], frames: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.bench.tasks.push(entry.duration);
        }).observe({ type: 'longtask', buffered: true });
        let previous;
        const frame = (time) => {
          if (previous !== undefined) window.bench.frames.push(time - previous);
          previous = time;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await page.goto('http://127.0.0.1:5173/app');
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await plot.waitFor();
      const ready = async () => {
        await plot.waitFor({ timeout: 120000 });
        await page.waitForFunction(
          () =>
            !document
              .querySelector('.eeg-plot-note')
              ?.textContent.includes('Updating window'),
          { timeout: 120000 },
        );
        await page.waitForTimeout(200);
      };
      const start = Date.now();
      const dialog = page.waitForEvent('filechooser');
      await page
        .getByRole('button', { name: 'Upload Recording', exact: true })
        .click();
      await (await dialog).setFiles(path.resolve(`work/phase-3b3/${name}.edf`));
      await page
        .getByText('EDF ready', { exact: false })
        .waitFor({ timeout: 120000 });
      const uploadMs = Date.now() - start;
      await ready();
      const firstViewMs = Date.now() - start;
      const initialRequests = requests;
      let t = Date.now();
      await page
        .getByRole('button', { name: 'Select all', exact: true })
        .click();
      await ready();
      const selectAllMs = Date.now() - t;
      const channels = await page
        .getByRole('checkbox', { checked: true })
        .count();
      const beforeWide = requests;
      t = Date.now();
      while (
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .isEnabled()
      )
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .click();
      await ready();
      const wideMs = Date.now() - t;
      const wideRequests = requests - beforeWide;
      const points = Number(await plot.getAttribute('data-rendered-points'));
      await page.getByRole('button', { name: 'Reset view' }).click();
      await ready();
      const times = [];
      for (let i = 0; i < 3; i++) {
        t = Date.now();
        await page.getByRole('button', { name: 'Pan later' }).click();
        await ready();
        times.push(Date.now() - t);
      }
      await page.getByLabel('Recording position').evaluate((input) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        setter.call(input, input.max);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await ready();
      const finalEnd = Number(await plot.getAttribute('data-end'));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const metrics = await cdp.send('Performance.getMetrics');
      const runtime = await page.evaluate(() => {
        const canv = document.querySelector('.eeg-plot canvas');
        const frames = window.bench.frames.sort((a, b) => a - b);
        return {
          longTasks: window.bench.tasks.length,
          maxTaskMs: Math.max(0, ...window.bench.tasks),
          frameP95Ms: frames[Math.floor(frames.length * 0.95)],
          canvasMiB: (canv.width * canv.height * 4) / 1048576,
        };
      });
      assert.deepEqual(errors, []);
      results.push({
        case: name,
        uploadMs,
        firstViewMs,
        initialRequests,
        channels,
        selectAllMs,
        wideMs,
        wideRequests,
        points,
        panMs: times,
        finalEnd,
        ...runtime,
        jsHeapMiB:
          metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value /
          1048576,
      });
      console.log(JSON.stringify(results.at(-1)));
      await page
        .getByRole('button', { name: 'Delete EDF', exact: true })
        .click();
      await page.getByText('EDF recording deleted', { exact: false }).waitFor();
      await context.close();
    }
    fs.writeFileSync(
      process.argv[2],
      JSON.stringify(
        { browser: browser.version(), deviceScaleFactor: 2, results },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
