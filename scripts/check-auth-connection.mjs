// Read-only live diagnostics. Never print environment values or response bodies.
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { readAuthConfig } from '../src/features/auth/config.ts';

const config = readAuthConfig(loadEnv('development', process.cwd(), 'VITE_'));
if (!config) {
  console.error(
    'Invalid or incomplete Auth configuration. Check the public-key and local-site settings in AUTHENTICATION.md.',
  );
  process.exitCode = 1;
} else {
  try {
    const boundedFetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(15000),
        ]),
      });
    const response = await boundedFetch(
      new URL('/auth/v1/settings', config.url),
      { headers: { apikey: config.key } },
    );
    console.log(`Live Auth settings HTTP: ${response.status}`);
    if (!response.ok) throw new Error('Settings unavailable');
    const settings = await response.json();
    const checks = {
      emailProviderEnabled: settings.external?.email === true,
      registrationEnabled: settings.disable_signup === false,
      emailConfirmationRequired: settings.mailer_autoconfirm === false,
    };
    console.log(JSON.stringify(checks, null, 2));
    // This proves the real SDK reaches Auth and rejects an invalid token.
    // It does not create an account, send email, or establish a valid session.
    const client = createClient(config.url, config.key, {
      global: { fetch: boundedFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(
      'invalid-connectivity-probe',
    );
    const rejected =
      data.user === null &&
      error?.code === 'bad_jwt' &&
      (error.status === 401 || error.status === 403);
    console.log(`SDK invalid-token rejection: ${rejected ? 'PASS' : 'FAIL'}`);
    console.log(
      'Email delivery and valid-account sessions require browser verification.',
    );
    if (!rejected || !Object.values(checks).every(Boolean))
      process.exitCode = 1;
  } catch {
    console.error(
      'Live Auth check failed; configuration and response details withheld.',
    );
    process.exitCode = 1;
  }
}
