/** Non-destructive contract check for mutually isolated Android application IDs. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const configFactory = require('../app.config.js');
const base = JSON.parse(
  readFileSync(resolve(__dirname, '../app.json'), 'utf8'),
).expo;
const originalSmoke = process.env.KEYLORFORGE_QA_STANDALONE;
const originalReal = process.env.KEYLORFORGE_QA_REAL;

function variant(smoke, real) {
  process.env.KEYLORFORGE_QA_STANDALONE = smoke ? '1' : '0';
  process.env.KEYLORFORGE_QA_REAL = real ? '1' : '0';
  return configFactory({ config: base });
}

try {
  const normal = variant(false, false);
  assert.strictEqual(normal, base, 'ordinary Expo config must remain untouched');
  assert.equal(normal.android.package, 'com.jonathansalgadonieto.keylorforge');
  assert.equal(normal.scheme, 'keylorforge');
  assert.ok(normal.android.intentFilters.length > 0);

  const smoke = variant(true, false);
  const real = variant(false, true);
  assert.equal(smoke.android.package, 'com.jonathansalgadonieto.keylorforge.qastandalone');
  assert.equal(real.android.package, 'com.jonathansalgadonieto.keylorforge.qareal');
  assert.equal(smoke.scheme, 'keylorforge-qa-standalone');
  assert.equal(real.scheme, 'keylorforge-qa-real');
  assert.equal(smoke.android.intentFilters.length, 0);
  assert.equal(real.android.intentFilters.length, 0);
  assert.notEqual(smoke.android.package, real.android.package);
  assert.notEqual(smoke.android.package, normal.android.package);
  assert.notEqual(real.android.package, normal.android.package);
  assert.throws(() => variant(true, true), /mutually exclusive/);

  // A real QA build must not replace the application's original entrypoint.
  const entry = readFileSync(resolve(__dirname, '../app/index.tsx'), 'utf8');
  assert.match(entry, /export default function IndexRoute/);
  assert.match(entry, /useAuth\(\)/);
  assert.doesNotMatch(entry, /KeylorForge QA Standalone/);
  process.stdout.write('PASS: default, smoke and real Android packages isolated; real entry intact\n');
} finally {
  if (originalSmoke === undefined) delete process.env.KEYLORFORGE_QA_STANDALONE;
  else process.env.KEYLORFORGE_QA_STANDALONE = originalSmoke;
  if (originalReal === undefined) delete process.env.KEYLORFORGE_QA_REAL;
  else process.env.KEYLORFORGE_QA_REAL = originalReal;
}
