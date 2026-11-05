# Courseit-inspired Learning work

Reference reviewed on 2026-11-05: https://www.courseit.xyz/ (public page fetched directly because the web reader could not load it).

The reference describes video/playlist courses, placement tests, video plus article lessons, checkpoint quizzes with timestamp replay, daily 30–120 minute plans, timestamped notes and shared multi-course roadmaps. These are inspiration, not implemented PIOS claims.

## Current implementation milestone
- Expand existing objectives into private courses with ordered video/article lessons.
- Store timestamped learning notes, replay their moments and save useful notes into PIOS Notes.
- Add checkpoint questions, feedback/replay and placement-based known-lesson skipping.
- Derive course progress from lesson state and generate a daily plan from available minutes.
- Add an explicitly reviewed AI lesson draft from a user-provided timestamped transcript using their actual configured provider. No fake generated course when a provider/transcript is absent.

Automatic YouTube transcript acquisition, playlist ingestion, generated videos and public/shared roadmaps require later integrations and validation. Manual video links and pasted transcripts must be labelled accurately.

## Other request retained
PeekyNotes-inspired screen-edge decks, hover previews, floating note windows, undoable deletion and platform shortcuts are a separate delivery. The owner explicitly wants PeekyNotes behavior with PIOS account-backed access on phone, Windows and Mac. Native over-app desktop windows require a companion; mobile browser/PWA behavior must be distinguished from OS overlays. The current right-edge note rail alone does not complete that request.

## Completed baseline
RAG/editor/right-note-rail commit `29fdb7b` plus CI-isolation fix `f41d963` are deployed locally. Both GitHub CI jobs passed on `f41d963` (run 41990015034). Learning course implementation has not yet been delivered as of this milestone's start.

## Verification — 2026-11-05
First private-course milestone implemented. 47 backend unit tests and six frontend tests passed; frontend production build passed. Disposable PostgreSQL V7 HTTP checks passed ownership, checkpoints/placement, derived progress, daily plans, timestamp-note export/idempotence/escaping, edit/delete lifecycle, reviewed transcript drafts, quote rejection and generation quotas. AI calls used a labelled fixture, not a paid model. Headless Edge verified objective/reading-lesson creation, completion persistence and responsive layouts. External YouTube playback, automatic transcript/playlist import, shared roadmaps and generated videos are not verified or delivered.
