/* global document, window */
// Real browser, real local EDF backend. Does not import or mutate application state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-3c1');
const origin = 'http://127.0.0.1:5173';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), checks: [] };
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let accept = true;
      const dialogs = [];
      page.on('dialog', async (dialog) => {
        dialogs.push(dialog.type());
        if (accept) await dialog.accept();
        else await dialog.dismiss();
      });
      await page.goto(origin);
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      const plot = page.getByRole('group', {
        name: 'Interactive EEG waveform viewer',
      });
      await plot.waitFor();
      const field = (name) => page.getByLabel(name, { exact: true });
      const button = (name) => page.getByRole('button', { name, exact: true });
      const list = page.getByRole('list', {
        name: 'Annotations sorted by time',
      });
      async function capture(filename) {
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        );
        await page.waitForTimeout(120);
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: true,
        });
      }
      async function checkIntervalPosition() {
        const chart = await plot.boundingBox();
        const left = Number(await plot.getAttribute('data-start'));
        const right = Number(await plot.getAttribute('data-end'));
        const overlay = await page
          .locator('[data-annotation-overlay]')
          .filter({ has: button('Inspect annotation: Observed interval') })
          .boundingBox();
        const pixels = chart.width - 114;
        assert.ok(
          Math.abs(
            overlay.x - (chart.x + 92 + ((2 - left) / (right - left)) * pixels),
          ) < 1.1,
          'Overlay start matches recording time after navigation',
        );
        assert.ok(
          Math.abs(overlay.width - (2.5 / (right - left)) * pixels) < 1.1,
          'Overlay width matches interval duration after navigation',
        );
      }
      async function save(label) {
        await field('Annotation label').fill(label);
        await field('Annotation notes').fill(
          'User observation for timing verification; no diagnostic interpretation.',
        );
        await button('Save in session').click();
        await button(`Edit ${label}`).waitFor();
      }
      async function manual(type, label, start, end) {
        await button(`Add ${type}`).click();
        await field('Annotation start seconds').fill(String(start));
        if (end !== undefined)
          await field('Annotation end seconds').fill(String(end));
        await save(label);
      }
      async function upload(file) {
        await field('Choose EDF recording').setInputFiles(path.resolve(file));
        await page
          .getByText(
            'EDF ready · original measurements in µV · stored temporarily on this computer.',
            { exact: true },
          )
          .waitFor();
        await page.waitForTimeout(250);
      }
      await field('Inspect time in seconds').fill('1.25');
      await page.waitForTimeout(180);
      const originalAmplitude = await page
        .getByTestId('amplitude-readout')
        .textContent();
      await button('Add point').focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await field('Annotation label').evaluate(
          (el) => el === document.activeElement,
        ),
        true,
      );
      await save('Synthetic point');
      assert.equal(
        await list.locator('li').getAttribute('data-start-time'),
        '1.25',
      );
      assert.equal(
        await page.getByTestId('amplitude-readout').textContent(),
        originalAmplitude,
      );
      accept = false;
      await page.getByRole('link', { name: '← Back to homepage' }).click();
      await page.waitForTimeout(100);
      assert.equal(new URL(page.url()).pathname, '/app');
      await page.evaluate(() => window.history.back());
      await page.waitForTimeout(200);
      assert.equal(new URL(page.url()).pathname, '/app');
      accept = true;
      // Replacing the synthetic recording also warns before discarding its annotations.
      await upload('work/backend/S001R01.edf');
      assert.equal(await list.count(), 0);
      await field('Inspect time in seconds').fill('1.25');
      await page.waitForTimeout(250);
      const edfAmplitude = await page
        .getByTestId('amplitude-readout')
        .textContent();
      // Pointer interval creation in explicit annotation mode.
      await button('Annotate').click();
      await plot.scrollIntoViewIfNeeded();
      const box = await plot.boundingBox();
      const chartWidth = box.width - 92 - 22;
      const y = box.y + 16 + (box.height - 48) / 24;
      if (width === 390) {
        const touch = await context.newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + 92 + chartWidth * 0.2, y }],
        });
        for (let step = 1; step <= 12; step++)
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: box.x + 92 + chartWidth * (0.2 + (0.2 * step) / 12), y },
            ],
          });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await touch.detach();
      } else {
        await page.mouse.move(box.x + 92 + chartWidth * 0.2, y);
        await page.mouse.down();
        await page.mouse.move(box.x + 92 + chartWidth * 0.4, y, { steps: 12 });
        await page.mouse.up();
      }
      await button('Edit selection').click();
      await field('Annotation label').waitFor();
      assert.equal(await field('Annotation type').inputValue(), 'interval');
      assert.equal(await field('Annotation start seconds').inputValue(), '2');
      assert.equal(await field('Annotation end seconds').inputValue(), '4');
      await field('Annotation label').fill('Observed interval');
      await capture(`${width}-interval-selection.png`);
      await save('Observed interval');
      assert.equal(await plot.getAttribute('data-start'), '0.000000');
      assert.equal(
        await page.getByTestId('amplitude-readout').textContent(),
        edfAmplitude,
      );
      // Click point on the waveform, and edit its explicit time later.
      await plot.scrollIntoViewIfNeeded();
      const nextBox = await plot.boundingBox();
      const pointX = nextBox.x + 92 + chartWidth * 0.125;
      const pointY = nextBox.y + 16 + (nextBox.height - 48) / 24;
      if (width === 390) await page.touchscreen.tap(pointX, pointY);
      else await page.mouse.click(pointX, pointY);
      assert.equal(await field('Annotation type').inputValue(), 'point');
      await button('Edit selection').click();
      await save('Observed point');
      assert.equal(
        await list.locator('li').first().getAttribute('data-start-time'),
        '1.25',
      );
      await capture(`${width}-saved-annotations.png`);
      await button('Inspect annotation: Observed interval').click();
      await field('Annotation end seconds').fill('4.5');
      await button('Update annotation').click();
      assert.equal(
        await list.locator('li').last().getAttribute('data-end-time'),
        '4.5',
      );
      await button('Navigate').click();
      await button('Zoom in').click();
      await button('Pan later').click();
      await button('Jump to Observed interval').click();
      assert.equal(
        await page
          .locator('[data-annotation-overlay]')
          .filter({ has: button('Inspect annotation: Observed interval') })
          .getAttribute('data-time'),
        '2',
      );
      await checkIntervalPosition();
      await capture(`${width}-after-navigation.png`);
      await page.getByRole('checkbox').first().uncheck();
      assert.equal(
        await button('Inspect annotation: Observed interval').count(),
        0,
      );
      assert.equal(await list.locator('li').count(), 2);
      await button('Jump to Observed interval').click();
      assert.equal(await page.getByRole('checkbox').first().isChecked(), true);
      await button('Reset view').click();
      // Full recording envelope does not move annotation coordinates.
      for (let i = 0; i < 3; i++) await button('Zoom out').click();
      await page.waitForTimeout(300);
      await checkIntervalPosition();
      assert.equal(
        await list.locator('li').last().getAttribute('data-start-time'),
        '2',
      );
      assert.equal(
        await list.locator('li').last().getAttribute('data-end-time'),
        '4.5',
      );
      accept = false;
      await button('Delete EDF').click();
      assert.equal(await list.locator('li').count(), 2);
      await field('Choose EDF recording').setInputFiles(
        path.resolve('work/backend/known.edf'),
      );
      await page
        .getByText(
          'Replacement canceled. Current recording and annotations retained.',
        )
        .waitFor();
      assert.equal(await list.locator('li').count(), 2);
      accept = true;
      await upload('work/backend/known.edf');
      assert.equal(await list.count(), 0);
      await button('Add point').click();
      await field('Annotation channel').selectOption('ch001');
      await field('Annotation start seconds').fill('1.01');
      await save('Native 64 Hz point');
      assert.equal(
        await list.locator('li').getAttribute('data-start-time'),
        String(65 / 64),
      );
      assert.equal(
        await list.locator('li').getAttribute('data-channel-id'),
        'ch001',
      );
      await manual('interval', 'Final interval', 3, 4);
      assert.equal(
        await list.locator('li').last().getAttribute('data-end-time'),
        '4',
      );
      await button('Edit Native 64 Hz point').click();
      await field('Annotation start seconds').fill('3.999');
      await button('Update annotation').click();
      assert.equal(
        await list.locator('li').last().getAttribute('data-start-time'),
        String(255 / 64),
      );
      await button('Delete Native 64 Hz point').click();
      assert.equal(await list.locator('li').count(), 1);
      await button('Use synthetic demo').click();
      assert.equal(await list.count(), 0);
      await button('Return to EDF').click();
      await manual('point', 'Before deletion', 0);
      await button('Delete EDF').click();
      await page
        .getByText(
          'EDF recording deleted from the local backend. Synthetic demo restored.',
          { exact: true },
        )
        .waitFor();
      assert.equal(await list.count(), 0);
      await manual('point', 'Refresh warning', 0);
      await page.reload();
      await plot.waitFor();
      assert.equal(await list.count(), 0);
      assert.equal(dialogs.includes('beforeunload'), true);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      assert.deepEqual(errors, []);
      report.checks.push({
        width,
        passed: true,
        publicEDF: 'PhysioNet eegmmidb S001R01.edf',
        mixedNativePoint: '65/64 s on ch001',
        lastNativePoint: '255/64 s',
        dialogCount: dialogs.length,
        originalAmplitudeUnchanged: true,
        pointerInput: width === 390 ? 'Chrome emulated touch' : 'mouse',
      });
      console.log(`${width}: annotation workflow passed`);
      await context.close();
    }
    fs.writeFileSync(
      path.join(output, 'report.json'),
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
