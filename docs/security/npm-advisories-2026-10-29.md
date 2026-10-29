# npm advisory remediation — 2026-10-29

## Scope and evidence

Mobile dependency tree: `apps/mobile/package-lock.json`. Security gate: `.github/workflows/m3-security-baseline.yml`, using `npm audit --omit=dev --audit-level=high` followed by `apps/mobile/scripts/check_npm_advisory_allowlist.mjs`.

| Package path | Locked before | Action | Residual exposure |
| --- | --- | --- | --- |
| `node_modules/zod` | 4.3.6 | Update direct dependency and lock to **4.6.7** | The direct package is outside GHSA-mrhx-c7xc-m3w5's affected range (< 4.6.6); validate functional compatibility in CI. |
| `node_modules/expo/node_modules/zod` | 3.25.76 | No forced change | **Unresolved high-severity advisory** GHSA-mrhx-c7xc-m3w5. Expo SDK 57's `@expo/cli` currently requires `zod ^3.25.76`. |
| `node_modules/deepmerge` | 4.3.1 | No forced change | **Unresolved advisory** GHSA-gcqx-w48m-w2h4; upstream advisory reports no patched version. Transitive consumers include `@expo/config` and `jest-config`. |

## Advisory and upstream references

- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 (Zod, versions below 4.6.6 affected).
- https://github.com/advisories/GHSA-gcqx-w48m-w2h4 (deepmerge, affected 4.2.0–4.3.1; no fixed release as of 2026-10-29).
- https://github.com/expo/expo/pull/52316 (proposed SDK 57 CLI Zod 4 backport, **not yet merged or published** as of 2026-10-29).

## Risk and deployment notes

- `@expo/cli` and `@expo/config` are build/configuration tools in the mobile npm installation; `npm audit --omit=dev` still reports them because Expo lists these as runtime dependencies. This **does not prove exploitability in the shipped Android binary**, nor does it eliminate build-system risk.
- Zod memory exhaustion requires input that triggers large-scale validation failures. Review schemas that process externally controlled collections; enforce sensible input-size bounds at transport boundaries.
- Deepmerge prototype poisoning depends on attacker-controlled objects reaching affected merge operations. Trace actual data flows before claiming exposure is negligible.
- **No security checks or allowlist entries have been weakened or added.** The npm security gate should remain failing until remaining issues are remediated or a separate explicit, time-bounded, evidence-backed risk acceptance is authorized.
- Avoid `npm audit fix --force`, global `zod` overrides, or upgrading Expo SDK major versions without compatibility testing. No Android data, local SQLite, offline outbox, or authentication state may be cleared to test the package change.
- The existing advisory allowlist script refers to GitHub issue #143, which is unrelated to these package advisories. Track this documentation-link mismatch separately; it is not part of the current dependency change.

## Acceptance criteria

1. `package.json` and `package-lock.json` agree on direct Zod 4.6.7.
2. `npm ci` completes from the committed lockfile.
3. Mobile lint, typecheck, and unit tests pass, including offline and persistence tests.
4. The security scan does not show any **new** findings caused by the change; the two known transitive advisory identifiers remain visible and blocking.
5. No merge until CI, remaining risk decisions, and Product Owner approval are resolved.
