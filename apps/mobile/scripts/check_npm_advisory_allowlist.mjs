// Temporary security-debt allowance for the Expo SDK 57 dependency tree.
// See GitHub issue #143. No new or critical advisory may pass this gate.
// This is NOT a claim that the listed vulnerabilities are unexploitable.
import { readFileSync } from 'node:fs';

const acceptedByPackage = {
  'brace-expansion': [
    'GHSA-6j4f-fj2g-mc7p',
    'GHSA-q2hr-2g5m-vwhr',
    'GHSA-qhr7-859c-m2p7',
  ],
  braces: ['GHSA-vfj7-8cjw-p6xm'],
  compression: ['GHSA-vc2v-76pw-4v95'],
  'decode-uri-component': ['GHSA-vcc3-ghjq-m6fr'],
  'node-forge': ['GHSA-86w9-cpqp-85rv'],
  'source-map-js': ['GHSA-68fv-2mgg-jv7q'],
  'sprintf-js': ['GHSA-hp3w-g68c-fv3c'],
  uuid: ['GHSA-w5hq-g745-h8pq'],
};

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
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    for (const advisory of item.via ?? []) {
      if (typeof advisory !== 'object' || advisory === null) {
        continue; // Dependents have via-name edges, not original advisories.
      }
      const id = advisory.url?.split('/').pop();
      if (!id || !acceptedByPackage[name]?.includes(id)) {
        unknown.push(`${name}: ${id ?? 'unidentified advisory'}`);
      } else {
        seen.add(`${name}/${id}`);
      }
    }
  }

  if (counts.total > 0 && seen.size === 0) {
    throw new Error(
      'npm audit reported vulnerabilities without source advisories',
    );
  }
  if (unknown.length > 0) {
    throw new Error(`New npm advisories need triage: ${unknown.join(', ')}`);
  }

  console.log(
    `Known npm advisory debt: ${seen.size} accepted source advisories, ` +
      `${counts.total} affected dependency entries; 0 critical. See issue #143.`,
  );
}

validateAudit(JSON.parse(readFileSync(process.argv[2], 'utf8')));
