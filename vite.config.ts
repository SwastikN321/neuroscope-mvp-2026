import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isPublicKey, readAuthConfig } from './src/features/auth/config.ts';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'NEUROSCOPE_');
  const browserEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const authKey = browserEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (authKey && !isPublicKey(authKey))
    throw new Error(
      'Only a Supabase publishable or legacy anon key may be used in browser configuration.',
    );
  if (
    Object.entries(browserEnv).some(
      ([key, value]) =>
        value &&
        (/SECRET|SERVICE.?ROLE|PRIVATE.?KEY|PASSWORD/i.test(key) ||
          value.startsWith('sb_secret_')),
    )
  )
    throw new Error(
      'Backend secrets must never be configured as VITE_ variables.',
    );
  const cloudFlag = browserEnv.VITE_CLOUD_RECORDINGS_ENABLED || 'false';
  if (!['true', 'false'].includes(cloudFlag))
    throw new Error('VITE_CLOUD_RECORDINGS_ENABLED must be true or false.');
  if (command === 'build' && cloudFlag === 'true') {
    const auth = readAuthConfig(browserEnv);
    if (!auth || !auth.siteUrl.startsWith('https:'))
      throw new Error(
        'Cloud builds require valid public Auth configuration and an HTTPS Site URL.',
      );
    try {
      const origin = browserEnv.VITE_CLOUD_API_ORIGIN || '';
      const api = new URL(origin);
      if (
        api.protocol !== 'https:' ||
        api.origin !== origin ||
        api.username ||
        api.password
      )
        throw new Error();
    } catch {
      throw new Error(
        'Cloud builds require an exact HTTPS VITE_CLOUD_API_ORIGIN.',
      );
    }
  }
  const target = env.NEUROSCOPE_API_TARGET || 'http://127.0.0.1:8000';
  const url = new URL(target);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('The EEG API target must be a local HTTP server.');
  return {
    plugins: [react(), tailwindcss()],
    preview: { host: '127.0.0.1', proxy: {} },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Offline fixtures, backend work and QA reports must not reload an active
      // scientific/browser test session when those files change.
      watch: { ignored: ['**/work/**', '**/backend/**', '**/*.md'] },
      proxy: {
        '/cloud-eeg': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/cloud-eeg/, ''),
        },
        '/local-eeg': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-eeg/, ''),
        },
      },
    },
  };
});
