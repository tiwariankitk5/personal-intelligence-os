# PIOS: product and engineering direction

## Objective

Build a public, multi-user knowledge application that can serve paying clients and demonstrate the owner's Python, AI engineering and deployment skills. The owner selected FastAPI on 2026-11-23; the previous Java source has been removed from the active branch. Keep a runnable self-hosted edition. Validate the first paying customer segment before expanding the feature set.

The owner wants to serve students/professionals, freelancers/small teams and businesses. Use one shared knowledge engine with audience-specific onboarding: studying from notes, finding client/project material, and answering internal knowledge questions. Business team permissions and administration require additional implementation and testing; personal account isolation is not organisation tenancy.

## First complete workflow

An account uploads documents, sees their processing state, asks a question, receives an answer with verifiable passage citations, and can return to the conversation later. Notes are editable, reliably saved, searchable and available as retrieval context. When evidence is missing, the assistant says so.

## Technology mapped to real responsibilities

| Area | Implementation direction | Evidence required |
| --- | --- | --- |
| Frontend | Next.js, React, TypeScript; accessible, responsive workspace with onboarding and reliable error/retry states | Browser tests, screenshots and an accessible working demo |
| Python backend | FastAPI modular monolith; account authorisation, ingestion jobs, AI gateway, usage and billing boundaries | API contracts, isolation tests, observable request/job lifecycle |
| Relational storage | PostgreSQL, Flyway migrations and transactional application data | Real migration/integration tests and a restore demonstration |
| Vector retrieval | pgvector for embeddings; independent embedding model configuration; lexical + vector retrieval with account filters | Retrieval evaluation dataset, measured relevance and citation correctness |
| RAG | Bounded parsing, chunking, asynchronous indexing, hybrid retrieval, optional reranking, grounded generation and passage citations | Tests for ingestion failures, irrelevant evidence, private-data isolation and prompt injection |
| LLM integration | Provider adapters, request timeouts, streaming, cancellation, token usage, budgets and redacted diagnostics | Provider contract tests, failure handling and measured latency/cost |
| Docker | Reproducible frontend/backend images and local PostgreSQL stack | Clean-machine build and smoke-test instructions |
| Kubernetes | Staging deployment, probes, resource limits, configuration/secrets, ingress/TLS and rollout/rollback | Successful staging deployment, restart/rollback exercise and operating guide |
| Delivery | CI tests/builds, dependency scanning, staging verification and release checks | Passing CI on the actual commit and reproducible release artifacts |
| Operations | Durable sessions for multiple replicas, backups, monitoring and alerts | Multi-replica test, restored data and visible operational dashboards |

Use a background worker within the Java application initially. Add infrastructure such as a message broker only when durable job dispatch, retry or throughput requirements justify it. Keep architectural decisions documented with the problem and tradeoffs.

## Implementation milestones

1. **Trustworthy baseline:** authentication/CSRF, account isolation, CI, build reproducibility, upload/endpoint restrictions and reliable notes.
2. **Useful knowledge assistant:** asynchronous ingestion, real vector embeddings, hybrid retrieval, passage-level citations, conversation history and retrieval evaluations.
3. **Deployable service:** Docker stack verification, PostgreSQL integration tests, shared sessions, staging Kubernetes configuration, TLS, backups, monitoring and rollback.
4. **Client pilot:** choose one customer workflow, onboard pilot users, collect permissioned feedback, and measure successful answers, ingestion failures and time to first useful answer.
5. **Commercial release:** verified account recovery and data controls, explicit plans/quotas, enforced usage limits, payment webhooks and support procedures. Validate pricing with customers rather than inventing revenue assumptions.

## Portfolio and resume evidence

Publish an architecture diagram, brief demo, setup guide, API documentation, CI results, measured retrieval evaluation and deployment runbook. Use test documents in public demos. Keep private client documents and credentials out of screenshots and commits.

Resume statements must distinguish implemented features, tested deployments and future plans. Only describe semantic retrieval, Kubernetes operations, paying customers or measured performance once there is evidence. Do not invent user counts, revenue, latency gains or accuracy metrics.

## Current boundaries

The repository presently has keyword retrieval, not a completed semantic/hybrid RAG pipeline. Kubernetes deployment and paid plans are not implemented. The new browser-session work is a foundation; multiple replicas still need shared session persistence. See `PRODUCTION_READINESS.md` for findings and validation status.
