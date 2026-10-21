/* global window, document, HTMLCanvasElement */
// Local/production homepage verification. Genuine browser screenshots and native navigation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const origin = process.env.NEUROSCOPE_URL || 'http://127.0.0.1:4173';
const output = path.resolve(
  process.env.NEUROSCOPE_QA_OUTPUT || 'work/phase-2b',
);
const sections = [
  'product',
  'capabilities',
  'how-it-works',
  'use-cases',
  'scientific-integrity',
  'documentation',
];
async function scroll(page, y) {
  await page.evaluate(
    (top) => window.scrollTo({ top, behavior: 'instant' }),
    y,
  );
  await page.waitForTimeout(250);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { browser: browser.version(), origin, viewports: [] };
  try {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [834, 1112],
      [390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin);
      await page.locator('canvas[data-model]').waitFor();
      await page.waitForTimeout(900);
      assert.equal(
        await page.getByRole('heading', { level: 1 }).textContent(),
        'See beyond the signal.',
      );
      assert.equal(
        await page
          .getByRole('link', { name: 'Try NeuroScope', exact: true })
          .getAttribute('href'),
        '/app',
      );
      await page.screenshot({ path: path.join(output, `${width}-hero.png`) });
      const coordinates = {};
      for (const id of sections) {
        coordinates[id] = await page
          .locator('#' + id)
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        await scroll(page, coordinates[id]);
        await page
          .locator('#' + id + ' img')
          .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
        await page.screenshot({
          path: path.join(output, `${width}-${id}.png`),
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
          `${width}/${id}: no overflow`,
        );
      }
      const gallery = page.getByRole('group', {
        name: 'Workspace screenshot examples',
      });
      for (const [label, file] of [
        ['Select channels', 'channels'],
        ['Zoom in', 'zoom'],
        ['Inspect a sample', 'inspect'],
        ['Navigate time', 'timeline'],
        ['Overview', 'overview'],
      ]) {
        await gallery.getByRole('button', { name: label }).click();
        const img = page.locator('.product-demo__image img');
        await img.evaluate((el) => el.decode());
        assert.ok(
          (await img.getAttribute('src')).endsWith(`${file}-detail.webp`),
        );
        assert.ok(
          (await img.evaluate((el) => el.currentSrc)).endsWith(
            `${file}-detail${width === 390 ? '-mobile' : ''}.webp`,
          ),
        );
        await page
          .getByRole('button', { name: 'Full workspace', exact: true })
          .click();
        await img.evaluate((el) => el.decode());
        assert.ok((await img.getAttribute('src')).endsWith(`${file}.webp`));
        // Keyboard activation preserves the selected example across framing changes.
        await page
          .getByRole('button', { name: 'Signal detail', exact: true })
          .focus();
        await page.keyboard.press('Enter');
        await img.evaluate((el) => el.decode());
        assert.ok(
          (await img.getAttribute('src')).endsWith(`${file}-detail.webp`),
        );
        assert.equal(
          await gallery
            .getByRole('button', { name: label })
            .getAttribute('aria-pressed'),
          'true',
        );
      }
      await gallery.getByRole('button', { name: 'Select channels' }).click();
      await page
        .getByRole('button', { name: 'Explore exports', exact: true })
        .click();
      assert.ok(
        await page.getByAltText(/Actual workspace export panel/).isVisible(),
      );
      await page
        .getByRole('button', { name: 'Annotate an interval', exact: true })
        .click();
      for (const details of await page.locator('.faq-list details').all()) {
        await details.locator('summary').click();
        assert.equal(await details.evaluate((el) => el.open), true);
        await details.locator('summary').click();
      }
      // Verify every navigation hash resolves and each application CTA has a real destination.
      for (const link of await page.locator('a[href^="/#"]').all()) {
        const href = await link.getAttribute('href');
        assert.equal(await page.locator(href.slice(1)).count(), 1, href);
      }
      // Check footer resource paths as well as hash destinations, without leaving the page.
      for (const href of await page
        .locator('.product-footer a[href^="/"]')
        .evaluateAll((nodes) => [
          ...new Set(nodes.map((n) => n.getAttribute('href'))),
        ])) {
        if (!href.startsWith('/#')) {
          const response = await page.request.get(origin + href);
          assert.equal(response.status(), 200, href);
          if (href.endsWith('.md') || href.endsWith('.txt'))
            assert.ok(
              !(await response.text()).includes('<!doctype html>'),
              href,
            );
        }
      }
      for (const link of await page
        .locator('.product-footer a[href^="/#"]')
        .all()) {
        const id = (await link.getAttribute('href')).slice(2);
        await link.click();
        await page.waitForFunction(
          (target) => document.activeElement?.id === target,
          id,
        );
      }
      await scroll(page, 0);
      if (width === 390) {
        const toggle = page.getByRole('button', { name: 'Open navigation' });
        await toggle.click();
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(
          await toggle.evaluate((el) => document.activeElement === el),
          true,
        );
        await toggle.click();
        await page
          .getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Product', exact: true })
          .click();
        await page.waitForFunction(
          () => document.activeElement?.id === 'product',
        );
      } else {
        await page
          .getByRole('navigation', { name: 'Main navigation' })
          .getByRole('link', { name: 'Product', exact: true })
          .click();
        await page.waitForFunction(
          () => document.activeElement?.id === 'product',
        );
      }
      if (width > 780) {
        for (const label of ['How It Works', 'Use Cases', 'Documentation']) {
          const link = page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: label, exact: true });
          const id = (await link.getAttribute('href')).slice(2);
          await link.click();
          await page.waitForFunction(
            (target) => document.activeElement?.id === target,
            id,
          );
        }
      }
      // Return to the brain, then traverse forward and backward through the preserved canvas.
      await scroll(page, 0);
      await page.waitForTimeout(900);
      const distance = await page
        .locator('.neural-journey')
        .evaluate(
          (el) =>
            el.offsetHeight - el.querySelector('.cinematic-hero').offsetHeight,
        );
      for (const p of [0.5, 1, 0]) {
        await scroll(page, distance * p);
        await page.waitForTimeout(700);
      }
      assert.equal(
        await page.locator('.neural-journey').getAttribute('data-chapter'),
        'sculpture',
      );
      // Remove anchor focus before the presentation capture; no page styles or data altered.
      await page.evaluate(() => document.activeElement?.blur());
      await page.screenshot({
        path: path.join(output, `${width}-full.png`),
        fullPage: true,
      });
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      await page.getByRole('heading', { name: 'Signal explorer' }).waitFor();
      assert.ok(
        await page
          .getByRole('group', { name: 'Interactive EEG waveform viewer' })
          .isVisible(),
      );
      assert.deepEqual(errors, []);
      report.viewports.push({
        width,
        height,
        sections: sections.length,
        gallery: 'PASS',
        faq: 'PASS',
        navigation: 'PASS',
        cinematicReversal: 'PASS',
        workspace: 'PASS',
        errors,
      });
      await context.close();
      console.log(`${width}: marketing and workspace navigation passed`);
    }
    const docs = await browser.newPage();
    await docs.goto(origin + '/docs/research-preview.html');
    for (const id of [
      'start',
      'signals',
      'annotations',
      'exports',
      'limits',
      'privacy',
      'validation',
      'research',
    ])
      assert.equal(await docs.locator('#' + id).count(), 1);
    const links = await docs
      .locator('a[href^="/"]')
      .evaluateAll((nodes) => [
        ...new Set(nodes.map((n) => n.getAttribute('href'))),
      ]);
    for (const link of links)
      assert.equal((await docs.request.get(origin + link)).status(), 200, link);
    await docs.close();
    for (const mode of ['reduced', 'webgl-failure']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
      });
      if (mode === 'webgl-failure')
        await context.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return /webgl/.test(type)
              ? null
              : original.call(this, type, ...args);
          };
        });
      const page = await context.newPage();
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(origin);
      await page
        .getByAltText('Still view of the anatomical cerebral cortex')
        .waitFor();
      await page
        .getByRole('link', { name: 'Continue to the research platform' })
        .click();
      assert.ok(await page.locator('#product').isVisible());
      assert.ok(!requests.some((url) => url.endsWith('.glb')));
      await page.screenshot({ path: path.join(output, `${mode}-product.png`) });
      await context.close();
    }
    report.documentation = 'PASS';
    report.fallbacks = 'PASS';
    fs.writeFileSync(
      path.join(output, 'browser-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
