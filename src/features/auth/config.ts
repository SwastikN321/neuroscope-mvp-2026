export type AuthConfig = {
  url: string;
  key: string;
  siteUrl: string;
  callbackPath: string;
};
export function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const payload = JSON.parse(
      atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return key.split('.').length === 3 && payload.role === 'anon';
  } catch {
    return false;
  }
}
export function readAuthConfig(
  values: Record<string, string | undefined>,
): AuthConfig | null {
  const url = values.VITE_SUPABASE_URL?.trim();
  const key = values.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const siteUrl = values.VITE_SITE_URL?.trim();
  const callbackPath =
    values.VITE_AUTH_CALLBACK_PATH?.trim() || '/auth/callback';
  if (!url || !key || !siteUrl) return null;
  try {
    const project = new URL(url),
      site = new URL(siteUrl);
    const secure = (u: URL) =>
      u.protocol === 'https:' ||
      (u.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
    if (
      !secure(project) ||
      !secure(site) ||
      project.username ||
      project.password ||
      site.username ||
      site.password ||
      project.search ||
      project.hash ||
      site.search ||
      site.hash ||
      project.pathname !== '/' ||
      site.pathname !== '/' ||
      callbackPath !== '/auth/callback' ||
      !isPublicKey(key)
    )
      return null;
    return { url: project.origin, key, siteUrl: site.origin, callbackPath };
  } catch {
    return null;
  }
}
// Deliberately allow only known internal destinations, never a supplied URL.
export function safeNext(value: string | null): string {
  return value === '/app' || value === '/reset-password' ? value : '/dashboard';
}
export function callbackUrl(config: AuthConfig, next = '/dashboard'): string {
  const url = new URL(config.callbackPath, config.siteUrl);
  url.searchParams.set('next', safeNext(next));
  return url.href;
}
