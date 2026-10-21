import { createClient } from '@supabase/supabase-js';
import { readAuthConfig } from './config';
export const authConfig = readAuthConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
  VITE_AUTH_CALLBACK_PATH: import.meta.env.VITE_AUTH_CALLBACK_PATH,
});
// The SDK owns persistence/refresh and its PKCE verifier. Never duplicate tokens.
export const authClient = authConfig
  ? createClient(authConfig.url, authConfig.key, {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              ...(init?.signal ? [init.signal] : []),
              AbortSignal.timeout(15000),
            ]),
          }),
      },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

let exchange:
  | {
      code: string;
      promise: ReturnType<
        NonNullable<typeof authClient>['auth']['exchangeCodeForSession']
      >;
    }
  | undefined;
export function exchangeOnce(code: string) {
  if (!authClient) throw new Error('Authentication is not configured.');
  // Single-use codes must not be consumed twice by React StrictMode effects.
  if (exchange?.code !== code)
    exchange = { code, promise: authClient.auth.exchangeCodeForSession(code) };
  return exchange.promise;
}
export function authError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (code === 'invalid_credentials')
    return 'Email or password is incorrect. Please try again.';
  if (code === 'email_not_confirmed')
    return 'Verify your email before logging in. Check your inbox and spam folder.';
  if (code === 'weak_password')
    return 'Choose a stronger password that meets the account password policy.';
  if (code === 'same_password')
    return 'Choose a password different from your current one.';
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit'
  )
    return 'Too many attempts. Please wait before trying again.';
  if (code === 'provider_disabled' || code === 'validation_failed')
    return 'This sign-in method is unavailable. Try email or contact the site owner.';
  return 'Unable to complete this account request. Check your connection and try again.';
}
