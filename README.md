# Personal Intelligence OS (PIOS) — runnable V1

PIOS is a self-hostable knowledge workspace. This repository contains a connected Next.js frontend, Java 21 / Spring Boot API, PostgreSQL with pgvector, account authentication, private folders and notes, PDF/TXT/Markdown ingestion, learning objectives, encrypted Bring-Your-Own-Key (BYOK) provider settings, local-model connections and workspace-grounded AI chat.

This is a **runnable V1 foundation**, not the complete long-term PIOS vision or a hardened public SaaS release. The implementation status and limitations are listed below.

## What works in V1

- Register and sign in with email/password; passwords are BCrypt-hashed and API access uses signed JWTs.
- User-scoped workspace data: folders, notes, sources, learning objectives, AI provider connections and chat conversations.
- Persistent note editor with rich-text formatting, pin/archive, colours, search, sorting, drag reorder, folder creation and quick capture. Notes are stored in PostgreSQL, not browser-only local storage.
- Destination suggestions for quick capture using local keyword matching. Users can choose a folder, create a folder, append to a similar existing page or create a separate note. The current suggestion logic is heuristic, not an autonomous AI agent.
- Upload PDF, TXT, Markdown and paste text as knowledge sources. Text is extracted, stored in PostgreSQL and chunked. Uploaded originals are stored in a Docker volume. Text-based PDFs are supported; scanned PDFs require OCR and are not yet supported.
- Search stored source titles and text.
- Connect cloud AI with a provider API key, or connect a compatible local model server. V1 includes OpenAI-compatible endpoints (including OpenAI, OpenRouter, Groq, DeepSeek, Mistral and compatible gateways), Anthropic Messages API, and Google Gemini API.
- Provider keys are encrypted at rest with AES-256-GCM. They are never returned to the browser after saving.
- Test a provider, choose a default provider, and use Ask PIOS. Relevant account-owned notes and sources are selected with keyword scoring, sent to the selected provider, and returned with source metadata citations.
- Create learning objectives and update progress.
- Docker Compose for frontend, backend, PostgreSQL + pgvector and persistent uploaded files.

## Windows quick start

### Requirements

1. Windows 10/11.
2. Docker Desktop installed and running with the Linux container engine.
3. A browser.

No local Maven, Java, PostgreSQL or npm installation is needed for the Docker quick-start path. Docker builds the frontend and backend containers.

### Start PIOS

1. Extract this project folder somewhere convenient, for example `D:\SCIENCE\pios-v1-fullstack`.
2. Open PowerShell in the extracted project folder.
3. Run the included setup script. If Windows blocks PowerShell scripts, use the process-scoped bypass below; it does not change the machine-wide execution policy.

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\start-pios.ps1
```

The script checks Docker, generates a `.env` with independent random database/JWT/encryption secrets on first run, builds the containers, starts the stack, waits for the backend health endpoint and frontend HTTP response, then opens the app. The database and backend ports are bound to `127.0.0.1` by default. Keep `.env` private. Back up `PIOS_ENCRYPTION_KEY`; do not rotate it after saving provider credentials.

Open:

- Frontend: http://localhost:3000
- Backend health: http://localhost:8080/actuator/health

Register a PIOS account in the browser. The first workspace gets default folders (Inbox, Backend Engineering, AI & Machine Learning, Computer Science, Projects and Personal).

### Stop PIOS

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-pios.ps1
```

This stops and removes containers but preserves data volumes. To permanently delete the database and uploaded files as well, use `-RemoveData` (the script asks for explicit confirmation):

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-pios.ps1 -RemoveData
```

### Diagnose a startup problem

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\diagnose-pios.ps1
```

Or inspect logs directly:

```powershell
docker compose ps
docker compose logs -f db backend frontend
```

You can also double-click `scripts\start-pios.cmd` to launch the same Windows setup script without changing your PowerShell execution policy.

## Connect an AI provider

Open **AI providers → Add connection**.

- **OpenAI:** use an API key from your developer/API account, not a ChatGPT consumer password. Enter the API model ID available to that account.
- **Anthropic:** use an Anthropic API key and a model identifier enabled for your account.
- **Google Gemini:** use a Gemini API key from the Google AI developer platform and an available model ID.
- **OpenRouter / Groq / DeepSeek / Mistral:** select the provider and use its API key and model ID.
- **Ollama on Windows:** install/start Ollama on Windows, pull a model that fits your machine, then select “Ollama (Docker host bridge)”. The prefilled endpoint is `http://host.docker.internal:11434/v1`.
- **LM Studio on Windows:** start its local OpenAI-compatible server and use the prefilled `http://host.docker.internal:1234/v1` endpoint.

For a local model, the PIOS backend must be able to reach the endpoint. The Compose file adds `host.docker.internal` as a host gateway. Test the connection after saving it.

