/* global document, window -- browser callbacks */
// Run against real Vite + FastAPI. No API mocking in this verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const url = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';
const output = path.resolve('work/phase-3b2');
const expected = JSON.parse(
  fs.readFileSync(path.join(output, 'expected.json')),
);
const publicFile = path.resolve('work/backend/S001R01.edf');
const fixture = path.resolve('work/backend/known.edf');
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), checks: [] };
  try {
    for (const width of process.argv.includes('--offline')
      ? [1440]
      : [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        deviceScaleFactor: 1,
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (r.url().includes('/local-eeg'))
          requests.push({ url: r.url(), method: r.method() });
      });
      await page.goto(url);
      await page
        .getByRole('link', { name: 'Explore NeuroScope', exact: true })
        .click();
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await plot.waitFor();
      async function choose(file) {
        const dialog = page.waitForEvent('filechooser');
        await page
          .getByRole('button', { name: 'Upload Recording', exact: true })
          .click();
        await (await dialog).setFiles(file);
      }
      async function settled() {
        await plot.waitFor();
        await page.waitForFunction(
          () =>
            !document
              .querySelector('.eeg-plot-note')
              ?.textContent.includes('Updating window'),
        );
        await page.waitForTimeout(150);
        assert.equal(
          await page.locator('.eeg-load-state[role="alert"]').count(),
          0,
        );
      }
      if (process.argv.includes('--offline')) {
        await choose(publicFile);
        await page
          .getByRole('alert')
          .filter({ hasText: 'Local EEG backend unavailable' })
          .waitFor();
        assert((await plot.getAttribute('data-channels')).includes('Fp1'));
        await page
          .getByRole('button', { name: 'Zoom in', exact: true })
          .click();
        assert.equal(await plot.getAttribute('data-start'), '2.500000');
        await page.screenshot({
          path: path.join(output, 'offline.png'),
          fullPage: true,
        });
        report.checks.push(
          'Actual stopped backend: clear error; synthetic viewer and zoom remain usable.',
        );
        await context.close();
        continue;
      }
      const uploadResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/recordings') &&
          r.request().method() === 'POST',
      );
      await choose(publicFile);
      const upload = await uploadResponse;
      const readUpload = async (response) => {
        assert.equal(response.status(), 201);
        const location = response.headers()['location'];
        assert(location.startsWith('/api/recordings/'));
        // Chrome may evict no-store XHR bodies. Read the real metadata resource.
        for (let attempt = 0; attempt < 10; attempt++) {
          const metadata = await context.request.get(
            `${url}/local-eeg${location}`,
          );
          if (metadata.status() === 429) {
            await page.waitForTimeout(200);
            continue;
          }
          assert.equal(metadata.status(), 200);
          return metadata.json();
        }
        throw new Error('Backend remained busy');
      };
      const metadata = await readUpload(upload);
      assert.equal(upload.status(), 201);
      assert.equal(
        upload.request().headers()['content-type'],
        'application/octet-stream',
      );
      assert.equal(
        Number((await upload.request().allHeaders())['content-length']),
        fs.statSync(publicFile).size,
      );
      assert.equal(metadata.duration_seconds, 61);
      assert.equal(metadata.eeg_channel_count, 64);
      assert(metadata.channels.every((c) => c.sampling_frequency_hz === 160));
      await page.getByText('EDF ready', { exact: false }).waitFor();
      await settled();
      assert.equal(await page.getByRole('checkbox').count(), 64);
      assert.equal(
        await page
          .getByRole('checkbox', { name: 'Fc5. 160 Hz', exact: true })
          .count(),
        1,
      );
      async function inspect(name, data) {
        const option = page
          .getByLabel('Inspect channel')
          .getByRole('option', { name, exact: true });
        const id = await option.getAttribute('value');
        await page.getByLabel('Inspect channel').selectOption(id);
        await page
          .getByLabel('Inspect time in seconds')
          .fill(String(data.time));
        await page.getByLabel('Inspect time in seconds').press('Tab');
        const text = `${data.value >= 0 ? '+' : ''}${data.value.toFixed(2)} µV`;
        await page.waitForFunction(
          (value) =>
            document.querySelector('[data-testid="amplitude-readout"]')
              ?.textContent === value,
          text,
        );
        assert.equal(
          Number(await page.getByLabel('Inspect time in seconds').inputValue()),
          data.time,
        );
      }
      await inspect('Fc5.', expected['S001R01.edf']['Fc5.']);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await settled();
      assert.equal(await plot.getAttribute('data-start'), '2.500000');
      await page.getByRole('button', { name: 'Pan later' }).click();
      await settled();
      assert.equal(await plot.getAttribute('data-start'), '5.000000');
      assert(
        requests.some(
          (r) =>
            r.url.includes('/samples?') && r.url.includes('start_seconds=5.'),
        ),
      );
      await page.getByLabel('Recording position').evaluate((input) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        setter.call(input, '40');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settled();
      assert.equal(await plot.getAttribute('data-start'), '40.000000');
      await page.getByRole('button', { name: 'Reset view' }).click();
      await settled();
      for (let i = 0; i < 3; i++) {
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .click();
        await settled();
      }
      assert.equal(await plot.getAttribute('data-end'), '61.000000');
      await page
        .getByText('Peak-preserving display envelope.', { exact: false })
        .waitFor();
      await inspect('Fc5.', expected['S001R01.edf']['Fc5.']);
      assert(
        requests
          .filter((r) => r.url.includes('/samples?'))
          .every((r) => {
            const q = new URL(r.url).searchParams;
            return (
              Number(q.get('end_seconds')) - Number(q.get('start_seconds')) <=
              30
            );
          }),
      );
      await page.getByRole('button', { name: 'Reset view' }).click();
      await settled();
      await page
        .getByRole('checkbox', { name: 'Fc5. 160 Hz', exact: true })
        .uncheck();
      await settled();
      assert(
        !(await plot.getAttribute('data-channels'))
          .split(',')
          .includes('ch000'),
      );
      await page
        .getByRole('checkbox', { name: 'Fc5. 160 Hz', exact: true })
        .check();
      await settled();
      await inspect('Fc5.', expected['S001R01.edf']['Fc5.']);
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      await page.screenshot({
        path: path.join(output, `edf-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Select all', exact: true })
        .click();
      await settled();
      assert.equal(
        (await plot.getAttribute('data-channels')).split(',').length,
        64,
      );
      await page
        .getByRole('button', { name: 'Deselect all', exact: true })
        .click();
      await settled();
      await page.getByText('No channels selected', { exact: true }).waitFor();
      await page
        .getByRole('checkbox', { name: 'Fc5. 160 Hz', exact: true })
        .check();
      await settled();
      // Rapid changes must settle on the final viewport, never an older response.
      for (let i = 0; i < 5; i++)
        await page.getByRole('button', { name: 'Pan later' }).click();
      await settled();
      assert.equal(await plot.getAttribute('data-start'), '25.000000');
      await page.getByRole('button', { name: 'Use synthetic demo' }).click();
      await settled();
      assert((await plot.getAttribute('data-channels')).includes('Fp1'));
      await page.getByRole('button', { name: 'Return to EDF' }).click();
      await settled();
      const replacementResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/recordings') &&
          r.request().method() === 'POST',
      );
      await choose(fixture);
      const replacement = await readUpload(await replacementResponse);
      await page.getByText('EDF ready', { exact: false }).waitFor();
      await settled();
      assert.equal(
        (
          await context.request.get(
            `${url}/local-eeg/api/recordings/${metadata.id}`,
          )
        ).status(),
        404,
      );
      assert.equal(await page.getByRole('checkbox').count(), 3);
      for (const [name, data] of Object.entries(expected['known.edf']))
        await inspect(name, data);
      await page
        .getByRole('button', { name: 'Delete EDF', exact: true })
        .click();
      await page.getByText('EDF recording deleted', { exact: false }).waitFor();
      await settled();
      assert.equal(
        (
          await context.request.get(
            `${url}/local-eeg/api/recordings/${replacement.id}`,
          )
        ).status(),
        404,
      );
      await choose({
        name: 'invalid.edf',
        mimeType: 'application/octet-stream',
        buffer: Buffer.alloc(512, 65),
      });
      await page
        .getByRole('alert')
        .filter({ hasText: 'Invalid or corrupted EDF' })
        .waitFor();
      assert((await plot.getAttribute('data-channels')).includes('Fp1'));
      // Missing-recording handling uses a real backend deletion, not a mocked 404.
      const expiryResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/recordings') &&
          r.request().method() === 'POST',
      );
      await choose(fixture);
      const expiry = await readUpload(await expiryResponse);
      await page.getByText('EDF ready', { exact: false }).waitFor();
      await settled();
      assert.equal(
        (
          await context.request.delete(
            `${url}/local-eeg/api/recordings/${expiry.id}`,
          )
        ).status(),
        204,
      );
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'expired or was deleted' })
        .waitFor();
      await settled();
      assert((await plot.getAttribute('data-channels')).includes('Fp1'));
      assert.deepEqual(errors, []);
      report.checks.push({
        width,
        publicRecording: 'PhysioNet eegmmidb/1.0.0/S001/S001R01.edf',
        rawBytes: fs.statSync(publicFile).size,
        channels: 64,
        rate: 160,
        duration: 61,
        mixedRates: [128, 64, 128],
        amplitudeOracle: 'independent single-channel MNE reads',
        apiRequests: requests.length,
        pass: true,
      });
      await context.close();
    }
    fs.writeFileSync(
      path.join(
        output,
        process.argv.includes('--offline')
          ? 'offline-report.json'
          : 'browser-report.json',
      ),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
