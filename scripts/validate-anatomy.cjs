// Independent Khronos glTF 2.0 conformance check; tooling is isolated from the app.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require('../.cache/anatomy-validator/node_modules/gltf-validator');

async function main() {
  const directory = path.resolve(process.argv[2] || 'public/models');
  const reports = {};
  for (const profile of ['full', 'compact']) {
    const filename = `cortex-${profile}.glb`;
    const data = fs.readFileSync(path.join(directory, filename));
    const result = await validator.validateBytes(new Uint8Array(data), {
      uri: filename,
      format: 'glb',
      writeTimestamp: false,
      maxIssues: 0,
      externalResourceFunction: () =>
        Promise.reject(new Error('Assets must be self-contained')),
    });
    reports[profile] = {
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      ...result,
    };
    console.log(filename, JSON.stringify(result.issues));
    if (result.issues.numErrors || result.issues.numWarnings)
      process.exitCode = 1;
  }
  fs.writeFileSync(
    path.join(directory, 'gltf-validation.json'),
    JSON.stringify(reports, null, 2) + '\n',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
