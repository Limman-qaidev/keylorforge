# Remediation of October 2026 dependency advisories

## Scope

The October 29 audit detected two previously unrecognized advisories in the Expo SDK 57 dependency tree. This PR changes their actual resolution while preserving the existing advisory gate. None of the five pre-existing accepted advisories is removed from the security report or added to the allowlist in this PR.

| Dependency | Previous resolution | Proposed resolution | Validation |
| --- | --- | --- | --- |
| Direct Zod | zod@4.3.6 | zod@4.6.7 | Addresses GHSA-mrhx-c7xc-m3w5 (patched >=4.6.6) |
| Expo CLI Zod | zod@3.25.76 | zod@4.6.7 via narrowly scoped npm override | Verify Expo CLI compatibility, full CI, and Android QA APK build; upstream SDK 57 backport still open |
| deepmerge in @expo/config and jest-config | deepmerge@4.3.1 | deepmerge npm alias to @stackline/deepmerge@1.1.0 | Drop-in CommonJS API; custom prototype-poisoning regression suite and full CI required |

## Source and security rationale

- Zod: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 (4.6.6+ unaffected per the advisory). This does not automatically prove unbounded arrays safe; continue to constrain untrusted input sizes.
- deepmerge: https://github.com/advisories/GHSA-gcqx-w48m-w2h4 (no patched upstream version as of 2026-10-29). Alternate published package: https://www.npmjs.com/package/@stackline/deepmerge . Pin exactly v1.1.0, test API behavior, and retain npm lock integrity.
- Expo SDK 57 upstream Zod 4 adoption: https://github.com/expo/expo/pull/52316 (not merged as of 2026-10-29). Forcing Zod 4 may introduce compatibility regressions; require independent CI and isolated APK build. Do not assume the upstream backport has been released.

## Supply-chain consideration

`@stackline/deepmerge` is a separate third-party maintainer's code, not an upstream patch; npm alias replacement introduces a new supply-chain dependency. This change is acceptable only when installation provenance, exact lock integrity, regression tests, and PR reviews are inspected and successful. Before production release, consider a first-party maintained fork and independent audit of the substitute's implementation.

## Gates

1. `npm ci` must install from the committed lockfile on a clean runner.
2. `npm ls zod deepmerge --all` must show Zod >= 4.6.6 everywhere and no vulnerable `deepmerge@4.3.1` node.
3. Run `npm run test:security:deepmerge` against the **installed replacement**, not a detached vendor copy.
4. `npm audit --omit=dev` may report the previously documented advisory debt, but `check_npm_advisory_allowlist.mjs` must reject every new unaccepted advisory and any critical advisory, unchanged.
5. All backend, mobile, security, DB migration, and isolated Android build checks must pass.
6. Codex review should be clear and no errors should be hidden or baseline thresholds relaxed.
7. Remove the temporary lockfile workflow from the PR before merge, and rerun checks on the **final** commit.

No installed Android application, SQLite store, active session, offline outbox, or existing PostgreSQL QA state may be cleared or reset as part of this task.
