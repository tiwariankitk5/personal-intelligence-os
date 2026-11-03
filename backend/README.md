# PIOS V1 backend

This is the Java 21 / Spring Boot API used by the root PIOS Docker Compose stack. For the complete setup and Windows quick-start, read the root `README.md` first.

## Responsibilities

- Email/password registration and login with BCrypt and signed JWT access tokens.
- Account-scoped user profile and workspace endpoints.
- Account-scoped folders and rich-text notes CRUD.
- PDF, TXT, Markdown and pasted-text ingestion, extracted text persistence, file storage and chunk creation.
- AI provider configuration for OpenAI-compatible APIs, Anthropic and Gemini, with AES-256-GCM encrypted API keys.
- Provider connection tests and workspace-grounded chat with keyword retrieval and source metadata citations.
- Learning objective creation, progress updates and deletion.
- Flyway migrations for PostgreSQL + pgvector.

## Run in the full stack

From the repository root, use Docker Desktop on Windows:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\start-pios.ps1
```

The root Compose file builds this backend and PostgreSQL. Backend health is available at `http://localhost:8080/actuator/health`.

## Run the tests locally

Requires Java 21 and Maven 3.6.3 or later:

```powershell
cd backend
mvn test
```

Tests use H2 and do not require Docker. Tests have been added to the repository but must be executed on the developer machine or CI before treating the backend as verified.

## API base

`http://localhost:8080/api/v1`

The endpoint inventory is in the root README and `requests.http` contains representative HTTP requests.

## Engineering boundaries

This is a modular monolith and local V1 foundation. All private SQL operations must remain scoped to the authenticated account. Never return decrypted provider keys, log credentials or treat retrieved note/source text as instructions. Do not claim that vector embeddings, OAuth integrations, billing, autonomous agents or organisation collaboration are implemented; see root `BUILD_VALIDATION.md` and README for exact limitations.
