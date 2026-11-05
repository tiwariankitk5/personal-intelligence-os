# Editor and Draft milestone validation — 2026-11-04

## Implemented

- Integrated the existing notes-editor branch without dropping browser session/CSRF protection.
- Account-persisted note covers, cover position, page icons and white/black/warm/ruled/grid/dotted page settings.
- Searchable, keyboard-navigable slash menu with headings, formatting, code languages, lists, checklists, tables, diagrams, Draft and Ask PIOS.
- Automatic save feedback and a serial write queue. Failed saves remain unconfirmed and can be retried; account changes cancel queued work. This is not cross-device conflict resolution.
- Visible pin, fullscreen/focus mode and archive/restore; confirmed permanent deletion, duplication, CSV, HTML and print-to-PDF actions.
- Sanitised HTML/text import; standalone HTML and CSV exports, including source links, code and table data.
- Editable inline diagrams with persisted Excalidraw scenes and scene libraries.
- Separate account-owned Draft sheets with a draggable/collapsible writing palette, pen/highlighter/eraser/selection/panning, paper choices, clear/undo-clear, save/retry, minimise/restore, new sheets and copy-to-note.
- Approved-host policy for OpenAI-compatible providers, explicit self-hosted local-model opt-in, no HTTP redirect following, connection/read timeouts and correct missing-provider responses.
- Smaller non-root standalone frontend image and Maven dependency caching; removed the unnecessary go-offline step that attempted to resolve optional/private repositories.

## Checks completed

| Check | Evidence |
| --- | --- |
| Java compilation and test suite | 15 tests passed locally; new endpoint-policy tests reject internal/disguised/unauthorised destinations. |
| Frontend save-queue regressions | 4 tests passed: ordering, failure/retry, unchanged/deleted notes and account-generation cancellation. |
| Frontend typecheck and production build | Passed locally and in Docker. |
| Dependency advisories | `npm audit` reported zero known vulnerabilities after scoped overrides. This is not a security certification. |
| PostgreSQL migrations | Existing local database upgraded successfully from V2 through V3/V4 without replacing its data. |
| API smoke test | Passed rich blocks, page settings, notes/sources/objectives/Draft isolation, rejected foreign writes, invalid settings/covers/scenes, missing providers, uploads, deletion, sessions, CSRF and logout. |
| Browser note import | Distributed systems guide imported as actual headings, lists, code and links; account save confirmed. |
| Browser persistence | Guide survived reload and backend rebuild/sign-in; Draft save acknowledged. |
| Automatic page-setting save | Changed the guide's icon, observed the saved acknowledgment, reloaded and verified the icon persisted. |
| Inline diagram lifecycle | Drew a Client → Java API → Postgres diagram, inserted it, reloaded, reopened the original scene and updated it; exactly one preview remained. |
| Browser Draft controls | Drew a stroke; Clear All then Undo Clear restored it; minimised/restored the scratchpad. A dark-paper rendering issue discovered during testing was fixed. |
| Browser exports | Downloaded HTML preserved headings/code/source links; downloaded CSV parsed correctly with the complete note text. |
| Browser actions | Pin/unpin, fullscreen enter/exit and archive/restore exercised; guide left active and unpinned. |

Screenshots are local ignored artifacts under `backend/target/`. The distributed systems guide is also available in `docs/study-notes/`.

## Limits and remaining verification

Toolbar follow-up: dragging clears the sticky bottom offset, preventing a stretched pill. Users can switch horizontal/vertical layout; the browser remembers the choice. Pointer drags, orientation changes, reload persistence and viewport-edge clamping passed browser checks, including tablet/phone sizes. The horizontal palette stays on one row with sideways scrolling when needed. Actual iPad hardware remains unverified. Evidence: ignored `.validation/toolbar-horizontal.png` and `toolbar-vertical.png`.

2026-11-05 follow-up: three desktop columns now have pointer/keyboard resize handles and local browser width persistence. Direct folder and note-list delete actions require confirmation; Inbox cannot be deleted and folder notes are preserved in Inbox. A synthetic-account browser run verified creation, both cancellation paths, both confirmed deletions, server state after reload, resized width persistence and minimum editor width on a smaller viewport. Frontend tests/typecheck passed. Screenshots/logs are under ignored `.validation/`.

- Physical iPad/Apple Pencil, pressure/latency/palm rejection, multi-monitor desktop behaviour and offline operation have not been verified. Desktop companion and global shortcuts are not implemented.
- The PDF action invokes the browser print workflow; a final PDF file has not received a render/layout check.
- Inline diagram insertion/PNG export, recovery after reload and in-place updates passed browser checks. Library item recovery and larger imported scenes need additional coverage.
- Native fullscreen availability depends on the host browser; in-app focus mode is provided as a fallback.
- Exact multi-device conflicts, history recovery, undoable note trash and durable cross-replica sessions remain open.
- The drawing package supports React 19, but pinned upstream Radix dependencies still emit older peer-range warnings. Drawing browser smoke checks passed; retain this compatibility item for ongoing testing.
- Scoped overrides patch `nanoid`, `lodash-es` and `katex` advisories in the drawing dependency tree. Mermaid/math-to-diagram conversion has not been separately validated with those overrides.
- Live model calls and the new note-review action require a configured provider and have not been verified against a paid provider. No API keys were used in tests.
- Full video/YouTube ingestion, transcript acquisition, generated learning videos, semantic RAG, external OAuth/MCP connectors, billing and Kubernetes are not delivered by this editor milestone. See `ACCEPTED_REQUIREMENTS.md`; do not advertise these as implemented.
- Public deployment still requires rate/spend controls, upload isolation, network egress policy, backups/recovery and independent security review.

GitHub CI for this branch must be checked separately after publication; earlier CI results apply to the earlier production-readiness commit.
