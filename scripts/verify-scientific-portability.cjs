// Actual public EDF import conflicts, malformed duplicates and mobile native-end navigation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const root = path.resolve('work/phase-3d1');
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let accept = true;
  page.on('dialog', (d) => (accept ? d.accept() : d.dismiss()));
  const field = (name) => page.getByLabel(name, { exact: true }),
    button = (name) => page.getByRole('button', { name, exact: true });
  const load = async (file) => {
    await field('Choose annotation JSON').setInputFiles(file);
  };
  const original = JSON.parse(
    fs.readFileSync(path.join(root, 'sleep-long-export.json')),
  );
  const variant = (name, doc) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, JSON.stringify(doc));
    return file;
  };
  let uploaded = false;
  try {
    await page.goto('http://127.0.0.1:5173/app');
    await field('Choose EDF recording').setInputFiles(
      path.join(root, 'SC4001E0-PSG.edf'),
    );
    await page.getByText('EDF ready', { exact: false }).waitFor();
    uploaded = true;
    await load(path.join(root, 'sleep-long-export.json'));
    await button('Confirm import').click();
    assert.equal(await page.locator('[data-annotation-id]').count(), 4);
    const duplicate = structuredClone(original);
    duplicate.annotations.push(duplicate.annotations[0]);
    await load(variant('duplicate-review.json', duplicate));
    await page
      .getByText('Invalid or duplicate annotation IDs within the file.')
      .waitFor();
    assert.equal(await button('Confirm import').count(), 0);
    const conflict = structuredClone(original);
    const target = conflict.annotations.find((a) => a.label === 'Native point');
    target.label = 'Confirmed replacement';
    await load(variant('conflict-review.json', conflict));
    await button('Confirm import').click();
    assert.equal(await button('Edit Native point').count(), 1);
    await load(path.join(root, 'conflict-review.json'));
    await page.getByRole('checkbox', { name: /Replace conflicting/ }).check();
    accept = false;
    await button('Confirm import').click();
    assert.equal(await button('Edit Native point').count(), 1);
    accept = true;
    await button('Confirm import').click();
    await button('Edit Confirmed replacement').waitFor();
    const wrong = structuredClone(original);
    wrong.recording.identity.value = '0'.repeat(64);
    await load(variant('mismatched-review.json', wrong));
    await page
      .getByText(/Recording mismatch: the source fingerprint differs/)
      .waitFor();
    assert.equal(await button('Confirm import').count(), 0);
    await field('Recording position').focus();
    await page.keyboard.press('End');
    const plot = page.getByRole('group', {
      name: 'Interactive EEG waveform viewer',
    });
    await page.waitForTimeout(500);
    assert.equal(Number(await plot.getAttribute('data-end')), 79500);
    await page.getByRole('heading', { name: /Signal explorer/ }).click();
    await page.screenshot({
      path: path.join(root, 'mobile-sleep-validation.png'),
      fullPage: true,
    });
    await field('Choose EDF recording').setInputFiles(
      path.join(root, 'mixed.edf'),
    );
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await page
      .getByRole('checkbox', { name: 'EEG Fp1 42.666666666666664 Hz' })
      .waitFor();
    await field('Recording position').focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(500);
    assert.equal(Number(await plot.getAttribute('data-end')), 12);
    await page.getByRole('heading', { name: /Signal explorer/ }).click();
    await page.screenshot({
      path: path.join(root, 'mobile-mixed-end.png'),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(root, 'portability-report.json'),
      JSON.stringify(
        {
          status: 'PASS',
          browser: browser.version(),
          viewport: [390, 844],
          checks: [
            'real EDF fingerprint restoration',
            'duplicate document IDs rejected',
            'conflicts skipped by default',
            'declined replacement retains original',
            'confirmed replacement succeeds',
            'wrong fingerprint rejected',
            'mobile Sleep-EDF end = 79500 s',
            'mobile fractional-rate end = 12 s',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (uploaded)
      await button('Delete EDF')
        .click()
        .catch(() => {});
    await browser.close();
  }
  console.log('Mobile scientific portability passed');
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
