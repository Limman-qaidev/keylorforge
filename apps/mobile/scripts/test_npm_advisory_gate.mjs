// Regression tests for the fail-closed npm security advisory gate.
// Executes the same CLI used by GitHub M3 Security Baseline with synthetic
// reports. It does NOT modify npm's registry, the lockfile, or the allowlist.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'keylorforge-audit-gate-'));
const cli = new URL('./check_npm_advisory_allowlist.mjs', import.meta.url).pathname;

function advisory(name, id, critical = 0, extra = []) {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 1,
        high: 0,
        critical,
        total: 1 + critical,
      },
    },
    vulnerabilities: {
      [name]: {
        via: [
          {
            url: `https://github.com/advisories/${id}`,
          },
          ...extra.map((key) => ({
            url: `https://github.com/advisories/${key}`,
          })),
        ],
      },
    },
  };
}

function check(label, report, shouldPass, expectedText) {
  const file = join(tmp, 'audit.json');
  writeFileSync(file, JSON.stringify(report));
  const result = spawnSync(process.execPath, [cli, file], {
    encoding: 'utf8',
    timeout: 15000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if ((result.status === 0) !== shouldPass) {
    throw new Error(
      `${label}: unexpected exit status ${result.status}\n${output}`,
    );
  }
  if (expectedText && !output.includes(expectedText)) {
    throw new Error(`${label}: expected marker missing: ${expectedText}`);
  }
  console.log(`PASS: ${label}`);
}

try {
  check(
    'exact legacy minimatch 3.1.5 false-positive with locked dev-only graph',
    advisory('minimatch', 'GHSA-g3hv-75wg-m249'),
    true,
    'strictly version-scoped false-positive',
  );
  check(
    'unrecognized minimatch GHSA must fail',
    advisory('minimatch', 'GHSA-imaginary-new-vulnerability'),
    false,
    'New npm advisories need triage',
  );
  check(
    'new advisory alongside known one must fail',
    advisory('minimatch', 'GHSA-g3hv-75wg-m249', 0, [
      'GHSA-another-unknown-advisory',
    ]),
    false,
    'New npm advisories need triage',
  );
  check(
    'wrong package with the same GHSA must fail',
    advisory('glob', 'GHSA-g3hv-75wg-m249'),
    false,
    'New npm advisories need triage',
  );
  check(
    'critical findings always fail',
    advisory('minimatch', 'GHSA-g3hv-75wg-m249', 1),
    false,
    'critical advisories',
  );
  check(
    'existing documented security debt remains explicit',
    advisory('node-forge', 'GHSA-86w9-cpqp-85rv'),
    true,
    'Known npm advisory debt',
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
