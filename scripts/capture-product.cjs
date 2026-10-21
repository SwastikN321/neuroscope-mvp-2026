/* global window */
// Genuine synthetic workspace captures. Only UI interactions; no altered app data or styles.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-2b/product');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: 1,
      });
      await page.goto('http://127.0.0.1:5173/app');
      await page.getByRole('heading', { name: 'Signal explorer' }).waitFor();
      await page
        .getByRole('group', { name: 'Interactive EEG waveform viewer' })
        .waitFor();
      const button = (name) => page.getByRole('button', { name, exact: true });
      const field = (name) => page.getByLabel(name, { exact: true });
      const capture = async (name) => {
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        );
        await page.waitForTimeout(200);
        const layout = await page
          .locator(width === 390 ? '.eeg-viewer' : '.eeg-layout')
          .boundingBox();
        const timeline = await page.locator('.eeg-timeline').boundingBox();
        await page.screenshot({
          path: path.join(
            output,
            name + (width === 390 ? '-mobile' : '') + '.png',
          ),
          fullPage: true,
          clip: {
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: timeline.y + timeline.height - layout.y,
          },
        });
      };
      await capture('overview');
      await button('Deselect all').click();
      for (const label of [
        'Fp1 Frontopolar',
        'F3 Frontal',
        'C3 Central',
        'P3 Parietal',
        'O1 Occipital',
        'T7 Temporal',
      ])
        await page.getByRole('checkbox', { name: label, exact: true }).check();
      await capture('channels');
      await button('Zoom in').click();
      await capture('zoom');
      await field('Inspect channel').selectOption({ label: 'C3' });
      await field('Inspect time in seconds').fill('4.125');
      await capture('inspect');
      if (width === 1440)
        await page
          .locator('.eeg-inspector')
          .screenshot({ path: path.join(output, 'inspector-detail.png') });
      await page.getByRole('slider', { name: 'Recording position' }).focus();
      await page.keyboard.press('End');
      await capture('timeline');
      await button('Reset view').click();
      await button('Add interval').click();
      await field('Annotation channel').selectOption({ label: 'C3 · 256 Hz' });
      await field('Annotation start seconds').fill('2.25');
      await field('Annotation end seconds').fill('4.5');
      await field('Annotation label').fill('Interval for review');
      await button('Save in session').click();
      await capture('annotated');
      if (width === 1440)
        await page
          .locator('.eeg-annotations')
          .screenshot({ path: path.join(output, 'annotation-detail.png') });
      await page.locator('.eeg-export-panel > summary').click();
      if (width === 1440)
        await page
          .locator('.eeg-export-panel')
          .screenshot({ path: path.join(output, 'export-detail.png') });
      await page.close();
    }
    console.log('Captured synthetic workspace states; no source UI changes.');
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
