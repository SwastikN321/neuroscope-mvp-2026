// Collect the installed, locked production dependency licenses for distribution.
// Includes transitive/type-only dependencies conservatively; build tools are excluded.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const sections = [
  'NeuroScope — third-party notices',
  'Anatomical assets: Brain for Blender by Anderson Winkler, adapted for NeuroScope.\nCC BY-SA 3.0 Unported. See /models/ATTRIBUTION.md for source, modifications and terms.\nhttps://creativecommons.org/licenses/by-sa/3.0/',
];
for (const [directory, entry] of Object.entries(lock.packages).sort()) {
  if (!directory || entry.dev) continue;
  const pkg = JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
  );
  assert.equal(
    pkg.version,
    entry.version,
    `Install the lockfile before building: ${pkg.name}`,
  );
  const licenseFile = fs
    .readdirSync(directory)
    .find((name) => /^licen[sc]e(?:\..*)?$/i.test(name));
  let license;
  if (licenseFile)
    license = fs.readFileSync(path.join(directory, licenseFile), 'utf8');
  else if (pkg.name === '@react-three/fiber') {
    // This npm package omits its license file. Checked against upstream on 2026-10-14:
    // https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/LICENSE
    license = fs.readFileSync('scripts/licenses/react-three-fiber.txt', 'utf8');
  } else
    throw new Error(
      `Missing license text for ${pkg.name}; review before distribution`,
    );
  sections.push(
    `${pkg.name} ${pkg.version} (${pkg.license})\n\n${license.trim()}`,
  );
}
fs.writeFileSync(
  'public/THIRD-PARTY-NOTICES.txt',
  sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n',
);
console.log(
  `Prepared notices for ${sections.length - 2} locked production dependencies`,
);
