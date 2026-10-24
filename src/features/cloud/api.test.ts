import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => vi.fn());
vi.mock('../auth/client', () => ({
  authClient: { auth: { getSession: session } },
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUD_RECORDINGS_ENABLED', 'true');
  vi.stubEnv('VITE_CLOUD_API_ORIGIN', '');
  session.mockResolvedValue({
    data: { session: { access_token: 'user-token', user: { id: 'owner' } } },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('keeps the workflow off unless explicitly enabled', async () => {
  vi.stubEnv('VITE_CLOUD_RECORDINGS_ENABLED', 'false');
  const api = await import('./api');
  expect(() => api.cloudEndpoint('/api/cloud/health')).toThrow('not enabled');
});
it('does not transmit tokens to arbitrary or insecure origins', async () => {
  vi.stubEnv('VITE_CLOUD_API_ORIGIN', 'http://attacker.example');
  const api = await import('./api');
  expect(() => api.cloudEndpoint('/api/cloud/health')).toThrow('HTTPS');
});
it('refuses an account switch before sending a private request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { cloudRequest } = await import('./api');
  await expect(
    cloudRequest('/api/cloud/health', undefined, 'GET', 'json', 'other'),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it('sends the user bearer only and never cookies', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetcher);
  const { cloudRequest } = await import('./api');
  expect(
    await cloudRequest('/api/cloud/health', undefined, 'GET', 'json', 'owner'),
  ).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledWith(
    '/cloud-eeg/api/cloud/health',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer user-token' },
    }),
  );
});
it('never automatically retries a mutation', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { message: 'busy' } }), {
      status: 429,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const { cloudRequest } = await import('./api');
  await expect(
    cloudRequest('/api/cloud/recordings/id', undefined, 'DELETE'),
  ).rejects.toThrow('busy');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('validates file size and extension before sending credentials or bytes', async () => {
  const { uploadCloudEDF } = await import('./api');
  const signal = new AbortController().signal;
  await expect(
    uploadCloudEDF(
      'p',
      new File(['not EDF'], 'x.txt'),
      'test',
      vi.fn(),
      signal,
      'owner',
    ),
  ).rejects.toThrow('Choose an EDF');
  expect(session).not.toHaveBeenCalled();
});
it('rejects truncated CSV payloads', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('a,b', { headers: { 'Content-Length': '9' } }),
      ),
  );
  const { cloudRequest } = await import('./api');
  await expect(
    cloudRequest(
      '/api/cloud/recordings/id/export.csv',
      undefined,
      'GET',
      'blob',
    ),
  ).rejects.toThrow('Incomplete');
});
