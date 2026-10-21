// Validate the actual deployment directory; never publish the repository root.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? walk(path.join(dir, item.name))
        : [path.join(dir, item.name)],
    );
}
const files = walk('dist');
assert(files.length < 20000, 'Cloudflare Pages free-plan file limit');
assert(
  !fs.existsSync('dist/404.html'),
  'Keep Pages default SPA fallback enabled',
);
for (const file of files) {
  assert(
    fs.statSync(file).size < 25 * 1024 * 1024,
    `Pages per-asset limit: ${file}`,
  );
  assert(
    !/\.(?:map|tsx?|cjs|py|obj|webm)$/.test(file),
    `Unexpected source/development artifact: ${file}`,
  );
  assert(
    !/(?:^|\/)\.(?:env|git)|node_modules|tsbuildinfo/.test(file),
    `Private/build artifact: ${file}`,
  );
  if (/\.(?:js|html|css|json|txt|md)$/.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    // auth-js ships an unused GoTrue standalone-server default beside its storage key.
    // NeuroScope always supplies the validated project URL. Exempt only that exact
    // vendor constant pair; configured/application loopback URLs still fail below.
    const auditedText = text.replace(
      /=`http:\/\/localhost:9999`,[\w$]+=`supabase\.auth\.token`/g,
      '="vendor-default",storageKey="vendor-storage-key"',
    );
    assert(
      !/\/Users\/|\/var\/folders\/|@vite\/client|@react-refresh|localhost:\d|127\.0\.0\.1:\d/.test(
        auditedText,
      ),
      `Development path in ${file}`,
    );
    assert(
      !/dataset\.(?:drawCalls|frameMs|geometries|rotation)\s*=/.test(text),
      `Development diagnostics in ${file}`,
    );
  }
}
for (const name of [
  'index.html',
  'favicon.svg',
  'THIRD-PARTY-NOTICES.txt',
  'models/ATTRIBUTION.md',
  'models/cortex-full.glb',
  'models/cortex-compact.glb',
  'models/neural-full.json',
  'models/neural-compact.json',
  'models/cortex-still.png',
]) {
  assert(
    fs.existsSync(path.join('dist', name)),
    `Missing release asset: ${name}`,
  );
}
assert(
  files.some((file) => file.endsWith('.woff2')),
  'Missing local fonts',
);
const total = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(
  `Deployment audit passed: ${files.length} files, ${(total / 1e6).toFixed(2)} MB; SPA fallback enabled, no source maps or development artifacts`,
);
