import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'NEUROSCOPE_');
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
      proxy: {
        '/local-eeg': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-eeg/, ''),
        },
      },
    },
  };
});
