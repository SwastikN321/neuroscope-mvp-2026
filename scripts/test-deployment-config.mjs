// Local configuration checks only. Does not contact or publish to either host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveConfig } from 'vite';
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.equal(vercel.framework, 'vite');
assert.equal(vercel.outputDirectory, 'dist');
assert.equal(vercel.git.deploymentEnabled, false);
assert.deepEqual(vercel.rewrites, [
  { source: '/(.*)', destination: '/index.html' },
]);
const original = { ...process.env };
const publicConfig = {
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VITE_SITE_URL: 'https://neuroscope.example',
  VITE_CLOUD_RECORDINGS_ENABLED: 'true',
  VITE_CLOUD_API_ORIGIN: 'https://neuroscope-api.onrender.com',
};
async function config(overrides) {
  for (const key of Object.keys(process.env))
    if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, publicConfig, overrides);
  return resolveConfig({ logLevel: 'silent' }, 'build');
}
try {
  await config({});
  for (const overrides of [
    { VITE_CLOUD_API_ORIGIN: '' },
    { VITE_CLOUD_API_ORIGIN: 'http://api.example.com' },
    { VITE_CLOUD_API_ORIGIN: 'https://api.example.com/path' },
    { VITE_SITE_URL: 'http://127.0.0.1:5173' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' },
    { VITE_SUPABASE_SECRET_KEY: 'sb_secret_forbidden' },
    { VITE_CLOUD_RECORDINGS_ENABLED: 'yes' },
  ])
    await assert.rejects(config(overrides));
  await config({
    VITE_CLOUD_RECORDINGS_ENABLED: 'false',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    VITE_SITE_URL: '',
  });
  console.log(
    'Deployment configuration: static SPA routing, manual deploy gate, valid gated build, seven invalid configurations rejected, guest build accepted.',
  );
} finally {
  for (const key of Object.keys(process.env))
    if (key.startsWith('VITE_')) delete process.env[key];
  for (const [key, value] of Object.entries(original))
    if (key.startsWith('VITE_')) process.env[key] = value;
}
