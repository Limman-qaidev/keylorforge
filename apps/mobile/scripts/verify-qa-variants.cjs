/** Non-destructive contract check for isolated Android application IDs. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const configFactory = require('../app.config.js');
const read = (path) => readFileSync(resolve(__dirname, path), 'utf8');
const base = JSON.parse(read('../app.json')).expo;
const originalSmoke = process.env.KEYLORFORGE_QA_STANDALONE;
const originalReal = process.env.KEYLORFORGE_QA_REAL;
const mainId = 'com.jonathansalgadonieto.keylorforge';
const smokeId = 'com.jonathansalgadonieto.keylorforge.qastandalone';
const realId = 'com.jonathansalgadonieto.keylorforge.qareal';

function variant(smoke, real) {
  process.env.KEYLORFORGE_QA_STANDALONE = smoke ? '1' : '0';
  process.env.KEYLORFORGE_QA_REAL = real ? '1' : '0';
  return configFactory({ config: base });
}

try {
  const normal = variant(false, false);
  assert.strictEqual(normal, base);
  assert.equal(normal.android.package, mainId);
  assert.equal(normal.scheme, 'keylorforge');
  assert.ok(normal.android.intentFilters.length > 0);

  const smoke = variant(true, false);
  const real = variant(false, true);
  assert.equal(smoke.android.package, smokeId);
  assert.equal(real.android.package, realId);
  assert.equal(smoke.scheme, 'keylorforge-qa-standalone');
  assert.equal(real.scheme, 'keylorforge-qa-real');
  assert.equal(smoke.android.intentFilters.length, 0);
  assert.equal(real.android.intentFilters.length, 0);
  assert.notEqual(smokeId, realId);
  assert.notEqual(smokeId, mainId);
  assert.notEqual(realId, mainId);
  assert.throws(() => variant(true, true), /mutually exclusive/);

  // A real QA build must not replace the application's original entrypoint.
  const entry = read('../app/index.tsx');
  assert.match(entry, /export default function IndexRoute/);
  assert.match(entry, /useAuth\(\)/);
  assert.doesNotMatch(entry, /KeylorForge QA Standalone/);
  process.stdout.write('PASS: isolated Android variants\n');
} finally {
  if (originalSmoke === undefined) {
    delete process.env.KEYLORFORGE_QA_STANDALONE;
  } else {
    process.env.KEYLORFORGE_QA_STANDALONE = originalSmoke;
  }
  if (originalReal === undefined) {
    delete process.env.KEYLORFORGE_QA_REAL;
  } else {
    process.env.KEYLORFORGE_QA_REAL = originalReal;
  }
}
