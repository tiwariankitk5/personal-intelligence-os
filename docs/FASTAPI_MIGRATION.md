# FastAPI backend migration

The backend is entirely Python: `backend-python/`, Python 3.12 in Docker, FastAPI, Psycopg 3 and PostgreSQL/pgvector. Next.js remains the frontend. Java source, tests, Maven files, runtime configuration and the Java CI job have been removed. Original SQL migrations moved byte-for-byte into `backend-python/migrations/legacy/`; retaining their history protects existing data.

## Preserved features

- Existing `/api/v1` paths and camelCase JSON contracts, including browser session login, legacy JWT endpoints, profile/workspaces, folders/notes, page metadata, drawings, sources/uploads, learning courses/checkpoints/timestamped notes, providers/chat/conversations and retrieval settings/search/retry/rebuild.
- BCrypt password hashes and user UUIDs; AES-256-GCM `v1:` provider credentials use the same encryption key and IV/ciphertext/tag layout. Never regenerate the original `.env` or its encryption key during migration.
- The same database and upload volumes. Existing SQL triggers continue refreshing chunks and filtering archived/deleted material.
- Account ownership checks, HTML sanitization, HttpOnly/SameSite cookies, CSRF, shared authentication quotas/cooldowns, embedding consent/budgets and leased/retryable indexing. Provider requests have timeouts, no redirects and bounded responses. No provider calls are simulated in the application.

Python sessions use hashed opaque tokens in `python_sessions` and survive backend restart/replicas. Spring's Java-serialized sessions are not deserialized: users sign in once after cutover. Session lifetime is 30 minutes idle. Legacy JWTs continue working until expiry. Explicit bearer endpoints retain the existing CSRF requirement for mutations.

## Local development

Docker quick start stays `powershell -ExecutionPolicy Bypass -File scripts/start-pios.ps1`. Compose builds the Python backend from the repository root. Existing mapped ports remain unchanged.

For Python development, from the repository root:

```powershell
python -m venv backend-python/.venv
backend-python/.venv/Scripts/python.exe -m pip install -r backend-python/requirements-dev.txt
powershell -ExecutionPolicy Bypass -File scripts/verify-pios.ps1 -Scope backend
```

Supply the existing database/secrets as environment variables or Docker secret files; the app does not silently load `.env` into a local Python process. Then start from `backend-python/`:

```powershell
.venv/Scripts/python.exe -m uvicorn pios.main:create_app --factory --host 127.0.0.1 --port 8080 --no-proxy-headers --no-access-log
```

API schema: `/openapi.json`; interactive reference: `/docs`; readiness/liveness remain `/actuator/health/readiness` and `/actuator/health/liveness`. Docker uses a non-root user. Runtime dependencies are pinned in `requirements.txt`; development/test tools are separate in `requirements-dev.txt`. `-Build` verifies the image; `-Audit` runs pip-audit.

## Schema and rollback

The startup migrator validates Flyway's existing line-normalized CRC32 history and applies only unapplied original SQL under a PostgreSQL advisory lock. It refuses checksum mismatches. Python-specific additive SQL has a separate SHA-256 history in `pios_python_migrations`. Do not edit an applied migration or repair a mismatch without investigating it.

An encrypted database/uploads backup was authenticated before the Python cutover. Previous source versions remain recoverable through Git history. The active branch does not include a Java runtime or rollback build. Roll back using a known-good release and an explicit recovery plan; never run `down -v`, overwrite `.env`, or restore over a live database. Source backup/push and data backup are separate operations.

## Scaling and remaining release work

- Add API replicas behind a trusted ingress; they share PostgreSQL sessions and quotas. Each process has a pool capped at 10 connections; reserve database capacity for workers/migrations and size replicas accordingly. No load-test capacity claim is made.
- Indexing can run in a dedicated process with `python -m pios.worker`; disable `PIOS_RAG_WORKER_ENABLED` in API replicas when doing so. `SKIP LOCKED`, leases, versions and profile checks prevent stale or duplicate writes. This worker is for embeddings, not a general video/PDF execution queue.
- Synchronous route functions run in the ASGI thread pool; external calls do not block the event loop, but still consume threads. CPU-heavy PDF/model/video work needs resource-limited worker processes. Python async is not a CPU speedup.
- Forwarded headers are disabled by default. Until operators establish a trusted proxy chain and block direct access, clients behind NGINX share a source-IP quota. Do not use unrestricted `--forwarded-allow-ips '*'`. CloudPanel/NGINX/HTTPS deployment remains pending server access verification.
- PDF extension/signature/UTF-8 checks, page and extracted-text limits are implemented. Antivirus scanning, hard parser execution time/resource isolation and asynchronous failure reporting remain launch blockers.
- Recovery/verification emails, full AI spend/concurrency limits, multi-device conflict recovery, scheduled backups/alerts, operational dashboards, billing, device certification and wider RAG quality/security evaluation remain open. A framework migration does not complete production readiness.

## Verification

Real PostgreSQL tests cover shared/restarted sessions, cross-replica logout, transaction rollback, account isolation, original BCrypt hashes and migration idempotence. An old Java Docker service created accounts, JWTs, notes and encrypted keys; Python adopted its Flyway history and preserved stored rows exactly. The Java service was also restarted against the upgraded disposable database to check rollback compatibility.

Existing `smoke-test.mjs`, `rag-smoke-test.mjs`, `learning-smoke-test.mjs` and `auth-abuse-smoke.mjs` verify the Python API over HTTP. RAG/lesson generation checks use the explicitly labelled local provider fixture, not paid-provider or real-model quality claims. `fastapi-browser-smoke.cjs` forwards the existing frontend's requests to a real isolated FastAPI Docker service and verifies note loading/reload and learning save/completion. It never redirects the user's normal signed-in browser.

Tests requiring PostgreSQL deliberately skip without `PIOS_TEST_DATABASE_URL`. This variable must point only to a disposable test environment. CI builds and verifies Python. The original cross-language adoption test was run before removal; credential format and persisted-session regression tests remain in Python.
