# M0 Engineering Foundation

- Status: Planned
- Milestone: M0
- Owner: Project Manager

## Objective

Establish a reproducible engineering foundation before product feature implementation begins.

The milestone is complete when a new contributor or Codex worktree can clone the repository, start the backend/database/mobile development environment, run validation locally, and open a Pull Request that is checked automatically.

## Workstreams

### FND-001 Architecture conventions
Owner: `tech_lead`

Deliverables:
- architecture documentation structure
- initial ADRs
- API and repository conventions

### FND-002 GitHub contribution model
Owner: `project_manager` + `devops_engineer`

Deliverables:
- Issue templates
- Pull Request template
- labels/taxonomy plan
- branch/PR workflow

### FND-003 FastAPI skeleton
Owner: `backend_engineer`

Deliverables:
- application entry point
- configuration structure
- `/health` endpoint
- test skeleton
- formatting/lint/type-check configuration

Dependencies: FND-001

### FND-004 Expo mobile skeleton
Owner: `mobile_engineer`

Deliverables:
- Expo application
- TypeScript strict configuration
- Expo Router baseline
- environment configuration
- API connectivity abstraction
- test skeleton

Dependencies: FND-001

### FND-005 PostgreSQL and Alembic baseline
Owner: `data_engineer`

Deliverables:
- database configuration
- Alembic baseline
- migration conventions
- test database strategy

Dependencies: FND-001

### FND-006 Local Docker environment
Owner: `devops_engineer`

Deliverables:
- reproducible local services
- environment-variable examples
- documented startup workflow

Dependencies: FND-003, FND-005 as required by implementation choices

### FND-007 Backend CI
Owner: `devops_engineer`

Deliverables:
- backend lint/format/type/test checks
- deterministic check names for branch protection

Dependencies: FND-003

### FND-008 Mobile CI
Owner: `devops_engineer`

Deliverables:
- mobile lint/type/test checks
- deterministic check names for branch protection

Dependencies: FND-004

### FND-009 Database migration CI
Owner: `devops_engineer` + `data_engineer`

Deliverables:
- migration validation against test PostgreSQL

Dependencies: FND-005

### FND-010 Mobile-to-API health integration
Owner: `mobile_engineer` + `backend_engineer`

Acceptance path:

```text
Mobile -> GET /health -> FastAPI -> 200 -> visible development status
```

Dependencies: FND-003, FND-004, FND-006

### FND-011 Test architecture
Owner: `qa_engineer`

Deliverables:
- test taxonomy
- required test locations
- integration test strategy
- initial smoke path

Dependencies: FND-003, FND-004, FND-005

### FND-012 Branch protection
Owner: `project_manager` + `devops_engineer`

Deliverables:
- `main` protected
- Pull Request required
- real CI checks required
- no direct pushes as normal workflow

Dependencies: FND-007, FND-008, FND-009

## Parallelization plan

After FND-001 is accepted, the following can proceed in separate worktrees:

```text
FND-003 FastAPI       \
FND-004 Expo           > parallel
FND-005 Database      /
```

FND-006 can then integrate the backend/database local environment. CI work begins once each corresponding skeleton has a stable validation command.

Do not assign multiple write-heavy agents to the same checkout for these workstreams.

## Milestone gate

M0 is complete only when all of the following are true:
- local setup is documented and reproducible
- backend starts successfully
- mobile app starts successfully
- PostgreSQL test/development integration works
- backend health endpoint returns success
- mobile can call the backend health endpoint in the supported development setup
- automated backend checks pass
- automated mobile checks pass
- migration checks pass
- `main` is protected using the actual CI check names
- no privileged secrets are committed
- QA has independently verified the foundation smoke path

## Explicit non-goals

M0 does not implement:
- authentication product flows
- exercise catalog
- workout domain
- rankings
- social features

Those belong to later milestones.
