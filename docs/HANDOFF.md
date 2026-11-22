# PIOS handoff

Updated: 2026-11-23. Replace stale status at milestone boundaries; do not append chat history.

## Current state
- Latest UI milestone: sticky workspace top bar; collapsible note-folder rail; main navigation collapses to icons after selecting a section. Profile menu contains Settings and Sign out; standalone Settings entry removed.
- Peek final accepted behavior: restored sliding title tabs plus color-matched previews anchored to the hovered tab. Dark plus, immediate grip drag, saved four-edge docking and reduced-motion support remain. Hover/focus on plus or grip dismisses the prior note preview; leaving Peek closes the browse panel and retracts pointer-opened tabs. Today’s large-paper-card/pill animation experiments were reverted at the user’s request.
- Root HTML now uses force-dynamic/no-store so new deployments load fresh asset references. Local frontend updated at localhost:3100; latest fresh URL ?update=peek-control-dismiss-20261123.
- Validation: frontend tests/typecheck and production Docker build passed. Isolated browser fixtures verified rails, account menu/logout, hover colors/alignment, mouse/touch docking and the recording-specific note-to-control dismissal. Evidence/helpers remain ignored under .validation/. Physical iPad and native animation were not verified by these checks.
- Repository: tiwariankitk5/personal-intelligence-os. Branch: `codex/complete-note-workspace`.
- Draft PR #3: https://github.com/tiwariankitk5/personal-intelligence-os/pull/3, stacked on production-readiness PR #2. No main merge or public deployment.
- Notes/editor/Draft milestone and responsive/resizable columns are implemented. Main navigation auto-hides after tab selection. Formatting palette is draggable with saved horizontal/vertical preference. Evidence/limits: `docs/EDITOR_VALIDATION.md`.
- Shared authentication quotas/cooldowns and redacted audit logging: `docs/AUTH_ABUSE_PROTECTION.md`.
- New semantic retrieval milestone: opt-in embedding provider/model separate from chat, pgvector + full-text fusion, SQL-triggered chunk refresh, leased/retryable indexing, shared daily embedding budgets, status/rebuild controls and exact passage citations. Configuration and limits: `docs/SEMANTIC_RAG.md`.
- Validation: 37 Java tests and frontend tests/typecheck/production build passed. Real PostgreSQL/HTTP synthetic-provider smoke passed indexing lifecycle, account isolation, profile rebuilds, failure recovery, duplicate-work protection with two workers and concurrent budget enforcement. Browser checks passed settings, consent, real-model previews and expandable citations; chat generation used a labelled fixture.
- Real local MiniLM evaluation: 8 synthetic questions, hybrid recall@5/MRR/top-1 0.75 versus keyword 0.50; two misses retained. See `docs/evaluation/`. Do not imply broad production-quality validation or paid-model answer testing.
- Local V6 upgrade passed content-fingerprint preservation and normal API smoke checks; chunks were backfilled with semantic processing disabled. Final frontend/backend Docker builds passed. Right-edge note shortcuts passed hover, scrolling, keyboard, save-before-switch, failed-save retry, fullscreen and mobile checks; temporary test notes were removed. Learning/deck CI passed on 604ba92; new desktop changes require their own CI.

## Active work
- User prioritized Courseit-inspired Learning implementation. V7/course API and LearningWorkspace UI implemented; 47 Java / six frontend tests and production builds pass. PostgreSQL lifecycle/ownership/quota smoke and Edge course create/complete/reload checks passed. Deployed locally at localhost:3100/8180; backend restart requires sign-in. Existing API regression smoke passed against disposable V7. See docs/LEARNING_DIRECTION.md for scope.
- Main browser and native Peek now share frontend/src/components/floating-note-editor.tsx. Browser localhost:3100 has colored edge tabs, sliding hover previews, pastel handwriting-style cards, formatting and direct serial autosave. Peek now uses only the dedicated Peek notes folder (created/reused on first New Peek note); existing notebook content is not moved or imported. Local normal-stack update completed; sign-in may be needed after refresh. Folder isolation/reuse, persisted formatting, stable animation hit targets, close/reopen cancellation, reduced motion, drag/expand, archive Undo, failed-save retention, rich-block preservation and 390/820px layouts passed; native and Learning regressions also passed. Desktop host build remains desktop/dist/video-preview; browser update requires a page refresh. See docs/PEEK_DECK.md and desktop/README.md. Signed/Mac releases and live cross-device conflict merge remain pending.
- Both CI jobs passed on Learning/deck commit 604ba92 (run 41997094533). New desktop changes require their own CI.

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

Validation note: repeated normal-stack synthetic registrations reached its IP signup quota; remaining checks moved to disposable pios-peek-web-validation on 3130/8280/5632. Test scripts now default to isolated ports. Preserve the normal user database and quota configuration.

Latest motion/folder checks passed on disposable pios-peek-style-validation (3130/8280/5632); remove that project/volumes after verification. Normal app remains personal-intelligence-os (3100/8180/5532).

## Recovery setup — 2026-11-06
- Recovery scripts: scripts/pios-recovery.mjs, recover-github-key.mjs; guide docs/RECOVERY.md. Private release pios-recovery-2026-11-06 holds encrypted DB/uploads/.env/evidence/reference backup, source bundle and portable build. PIOS_RECOVERY_KEY is stored only as a protected GitHub repository secret and ignored local key files. Never commit private recovery data/keys.
- Encryption/tamper/path tests passed; 148 payload checksums verified. Protected key retrieval tested and temporary cloud key artifact/branch deleted. Restore into fresh pios-recovery-validation matched table contents/upload hashes and preserved original app secrets; API/frontend both returned 200. Workers disabled during verification. Normal app restarted and may require sign-in.
- Browser-test manifests are pinned under tools/browser; npm ci --prefix tools/browser reinstalls them. Caches remain ignored. Snapshots are manual; later source/data changes require another push/snapshot.
