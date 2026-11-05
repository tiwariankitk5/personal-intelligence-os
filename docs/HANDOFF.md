# PIOS handoff

Updated: 2026-11-05. Replace stale status at milestone boundaries; do not append chat history.

## Current state
- Repository: tiwariankitk5/personal-intelligence-os. Branch: `codex/complete-note-workspace`.
- Draft PR #3: https://github.com/tiwariankitk5/personal-intelligence-os/pull/3, stacked on production-readiness PR #2. No main merge or public deployment.
- Notes/editor/Draft milestone and responsive/resizable columns are implemented. Main navigation auto-hides after tab selection. Formatting palette is draggable with saved horizontal/vertical preference. Evidence/limits: `docs/EDITOR_VALIDATION.md`.
- Shared authentication quotas/cooldowns and redacted audit logging: `docs/AUTH_ABUSE_PROTECTION.md`.
- New semantic retrieval milestone: opt-in embedding provider/model separate from chat, pgvector + full-text fusion, SQL-triggered chunk refresh, leased/retryable indexing, shared daily embedding budgets, status/rebuild controls and exact passage citations. Configuration and limits: `docs/SEMANTIC_RAG.md`.
- Validation: 37 Java tests and frontend tests/typecheck/production build passed. Real PostgreSQL/HTTP synthetic-provider smoke passed indexing lifecycle, account isolation, profile rebuilds, failure recovery, duplicate-work protection with two workers and concurrent budget enforcement. Browser checks passed settings, consent, real-model previews and expandable citations; chat generation used a labelled fixture.
- Real local MiniLM evaluation: 8 synthetic questions, hybrid recall@5/MRR/top-1 0.75 versus keyword 0.50; two misses retained. See `docs/evaluation/`. Do not imply broad production-quality validation or paid-model answer testing.
- Local V6 upgrade passed content-fingerprint preservation and normal API smoke checks; chunks were backfilled with semantic processing disabled. Final frontend/backend Docker builds passed. Right-edge note shortcuts passed hover, scrolling, keyboard, save-before-switch, failed-save retry, fullscreen and mobile checks; temporary test notes were removed. Baseline CI passed on f41d963; new Learning/deck changes require their own CI.

## Active work
- User prioritized Courseit-inspired Learning implementation. V7/course API and LearningWorkspace UI implemented; 47 Java / six frontend tests and production builds pass. PostgreSQL lifecycle/ownership/quota smoke and Edge course create/complete/reload checks passed. Deployed locally at localhost:3100/8180; backend restart requires sign-in. Existing API regression smoke passed against disposable V7. See docs/LEARNING_DIRECTION.md for scope.
- PeekyNotes-inspired WEB edge deck implemented and browser-tested; see docs/PEEK_DECK.md. Native Windows/Mac companion, OS overlays/global shortcuts and automatic live cross-device synchronization remain pending.
- Both CI jobs passed on f41d963 (run 41990015034); this result predates Learning changes.

## Next work / limits
- Verify CI on the exact published commit, then expand relevance/abstention evaluation using representative held-out content and the chosen production embedding/chat models.
- Public release still requires trusted ingress, broader inference concurrency/spend controls, recovery/verification, backup restore and upload isolation. Embedding budgets are not a dollar cap.
- Physical Apple Pencil/iPad and final PDF rendering remain unverified. YouTube/video ingestion, OAuth/MCP connectors, billing, durable shared sessions and Kubernetes remain open.
- Requirements: `docs/ACCEPTED_REQUIREMENTS.md`; release blockers: `PRODUCTION_READINESS.md`. Distributed systems guide source remains in `docs/study-notes/`; user account contents may have changed.

## Environment
- Normal local app http://localhost:3100; API http://localhost:8180. Verify Compose mappings. Preserve unrelated containers/data.
- Sessions are in memory; backend restart requires sign-in. No credentials belong here.
- Use AGENTS.md and `.agents/skills/pios-development/SKILL.md`; quiet verifier: `scripts/verify-pios.ps1`. Ignored `.validation/` holds test logs/screenshots and optional CPU-model cache.
- The isolated RAG test project/volumes and test-only provider processes were removed after verification. Test logs/screenshots and the optional CPU-model cache remain ignored; the normal user stack remains running.
