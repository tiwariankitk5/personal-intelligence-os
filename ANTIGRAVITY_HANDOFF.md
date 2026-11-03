# Antigravity handoff — PIOS runnable V1

This folder is intended to be opened as the project root in Antigravity.

## Instruction

The repository now contains an integrated Next.js frontend, Spring Boot backend and Docker Compose setup. Do not replace the existing architecture or switch frameworks.

Before editing:
1. Read the root README and `backend/README.md` if present.
2. Inspect the existing UI and backend together.
3. Check API contracts under `/api/v1` and keep frontend types aligned with backend records.
4. Run `docker compose config` if Docker is available.
5. Run backend tests (`mvn test`) and frontend checks (`npm run typecheck`, `npm run build`) where dependencies are available.
6. Fix real compile/runtime problems with minimal changes.

Security requirements:
- Never return decrypted provider API keys from any API.
- Never log credentials, bearer tokens, or prompt contents containing private user files.
- Keep all private SQL operations scoped to the authenticated user ID.
- Do not weaken password hashing, JWT validation, workspace isolation or AES-GCM secret encryption.
- Validate file types and size on the server; never trust the filename as a storage path.
- Do not expose Postgres or uploads publicly in production deployment instructions.

V1 scope that is actually implemented: registration/login, notes/folders CRUD, PDF/TXT/Markdown upload and text extraction, text knowledge sources, AI provider storage/testing, OpenAI-compatible/Anthropic/Gemini chat, keyword retrieval over the user's notes/sources, citation metadata, conversations and learning objective progress.

Not implemented yet: vector embeddings/index/query, OAuth connectors, URL crawling, YouTube ingestion, task-based model routing, PIOS-managed billing, desktop companion, organisation workflows and autonomous agents. Do not mark these as complete or simulate successful connections.

Return a findings report and test results. Make modifications only when needed to resolve concrete issues; explain every schema or security change.
