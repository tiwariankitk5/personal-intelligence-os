# PIOS V1 frontend

This is the connected Next.js frontend for the PIOS full-stack V1. It uses the Spring Boot API rather than the earlier browser-only prototype. Read the root `README.md` for the complete Docker-based Windows setup.

## Connected features

- Registration, sign-in and sign-out.
- Account-backed folders and notes with rich-text editing, colours, pinning, archive, search, sorting, drag reordering and quick capture.
- Local keyword-based destination suggestions, existing-page matching and folder creation.
- Knowledge source upload for PDF/TXT/Markdown and pasted text.
- Knowledge library list/search.
- Ask PIOS through the selected default model provider, using keyword retrieval over the current user's saved notes and sources.
- AI provider creation, encrypted-key status, provider connection test, default-provider selection and deletion.
- Learning objective creation and progress updates.

Some longer-term areas (knowledge map, project workbench, integrations catalogue and advanced learning visuals) remain illustrative or partially connected in V1. The assistant and provider settings are real API-backed features; managed inference and billing are not enabled.

## Run standalone for frontend development

Requires Node.js 22.16.0 or later. Start the Spring Boot backend and PostgreSQL separately first. In Windows PowerShell use `npm.cmd` to avoid PowerShell's `npm.ps1` execution-policy restriction:

```powershell
npm.cmd install
npm.cmd run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the backend API base, defaulting to `http://localhost:8080/api/v1`.

## Main folders

- `src/app`: Next.js App Router entry and styles.
- `src/components`: PIOS screens and reusable UI.
- `src/lib/api.ts`: typed API client and auth token handling.
- `src/lib/notes.ts`: note models, local destination recommendation and HTML sanitisation.

For full-stack development on Windows, prefer the root Docker launcher. It avoids the need to install Maven or run npm directly from PowerShell.
