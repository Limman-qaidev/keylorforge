# Local Docker environment

This Compose environment provides only the local PostgreSQL 17 service needed
by the backend and database foundations. It does not package or deploy the API,
mobile app, Supabase, or any product service.

The local development database is `keylorforge`; the separately provisioned
disposable migration-test database is `keylorforge_test`. Database clients must
use the repository's sole supported SQLAlchemy driver contract:
`postgresql+psycopg://` (psycopg 3).

## Start

From the repository root, create an untracked local configuration and start
PostgreSQL:

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose ps
docker compose exec postgres pg_isready -U keylorforge -d keylorforge
```

The default port is bound to `127.0.0.1` only. The checked-in password is a
deliberately non-production local default, not a credential for any shared
environment. Do not reuse it outside a disposable local checkout.

The first start of a fresh named volume creates both databases. The test
database name is required to end in `_test`; this mirrors the guard in the
database migration tests.

## Database validation

Install the pinned database dependencies and then apply the baseline to the
development database:

```powershell
Set-Location database
python -m pip install -c constraints.txt -e '.[dev]'
$env:KEYLORFORGE_ENVIRONMENT = 'development'
$env:KEYLORFORGE_DATABASE_URL = 'postgresql+psycopg://keylorforge:keylorforge_local_development_only@127.0.0.1:5432/keylorforge'
python -m alembic upgrade head
python -m alembic current
```

Validate the clean migration path with the separate test database before it
has received any migrations:

```powershell
$env:KEYLORFORGE_TEST_DATABASE_URL = 'postgresql+psycopg://keylorforge:keylorforge_local_development_only@127.0.0.1:5432/keylorforge_test'
pytest
```

If you changed values in `.env`, use the corresponding values in these URLs.
Never use a development, staging, or production database as the test target.

## Stop and reset

Stop while retaining local data:

```powershell
docker compose down
```

Reset is destructive to the local named volume and therefore explicit. It
recreates empty `keylorforge` and `keylorforge_test` databases on the next start:

```powershell
docker compose down --volumes
docker compose up -d
```

## Backend health

The API currently runs on the host rather than in this Compose stack. Follow
`services/api/README.md` to start it, then verify its independent health
contract with `Invoke-RestMethod http://127.0.0.1:8000/health`.
