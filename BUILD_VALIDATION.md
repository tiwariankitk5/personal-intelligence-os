# PIOS V1 — build and validation status

This file records checks actually completed when this archive was prepared.

## Checks completed

- `frontend/package.json`: valid JSON.
- `backend/pom.xml`: valid XML.
- `compose.yaml`: valid YAML; defines `db`, `backend`, and `frontend` services plus persistent database and upload volumes.
- All 11 frontend `.ts` / `.tsx` files: parsed using the installed TypeScript transpiler with zero syntax diagnostics.
- Note destination smoke cases: Spring Boot routes to Backend Engineering, RAG routes to AI & Machine Learning, a matching Spring Boot page is suggested, and unrelated content falls back to Inbox.
- Flyway migration files contain all core tables used by the V1 backend.
- Added JUnit tests for provider-key encryption/decryption, fresh IV generation, and tamper detection. These tests are included but have not been executed in this environment.

## Checks not completed here

The build container did not have Docker or Maven installed, and external package-registry access timed out during a frontend dependency-install attempt. Therefore the following have **not** been verified in this environment:

- `docker compose build` / `docker compose up`.
- Maven compilation, Spring context startup, Flyway migration against PostgreSQL, or JUnit execution.
- Full Next.js typecheck or production build.
- Live provider API calls (these require the user's API key and network access).
- End-to-end account, file upload, notes, and AI chat flows in a browser.

The included Windows launcher performs the real Docker build/start sequence, waits for backend health and frontend HTTP readiness, and reports Docker logs if startup fails. Run it on a machine with Docker Desktop and internet access. If a build fails, use `scripts/diagnose-pios.ps1` and preserve the error output so the issue can be fixed without guessing.

## Known product limitations

This is a self-hosted local V1. It is not a production SaaS release. Keyword-based knowledge retrieval is implemented; embedding generation and semantic vector retrieval are not. OAuth connectors, billing/credits, multi-task model routing, scanned-PDF OCR, URL/video ingestion, a complete knowledge graph, agent workflow execution, multi-user organisation collaboration, and desktop quick capture remain future work. Browser access tokens currently use localStorage; secure HttpOnly cookie auth and a reviewed CSRF approach are required before public deployment.
