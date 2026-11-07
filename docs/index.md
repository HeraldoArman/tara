# TARa — production implementation plan

**Status:** Proposed  
**Date:** 2026-11-06  
**Source of product truth:** the existing HTML prototype in this repository  
**Purpose:** turn the prototype into a real, low-latency, SOP-guided work execution system without reproducing the complexity of the previous Memora project.

## Start here

Read [Executive summary](executive-summary.md) first, then follow the documents in order.

| Document | What it defines |
| --- | --- |
| [Executive summary](executive-summary.md) | Product direction, architecture, scope, delivery order and major risks |
| [01 — Product scope](01-product-scope.md) | Prototype parity, user journeys and the silent-by-default interaction contract |
| [02 — Architecture](02-architecture.md) | Monorepo, services, technology choices, runtime flows and deployment boundaries |
| [03 — SOP, RAG and agent](03-sop-rag-agent.md) | SOP decomposition, execution state machine, tools, vision and retrieval |
| [04 — Data, audit and RBAC](04-data-audit-rbac.md) | Database records, evidence, logging, reports, evaluation and permissions |
| [05 — API and frontend](05-api-frontend.md) | Routes, API surface, realtime messages, UI states, accessibility and PWA behavior |
| [06 — Latency and observability](06-latency-observability.md) | Latency budgets, bounded vision, metrics, cost controls and failure behavior |
| [07 — Security and privacy](07-security-privacy.md) | Minimal JWT auth, secrets, untrusted content, evidence access and data limits |
| [08 — Testing and deployment](08-testing-deployment.md) | Test matrix, release gates, CI, environments, rollout and recovery |
| [09 — Roadmap and risks](09-roadmap-risks.md) | Implementation milestones, tradeoffs, risk register and deferred work |
| [10 — New design reference](10-new-design.md) | Redesigned workspace provenance, visual direction and presentation-only controls |
| [11 — Railway deployment](11-railway-deployment.md) | Railway IaC, Docker services, networking, secrets, migrations, rollout, recovery and operating runbooks |
| [References](references.md) | Official documentation and local evidence used for this plan |

## Fixed product decisions

These decisions are inputs, not open questions:

1. **Frontend:** Better-T-Stack with Next.js, Bun, Nx, PWA, Ultracite and Docker.
2. **Backend:** Python, FastAPI, PostgreSQL 18, SQLAlchemy Async and Alembic.
3. **Realtime AI:** one LiveKit Agents worker using the direct OpenAI Realtime plugin.
4. **SOP documents:** Markdown, TXT and text-based PDF. No DOCX or OCR requirement in v1.
5. **SOP decomposition:** AI generates a structured draft; a human publishes it.
6. **Execution:** the server, not the model, owns the current SOP version, current step and transitions.
7. **Visual steps:** AI can complete visual steps when every required criterion passes and fresh evidence is stored.
8. **RAG:** use it for grounded SOP questions, not for workflow state. Start with PostgreSQL full-text search.
9. **Organization:** one company with organization IDs retained on business records.
10. **Authentication:** simple username/password JWT plus four-role RBAC. No separate auth workstream.
11. **Silent by default:** no greeting, narration or spoken confirmation for correct work.
12. **Proactive speech:** allowed only for detected mistakes, exceptions, unsafe actions or similar alerts.
13. **On-demand help:** the technician clicks **Ask TARa** before normal voice or text conversation is enabled.
14. **Previous Memora project:** do not copy its architecture. Learn only from its measured complexity and latency problems.
15. **New design:** the extracted `new-design/` workspace is a visual redesign only. It introduces no functional changes and does not override the execution, agent, audit or authorization requirements in these documents.
16. **Deployment:** Railway with Next.js, FastAPI and LiveKit worker services, PostgreSQL 18, private evidence storage and reviewed TypeScript IaC. Legacy `railway.json` is not used for new services.

## The main idea

TARa is not a conversational assistant that happens to display an SOP. It is an **SOP execution system with a restrained realtime assistant**:

- Correct work advances quietly through visible checks and UI updates.
- A failed visual criterion, incorrect choice or recorded exception triggers a short corrective spoken alert.
- Pressing **Ask TARa** explicitly enables normal questions, explanations, reference retrieval, parts lookup and web search.
- Every attempt, mistake, frame, tool call and review is preserved for later evaluation.
- AI proposes results and explanations; deterministic server code authorizes every state change.

## Important detection boundary

The agent does not continuously judge every physical movement. Proactive corrections are triggered by:

- automatic or requested visual checks;
- submitted attestations and structured choices;
- retry, skip, unsafe-action and escalation requests;
- media, tool and execution failures that need technician attention.

This keeps latency and cost bounded. A mistake made between checks may remain undetected until the next check. Continuous activity recognition is explicitly deferred.

## Implementation rules

- Build one database-backed WO-1042 vertical slice before generalizing the UI.
- Test the SOP state machine without AI before connecting realtime tools.
- Keep one realtime agent and at most one consecutive tool call per user turn.
- Keep business logic in shared Python services used by FastAPI and the worker.
- Do not add infrastructure for hypothetical scale.
- Treat AI confidence as diagnostic data, not calibrated proof.
- Do not claim that AI verification is equivalent to human safety certification.
- Keep the static prototype available as `prototype/` when implementation begins.

## Glossary

| Term | Meaning |
| --- | --- |
| SOP version | Immutable, published procedure definition pinned to new runs |
| Run | One execution of a work order using one pinned SOP version |
| Run step | Current projected state of one step in a run |
| Attempt | One visual check, attestation or structured response; failures create history, not silent overwrites |
| Evidence | A frame or other artifact linked to an attempt and criterion results |
| Silent mode | Default execution mode with normal microphone conversation and non-alert speech disabled |
| Alert mode | Short, proactive corrective speech caused by an eligible server-recorded event |
| Consultation mode | User-activated question/answer mode entered through **Ask TARa** |
| RAG | Retrieval of approved source excerpts to ground an answer; not a mechanism for changing workflow state |

## Out of scope for v1

Multi-tenant administration, SSO/MFA, refresh-token infrastructure, user-admin UI, OCR, DOCX, offline AI completion, continuous raw media retention, multi-agent handoffs, proactive planners, memory extraction, Neo4j, a standalone vector database, Redis, Kubernetes and general-purpose workflow builders.
