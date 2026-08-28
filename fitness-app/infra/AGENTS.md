# Infrastructure Engineering Instructions

These instructions extend the repository-level `AGENTS.md` for `infra/`.

## Ownership

Primary owner: `devops_engineer`.

Use `tech_lead` for material infrastructure architecture changes, `qa_engineer` for deployment/test-environment validation, and `security_engineer` for secrets, network exposure, privilege boundaries, storage permissions, or production access concerns.

## Infrastructure principles

- Prefer the simplest infrastructure that satisfies the current product requirement.
- Preserve portability where practical; application architecture must not become unnecessarily coupled to one hosting vendor.
- Docker is the baseline packaging mechanism for backend services.
- Environments are separated as LOCAL, TEST, STAGING, and PRODUCTION.
- Staging and production must use separate credentials and data stores.
- Infrastructure configuration must be reproducible from version-controlled files plus external secrets.
- Do not introduce Kubernetes, service meshes, message brokers, or additional managed services without a demonstrated requirement and architectural approval.

## Secrets and configuration

- Never commit secrets, API tokens, passwords, service-role keys, certificates, private keys, or production credentials.
- Use environment variables or the approved secret-management facility.
- Provide `.env.example`-style documentation with names and safe placeholder values when configuration is required.
- Distinguish public client configuration from privileged server-only configuration.
- Supabase privileged/service-role credentials are server-side only.
- Default configurations should fail safely when required secrets are missing.

## Docker

- Keep images reproducible and minimal without sacrificing debuggability needed by the environment.
- Use explicit build contexts and avoid copying unrelated repository content.
- Use `.dockerignore` appropriately.
- Run production containers as non-root when practical.
- Define health checks where they materially improve orchestration/deployment reliability.
- Do not bake secrets into image layers.
- Pin/constrain base images and dependencies according to the repository dependency policy.

## Local development

Local setup should converge toward a documented command sequence that allows a clean checkout to start required development services consistently.

- Avoid hidden manual host configuration.
- Do not require production credentials for local development.
- Keep local database/service initialization deterministic.
- Preserve useful logs and error visibility.

## Environments and deployment

- Treat staging as the integration environment for the real mobile/API/Auth/Storage stack before production.
- Production changes must be explicit and reviewable.
- Destructive infrastructure operations must never occur implicitly during ordinary application deployment.
- Database migration ordering must be coordinated with `data_engineer` and backend compatibility requirements.
- Prefer zero/low-downtime compatible changes where reasonable.

## Observability

Add observability incrementally when there is an operational need. At minimum, architecture should allow:
- structured application logs
- error visibility
- health/readiness checks where useful
- deployment traceability by version/commit

Do not log secrets, authentication tokens, passwords, or unnecessary personal data.

## Security

- Apply least privilege to deployment credentials and service accounts.
- Expose only required network ports/services.
- Separate public endpoints from administrative/internal capabilities.
- Review CORS, TLS termination, storage permissions, and secret boundaries whenever relevant.
- Security-sensitive infrastructure changes require `security_engineer` review.

## Before completing work

- validate configuration syntax
- inspect the complete diff
- verify no secrets are present
- verify local setup remains reproducible
- validate relevant container builds/configuration
- explain environment/deployment impact
- verify acceptance criteria
- report anything that could not be validated

Do not modify application business logic, database domain modelling, or mobile UI as part of an infrastructure task.