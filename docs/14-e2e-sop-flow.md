# SOP flow regression checks

The default Playwright suite includes browser checks for supported upload formats,
invalid-file feedback, clear navigation, and retrying a saved source after reload.
It uses the existing isolated demonstration seed and `TARA_E2E_PASSWORD`.

The two full lifecycle checks in `tests/e2e/sop-lifecycle.spec.ts` are registered
only when `TARA_E2E_SOP_LIFECYCLE=1`. They require the guarded API wrapper
`tests/fixtures/sop-lifecycle-server.py`.

## What the lifecycle fixture covers

- Real DOCX/Markdown extraction and source storage.
- Real authenticated draft, intelligence, validation, and publication APIs.
- Saving a draft while edits and publication controls are disabled.
- Returning from intelligence to the exact draft revision.
- Distinguishing two published revisions with the same display version.
- Creating an assigned job and opening its correctly pinned session as the technician.

Only SOP drafting is replaced with a deterministic two-step definition. The
recognized source contains `E2E lifecycle SOP` and the two sentences in
`tests/fixtures/sop-lifecycle.docx`. Other source documents produce an explicit
provider-unavailable response. The wrapper disables external AI, search, and
LiveKit settings. These checks do not validate model quality, physical camera
verification, microphone access, or LiveKit connectivity.

The test wrapper also resets the login throttle between requests because all
browser scenarios share one loopback address. Password verification and session
authorization still use the real application. This suite does not validate login
rate limiting; production login behavior is unchanged.

The reload-recovery browser check separately mocks the import failure and retry
response so it can deterministically exercise a retained document identifier.

## Run locally on Windows

Install the repository's Bun/Python dependencies and Playwright Chromium first.
Use separate ports and output directories from the development app. The API
wrapper refuses production settings, a non-loopback app origin, and databases or
evidence directories outside this checkout's ignored `.cache` directory.

From the repository root, configure the API terminal:

```powershell
$repoRoot = (Get-Location).Path
$testRoot = Join-Path $repoRoot '.cache/sop-flow-e2e'
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
$env:PYTHONPATH = Join-Path $repoRoot 'apps/server/src'
$env:ENVIRONMENT = 'test'
$env:TARA_E2E_SOP_LIFECYCLE = '1'
$env:DATABASE_URL = 'sqlite+aiosqlite:///' + (Join-Path $testRoot 'test.db').Replace('\', '/')
$env:EVIDENCE_LOCAL_PATH = Join-Path $testRoot 'evidence'
$env:EVIDENCE_BACKEND = 'local'
$env:APP_ORIGIN = 'http://localhost:3002'
$env:COOKIE_SECURE = 'false'
$env:DEMO_PASSWORD = Read-Host 'Choose an isolated test password'
$env:JWT_SECRET = (& apps/server/.venv/Scripts/python.exe -c 'import secrets; print(secrets.token_urlsafe(48))')
Remove-Item Env:SSLKEYLOGFILE -ErrorAction SilentlyContinue
Push-Location apps/server
& .venv/Scripts/python.exe -m alembic upgrade head
& .venv/Scripts/python.exe -m tara_server.seed
& .venv/Scripts/python.exe (Join-Path $repoRoot 'tests/fixtures/sop-lifecycle-server.py')
Pop-Location
```

In a second terminal, start the app with its own Next.js output:

```powershell
$env:API_INTERNAL_URL = 'http://localhost:8002'
$env:APP_ORIGIN = 'http://localhost:3002'
$env:NEXT_DIST_DIR = '.next-e2e'
Set-Location apps/web
& node node_modules/next/dist/bin/next dev --port 3002
```

In a third terminal at the repository root, use the password chosen for the seed:

```powershell
$env:TARA_E2E_PASSWORD = Read-Host 'Isolated test password'
$env:TARA_E2E_ORIGIN = 'http://localhost:3002'
$env:TARA_E2E_SOP_LIFECYCLE = '1'
node node_modules/@playwright/test/cli.js test tests/e2e/sop-lifecycle.spec.ts
```

Omit the spec argument to run the complete browser suite. Stop the two isolated
servers after testing; the normal app on port 3001 can continue running. Fixture
data remains under `.cache/sop-flow-e2e`; it is not production data.
