# Codex Task Specifications

These files mirror active implementation work that is also tracked in GitHub Issues.

## Purpose

Codex implementation agents must be able to execute from repository-local context even when GitHub CLI or remote network authentication is unavailable inside a sandboxed worktree.

For implementation work, the local task specification is the execution contract for scope, acceptance criteria, validation, ownership and boundaries. GitHub remains the project-management record for status, discussion and Pull Requests.

## Rules

- Read the repository `AGENTS.md` hierarchy before executing a task.
- Read the relevant architecture documents and accepted ADRs.
- Use the task file matching the assigned FND identifier.
- Do not broaden scope based on assumptions.
- If a local task specification conflicts with an accepted ADR, stop and escalate to `tech_lead`.
- If GitHub is accessible, compare the local task spec with the Issue and report any discrepancy; GitHub access is not a prerequisite for implementation.
- Codex must not expose, request, copy or persist GitHub authentication tokens in project files.
- Remote push and Pull Request creation may be performed outside the Codex sandbox when the sandbox cannot authenticate reliably.
