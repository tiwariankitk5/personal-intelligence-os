# PIOS handoff

Updated: 2026-11-05. Replace stale status at milestone boundaries; do not append chat history.

## Current state
- Repository: tiwariankitk5/personal-intelligence-os. Branch: `codex/complete-note-workspace`.
- Draft PR #3: https://github.com/tiwariankitk5/personal-intelligence-os/pull/3, stacked on production-readiness PR #2. No public deployment or main merge.
- Notes milestone includes covers/slash commands, persisted editable diagrams, Draft sheets, import/export, serial save/retry and browser sessions/CSRF. Evidence/limits: `docs/EDITOR_VALIDATION.md`.
- Three desktop columns resize by drag/keyboard and remember browser widths. Folder deletion preserves notes in Inbox; note-list deletion confirms. Notes fill remaining viewport height; cards show title/delete only. Main navigation auto-hides after selecting any tab and reopens from the top-left menu.
- Authentication safeguards now use shared PostgreSQL counters, source/account quotas and failed-login cooldowns on browser and legacy routes. Logs contain keyed references rather than raw identities or credentials. Details: `docs/AUTH_ABUSE_PROTECTION.md`.
- Validation: 30 Java tests and frontend tests/typecheck passed. Isolated real PostgreSQL/API smoke passed cooldown recovery, both auth routes, quotas, unknown-account parity and spoofed-forwarding rejection. The disposable smoke deliberately exhausts quotas; never run it on the user's stack.
- Formatting-toolbar drag sizing fixed by clearing bottom positioning; drag bounds stay on screen. Users choose horizontal or vertical orientation, remembered in the browser. Both layouts and edge dragging passed tablet/phone viewport checks; frontend/backend production builds and normal API smoke passed after local application.

## Next work / limits
- Check CI on the exact latest published commit. Next product milestone: embeddings + pgvector/hybrid retrieval with account isolation and citations.
- Public release still needs trusted ingress configuration, AI spend/concurrency controls, recovery/verification, backup restore and upload hardening. Auth limits do not complete production readiness.
- Physical Apple Pencil/iPad and final PDF rendering remain unverified. YouTube/video ingestion, OAuth/MCP connectors, billing, durable shared sessions and Kubernetes remain open.
- Requirements: `docs/ACCEPTED_REQUIREMENTS.md`; release blockers: `PRODUCTION_READINESS.md`. Distributed systems source guide: `docs/study-notes/`; current account contents may have been changed by the user.

## Environment
- Local user app: http://localhost:3100; API: http://localhost:8180. Verify Compose mappings. Preserve unrelated containers/data.
- Sessions are in memory; backend restart requires sign-in. No credentials belong in this file.
- Use AGENTS.md and `.agents/skills/pios-development/SKILL.md`; quiet verifier: `scripts/verify-pios.ps1`.
- Ignored `.validation/` holds logs, browser checks and screenshots. The temporary `pios-auth-validation` project and its disposable volumes were removed after quota tests; the user stack remains running.
