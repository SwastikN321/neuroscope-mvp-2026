/* global document */
// Real FastAPI data. Abort/delay only the transport for explicit failure scenarios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const output = path.resolve('work/phase-3d2');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  let accept = true;
  page.on('dialog', (d) => (accept ? d.accept() : d.dismiss()));
  const button = (n) => page.getByRole('button', { name: n, exact: true }),
    field = (n) => page.getByLabel(n, { exact: true });
  const settle = () =>
    page.waitForFunction(
      () =>
        document.querySelector('.eeg-plot') &&
        !document
          .querySelector('.eeg-plot-note')
          ?.textContent.includes('Updating window'),
    );
  const annotate = async (label) => {
    await button('Add point').click();
    await field('Annotation label').fill(label);
    await button('Save in session').click();
    await button('Edit ' + label).waitFor();
  };
  const checks = [];
  try {
    await page.goto('http://127.0.0.1:5173/app');
    await settle();
    await field('Choose EDF recording').setInputFiles(
      path.resolve('work/phase-3b3/S001R03.edf'),
    );
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await settle();
    await annotate('Keep through failure');
    await page.route('**/windows?**', (route) =>
      route.abort('connectionfailed'),
    );
    await button('Pan later').click();
    await page
      .getByRole('heading', { name: 'Unable to read this window' })
      .waitFor();
    assert.equal(await page.locator('.eeg-plot').count(), 0);
    assert.equal(await button('Edit Keep through failure').count(), 1);
    assert.match(
      await page.getByTestId('amplitude-readout').textContent(),
      /—/,
    );
    await page.screenshot({
      path: path.join(output, 'backend-unavailable.png'),
      fullPage: true,
    });
    await page.unroute('**/windows?**');
    await button('Retry recording').click();
    await settle();
    checks.push(
      'Failed real window transport hides stale plot and amplitude, preserves annotations, and recovers via Retry recording',
    );
    await field('Choose annotation JSON').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{invalid'),
    });
    await page
      .getByText('This file is not valid JSON.', { exact: true })
      .waitFor();
    assert.equal(await button('Edit Keep through failure').count(), 1);
    checks.push(
      'Invalid annotation JSON rejected without changing existing notes',
    );
    await page.locator('.eeg-export-panel > summary').click();
    await button('Clear CSV channels').click();
    const channels = page
      .getByRole('group', { name: 'CSV channels' })
      .getByRole('checkbox');
    for (let i = 0; i < 32; i++) await channels.nth(i).check();
    await field('CSV interval').selectOption('custom');
    await field('CSV start seconds').fill('0');
    await field('CSV end seconds').fill('60');
    let downloads = 0;
    page.on('download', () => downloads++);
    await button('Export EEG Data (CSV)').click();
    await page
      .getByText(
        'CSV is limited to 250,000 original samples. Reduce the interval or channels.',
        { exact: true },
      )
      .waitFor();
    assert.equal(downloads, 0);
    await field('CSV end seconds').fill('1');
    const download = page.waitForEvent('download');
    await button('Export EEG Data (CSV)').click();
    await (await download).saveAs(path.join(output, 'recovered-export.csv'));
    assert.equal(
      fs
        .readFileSync(path.join(output, 'recovered-export.csv'), 'utf8')
        .trim()
        .split('\n').length,
      5121,
    );
    checks.push(
      '307,200-row export rejected without a download; reducing to 5,120 rows succeeds without silent truncation',
    );
    // Keep a genuine response in flight long enough to exercise deletion/late completion deterministically.
    let resolveEntered;
    const entered = new Promise((r) => (resolveEntered = r));
    await page.route('**/windows?**', async (route) => {
      const response = await route.fetch();
      resolveEntered();
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({ response }).catch(() => {});
    });
    await button('Pan later').click();
    await entered;
    await button('Delete EDF').click();
    await page.getByText('Synthetic EEG', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    await settle();
    assert.ok(
      (
        await page.locator('.eeg-plot').getAttribute('data-channels')
      ).startsWith('Fp1'),
    );
    await page.unroute('**/windows?**');
    checks.push(
      'Deletion while a genuine window response is delayed completes; late response cannot overwrite the synthetic source',
    );
    await field('Choose EDF recording').setInputFiles(
      path.resolve('work/backend/S001R01.edf'),
    );
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await settle();
    await button('Use synthetic demo').click();
    await settle();
    await annotate('Unrelated demo observation');
    await button('Delete EDF').click();
    assert.equal(await button('Edit Unrelated demo observation').count(), 1);
    accept = false;
    await field('Choose EDF recording').setInputFiles(
      path.resolve('work/backend/S001R01.edf'),
    );
    await page
      .getByText(
        'Replacement canceled. Current recording and annotations retained.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await button('Edit Unrelated demo observation').count(), 1);
    checks.push(
      'Deleting retained EDF preserves unrelated synthetic annotations and their replacement-discard warning',
    );
    accept = true;
    await page.reload();
    await settle();
    assert.equal(await button('Edit Unrelated demo observation').count(), 0);
    checks.push(
      'Refresh warns about session-only annotations and returns explicitly to the synthetic recording',
    );
    fs.writeFileSync(
      path.join(output, 'recovery.json'),
      JSON.stringify({ browser: browser.version(), checks }, null, 2),
    );
    console.log(checks);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
