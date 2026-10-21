/* global window, document */
// End-to-end public/synthetic downloads. No injected application state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-3c2');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), runs: [] };
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        isMobile: width === 390,
        hasTouch: width === 390,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      const button = (name) => page.getByRole('button', { name, exact: true });
      const field = (name) => page.getByLabel(name, { exact: true });
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await page.goto('http://127.0.0.1:5173/');
      await page
        .getByRole('link', { name: 'Explore NeuroScope', exact: true })
        .click();
      await plot.waitFor();
      const download = async (name, filename) => {
        const event = page.waitForEvent('download');
        await button(name).click();
        const file = await event;
        assert.equal(await file.failure(), null);
        assert.match(file.suggestedFilename(), /^neuroscope-/);
        await file.saveAs(path.join(output, filename));
        assert.ok(fs.statSync(path.join(output, filename)).size > 0);
      };
      const annotate = async (type, label, start, end, channel) => {
        await button(`Add ${type}`).click();
        await field('Annotation channel').selectOption(channel);
        await field('Annotation start seconds').fill(String(start));
        if (end !== undefined)
          await field('Annotation end seconds').fill(String(end));
        await field('Annotation label').fill(label);
        await field('Annotation notes').fill(
          'Timing observation for export verification. No diagnostic interpretation.',
        );
        await button('Save in session').click();
        await button(`Edit ${label}`).waitFor();
      };
      const selectChannels = async () => {
        const controls = page.getByRole('complementary', {
          name: 'Channel controls',
        });
        await controls
          .getByRole('button', { name: 'Deselect all', exact: true })
          .click();
        for (let i = 0; i < 4; i++)
          await controls.getByRole('checkbox').nth(i).check();
      };
      const openExport = async () => {
        await page.locator('.eeg-export-panel > summary').click();
        await button('Use visible channels for CSV').click();
        await button('Export Visualization (PNG)').waitFor();
      };
      const capture = async (filename) => {
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        );
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: true,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
          'no horizontal page overflow',
        );
      };
      const roundtrip = async (filename, original) => {
        for (const a of original.annotations)
          await button(`Delete ${a.label}`).click();
        assert.equal(await page.locator('[data-annotation-id]').count(), 0);
        await field('Choose annotation JSON').setInputFiles(
          path.join(output, filename),
        );
        await page
          .getByRole('region', { name: 'Annotation import review' })
          .waitFor();
        await button('Cancel import').click();
        assert.equal(await page.locator('[data-annotation-id]').count(), 0);
        await field('Choose annotation JSON').setInputFiles(
          path.join(output, filename),
        );
        await button('Confirm import').click();
        for (const a of original.annotations) {
          const item = page.locator(`[data-annotation-id="${a.id}"]`);
          await item.waitFor();
          assert.equal(
            Number(await item.getAttribute('data-start-time')),
            a.startTime,
          );
          if (a.endTime !== undefined)
            assert.equal(
              Number(await item.getAttribute('data-end-time')),
              a.endTime,
            );
          assert.equal(
            await item.getAttribute('data-channel-id'),
            a.channelId || '',
          );
        }
        // Export again and compare every semantic field, including anchors/timestamps.
        await download('Export Annotations (JSON)', `restored-${filename}`);
        const restored = JSON.parse(
          fs.readFileSync(path.join(output, `restored-${filename}`)),
        );
        const sorted = (xs) => xs.sort((a, b) => a.id.localeCompare(b.id));
        assert.deepEqual(
          sorted(restored.annotations),
          sorted(original.annotations),
        );
      };
      for (const kind of ['synthetic', 'edf']) {
        if (kind === 'edf') {
          await field('Choose EDF recording').setInputFiles(
            path.resolve('work/backend/S001R01.edf'),
          );
          await page
            .getByText(
              'EDF ready · original measurements in µV · stored temporarily on this computer.',
              { exact: true },
            )
            .waitFor();
        }
        await selectChannels();
        await button('Zoom in').click();
        const channel = kind === 'synthetic' ? 'Fp1' : 'ch000';
        await annotate('point', 'Export point', 3.113, undefined, channel);
        await annotate('interval', 'Export interval', 4.237, 5.413, channel);
        await annotate(
          'point',
          'Outside viewport',
          kind === 'synthetic' ? 119.99 : 60.99,
          undefined,
          '',
        );
        await openExport();
        const prefix = `${width}-${kind}`;
        await download('Export Visualization (PNG)', `${prefix}.png`);
        await field('CSV interval').selectOption('custom');
        await field('CSV start seconds').fill('.113');
        await field('CSV end seconds').fill('1.237');
        await download('Export EEG Data (CSV)', `${prefix}.csv`);
        await download('Export Annotations (JSON)', `${prefix}.json`);
        const json = JSON.parse(
          fs.readFileSync(path.join(output, `${prefix}.json`)),
        );
        assert.equal(json.annotations.length, 3);
        assert.equal(json.recording.source, kind);
        const csv = fs.readFileSync(path.join(output, `${prefix}.csv`), 'utf8');
        assert.ok(
          csv.startsWith(
            'channel_id,channel_name,sample_index,time_seconds,amplitude_uv',
          ),
        );
        assert.ok(!csv.includes('NaN'));
        await roundtrip(`${prefix}.json`, json);
        await capture(`${prefix}-workspace.png`);
        await page.locator('.eeg-export-panel').screenshot({
          path: path.join(output, `${prefix}-export-panel.png`),
        });
        // Test compatibility guard with no fingerprint, then a known wrong fingerprint.
        const unverified = structuredClone(json);
        delete unverified.recording.identity;
        const unknownPath = path.join(output, `${prefix}-unverified.json`);
        fs.writeFileSync(unknownPath, JSON.stringify(unverified));
        await field('Choose annotation JSON').setInputFiles(unknownPath);
        await button('Confirm import').waitFor();
        assert.equal(await button('Confirm import').isDisabled(), true);
        await page
          .getByRole('checkbox', { name: /I confirm this is the correct/ })
          .check();
        assert.equal(await button('Confirm import').isEnabled(), true);
        await button('Cancel import').click();
        if (kind === 'edf') {
          const wrong = structuredClone(json);
          wrong.recording.identity.value = '0'.repeat(64);
          const wrongPath = path.join(output, `${prefix}-wrong.json`);
          fs.writeFileSync(wrongPath, JSON.stringify(wrong));
          await field('Choose annotation JSON').setInputFiles(wrongPath);
          await page
            .getByText(/Recording mismatch: the source fingerprint differs/)
            .waitFor();
          assert.equal(await button('Confirm import').count(), 0);
        }
        report.runs.push({
          width,
          kind,
          range: {
            start: Number(await plot.getAttribute('data-start')),
            end: Number(await plot.getAttribute('data-end')),
          },
          annotations: 3,
          png: `${prefix}.png`,
          csv: `${prefix}.csv`,
          json: `${prefix}.json`,
          roundtrip: 'exact',
        });
      }
      // Re-upload same original bytes: new local recording ID, matching fingerprint.
      const before = JSON.parse(
        fs.readFileSync(path.join(output, `${width}-edf.json`)),
      );
      await field('Choose EDF recording').setInputFiles(
        path.resolve('work/backend/S001R01.edf'),
      );
      await page
        .getByText(
          'EDF ready · original measurements in µV · stored temporarily on this computer.',
          { exact: true },
        )
        .waitFor();
      await page.getByText('No annotations yet.', { exact: false }).waitFor();
      await field('Choose annotation JSON').setInputFiles(
        path.join(output, `${width}-edf.json`),
      );
      await button('Confirm import').click();
      await openExport();
      await download('Export Annotations (JSON)', `${width}-reupload.json`);
      const reuploaded = JSON.parse(
        fs.readFileSync(path.join(output, `${width}-reupload.json`)),
      );
      assert.notEqual(reuploaded.recording.id, before.recording.id);
      assert.equal(
        reuploaded.recording.identity.value,
        before.recording.identity.value,
      );
      assert.deepEqual(
        reuploaded.annotations
          .map((a) => ({ ...a, recordingId: before.recording.id }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        before.annotations.sort((a, b) => a.id.localeCompare(b.id)),
      );
      assert.deepEqual(errors, []);
      await button('Delete EDF').click();
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(output, 'browser-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
