# PIOS implementation scope

This consolidates the owner's requests through the instruction to start development on 2026-11-04. Features are requirements, not claims of completion. See implementation status and test evidence before advertising them.

## Product and architecture
- Public multi-user product serving students/professionals, freelancers/small teams and businesses, with self-hosted support.
- Next.js/TypeScript frontend, Java/Spring Boot backend, PostgreSQL/pgvector, LLM gateway and evaluated RAG, Docker and Kubernetes.
- Portfolio evidence, reproducible demos, operating documentation and eventually paid client plans; never invent usage or revenue metrics.

## Notes and capture
- Notion-inspired page covers, icons, repositioning, rich text and searchable slash commands: formatting, headings, code languages, tables, lists/checklists and diagrams.
- Visible pin/unpin, fullscreen and archive/restore; overflow: confirmed permanent deletion, PDF, CSV and standalone HTML exports.
- Reliable account-backed saving, save/error/retry feedback, search, order, colours, archives, keyboard shortcuts and portability.
- PeekyNotes-inspired desktop companion: screen-edge deck, previews, floating windows, global shortcuts, fullscreen awareness and desktop startup. Browser shortcuts must be labelled as tab-scoped.

## iPad, handwriting and Draft
- Responsive touch/stylus experience with editable ink, pens/highlighters, eraser, selection, shapes and undo/redo.
- Draggable/collapsible writing palette, AI entry near top-left and bottom-right.
- Separate Draft rough-work surface: minimise/reopen, clear with undo, multiple sheets, unbounded panning; zoom controls included until the owner's ambiguous fixed-scale/zoom preference is settled.
- White, black, warm, ruled, grid and dotted paper independently of app theme; comfortable contrast without medical claims.
- Editable Excalidraw diagrams and reusable library elements; promote useful rough work into notes.
- Suggested enhancements: handwriting recognition/search, lasso-to-AI, split-screen study, canvas bookmarks, version recovery, presentation pointer. These require their own implementation and validation.

## Learning and video
- Embedded YouTube video alongside editable notes, timestamp navigation, whole-video or selected-section notes, code and diagrams; unavailable transcripts must be reported honestly.
- User chooses existing video content or PIOS-generated video.
- Review text, code and diagrams before generating learning material. Show evidence, proposed corrections and uncertainty; user approval precedes video generation. Existing videos should be checked for topic alignment and conflicts.
- Match the generated notes to visual explanations and video sections; support annotation, exercises and study actions.
- Rendering/video and transcription providers must be actual working integrations; never substitute a fake success response for generation.

## Integrations and trust
- Connect Slack, Google Drive, GitHub, Replit and other supported services; MCP server support with scoped tools/knowledge, explicit consent and disconnect controls.
- Real OAuth/provider configuration, encrypted credentials and account/organisation isolation. No simulated connected accounts.
- Clear local-only, synced and remote-AI data boundaries; provider budgets, abuse controls, safe uploads/endpoints, recovery/export/deletion, backups and monitoring.
- Organisation permissions, billing, desktop packaging, Kubernetes deployment and external provider verification must be validated before claiming public production readiness.

## Peek folder and reference motion — accepted 2026-11-05
- Peek has its own Peek notes folder; existing notes are not automatically incorporated. New Peek notes are created there; users may deliberately move existing notes into it.
- Match the supplied recording's colored retracting tabs, sliding hover previews, pastel handwriting-style floating cards, compact formatting controls and open/close motion in the main browser and companion; preserve autosave/retry and reduced-motion support.
