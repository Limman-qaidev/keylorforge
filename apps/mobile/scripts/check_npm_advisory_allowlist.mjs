// Temporary security-debt allowance for five unpatched advisories in the Expo SDK 57 tree.
// See GitHub issue #143. No new or critical advisory may pass this gate.
// This is NOT a claim that the listed vulnerabilities are unexploitable.
import { readFileSync } from 'node:fs';

const acceptedByPackage = {
  braces: ['GHSA-vfj7-8cjw-p6xm'],
  'decode-uri-component': ['GHSA-vcc3-ghjq-m6fr'],
  'node-forge': ['GHSA-86w9-cpqp-85rv'],
  'sprintf-js': ['GHSA-hp3w-g68c-fv3c'],
  uuid: ['GHSA-w5hq-g745-h8pq'],
};

// One narrowly scoped false-positive triage, NOT a blanket GHSA allowlist.
// GHSA-g3hv-75wg-m249 describes firstPhasePreProcess() on minimatch 10.2.6,
// introduced after legacy minimatch v3.1.5. The immutable v3.1.5 source lacks
// both firstPhasePreProcess and optimizationLevel. The registry's broad range
// (<11.0.1) includes the legacy version despite this incompatible code path.
// Evidence and PO risk-acceptance gate: issue #182. This rule applies ONLY
// when all legacy consumers remain in the exact known Jest/ESLint dev graph;
// a new 10.x instance, version change, or new consumer MUST fail CI.
const legacyMinimatchDevConsumers = new Set([
  'node_modules/@eslint/config-array',
  'node_modules/@eslint/eslintrc',
  'node_modules/@jest/reporters/node_modules/glob',
  'node_modules/eslint',
  'node_modules/eslint-plugin-import',
  'node_modules/eslint-plugin-react',
  'node_modules/jest-config/node_modules/glob',
  'node_modules/jest-runtime/node_modules/glob',
  'node_modules/test-exclude',
  'node_modules/test-exclude/node_modules/glob',
]);

// Resolve installed packages by Node's nearest-node_modules lookup, not by
// dependency range syntax. This catches ^3, ~3, optional and peer consumers.
function resolveMinimatch(fromPath, packages) {
  let current = fromPath;
  while (true) {
    const nested = `${current}/node_modules/minimatch`;
    if (packages[nested]) {
      return nested;
    }
    const parentSeparator = current.lastIndexOf('/node_modules/');
    if (parentSeparator === -1) {
      break;
    }
    current = current.slice(0, parentSeparator);
  }
  return packages['node_modules/minimatch']
    ? 'node_modules/minimatch'
    : null;
}

function isPatchedMinimatch(version) {
  // GHSA-g3hv-75wg-m249 first patched in 11.0.1; 11.0.0 is vulnerable.
  // Reject prereleases and malformed versions rather than treating them safe.
  const match = /^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(version ?? '');
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 11 || (major === 11 && (minor > 0 || patch >= 1));
}

function isLegacyMinimatch3FalsePositive(name, id) {
  if (name !== 'minimatch' || id !== 'GHSA-g3hv-75wg-m249') {
    return false;
  }

  const lock = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const packages = lock.packages ?? {};
  const installed = Object.entries(packages).filter(
    ([path]) =>
      path === 'node_modules/minimatch' ||
      path.endsWith('/node_modules/minimatch'),
  );
  const unpatched = installed.filter(([, item]) =>
    !isPatchedMinimatch(item.version),
  );
  if (
    unpatched.length !== 1 ||
    unpatched[0][0] !== 'node_modules/minimatch' ||
    unpatched[0][1].version !== '3.1.5' ||
    unpatched[0][1].devOptional !== true
  ) {
    return false;
  }

  const legacyConsumers = Object.entries(packages).filter(([path, item]) => {
    const needsMinimatch = [
      item.dependencies,
      item.optionalDependencies,
      item.peerDependencies,
    ].some((dependencies) =>
      Object.prototype.hasOwnProperty.call(dependencies ?? {}, 'minimatch'),
    );
    return (
      needsMinimatch &&
      resolveMinimatch(path, packages) === 'node_modules/minimatch'
    );
  });
  return (
    legacyConsumers.length === legacyMinimatchDevConsumers.size &&
    legacyConsumers.every(
      ([path, item]) =>
        legacyMinimatchDevConsumers.has(path) &&
        (item.dev === true || item.devOptional === true),
    )
  );
}

function validateAudit(report) {
  if (
    !report ||
    typeof report !== 'object' ||
    report.error ||
    !report.vulnerabilities ||
    !report.metadata?.vulnerabilities
  ) {
    throw new Error(
      'npm audit produced an incomplete report or failed to scan',
    );
  }

  const counts = report.metadata.vulnerabilities;
  if (counts.critical !== 0) {
    throw new Error(`npm audit has ${counts.critical} critical advisories`);
  }

  const unknown = [];
  const seen = new Set();
  const triagedFalsePositives = new Set();
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    for (const advisory of item.via ?? []) {
      if (typeof advisory !== 'object' || advisory === null) {
        continue; // Dependents have via-name edges, not original advisories.
      }
      const id = advisory.url?.split('/').pop();
      if (isLegacyMinimatch3FalsePositive(name, id)) {
        triagedFalsePositives.add(`${name}/${id}`);
      } else if (!id || !acceptedByPackage[name]?.includes(id)) {
        unknown.push(`${name}: ${id ?? 'unidentified advisory'}`);
      } else {
        seen.add(`${name}/${id}`);
      }
    }
  }

  if (unknown.length > 0) {
    throw new Error(`New npm advisories need triage: ${unknown.join(', ')}`);
  }
  if (counts.total > 0 && seen.size + triagedFalsePositives.size === 0) {
    throw new Error(
      'npm audit reported vulnerabilities without source advisories',
    );
  }

  console.log(
    `Known npm advisory debt: ${seen.size} accepted source advisories, ` +
      `${counts.total} affected dependency entries; 0 critical. ` +
      `${triagedFalsePositives.size} strictly version-scoped false-positive(s) ` +
      `documented in issue #182. See issue #143 for accepted debt.`,
  );
}

validateAudit(JSON.parse(readFileSync(process.argv[2], 'utf8')));
