import { describe, expect, it } from 'vitest';
import { readAuthConfig, isPublicKey, safeNext, callbackUrl } from './config';
const config = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VITE_SITE_URL: 'http://127.0.0.1:5173',
  VITE_AUTH_CALLBACK_PATH: '/auth/callback',
};
describe('Auth configuration and navigation boundaries', () => {
  it('requires configuration without disrupting guest use', () => {
    expect(readAuthConfig({})).toBeNull();
    expect(readAuthConfig(config)).not.toBeNull();
  });
  it('rejects server keys and accepts only public key types', () => {
    expect(isPublicKey('sb_secret_do_not_expose')).toBe(false);
    const jwt = (role: string) =>
      `e30.${btoa(JSON.stringify({ role }))}.signature`;
    expect(isPublicKey(jwt('service_role'))).toBe(false);
    expect(isPublicKey(jwt('anon'))).toBe(true);
    expect(
      readAuthConfig({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: 'secret' }),
    ).toBeNull();
  });
  it.each([
    'http://remote.example',
    'https://user:password@example.com',
    'https://example.com/?redirect=bad',
    'https://example.com/account',
    'javascript:alert(1)',
  ])('rejects unsafe site address %s', (site) => {
    expect(readAuthConfig({ ...config, VITE_SITE_URL: site })).toBeNull();
  });
  it('rejects callback routes the app does not handle', () => {
    expect(
      readAuthConfig({ ...config, VITE_AUTH_CALLBACK_PATH: '//evil.example' }),
    ).toBeNull();
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/login',
    '%2F%2Fevil.example',
    '/app?next=https://evil.example',
    '/dashboard#token',
  ])('contains untrusted next %s', (next) =>
    expect(safeNext(next)).toBe('/dashboard'),
  );
  it('builds only same-site known callbacks', () => {
    const c = readAuthConfig(config)!;
    expect(callbackUrl(c, '/reset-password')).toBe(
      'http://127.0.0.1:5173/auth/callback?next=%2Freset-password',
    );
    expect(
      new URL(callbackUrl(c, 'https://evil.example')).searchParams.get('next'),
    ).toBe('/dashboard');
  });
});
