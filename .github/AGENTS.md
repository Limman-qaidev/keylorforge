# GitHub and CI/CD Instructions

These instructions extend the repository-level `AGENTS.md` for `.github/`.

## Ownership

Primary owner: `devops_engineer`.

Use `project_manager` for issue/PR workflow conventions, `tech_lead` for required architectural gates, `qa_engineer` for test-gate strategy, and `security_engineer` for workflow permissions, secret exposure, dependency security, or release-signing concerns.

## Pull request policy

- All production changes go through Pull Requests.
- Never commit directly to `main`.
- Keep PRs focused on one bounded change whenever practical.
- Link the relevant Issue when one exists.
- PR descriptions should state: goal, scope, notable implementation choices, test evidence, risks, and follow-up work.
- Do not merge solely because an implementation agent reports success.

## CI principles

CI must progressively enforce the repository Definition of Done. Relevant checks should include, as the codebase becomes available:
- backend formatting/lint
- backend type checking
- backend tests
- migration validation
- mobile formatting/lint
- mobile type checking
- mobile tests
- build/configuration validation

Do not add placeholder green checks that provide no real validation.

## Workflow design

- Give workflows explicit, readable names.
- Use least-privilege `permissions` declarations.
- Avoid `write-all`.
- Pin third-party actions to stable versions according to the repository dependency/security policy.
- Avoid executing untrusted PR code with privileged secrets.
- Be cautious with `pull_request_target`; use it only with an explicit security rationale.
- Cache dependencies only when cache keys cannot cause unsafe cross-context behavior.
- Keep CI deterministic and independent of developer-machine state.

## Secrets

- Never embed secrets in workflow YAML.
- Reference repository/environment secrets only where required.
- Prefer environment-scoped production secrets.
- Do not expose privileged secrets to fork/untrusted code paths.
- Do not print secrets or sensitive environment values to logs.

## Branch protection target

`main` should ultimately require Pull Requests and required CI status checks before merge. Until those checks exist, do not invent required status names that are not backed by workflows.

As M0 progresses, coordinate branch-protection rules with the actual workflow job/check names so the branch cannot be permanently blocked by nonexistent checks.

## CODEOWNERS

When `CODEOWNERS` is introduced, keep ownership aligned with the repository operating model:
- `apps/mobile/` -> mobile ownership plus technical review
- `services/api/` -> backend ownership plus technical review
- `database/` -> data ownership plus technical review
- `infra/` and `.github/` -> DevOps ownership plus technical review
- `docs/architecture/` -> Tech Lead ownership

Do not invent GitHub usernames or teams. Add concrete owners only after valid repository collaborators/teams are known.

## Issue templates

Issue templates should capture enough information for safe agent execution:
- context
- goal
- scope
- out of scope
- dependencies
- affected modules
- acceptance criteria
- required tests
- risk/notes

Avoid templates that encourage broad multi-feature Issues.

## PR templates

PR templates should prompt for:
- linked Issue
- summary
- scope
- test evidence
- database/migration impact
- API contract impact
- security/privacy impact
- screenshots or UX evidence when relevant
- checklist against Definition of Done

## Before completing work

- validate YAML/configuration syntax
- inspect workflow triggers and permissions
- verify no secrets are embedded
- verify referenced commands/files actually exist when the workflow is expected to run
- avoid creating required checks before their workflows exist
- verify acceptance criteria
- report anything that could not be validated

Do not weaken CI, review requirements, or security controls merely to make a failing pipeline green.