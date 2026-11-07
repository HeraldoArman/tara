# 07 — Security and privacy

Authentication is intentionally a small supporting feature. The important trust boundaries are execution authorization, evidence integrity, untrusted SOP/web content and protection of technician/work data.

## 1. Minimal authentication

Implement only:

- Seeded users with username, Argon2id password hash, organization and role.
- One FastAPI login endpoint issuing a signed, expiring HS256 JWT.
- A strong randomly generated runtime JWT secret.
- JWT subject, organization, role, issuer, issued-at and expiry claims.
- An HttpOnly, Secure, SameSite=Lax login cookie so browser code does not store the JWT in `localStorage`.
- FastAPI `get_current_user` and `require_roles(...)` dependencies.
- Active-user, organization and work-order assignment checks.
- Generic login failure messages and basic login throttling.
- Logout by clearing the cookie; normal re-login after expiry.

Use a one-shift expiry as the initial configurable value. Do not add refresh tokens, token revocation storage, SSO, MFA, invitations, email recovery or a user-admin SPA to v1.

Serve the frontend and `/api` through one application origin in production. Apply narrow CORS if separate development origins require it and validate request origin for cookie-authenticated mutations. These are baseline protections, not a new identity platform.

## 2. Authorization at every boundary

- FastAPI routes check role and organization.
- Technician run/evidence/report queries also check assignment/ownership.
- SOP publication requires `sop_manager` or `owner`.
- Report review and escalation resolution require `supervisor` or `owner`.
- The worker receives server-derived organization/actor/run context; model arguments cannot override it.
- Agent tools call the same authorization/domain services as REST routes.
- The model cannot publish SOPs, approve reports, resolve its own restrictions or mint LiveKit credentials.

Hiding a button is not authorization.

## 3. Credential boundaries

| Credential | Allowed location |
| --- | --- |
| JWT signing secret | FastAPI runtime secret store |
| Database credentials | FastAPI/worker runtime secret store |
| LiveKit API key/secret | FastAPI and worker runtime secret stores |
| OpenAI Realtime API key | Worker only |
| OpenAI SOP-decomposition API key | FastAPI only; separate from the realtime credential |
| Web-search provider key | Worker only |
| S3 credentials | FastAPI/worker runtime secret stores |
| Short-lived LiveKit join token | Returned to the authorized browser for one room |

Never expose provider signing keys to Next.js public environment variables or the browser. Do not commit real `.env` files, bake secrets into images or include signed evidence URLs in analytics logs.

## 4. LiveKit access

- Use explicit agent dispatch, not automatic unrestricted room joining.
- Generate room and participant identity on the server.
- Put only opaque run/session IDs in dispatch metadata; reload business context from Postgres.
- Mint short-lived tokens scoped to the intended room and required publish/subscribe/data permissions.
- Do not accept organization, role or authoritative user identity from client JSON.
- Return connection success only after dispatch succeeds or return an explicit retryable state.
- Reconnect must reauthorize rather than trusting stale browser state.

## 5. SOP upload and prompt-injection boundary

SOP documents are both files and untrusted text.

File handling:

- Allow only Markdown, TXT and valid text-based PDF signatures.
- Enforce file-size, page-count, extracted-text and processing-time limits.
- Store originals outside the public web root with generated object keys.
- Do not execute embedded scripts/macros or follow embedded remote resources.
- Reject unsupported encrypted/image-only PDFs with a clear error.
- Keep parser dependencies updated and run parsing with least privilege.

Model handling:

- Treat all extracted instructions as source content, not system/developer instructions.
- Use structured output and reject unknown fields/executable expressions.
- Require source citations and human publication.
- Index only the intended organization’s versions.
- Keep published versions immutable to prevent silent prompt/procedure replacement.

## 6. Web-search boundary

- Search only during user-activated consultation.
- Use a configured provider with a short timeout and query/result limits.
- Return title, URL, snippet and retrieval time.
- Treat snippets/pages as untrusted data; do not obey their instructions.
- Do not fetch arbitrary URLs or run downloaded code in v1.
- State that approved SOP content takes precedence over web content.
- Avoid sending customer identifiers, secrets or unnecessary transcript content in search queries.

## 7. Evidence and report access

- Evidence object keys are unguessable and not publicly listed.
- Downloads require an authorized FastAPI check and short-lived signed URL.
- Every evidence row is organization/run/step/attempt scoped.
- Accepted and rejected frames receive the same access controls.
- Reports and exports use the same organization/role checks.
- Reviews are append-only and tied to authenticated supervisor/owner identities.
- SHA-256 hashes detect content changes but do not prove who created a frame or make a database administrator unable to alter records.

Do not claim regulatory compliance, cryptographic non-repudiation or human-equivalent safety certification without separate requirements and audits.

## 8. Privacy and data minimization

The system can collect substantial operational data without recording everything continuously.

Default collection:

- Work/SOP/run/step/attempt history.
- Selected accepted/rejected visual evidence.
- Final user-activated consultation transcripts and proactive alert text.
- Tool calls, failures, latency, model usage, interruptions and reconnects.
- Accessible UI actions and supervisor decisions.

Not collected by default:

- Continuous raw audio.
- Continuous raw video or every preview frame.
- Silent-mode microphone transcripts; normal microphone input is disabled.
- Every interim speech fragment.
- Unrelated customer/technician personal information.

Before production, the organization must set retention periods for source documents, evidence, transcripts, reports and operational logs. Retention deletion must respect active runs and retained report references. Provide an authorized export path where required.

## 9. Browser and PWA data

- Do not persist JWTs, provider tokens or sensitive run/report datasets in `localStorage`.
- Service-worker caching is limited to the app shell/static safe resources by default.
- Do not cache signed evidence URLs or authenticated API responses without an explicit reviewed policy.
- Camera/microphone permission states and consultation activation are visible.
- On deactivation, normal microphone conversation stops; on reconnect, return to silent mode.
- Text/audit displays escape untrusted content; do not inject model/document/web HTML directly.

## 10. Minimum security tests

- Anonymous and wrong-role requests are rejected.
- A technician cannot read or mutate another technician’s assigned run/evidence/report.
- Organization IDs in path/body/tool arguments cannot switch scope.
- Model-generated role/org/run fields are ignored or rejected.
- Published SOPs cannot be edited through draft endpoints.
- Expired/invalid JWTs and inactive users are rejected.
- LiveKit tokens are room-scoped and dispatch failure does not return false success.
- Unsupported/malicious uploads fail within configured limits.
- SOP and web prompt-injection fixtures cannot trigger tools or alter system policy.
- Evidence URLs expire and require authorization to mint.
- Logs and exports contain no passwords, tokens or secret headers.
