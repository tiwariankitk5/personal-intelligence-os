# Public multi-user release assessment

Target confirmed by the owner: a public application with multiple users. Scope is this repository, including its existing feature branches. Assessment started 2026-11-04 against main commit `0c8ba20`.

## Verified baseline

- Frontend dependencies installed successfully; a package lock now records the resolved dependency tree.
- Frontend TypeScript check and Next.js production build passed on Windows.
- Backend compiled for Java 21 and all 12 tests passed under the available JDK 25. Repeat on Java 21 in CI.
- Four new regression tests cover pasted-text deletion, uploaded-file deletion, missing sources, and rejecting deletion of another account's source/file.
- Fixed deletion of pasted-text sources: a nullable storage key previously made an existing source look absent.
- Added GitHub Actions jobs for backend verification and frontend typecheck/build. These jobs have not yet run on GitHub.
- Docker images built and the isolated stack started successfully on frontend port 3100, API port 8180 and database port 5532. Existing PIOS containers were preserved. The launcher now respects configurable ports and container names are scoped by Compose project.
- Real PostgreSQL/pgvector startup and Flyway migrations passed. The reusable API smoke test passed session cookie flags, CSRF, private notes/sources/objectives, uploaded text files, source deletion and logout.
- Browser registration, session restoration on reload, quick capture, saved-note persistence after reload and sign-out were verified against the Docker stack. Full browser coverage, idle-expiry timing, HTTPS and external AI providers remain outstanding.

## Release blockers and acceptance criteria

| Priority | Finding / evidence | Required outcome |
| --- | --- | --- |
| P0 | Browser session/CSRF foundation implemented with integration tests; cookies default secure and logout invalidates sessions. | Verify real browser cookies, idle expiry and HTTPS deployment. Add shared session persistence before multiple replicas, account recovery and verification, and independent review. |
| P0 | `AiGatewayService` accepts stored custom endpoints and creates clients without application-configured timeouts. Local host bridge support is part of the self-hosted product. | Define hosted-mode endpoint policy, enforce outbound destination restrictions at application and network levels, reject redirects/private and metadata destinations, set timeouts and response limits, test malicious endpoints. Preserve local inference only through a separately supported local deployment or authenticated bridge. |
| P0 | Login/registration and AI requests have no demonstrated rate/spend enforcement. | Enforce distributed abuse limits, concurrent request limits and account/provider budgets; test enforcement before upstream requests. |
| P0 | Unit/integration tests use H2; the real Docker smoke test now exercises Flyway and PostgreSQL. CI is configured to run the same API smoke test against pgvector. | Verify the new CI run and extend isolation coverage to all reads/writes, providers and conversations; add concurrent-write and migration-upgrade tests. |
| P0 | File parsing is synchronous; upload size limits alone do not bound PDF extraction or indexing work. | Bound parsing time, pages, extracted text and chunk counts; validate content; add scanning and a processing lifecycle with retry/error UI. |
| P0 | Compose is configured for localhost development. | Establish staging and production hosting, TLS, trusted proxy configuration, private DB/uploads, secret management, health/readiness checks and rollback. |
| P0 | Backups and restore procedures are not verified. | Automate database and upload backups, preserve encryption keys separately, and demonstrate a restore into an isolated environment. |
| P1 | Note persistence optimistically updates state; error recovery reloads workspace data. Concurrent save requests are not coordinated. | Prevent stale saves from overwriting newer edits; display saving/saved/failed state, offer retry and protect unsaved edits. Verify rapid edits and network failures. |
| P1 | Search results and recent note links select the Notes screen without identifying the selected note. | Open the exact result, preserve search context and support keyboard navigation. |
| P1 | Workspace fetch failure is shown via a temporary toast and initial empty content can resemble a genuinely empty account. | Persistent error/retry states per screen and accurate connection status. |
| P1 | Existing conversation endpoints are not exposed as a history browser in the connected UI. | Restore conversations after reload, expose history and source navigation, and handle missing provider/setup clearly. |
| P1 | Account recovery, verification, data export/deletion and privacy lifecycle are incomplete. | Implement and test recovery, verification, retention and user data controls before general availability. |
| P1 | No demonstrated end-to-end coverage or production monitoring. | Verify signup/login, notes, uploads, provider setup and chat in browser tests; add redacted logs, request IDs, metrics and alerts. |

## Branch reconciliation

- `main`: connected V1; starting point for this assessment.
- `feature/notes-editor-workspace`: richer editor and Excalidraw scene persistence; contains a V3 note metadata migration.
- `feature/chatgpt-plan-usage`: another editor implementation plus experimental ChatGPT account integration; contains a different V3 migration.

These branches cannot be treated as interchangeable completed features. Compare API contracts, editor persistence and sanitisation, reconcile migration numbering before combining them, and test preservation of existing notes. The experimental account integration requires its own eligibility and hosted-deployment review before inclusion in the public application.

## Delivery order

1. Reproducible builds, CI, regression fixes and branch reconciliation.
2. Authentication, isolation, outbound endpoint controls and upload hardening.
3. Reliable notes, search/navigation, onboarding, source processing and conversation history.
4. Staging deployment, real PostgreSQL/browser tests, backup restore, monitoring and security review.
5. Public release only after the release blockers have evidence attached. Semantic retrieval, OCR, integrations and billing are separate product milestones unless required for the first release.

This document records an initial assessment and implementation backlog. It does not certify production readiness or claim that every file and feature branch has received a complete security review.