**Billing:** PIOS uses provider API access. A ChatGPT Plus, Claude Pro or other consumer AI subscription is not automatically an API credential. Cloud API calls are billed by the provider account whose key you configure. Local inference uses your own hardware. PIOS-managed paid inference and subscription billing are not implemented in this self-hosted V1.

## Use the V1

1. Register a PIOS account.
2. Create a note from **Quick capture** or the **Notes** workspace.
3. Upload a PDF/TXT/Markdown file or paste text via **Add to library**.
4. Create learning objectives and track progress in **Learning**.
5. Connect and test an AI provider under **AI providers**.
6. Ask questions in **Ask PIOS**. Relevant text from your own account is retrieved and sent to the selected provider.

## API overview

Base URL: `http://localhost:8080/api/v1`

| Area | Endpoints |
|---|---|
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /users/me` |
| Folders | `GET/POST /folders`, `PUT/DELETE /folders/{id}` |
| Notes | `GET/POST /notes`, `PUT/DELETE /notes/{id}` |
| Knowledge sources | `GET /sources`, `POST /sources/upload`, `POST /sources/text`, `DELETE /sources/{id}` |
| AI providers | `GET/POST /ai/providers`, `PUT /ai/providers/{id}/default`, `POST /ai/providers/{id}/test`, `DELETE /ai/providers/{id}` |
| AI chat | `POST /ai/chat`, `GET /ai/conversations`, `GET /ai/conversations/{id}/messages` |
| Learning | `GET/POST /learning/objectives`, `PATCH/DELETE /learning/objectives/{id}` |

Except registration/login and the health endpoint, API requests require `Authorization: Bearer <accessToken>`.

## Project layout

```text
pios-v1-fullstack/
├── compose.yaml
├── .env.example
├── scripts/               # Windows start, stop and diagnostics scripts
├── backend/               # Java 21, Spring Boot, Security, JPA, JDBC, Flyway
│   └── src/main/resources/db/migration/
└── frontend/              # Next.js, React, TypeScript
```

## Architecture and security notes

- The backend is a modular monolith. It is intentionally not split into microservices.
- PostgreSQL holds user, folder, note, source, provider, conversation and learning records. pgvector is enabled and a vector column exists for the upcoming embedding pipeline.
- Uploaded original files are persisted in the `pios-uploads` Docker volume. PostgreSQL is persisted in `pios-postgres-data`.
- Passwords use BCrypt. JWTs are signed with a 256-bit-or-stronger secret. API keys use AES-256-GCM encryption with a random IV.
- User-owned queries scope reads/writes to the authenticated user ID. The model does not get direct database access.
- Note rich text is sanitized on the server using a restrictive HTML allowlist before storage.
- Provider keys are sent to the PIOS backend and encrypted there. Use HTTPS if the backend is accessed over a network.
- When Ask PIOS is used with knowledge enabled, relevant note/source excerpts are sent to the configured AI provider. Do not store sensitive material unless the provider's terms and your chosen deployment satisfy your requirements.

## Known limitations — not production-ready SaaS yet

- RAG retrieval is keyword-scored over note and extracted source text. The app stores chunks and has a pgvector column, but it does not yet generate embeddings or run semantic/hybrid vector retrieval.
- Destination recommendations are local keyword heuristics. AI-assisted folder/page routing is not wired yet.
- Only one default chat provider is used. Per-task model routing, dedicated embedding/vision models and usage/cost accounting are future work.
- No PIOS-managed provider billing, subscriptions, credit ledger or payment integration.
- No OAuth integrations for Drive, Gmail, GitHub, Slack, Calendar or other external applications.
- No desktop menu-bar/notch quick-capture companion; the current quick capture runs inside the PIOS browser tab.
- No agent workflow execution, organisation multi-tenancy, collaboration, realtime sync, full concept graph extraction, advanced curriculum generation or spaced-repetition scheduler.
- Scanned PDFs need OCR; OCR is not enabled. URL crawling and YouTube ingestion are not included.
- The frontend currently stores the access token in browser localStorage. Before public deployment, move authentication to secure HttpOnly cookies and apply a reviewed CSRF strategy.
- Add API rate limits, provider spend limits, robust SSRF/egress controls for custom model endpoints, account deletion/export, database and file backups, HTTPS, logging/monitoring, malware scanning and a security review before public/multi-tenant deployment.
- This self-hosted V1 is for local development and early testing, not a certified multi-tenant service. The Spring Boot 3.5.16 line is the final OSS 3.5.x release; plan a tested move to a supported 4.x line before long-term production maintenance.

## Developer setup without Docker

Requires Java 21, Maven 3.6.3+, Node.js 22.16.0 and PostgreSQL 16 with the pgvector extension. Create a database named `pios`, then set the environment variables from `.env.example`. Run the backend with `mvn spring-boot:run` from `backend`, then run `npm.cmd install` and `npm.cmd run dev` from `frontend` on Windows. If PowerShell blocks `npm.ps1`, use `npm.cmd` as shown. The browser frontend uses `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1`.
