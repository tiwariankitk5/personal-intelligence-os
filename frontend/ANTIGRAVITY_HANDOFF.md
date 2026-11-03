# Antigravity Handoff — PIOS Frontend

## Current state

This repository is the V1 frontend prototype for Personal Intelligence OS. It is a Next.js App Router application with local demo state. It is intentionally not connected to the backend.

The Notes workspace now includes colour-coded notes, pinning, archive/restore, search, sorting, drag-to-reorder, rich-text formatting, lists/checklists, browser-local persistence, and a top-bar quick-capture modal. The destination suggestion is currently a transparent keyword-based demo. It can recommend a folder, suggest appending to a matching existing note/page, or create a new folder for a new page.

The quick-capture keyboard shortcut works only while the browser tab is active. The web app cannot create an OS-level always-on-top overlay beside the webcam/notch or write silently to arbitrary Windows folders. A Windows desktop companion would be a separate product surface (for example, Tauri/Electron plus explicit filesystem permission).

## First run

```bash
npm install
npm run dev
```

## Integration instructions

Before changing the UI, inspect the PIOS architecture pack and backend project. Then:

1. Confirm the backend API base path and authentication model from the approved API design and implemented Spring Boot controllers.
2. Create a typed API client and centralise all HTTP calls. Do not scatter `fetch` calls across UI components.
3. Add loading, empty, error and retry states to each data-driven screen.
4. Replace demo source data with authenticated workspace-scoped API calls.
5. Implement the source ingestion lifecycle: create source, upload file (for file sources), poll or subscribe to processing status, show extraction/indexing errors, then refresh concepts and collections.
6. Replace the illustrative assistant response with the real conversation/RAG API. Render citations using server-provided source IDs, passage references and snippets. Never fabricate citations in the client.
7. Replace learning-path demo progress with backend objectives, lesson, assessment and progress data.
8. Replace the graph preview with concepts and relationships returned by the backend. Keep graph rendering separate from graph persistence and inference.
9. Implement integrations only after backend OAuth, scopes, token storage, revocation and permission checks exist.
10. Add component tests and end-to-end tests for the main flows.
11. Replace the notes browser `localStorage` adapter with Notes APIs, including folders, pages, append-to-page, pin/archive, reorder and rich-text content.
12. Replace `suggestNoteDestination` keyword matching with a backend classification/retrieval endpoint. Return a confidence score, matched evidence, existing-page candidates and an explicit create-new-page recommendation. The UI must always let the user override the recommendation.
13. For desktop quick capture, decide whether to ship a Tauri/Electron companion. Do not pretend a browser keyboard shortcut is system-wide; request filesystem permissions explicitly and retain clear local/cloud storage controls.

## Non-negotiable security rules

- Do not treat hidden UI controls or client-side checks as authorisation.
- Every request must be scoped to the authenticated user and workspace on the backend.
- Do not store provider secrets or long-lived refresh tokens in browser storage.
- Treat `localStorage` note persistence as prototype-only; use authenticated, workspace-scoped APIs for production.
- Do not send an entire workspace to the LLM. The backend must retrieve only authorised passages.
- Render citations only when they are returned by the backend and resolve to authorised source records.
- Keep destructive actions explicit, confirmed and audited.

## UX requirements

- Preserve the current responsive layout and accessible labels.
- Add skeleton, error and empty states instead of silently rendering empty data.
- Keep the UI honest about ingestion and AI processing status.
- Avoid showing "connected", "processed" or "saved" until the server confirms the operation.
- Keep a visible distinction between source capture, source processing and indexed/ready status.

## Files to review

- `src/components/pios-app.tsx` — current application shell and screen flows.
- `src/components/icon.tsx` — local SVG icon set.
- `src/lib/demo-data.ts` — temporary content that should be replaced by API data.
- `src/lib/types.ts` — frontend domain types.
- `src/app/globals.css` — responsive design system and component styles.
- `.env.example` — API base URL placeholder.

Do not introduce microservices, Kafka or a client-side database as part of this frontend integration task unless the approved architecture changes.

## PIOS AI Connect (new frontend prototype)

The AI Providers screen has been added under Manage > AI providers. Review `docs/ai/AI_PROVIDER_ARCHITECTURE.md` before implementing its backend. The UI shows four paths: BYOK cloud APIs, local runtimes (Ollama / LM Studio / custom compatible endpoint), PIOS-managed inference, and official account linking where a vendor explicitly supports it. It includes a provider/model selector, task-level routing, spend-limit control, subscription caveat panel and connection list.

Prototype safety rules: connection records are in component state only; the entered API key is cleared after submit and is not transmitted or persisted. “Demo configured” is not a verified connection. PIOS-managed billing is not activated. Routing and budget settings are not persisted or enforced. Do not change these labels to “Connected” or “Active” until the backend confirms a successful test.

Production requirements:
1. Build a provider-neutral Spring Boot AI Gateway and capability-aware model catalog. Keep provider adapters in the modular monolith.
2. Implement BYOK first. Send credentials over TLS directly to the backend, validate them, encrypt at rest using envelope encryption/KMS, and expose only masked metadata. Never store provider keys in localStorage/sessionStorage or logs.
3. Add task routes for chat, summarisation/extraction, embeddings, vision (and later reranking/transcription). Validate that the selected model actually supports the required capability. Embeddings must have independent model configuration and vector-dimension migration rules.
4. Implement local inference differently for local and hosted deployments. A local PIOS backend can call a same-machine Ollama/LM Studio endpoint. A cloud PIOS backend cannot call the user's `localhost`; it needs a signed, outbound-only local desktop bridge or a clear same-device direct connector. Do not expose local model servers to the public internet.
5. Keep user-provided API billing, local inference and PIOS-managed billing separate. Never silently route a BYOK/local request to PIOS-paid inference. Enforce budgets before upstream calls and maintain a usage/credit ledger.
6. Add delegated provider-account linking only for provider-published, permitted OAuth/API-credit flows. Do not scrape cookies, reuse consumer web sessions, ask for provider passwords or reverse-engineer private APIs. A consumer ChatGPT/Claude/Gemini subscription must not be advertised as generic API access.
7. Add SSRF protection for custom endpoints, workspace isolation, credential rotation/revocation, OAuth PKCE/state, data locality policies, redacted audit events and explicit user consent for remote processing.

Suggested implementation order: catalog and BYOK connection lifecycle -> first provider adapter -> assistant gateway integration -> usage attribution -> Ollama/LM Studio local support -> route preferences and budget enforcement -> PIOS-managed credits -> provider-specific delegated flows where permitted.
