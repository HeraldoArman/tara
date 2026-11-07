# Initial organization and real workshop data

Run these commands from `apps/server` in an operator environment connected to the intended database and private evidence storage. Run `uv run alembic upgrade head` first. Runtime secrets belong in the deployment secret store, never in command arguments, source files or Git.

## Initial owner

Set `BOOTSTRAP_OWNER_USERNAME`, `BOOTSTRAP_OWNER_PASSWORD` (at least 16 characters) and optional `BOOTSTRAP_ORGANIZATION`. Then run:

```sh
uv run python -m tara_server.seed --owner-only
```

This creates an organization and owner without work orders, fake reports or demonstration data. Rerunning preserves an existing owner. Remove the bootstrap password from the runtime configuration after provisioning.

## Other workshop roles

Set `ADMIN_OWNER_USERNAME` and `ADMIN_OWNER_PASSWORD` to an active owner account in the target organization. Set `PROVISION_USER_PASSWORD` to the new user's initial password (at least 16 characters). Then run, for example:

```sh
uv run python -m tara_server.admin provision-user --username bench-technician --name 'Bench Technician' --role technician
```

Supported roles are `technician`, `supervisor`, `sop_manager` and `owner`. Provisioning rejects duplicate usernames and never replaces passwords or grants an organization from a JSON field. This administrative CLI is the v1 provisioning path; there is no user-admin application.

## Publish a procedure and import assigned work

A manager or owner signs in at `/login`, imports a Markdown, TXT or text-based PDF at `/sops/import`, reviews citations and criteria, validates the draft and publishes it. Drafts cannot be used for new runs. The deployment needs `SOP_OPENAI_API_KEY` for bounded draft generation; failed provider requests retain the original source for retry.

Find the published version's `id` in the authenticated `/api/v1/sops` response. Prepare a JSON array with real work records:

```json
[
  {
    "reference": "YOUR-WORK-REFERENCE",
    "title": "Approved service task",
    "asset": {"model": "Actual model", "serial": "Actual serial"},
    "issue": "Observed issue",
    "priority": "standard",
    "assignedUsername": "bench-technician",
    "sopVersionId": "PUBLISHED-VERSION-UUID",
    "estimatedMinutes": 20
  }
]
```

With the owner operator variables set, run:

```sh
uv run python -m tara_server.admin import-work-orders /path/to/work-orders.json
```

The command validates every assignment and published version against the owner's organization. One transaction imports at most 500 records. Existing references are rejected, and existing run history is never overwritten.

## Real parts records

Prepare a JSON array with `sku`, `name`, nonnegative `stock`, `location`, nonnegative `priceCents` and three-letter `currency`:

```sh
uv run python -m tara_server.admin import-parts /path/to/parts.json
```

At most 1000 records are imported per transaction. Duplicate SKUs are rejected rather than silently changing inventory. External inventory synchronization is outside v1.

## Local demonstration only

For local development, set `DEMO_PASSWORD` to at least 10 characters and run `uv run python -m tara_server.seed`. The four usernames are `technician`, `supervisor`, `sop_manager` and `owner`. The organization and work orders are labeled demonstration data. This creates no visual verdict, evidence or report. Production rejects this seed path.
