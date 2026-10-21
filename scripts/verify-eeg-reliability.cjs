/* global document */
// Owns only its temporary backend child. Configure NEUROSCOPE_TEST_API_PORT and
// NEUROSCOPE_URL for an isolated Vite proxy; the selected API port must be free.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const storage = fs.mkdtempSync(
  path.join(os.tmpdir(), 'neuroscope-reliability-'),
);
const python = path.resolve('.venv-backend/bin/python');
const directory = path.resolve('work/phase-3b3');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = process.env.NEUROSCOPE_TEST_API_PORT || '8000';
const origin = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:5173';
let server;
async function start(env = {}) {
  server = spawn(
    python,
    [
      '-m',
      'backend.benchmark_eeg',
      '--serve',
      '--port',
      port,
      '--storage',
      storage,
    ],
    { env: { ...process.env, ...env }, stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {
      /* Starting. */
    }
    await delay(50);
  }
  throw new Error('Test backend did not start');
}
async function stop(signal = 'SIGTERM') {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill(signal);
  await exited;
}
async function noFiles() {
  for (let i = 0; i < 100; i++) {
    if (!fs.readdirSync(storage).some((n) => /\.(part|edf)$/.test(n))) return;
    await delay(50);
  }
  throw new Error('Incomplete recording was not cleaned up');
}
async function main() {
  fs.mkdirSync('work/phase-3d2', { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const checks = [];
  try {
    const occupied = await fetch(`http://127.0.0.1:${port}/health`).then(
      () => true,
      () => false,
    );
    assert.equal(
      occupied,
      false,
      'Selected test API port is already occupied; do not stop an unrelated server',
    );
    await start();
    const page = await browser.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(origin + '/app');
    await page
      .getByRole('group', { name: 'Interactive EEG waveform viewer' })
      .waitFor();
    const upload = async (file) => {
      const dialog = page.waitForEvent('filechooser');
      await page
        .getByRole('button', { name: 'Upload Recording', exact: true })
        .click();
      await (await dialog).setFiles(file);
    };
    await page.getByRole('button', { name: 'Add point', exact: true }).click();
    await page
      .getByLabel('Annotation label', { exact: true })
      .fill('Unrelated demo note');
    await page
      .getByRole('button', { name: 'Save in session', exact: true })
      .click();
    const cdp = await page.context().newCDPSession(page);
    const throttle = (speed) =>
      cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: speed,
      });
    await cdp.send('Network.enable');
    await throttle(65536);
    await upload(path.join(directory, 'near-cap.edf'));
    await page
      .getByRole('progressbar', { name: 'EDF upload progress' })
      .waitFor();
    assert(
      await page
        .getByRole('button', { name: 'Upload Recording', exact: true })
        .isDisabled(),
    );
    await page.getByRole('button', { name: 'Cancel upload' }).click();
    await page.getByText('Upload canceled.', { exact: false }).waitFor();
    await noFiles();
    checks.push(
      'Cancel active raw upload; second selection disabled until cancel; incomplete file removed',
    );
    await upload(path.join(directory, 'near-cap.edf'));
    await page
      .getByRole('progressbar', { name: 'EDF upload progress' })
      .waitFor();
    await stop('SIGKILL');
    await throttle(-1);
    await page
      .getByRole('alert')
      .filter({ hasText: 'Local EEG backend unavailable' })
      .waitFor({ timeout: 30000 });
    assert(
      (await page.locator('.eeg-plot').getAttribute('data-channels')).includes(
        'Fp1',
      ),
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Edit Unrelated demo note' })
        .count(),
      1,
    );
    await start();
    await noFiles();
    checks.push(
      'Backend process terminated during upload; clear offline recovery; restart removes crash leftovers',
    );
    await upload(path.join(directory, 'six-hour.edf'));
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('.eeg-plot') &&
        !document
          .querySelector('.eeg-plot-note')
          ?.textContent.includes('Updating window'),
    );
    const inspect = async (sample, value) => {
      await page
        .getByLabel('Inspect time in seconds')
        .fill(String(sample / 128));
      await page.getByLabel('Inspect time in seconds').press('Tab');
      const expected = `${value >= 0 ? '+' : ''}${value.toFixed(2)} µV`;
      await page.waitForFunction(
        (expected) =>
          document.querySelector('[data-testid="amplitude-readout"]')
            ?.textContent === expected,
        expected,
      );
    };
    await inspect(17, 1200);
    while (
      await page
        .getByRole('button', { name: 'Zoom out', exact: true })
        .isEnabled()
    )
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page
      .getByText('Peak-preserving display envelope.', { exact: false })
      .waitFor();
    await inspect(
      19,
      Math.round(22 * Math.sin(19 * 0.173) + 9 * Math.cos(19 * 0.049)),
    );
    await inspect(21600 * 128 - 1, 900);
    checks.push(
      'Six-hour navigation and original non-extremum sample inspection at full zoom; first transient and last sample preserved',
    );
    await page.reload();
    await page.getByText('Synthetic EEG', { exact: true }).waitFor();
    checks.push(
      'Reload clearly returns to demo; backend file remains subject to TTL/shutdown cleanup',
    );
    await stop();
    await noFiles();
    await start({
      NEUROSCOPE_TTL_SECONDS: '2',
      NEUROSCOPE_CLEANUP_INTERVAL: '0.1',
    });
    await upload(path.join(directory, 'mixed.edf'));
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Add point', exact: true }).click();
    await page
      .getByLabel('Annotation label', { exact: true })
      .fill('Retain after expiry');
    await page
      .getByRole('button', { name: 'Save in session', exact: true })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'expired or was deleted' })
      .waitFor({ timeout: 10000 });
    await noFiles();
    await page.screenshot({
      path: 'work/phase-3d2/expiry-recovery.png',
      fullPage: true,
    });
    assert.equal(
      await page
        .getByRole('button', { name: 'Edit Retain after expiry' })
        .count(),
      1,
      'Automatic expiry must preserve session annotations for JSON recovery',
    );
    assert.equal(await page.locator('.eeg-plot').count(), 0);
    await page.locator('.eeg-export-panel > summary').click();
    assert.equal(
      await page
        .getByRole('button', { name: 'Export EEG Data (CSV)', exact: true })
        .isDisabled(),
      true,
    );
    const rescue = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export Annotations (JSON)', exact: true })
      .click();
    await (await rescue).saveAs('work/phase-3d2/expiry-annotations.json');
    assert.equal(
      JSON.parse(fs.readFileSync('work/phase-3d2/expiry-annotations.json'))
        .annotations.length,
      1,
    );
    checks.push(
      'Real two-second expiry removes measurements, hides plot/timeline, preserves annotations and permits JSON rescue',
    );
    await stop();
    await start({
      NEUROSCOPE_MAX_UPLOAD_BYTES: '10000',
      NEUROSCOPE_MAX_STORAGE_BYTES: '7000',
    });
    await upload(path.join(directory, 'mixed.edf'));
    await page.getByText('EDF ready', { exact: false }).waitFor();
    await page
      .getByLabel('Choose annotation JSON', { exact: true })
      .setInputFiles('work/phase-3d2/expiry-annotations.json');
    await page
      .getByRole('button', { name: 'Confirm import', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Edit Retain after expiry', exact: true })
      .waitFor();
    checks.push(
      'Rescued annotations restore after uploading the same bytes with a new recording ID',
    );
    await upload(path.join(directory, 'mixed.edf'));
    await page
      .getByRole('alert')
      .filter({ hasText: 'file or storage limit' })
      .waitFor();
    assert(await page.getByRole('button', { name: 'Delete EDF' }).isVisible());
    await page.getByRole('button', { name: 'Delete EDF' }).click();
    await noFiles();
    for (const buffer of [
      Buffer.alloc(512, 65),
      fs.readFileSync(path.join(directory, 'mixed.edf')).subarray(0, 4863),
    ]) {
      await upload({
        name: 'invalid.edf',
        mimeType: 'application/octet-stream',
        buffer,
      });
      await page
        .getByRole('alert')
        .filter({ hasText: 'Invalid or corrupted' })
        .waitFor();
      await noFiles();
    }
    const unsupported = Buffer.from(
      fs.readFileSync(path.join(directory, 'mixed.edf')),
    );
    unsupported.write('EDF+D', 192, 'ascii');
    await upload({
      name: 'unsupported.edf',
      mimeType: 'application/octet-stream',
      buffer: unsupported,
    });
    await page.getByRole('alert').filter({ hasText: 'Unsupported' }).waitFor();
    await noFiles();
    checks.push('Discontinuous EDF+D is explicitly rejected');
    await upload(path.join(directory, 'near-cap.edf'));
    await page
      .getByRole('alert')
      .filter({ hasText: 'File is too large' })
      .waitFor();
    await noFiles();
    checks.push(
      'Aggregate storage exhaustion preserves current recording; oversized, corrupt and truncated uploads fail without leaked files',
    );
    fs.writeFileSync(
      path.join(directory, 'reliability.json'),
      JSON.stringify({ browser: browser.version(), checks }, null, 2),
    );
    console.log(JSON.stringify(checks, null, 2));
  } finally {
    await browser.close();
    await stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
