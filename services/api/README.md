# KeylorForge API

Minimal FastAPI foundation for the KeylorForge modular monolith. It deliberately
contains no authentication, persistence, migrations, or product-domain APIs.

## Requirements

- Python 3.11, 3.12, or 3.13

## Local setup and run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -c constraints.txt -e ".[dev]"
uvicorn app.main:app --reload
```

The application listens on `http://127.0.0.1:8000` by default. Verify the
service with:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected stable response:

```json
{"status":"ok"}
```

## Configuration

Settings are read from environment variables prefixed with `KEYLORFORGE_`.

- `KEYLORFORGE_APP_NAME` defaults to `keylorforge-api`.
- `KEYLORFORGE_ENVIRONMENT` defaults to `development` and accepts `development`,
  `test`, or `production`.
- `KEYLORFORGE_LOG_LEVEL` defaults to `INFO`.
- `KEYLORFORGE_SUPABASE_PROJECT_URL` identifies the trusted Supabase project.
- `KEYLORFORGE_SUPABASE_SECRET_KEY` is required only for account deletion. Supply
  its current `sb_secret_...` value through server-only secret storage; never
  commit, log, or place it in mobile configuration.

No secrets are required by this skeleton. A future secret must be supplied
through the environment, never committed to this repository.

## Updating dependency constraints

After intentionally changing dependencies in `pyproject.toml`, regenerate the
resolved dependency constraints:

```powershell
python -m pip install -e ".[dev]"
python -m pip freeze --exclude-editable | Sort-Object | Set-Content constraints.txt
```

Commit `pyproject.toml` and `constraints.txt` together.

## Validation

Run all checks from this directory:

```powershell
ruff format --check .
ruff check .
mypy app
pytest
```

## Continuous integration

The GitHub Actions workflow runs the same validation commands on pull requests
that affect `services/api/` and on pushes to `main`. Its stable job/check name
for branch protection is `Backend CI`.
