# PIOS working guide

- Read `docs/HANDOFF.md` for the current stopping point. Use `docs/ACCEPTED_REQUIREMENTS.md` only for the relevant feature; do not load all documentation by default.
- Implement the user's bounded milestone. Distinguish implemented, verified and planned behavior; this app is not yet public-production ready.
- Map: `frontend/` Next.js/React/TypeScript; `backend/` Java 21 Spring Boot; PostgreSQL/pgvector; `scripts/` local tooling; `.github/workflows/ci.yml` full CI checks.
- Search relevant paths with `rg`; exclude generated output unless debugging it. Read excerpts and concise diffs rather than whole large files or logs.
- Use `.agents/skills/pios-development/SKILL.md` for PIOS implementation/testing work. Keep detailed workflow guidance there, not duplicated here.
- Start local stack: `powershell -ExecutionPolicy Bypass -File scripts/start-pios.ps1 -SkipBrowser`. Diagnose with `scripts/diagnose-pios.ps1`; preserve unrelated containers and existing data.
- Validate: `powershell -ExecutionPolicy Bypass -File scripts/verify-pios.ps1 -Scope frontend` (or `backend`, `full`). Add `-Build` for production compilation; `-Audit` for dependency changes; `-Smoke` for local API integration checks. Failures print a short tail; full logs are under ignored `.validation/`.
- Node 22+; Java 21 is the CI target. Set JAVA_HOME and put Maven on PATH, or pass `-MavenPath`. The verifier can find the existing IntelliJ Maven installation on this machine.
- Preserve account isolation, session/CSRF protection, sanitized rich text, serial save/retry semantics and Flyway migration history. Do not silently replace real services with mock success.
- Keep secrets out of output and Git. Do not read `.env` to understand ports: use `docker compose port`. Existing local app uses frontend 3100/backend 8180; verify rather than assume.
- Run checks relevant to changes once; broaden when failures or shared behavior justify it. Documentation-only edits need no app rebuild. Browser checks supplement automated tests for UI behavior.
- Keep progress brief and report changed behavior, validation and material limits. Update the small handoff at milestone boundaries, not after every edit. Preserve unrelated work; use `codex/` for new branches.
