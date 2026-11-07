# Browser regression tests

`application.spec.ts` exercises the real web/API/database and the explicitly seeded
demonstration organization. `integration.spec.ts` uses the same login and pages,
then intercepts browser-facing import, history and evaluation responses to cover
recovery and rendering without provider calls. Run against an isolated local/test
deployment with LiveKit unconfigured:

```sh
TARA_E2E_PASSWORD='<the password used by demo seed>' bunx playwright test
```

The default origin is `http://localhost:3001`; override `TARA_E2E_ORIGIN` only when
it matches API/web `APP_ORIGIN`. Install Chromium through
`bunx playwright install chromium` if it is not already available. Never run this
suite against customer production data. It creates/resumes the WO-1042 demo run
and submits an invalid source document to test error handling.

The suite checks actual login/cookies, queue filters, SOP publication immutability,
role-gated routes/API, rejected foreign origins and a silent workspace with
disabled input/no media capture after an honest unavailable-provider response.
Actual LiveKit audio/vision/dispatch and consultation gates require the separate
credentialed release smoke in the parent workspace's `docs/deployment.md`.

The integration regressions cover retained-source decomposition retries without
re-uploading, history beyond the first 100 records with interrupted-page recovery,
duplicate-read handling, visible procedure prerequisites, and complete technician
aggregate columns including unknown first-pass rates. These browser response
fixtures exist only in Playwright; they do not write attempts, evidence or reports.
