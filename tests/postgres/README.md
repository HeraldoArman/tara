# PostgreSQL contract tests

These tests exercise actual PostgreSQL 18, the Alembic-created FTS index and
history guards, concurrent row locks, stale-version rejection and replayed
idempotency. They do not substitute SQLite behavior for production constraints.

Use a disposable database whose name ends in `_test`. The suite seeds fixtures
and adds work orders/runs; never point it at customer data. Apply Alembic first,
then run from `apps/server`:

```sh
TARA_POSTGRES_TEST_URL="$DATABASE_URL" uv run pytest -q ../../tests/postgres
```

CI runs this suite against its isolated PostgreSQL 18 service after migration.
Unit tests continue to use their fast independent in-memory adapter.
