/* global document, window, HTMLElement */
// Official SDK against intercepted Auth HTTP fixtures. NO live provider/account validation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.NEUROSCOPE_PLAYWRIGHT || 'playwright');
const origin = process.env.NEUROSCOPE_AUTH_QA_URL || 'http://127.0.0.1:5174';
const output = path.resolve('work/phase-4a');
const endpoint = 'https://auth-fixture.example.test';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.NEUROSCOPE_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = {
    mode: 'MOCKED Supabase Auth HTTP via official SDK; no real email, Google, or GitHub credentials',
    browser: browser.version(),
    checks: [],
  };
  try {
    for (const [width, height] of [
      [1440, 1000],
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

      let expired = false,
        pkce = 0,
        recoveries = 0,
        updates = 0,
        logouts = 0;
      const providers = [];
      const user = {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'researcher@example.test',
        email_confirmed_at: '2026-10-01T12:00:00Z',
        created_at: '2026-10-01T12:00:00Z',
        updated_at: '2026-10-01T12:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: 'Alex Researcher' },
        identities: [],
      };
      const token = () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        return {
          access_token: [
            { alg: 'HS256', typ: 'JWT' },
            {
              sub: user.id,
              exp,
              aud: 'authenticated',
              role: 'authenticated',
              iss: endpoint + '/auth/v1',
            },
            'mock-signature',
          ]
            .map((x) =>
              typeof x === 'string'
                ? x
                : Buffer.from(JSON.stringify(x)).toString('base64url'),
            )
            .join('.'),
          refresh_token: 'MOCK-REFRESH-NOT-A-REAL-TOKEN',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          user,
        };
      };
      await context.route(endpoint + '/**', async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        const headers = {
          'access-control-allow-origin': origin,
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          'content-type': 'application/json',
          'x-supabase-api-version': '2024-01-01',
          'access-control-expose-headers': 'x-supabase-api-version',
        };
        const send = (body, status = 200) =>
          route.fulfill({ status, headers, body: JSON.stringify(body) });
        if (req.method() === 'OPTIONS')
          return route.fulfill({ status: 204, headers });
        if (url.pathname.endsWith('/authorize')) {
          providers.push(url.searchParams.get('provider'));
          assert.equal(url.searchParams.get('code_challenge_method'), 's256');
          assert.ok(url.searchParams.get('code_challenge').length >= 40);
          const destination = new URL(url.searchParams.get('redirect_to'));
          assert.equal(destination.origin, origin);
          assert.equal(destination.pathname, '/auth/callback');
          destination.searchParams.set(
            'code',
            'mock-single-use-' + providers.length,
          );
          return route.fulfill({
            status: 302,
            headers: { ...headers, location: destination.href },
          });
        }
        if (url.pathname.endsWith('/token')) {
          const body = req.postDataJSON();
          if (url.searchParams.get('grant_type') === 'pkce') {
            pkce++;
            assert.ok(body.code_verifier);
            return send(token());
          }
          if (expired)
            return send(
              { code: 'refresh_token_not_found', msg: 'Invalid refresh token' },
              400,
            );
          if (body.password === 'incorrect-password')
            return send(
              { code: 'invalid_credentials', msg: 'Invalid login credentials' },
              400,
            );
          return send(token());
        }
        if (url.pathname.endsWith('/signup')) return send(user);
        if (url.pathname.endsWith('/recover')) {
          recoveries++;
          assert.equal(
            new URL(url.searchParams.get('redirect_to')).searchParams.get(
              'next',
            ),
            '/reset-password',
          );
          return send({});
        }
        if (url.pathname.endsWith('/logout')) {
          logouts++;
          return send({});
        }
        if (url.pathname.endsWith('/user')) {
          if (expired)
            return send({ code: 'bad_jwt', msg: 'Expired session' }, 401);
          if (req.method() === 'PUT') {
            updates++;
            assert.equal(req.postDataJSON().password, 'a-new-secure-password');
          }
          return send(user);
        }
        throw new Error('Unexpected fixture Auth path: ' + url.pathname);
      });
      const button = (n) => page.getByRole('button', { name: n, exact: true });
      async function capture(name) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          window.scrollTo({ top: 0, behavior: 'instant' });
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          ),
          false,
          'No account page horizontal overflow',
        );
        await page.evaluate(() => {
          let badge = document.getElementById('qa-fixture');
          if (!badge) {
            badge = document.createElement('div');
            badge.id = 'qa-fixture';
            badge.textContent = 'AUTH QA · MOCKED RESPONSES · NO LIVE ACCOUNT';
            badge.style.cssText =
              'position:relative;padding:7px 12px;background:#283b46;color:#e1f3f4;text-align:center;font:10px monospace;z-index:9999';
            document.body.append(badge);
          }
        });
        await page.screenshot({
          path: path.join(output, `${width}-${name}-mocked.png`),
          fullPage: true,
        });
        await page.evaluate(() =>
          document.getElementById('qa-fixture')?.remove(),
        );
      }
      await page.goto(origin + '/dashboard');
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      assert.ok(page.url().includes('/login'));
      await page.getByLabel('Password', { exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page
          .getByRole('button', { name: 'Show password' })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await capture('login');
      await page.getByRole('link', { name: 'Sign up', exact: true }).click();
      await page
        .getByRole('heading', { name: 'A clearer perspective starts here.' })
        .waitFor();
      await page
        .getByLabel('Email address', { exact: true })
        .fill('researcher@example.test');
      await page
        .getByLabel('Password', { exact: true })
        .fill('a-secure-password');
      await page
        .getByLabel('Confirm password', { exact: true })
        .fill('a-secure-password');
      await button('Create account').click();
      await page
        .getByText(/If registration can proceed/)
        .waitFor({ timeout: 5000 })
        .catch(async (error) => {
          console.log(
            'Signup UI:',
            await page.getByRole('alert').allTextContents(),
          );
          throw error;
        });
      await capture('signup');
      // Simulate following the confirmation email in the same PKCE browser.
      await page.goto(
        origin + '/auth/callback?code=mock-email-confirmation&next=/dashboard',
      );
      await page
        .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
        .waitFor();
      await page.getByText('Account settings', { exact: true }).click();
      await button('Log out').click();
      await page.getByText('You have logged out of this browser.').waitFor();
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      await page
        .getByLabel('Email address', { exact: true })
        .fill('researcher@example.test');
      await page
        .getByLabel('Password', { exact: true })
        .fill('incorrect-password');
      await button('Log in').click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'incorrect' })
        .waitFor({ timeout: 5000 })
        .catch(async (error) => {
          console.log(
            'Login UI:',
            await page.getByRole('alert').allTextContents(),
          );
          throw error;
        });
      await page
        .getByLabel('Password', { exact: true })
        .fill('a-secure-password');
      await page.getByLabel('Password', { exact: true }).press('Enter');
      await page
        .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
        .waitFor();
      await capture('dashboard');
      await page.reload();
      await page
        .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
        .waitFor();
      await page.getByText('Account settings', { exact: true }).press('Enter');
      const menuBounds = await page
        .locator('.account-menu > div')
        .boundingBox();
      assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width);
      await capture('account-settings');
      await button('Log out').click();
      await page.getByText('You have logged out of this browser.').waitFor();
      assert.equal(logouts, 2);
      await page
        .getByRole('link', { name: 'Forgot password?', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'Find your way back.' })
        .waitFor();
      await page.getByLabel('Email address').fill('researcher@example.test');
      await button('Send recovery link').click();
      await page.getByText(/If an account is eligible/).waitFor();
      assert.equal(recoveries, 1);
      await page.goto(
        origin + '/auth/callback?code=mock-recovery&next=/reset-password',
      );
      await page.getByLabel('New password', { exact: true }).waitFor();
      assert.ok(!page.url().includes('code='));
      await page
        .getByLabel('New password', { exact: true })
        .fill('a-new-secure-password');
      await page
        .getByLabel('Confirm password', { exact: true })
        .fill('a-new-secure-password');
      await button('Update password').click();
      await page.getByText(/Your password has been updated/).waitFor();
      assert.equal(updates, 1);
      await page.getByRole('link', { name: 'Return to your account' }).click();
      await page.getByText('Account settings', { exact: true }).click();
      await button('Log out').click();
      await page.getByText('You have logged out of this browser.').waitFor();
      for (const name of ['Google', 'GitHub']) {
        await button('Continue with ' + name).click();
        await page
          .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
          .waitFor();
        await page.getByText('Account settings', { exact: true }).click();
        await button('Log out').click();
        await page.getByText('You have logged out of this browser.').waitFor();
      }
      assert.deepEqual(providers, ['google', 'github']);
      assert.equal(pkce, 4, 'one exchange per callback, including StrictMode');
      await page.goto(
        origin +
          '/auth/callback?error=access_denied&error_description=untrusted',
      );
      await page.getByRole('alert').waitFor();
      assert.equal(
        await page.getByText('untrusted', { exact: true }).count(),
        0,
      );
      assert.ok(!page.url().includes('error='));
      await page.goto(origin + '/login');
      await page.getByLabel('Email address').fill('researcher@example.test');
      await page
        .getByLabel('Password', { exact: true })
        .fill('a-secure-password');
      await button('Log in').click();
      await page
        .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
        .waitFor();
      expired = true;
      await page.reload();
      await page
        .getByText(/could not verify|session ended|session expired/)
        .first()
        .waitFor();
      assert.equal(
        await page
          .getByRole('heading', { name: 'Welcome, Alex Researcher.' })
          .count(),
        0,
      );
      await page.goto(origin + '/app');
      await page.locator('.eeg-plot').waitFor();
      assert.ok(
        await page.getByText('Synthetic EEG', { exact: true }).isVisible(),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      report.checks.push({
        width,
        height,
        status: 'PASS',
        pkceExchanges: pkce,
        providers,
        checks:
          'registration and email-confirmation callback, validation, login failure/success, refresh, dashboard, logout, recovery/update, OAuth PKCE redirects/exchange, callback errors, invalid stored session, guest EEG',
      });
      await context.close();
      console.log(width + ': mocked SDK auth browser flow passed');
    }
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width === 390,
        hasTouch: width === 390,
      });
      const page = await context.newPage();
      const guestOrigin =
        process.env.NEUROSCOPE_AUTH_GUEST_URL || 'http://127.0.0.1:4173';
      const external = [];
      page.on('request', (request) => {
        if (new URL(request.url()).origin !== guestOrigin)
          external.push(new URL(request.url()).origin);
      });
      await page.goto(guestOrigin + '/login');
      await page.getByText(/Account sign-in is not configured/).waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Log in', exact: true })
          .isDisabled(),
        true,
      );
      await page.screenshot({
        path: path.join(output, `${width}-login-unconfigured.png`),
        fullPage: true,
      });
      await page.getByRole('link', { name: 'Sign up', exact: true }).click();
      await page
        .getByRole('heading', { name: 'A clearer perspective starts here.' })
        .waitFor();
      await page.screenshot({
        path: path.join(output, `${width}-signup-unconfigured.png`),
        fullPage: true,
      });
      await page.goto(guestOrigin + '/dashboard');
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      await page.goto(guestOrigin + '/');
      await page
        .getByRole('link', { name: 'Try NeuroScope', exact: true })
        .click();
      await page.locator('.eeg-plot').waitFor();
      assert.deepEqual(external, []);
      await context.close();
      report.checks.push({
        width,
        height,
        status: 'PASS',
        checks:
          'Unconfigured account buttons disabled with explanation; dashboard redirects; homepage CTA opens guest EEG; no external requests',
      });
    }
    fs.writeFileSync(
      path.join(output, 'auth-browser-report.json'),
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
