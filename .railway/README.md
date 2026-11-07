# Railway configuration

The TypeScript definition manages web, API, worker, PostgreSQL 18 and private
evidence storage for one environment. It can be reused for isolated staging and
production environments. Only web receives a public application domain.

Install the locked dependencies, link this checkout to the intended project and
environment, then preview the redacted change set:

```sh
bun install --frozen-lockfile
railway status --json
railway config plan --environment staging
```

Review the exact project, environment, resources and deletion count before applying
a plan. Do not use `--show-values`, commit generated Railway IDs, or mix legacy
`railway.json` ownership with this file. `preserve()` retains existing sealed
values; it does not provision a missing secret. Configure each environment's
credentials first. An ordinary application deployment does not apply this file.

The pilot region is Singapore (`asia-southeast1-eqsg3a`, bucket `sin`). Bucket
regions cannot be changed after creation. Set the actual public web origin in
web/API `APP_ORIGIN`; set only web's public domain. Database and storage references
are environment-local; API and worker must share the same LiveKit agent name and
credentials within that environment.

See the parent workspace's `docs/deployment.md` for required credentials,
migrations, release verification and backup limitations.

The infrastructure-plan workflow is manual until a project owner installs a
**staging-scoped** `RAILWAY_PLAN_TOKEN` GitHub repository secret and sets repository
variable `RAILWAY_PLAN_ENABLED=true`. It then runs on `.railway/**` pull requests
from this repository; fork PRs never receive the token. The current OAuth CLI
session can plan/apply resources but cannot create project tokens (`Not Authorized`).
Do not substitute the broader personal OAuth credential to bypass that boundary.
The ordinary application CI still typechecks this definition without credentials.

## Application CD

`.github/workflows/deploy.yml` deploys application changes pushed to `main`,
independently of the Checks workflow. It also supports **Run workflow** on `main`.
Application or deployment-script changes deploy all three services. This keeps
production consistent if GitHub replaces a queued run with a newer main push.
Documentation-only pushes do not enter the deployment queue. Deployments run one at a time, and API migrations and readiness
must succeed before the worker and web are deployed. Every deployment is polled
by its returned ID until Railway reports `SUCCESS`; a queued build is insufficient.

Configure these GitHub Actions repository settings once:

- Variables `RAILWAY_PROJECT_ID` and `RAILWAY_PRODUCTION_ENVIRONMENT_ID` select the
  project and its production environment.
- Secret `RAILWAY_PRODUCTION_TOKEN` must contain a Railway **project token scoped
  to production**. Create it in the project's Settings / Tokens, then add it at
  `https://github.com/HeraldoArman/tara/settings/secrets/actions`.

The project/environment variables are configured. Deployment remains blocked
until the production token is supplied: the current Railway OAuth session can
deploy but cannot create project tokens. The workflow reports the missing secret
before installing the CLI or uploading code. Never use a personal OAuth token as
a substitute.

Railway's native GitHub connection currently rejects this repository with
`User does not have access to the repo`; source repo/branch values in the
infrastructure definition alone do not activate push deployments. The GitHub
Actions workflow uploads the checkout directly and does not need that connection.
Use one CD mechanism if native GitHub autodeploy is enabled later to avoid
duplicate releases. The infrastructure-plan workflow remains separate and does
not deploy application code.
