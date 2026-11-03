# Action Taken from Starting

> **INTERNAL PROJECT RECORD — NOT FOR PUBLIC DISTRIBUTION**
>
> Repository: personal-intelligence-os (PIOS)  
> Intended location: docs/internal/Action Taken from Starting.md  
> Repository visibility at the time of writing: **Private**  
> Working branch: **feature/chatgpt-plan-usage**  
> Last reviewed: **4 November 2026**

## 1. Purpose and scope

This document records the decisions and actions taken from the beginning of PIOS through the current ChatGPT account-connection work. It is an internal product and engineering history, not a public product description.

It is intended to preserve the reasoning that normally disappears between conversations, code changes, and commits. For each important action it records:

1. What was done.
2. What problem or need led to it.
3. Why the selected approach was preferred.
4. What alternatives were considered or deferred.
5. What trade-offs and risks were accepted.
6. Whether the result is implemented, documented, locally observed, planned, or still unverified.

The document distinguishes implementation from discussion. A proposed design is not treated as a completed feature. A page loading in a browser is not treated as proof that all backend paths work.

### Status definitions

- **Implemented:** source code or configuration exists in the repository.
- **Documented:** a README, architecture document, or implementation note describes the feature or decision.
- **Observed locally:** the user reported that the feature or interface appeared on the local Windows installation.
- **Planned / deferred:** the idea was discussed or designed but is not implemented.
- **Unverified:** code exists, but build, runtime, migration, end-to-end, or live provider validation has not been completed.

## 2. Product origin: why PIOS was started

### 2.1 The problem identified

The original product direction started from the fragmentation of personal knowledge and work. Notes, documents, learning resources, projects, decisions, and reference material are usually stored in separate tools. That creates several recurring problems:

- Information is captured in one tool but needed in another.
- Useful notes become difficult to find after the original context is forgotten.
- Learning material is spread across videos, articles, documents, code, and personal notes.
- Previous decisions and work experience are not consistently reusable.
- A chatbot can answer an isolated question, but does not automatically become a persistent and organised memory of the user's work.
- Switching applications causes repeated capture, searching, summarising, and context reconstruction.

The opportunity was therefore larger than creating another note editor or a chatbot wrapper. The objective was to build a workspace where information can be captured, organised, retrieved, understood, and used again.

### 2.2 Long-term product direction

The intended PIOS direction is a personal intelligence workspace that can:

1. Capture information from sources that the user has authorised.
2. Organise notes, files, projects, learning material, and decisions.
3. Retrieve relevant information using context rather than only remembering filenames.
4. Preserve relationships and useful history.
5. Support learning, research, planning, and problem solving.
6. Execute approved workflows once integrations, permissions, and safeguards exist.

The central product loop is:

**Capture → Organise → Retrieve → Understand → Act**

This is the long-term product direction. It is not a statement that V1 already implements every step.

### 2.3 Why a limited V1 was chosen

The full concept includes external integrations, semantic search, a knowledge graph, agent workflows, desktop capture, organisation memory, model routing, and billing. Implementing all of these at once would introduce too many independent systems and failure points before the basic product had been proven.

The first release was narrowed to an end-to-end knowledge workspace:

- User registration and sign-in.
- Account-scoped folders and notes.
- Text and document ingestion.
- Basic source retrieval.
- Configurable AI providers.
- An assistant grounded in the user's own workspace.
- Learning objectives and progress tracking.
- A self-hosted local runtime.

**Need:** establish a coherent product foundation that can be run and tested.

**Trade-off:** the first release is much smaller than the long-term vision. This sacrifices breadth in exchange for faster feedback, fewer operational dependencies, and a clearer definition of what is actually working.

## 3. Product definition and planning actions

### Action 01 — Separate the product vision from the first release

**Action taken:** the PIOS concept was separated into product playbook, problem/opportunity definition, V1 requirements, and an engineering roadmap. These were prepared as planning artefacts during the product-design work; they are not all committed as files in this repository.

**Need:** a broad product idea needs a stable explanation of the user problem, target outcome, first-release scope, and future boundaries. Without that, each new feature request can expand the scope without a priority rule.

**Reason for the approach:** define the intended product before treating implementation details as the product. Keep long-term capabilities separate from V1 acceptance criteria.

**Alternatives considered:** start coding immediately from a feature list; build one large prototype containing every planned capability.

**Trade-off:** planning takes time before code is written. It reduces ambiguity and rework, but it cannot replace validation with actual users.

**Status:** planning artefacts prepared; not all were added to the GitHub repository.

### Action 02 — Define a self-hosted V1 instead of a hosted SaaS first

**Action taken:** V1 was designed to run locally through Docker Compose on the user's Windows machine.

**Need:** the application needed a reproducible development environment with a frontend, backend, and database that could be started without manually installing every runtime dependency.

**Reason for the approach:** self-hosting gives direct control over the local database, uploaded files, provider credentials, and network boundaries. Docker Compose also makes the services easier to start together.

**Alternatives considered:** immediately deploy a cloud-hosted multi-tenant SaaS; run the frontend, Java backend, and database separately with manual setup.

**Trade-offs:** local deployment reduces hosting and tenancy complexity, but it does not automatically provide cloud access, multi-device sync, managed backups, public availability, or SaaS-grade operational controls. The user must protect the local environment and its secrets.

**Status:** Docker Compose and Windows start/stop/diagnostic scripts are implemented. The product is documented as a local V1, not a production SaaS.

## 4. Architecture and technology decisions

### Action 03 — Use Next.js, React, and TypeScript for the frontend

**Action taken:** the user interface was built with Next.js, React, and TypeScript.

**Need:** PIOS requires a browser-based workspace with multiple views, structured forms, interactive note editing, provider configuration, and API-backed data.

**Reason for the approach:** React supports reusable interface components and interactive state; TypeScript makes API contracts and UI data structures more explicit; Next.js provides the application framework and production build path.

**Alternatives considered:** a static HTML prototype, a separate lightweight frontend framework, or a desktop-only interface.

**Trade-offs:** the stack introduces Node.js dependencies and frontend build complexity. It provides a flexible browser application without requiring a native desktop application at the start.

**Status:** implemented in the frontend source tree.

### Action 04 — Use Java 21 and Spring Boot for the backend

**Action taken:** the backend was built using Java 21 and Spring Boot.

**Need:** PIOS requires an API that can own authentication, account isolation, file ingestion, database access, encrypted provider credentials, and AI-provider calls.

**Reason for the approach:** the backend needs explicit service boundaries, validation, persistence, security filters, migrations, and testability. Spring Boot provides a conventional Java service foundation for those responsibilities.

**Alternatives considered:** Node.js/Express, a serverless backend, or a collection of smaller services from the beginning.

**Trade-offs:** Java and Spring Boot provide a structured backend but require more framework configuration and a Maven build. A Java backend is not inherently more secure; security depends on implementation and testing.

**Status:** implemented. Actual build and test status is tracked separately in BUILD_VALIDATION.md.

### Action 05 — Choose a modular monolith instead of microservices

**Action taken:** the backend was kept as one Spring Boot application with feature-oriented packages and service boundaries.

**Need:** splitting the first release into multiple services would add service discovery, network authentication, deployment, tracing, versioning, and failure-handling concerns before there was enough scale to justify them.

**Reason for the approach:** keep one deployable backend while maintaining logical separation between authentication, workspace data, AI, files, and learning.

**Alternatives considered:** separate microservices for notes, AI, ingestion, identity, and learning.

**Trade-off:** modules are less independently deployable than separate services. However, the current scale does not justify the operational cost of microservices. Boundaries can be extracted later if real usage, team structure, or scaling requirements make that worthwhile.

**Status:** modular-monolith direction is documented and reflected in the project structure.

### Action 06 — Use PostgreSQL and enable pgvector

**Action taken:** PostgreSQL is the primary database. The schema enables the vector extension and includes an embedding column for content chunks.

**Need:** user data, notes, folders, sources, conversations, provider connections, and learning objectives need durable relational storage. The long-term retrieval design also anticipates vector embeddings.

**Reason for the approach:** PostgreSQL provides relational integrity and supports the current data model. pgvector avoids committing to a separate vector database before the retrieval workload is understood.

**Alternatives considered:** MongoDB, a separate vector database, or storing all application data as files.

**Trade-off:** enabling pgvector does not mean semantic search is implemented. V1 currently uses keyword scoring; embedding generation and semantic/hybrid retrieval remain future work.

**Status:** PostgreSQL and pgvector are configured; keyword-based retrieval is implemented; vector search is not.

### Action 07 — Use Flyway database migrations

**Action taken:** database schema changes are written as versioned SQL migrations.

**Need:** the application needs a repeatable way to create and evolve its schema across fresh local installations.

**Reason for the approach:** migrations make schema changes reviewable and allow the backend to apply them in order.

**Alternatives considered:** manually creating tables in a database client or relying only on ORM auto-DDL.

**Trade-off:** migrations must be maintained carefully. Once a migration has been applied to a user's database, editing its historical contents can create checksum conflicts. New schema changes should normally be added as a new migration.

**Status:** V1 includes migrations V1 and V2; ChatGPT account connection work adds V3 on the feature branch. V3 still requires a real Flyway run on the user's machine.

### Action 08 — Use Docker Compose for local orchestration

**Action taken:** the stack was defined with database, backend, and frontend services, persistent database/upload volumes, health checks, and loopback-bound local ports.

**Need:** local setup should not require separate manual startup and configuration of every component.

**Reason for the approach:** a single Compose workflow can build and start the system consistently. Persistent volumes retain the database and uploaded files between container restarts.

**Alternatives considered:** manually start PostgreSQL, Maven, and Next.js in separate terminals; deploy the first version directly to a cloud host.

**Trade-offs:** Docker adds image-build and container-networking complexity. Persistent data is tied to Docker volumes and must be backed up. A local container's localhost is not the same as the Windows host, which is why local model connections use the host bridge address.

**Status:** implemented. The user reported that the startup process reached the PIOS registration screen. This is evidence of local UI availability, not a completed test of every backend feature.

## 5. Data, security, and workspace actions

### Action 09 — Add email/password authentication with BCrypt and JWT

**Action taken:** registration and login were added, passwords are stored as BCrypt hashes, and authenticated API requests use signed JWT access tokens.

**Need:** PIOS stores private user notes, documents, provider settings, and conversations. Data must be associated with an authenticated user.

**Reason for the approach:** email/password authentication gives the local V1 a straightforward account boundary without requiring an external identity provider for initial use. JWTs allow the frontend to authenticate API calls.

**Alternatives considered:** no login for a single-user prototype; OAuth-only login from the start; cookie-based sessions.

**Trade-offs:** JWTs stored in browser localStorage are exposed if malicious script executes in the page. The README records migration to secure HttpOnly cookies and a reviewed CSRF design as a prerequisite before public deployment. Authentication code still requires tests and security review.

**Status:** implemented for V1; localStorage token storage is a known limitation, not a production recommendation.

### Action 10 — Scope private records to the authenticated user

**Action taken:** user-owned queries in the workspace and AI paths use the authenticated user ID when reading or writing private records.

**Need:** one user's notes, files, providers, and conversations must not be accessible to another account.

**Reason for the approach:** user scoping is a core data-isolation boundary for a product that stores private knowledge.

**Alternatives considered:** a single shared demo workspace; relying only on frontend filtering.

**Trade-off:** every query and new feature must preserve account scoping. A single missed ownership check can become a data leak. Automated cross-account tests should be expanded as features are added.

**Status:** account-scoped V1 paths are implemented; broad security testing remains necessary.

### Action 11 — Encrypt provider credentials at rest

**Action taken:** provider API keys are encrypted in the backend using AES-256-GCM before persistence. The local startup script generates a separate PIOS_ENCRYPTION_KEY and keeps it in the ignored local .env file.

**Need:** provider credentials can incur cost and grant access to external AI accounts. They must not be stored as plaintext or returned to the browser after saving.

**Reason for the approach:** AES-GCM provides authenticated encryption, and a random IV is used for each encryption operation. Keeping the key outside the database separates data storage from the encryption secret.

**Alternatives considered:** plaintext database storage; browser-only storage; a managed KMS or vault.

**Trade-offs:** local key management is simpler for a self-hosted prototype but places responsibility on the owner to back up and protect the key. Losing or changing PIOS_ENCRYPTION_KEY can make existing encrypted credentials unreadable. A production deployment should use a managed secret/key system, documented rotation, and controlled access.

**Status:** implemented for local V1. Tests for round-trip encryption, fresh IVs, and tamper detection are present but were not confirmed as executed in this environment.

### Action 12 — Strengthen Git ignore rules and keep local secrets out of commits

**Action taken:** repository ignore rules were expanded for .env files, local environment files, node_modules, Next.js builds, Maven target output, uploaded files, private key files, and Windows artefacts. Example environment files remain allowed.

**Need:** local environment files contain database, JWT, and encryption secrets. Runtime uploads and build output do not belong in the source repository.

**Reason for the approach:** prevent accidental commits of credentials or local runtime data while preserving safe configuration examples.

**Alternatives considered:** manually remember which files to exclude before each commit; commit a populated .env and rely on repository privacy.

**Trade-off:** ignore rules do not remove a secret that was already committed. They also do not replace secret scanning or credential rotation after a leak.

**Status:** .gitignore includes the relevant patterns; the baseline commit was reviewed for environment files and credential patterns. Continue scanning before future pushes.

## 6. Workspace and knowledge features

### Action 13 — Implement persistent notes and folders

**Action taken:** PIOS gained account-scoped folders and persistent notes with rich-text content, pin/archive states, colours, searching, sorting, and ordering.

**Need:** the product needs a durable place to capture and organise a user's own knowledge before more advanced retrieval can work.

**Reason for the approach:** a note/folder foundation is useful independently of AI and provides the content base for future retrieval.

**Alternatives considered:** use browser localStorage only; integrate a third-party note application before building a native workspace.

**Trade-offs:** building note management adds editor, sanitisation, persistence, and UI complexity. It avoids making the product dependent on another application's data model. Rich-text sanitisation remains security-critical.

**Status:** implemented in the full-stack V1, with data stored in PostgreSQL.

### Action 14 — Add quick capture and destination suggestions

**Action taken:** a quick-capture workflow was added with local keyword-based suggestions for a likely folder or destination.

**Need:** capturing information should be faster than opening a folder, creating a document, and manually organising every item.

**Reason for the approach:** a local heuristic can suggest a destination without sending private text to an external model or requiring an AI call for every capture.

**Alternatives considered:** always send text to an AI model for routing; save everything to one unstructured inbox; build a native Windows companion.

**Trade-offs:** keyword matching is predictable, cheap, and local, but cannot understand complex intent as well as a language model. The current feature is heuristic, not an autonomous AI agent. A desktop/menu-bar companion remains future work; the current quick capture runs inside the browser application.

**Status:** local keyword suggestions are implemented. Autonomous AI routing and native desktop capture are not.

### Action 15 — Add document and text ingestion

**Action taken:** the library accepts PDF, TXT, Markdown, and pasted text. Extracted text is stored and chunked; uploaded originals are persisted in a Docker volume.

**Need:** a knowledge workspace must accept material beyond manually typed notes.

**Reason for the approach:** text extraction and chunking provide a practical first step toward retrieval without requiring OCR, crawling, or video-processing infrastructure.

**Alternatives considered:** build OCR and web/video ingestion immediately; store file attachments only and not extract text; integrate third-party ingestion services.

**Trade-offs:** text-based PDFs work, but scanned PDFs require OCR which is not enabled. URL crawling and YouTube ingestion are not included. File type, size, and storage security need continued review.

**Status:** basic text-based ingestion is implemented; OCR and web/video ingestion are deferred.

### Action 16 — Add keyword-based retrieval for Ask PIOS

**Action taken:** Ask PIOS retrieves a small set of account-owned notes and sources using keyword scoring, adds those excerpts to the model prompt, and returns citation metadata associated with the retrieved sources.

**Need:** an assistant that only sees the user's question cannot answer questions that depend on the user's own documents and past notes.

**Reason for the approach:** keyword retrieval is straightforward to inspect and can validate the end-to-end pattern of retrieving private context before calling a model.

**Alternatives considered:** direct chat without workspace context; a full embedding/vector retrieval pipeline; a hosted search service.

**Trade-offs:** keyword scoring is weaker for synonyms, paraphrases, and concept-level matches. The schema anticipates vector embeddings, but V1 does not generate embeddings or perform semantic/hybrid search. Source metadata citations are returned by PIOS; they should not be confused with proof that the model itself reasoned correctly.

**Status:** keyword-based retrieval is implemented. Semantic retrieval is deferred.

### Action 17 — Add learning objectives and progress

**Action taken:** users can create learning objectives and update progress.

**Need:** the long-term PIOS concept includes learning continuity, not only storing reference material.

**Reason for the approach:** a lightweight objective tracker introduces learning structure without pretending a complete curriculum engine or spaced-repetition system exists.

**Alternatives considered:** build a full learning management system immediately; leave learning entirely outside PIOS.

**Trade-off:** the current tracker is intentionally basic. Curriculum generation, adaptive practice, mastery modelling, and spaced repetition remain future work.

**Status:** basic objectives and progress are implemented.

## 7. AI provider strategy

### Action 18 — Keep AI providers interchangeable

**Action taken:** the AI provider layer supports OpenAI-compatible endpoints, Anthropic, Gemini, and compatible local model endpoints.

**Need:** PIOS should not depend on a single model vendor or assume all users want the same billing arrangement.

**Reason for the approach:** separating provider configuration from the workspace allows users to select their inference source while preserving PIOS as the place where their notes, files, and project context live.

**Alternatives considered:** hard-code one model vendor; build a PIOS-managed model service and require every user to pay PIOS; support only local models.

**Trade-offs:** a provider abstraction adds adapters, error mapping, model compatibility concerns, and testing effort. APIs differ in streaming, tool use, model catalogues, and supported parameters. A common interface cannot guarantee all providers have identical capability.

**Status:** BYOK adapters and local OpenAI-compatible endpoints are implemented. PIOS-managed billing is not.

### Action 19 — Separate BYOK, local inference, and PIOS-managed billing

**Action taken:** the product architecture distinguishes:
- BYOK: the user supplies a provider API key and that provider bills the user.
- Local: inference runs through a local model endpoint reachable by the backend.
- PIOS-managed: PIOS pays the upstream provider and would need its own metering and customer billing.
- Official delegated account connections: only where the provider supports and permits a suitable flow.

**Need:** consumer AI subscriptions, developer API keys, local runtimes, and PIOS-managed usage are different credential and billing arrangements.

**Reason for the approach:** avoid promising that a consumer chat subscription automatically grants third-party API access or silently charging the wrong party.

**Alternatives considered:** one universal “Connect AI” button that hides billing and permission differences; use a provider's first-party session or browser cookie to impersonate its own application.

**Trade-offs:** explaining multiple modes creates a more complex settings screen. It is more accurate and avoids unsupported credential reuse. PIOS-managed billing is deferred until pricing, metering, payment, tax, abuse, and provider-contract requirements are addressed.

**Status:** BYOK and local modes are implemented; PIOS-managed inference/billing is explicitly not enabled.

### Action 20 — Add a provider connection screen and retain API-key flows

**Action taken:** the AI Providers page supports saving, testing, selecting, and removing provider connections. API-key values are encrypted by the backend and are not returned as plaintext.

**Need:** users need control over which model receives their prompts and retrieved workspace context.

**Reason for the approach:** provider setup belongs in a dedicated settings area and should disclose that relevant private notes or source excerpts may be sent to the selected cloud provider.

**Alternatives considered:** put API keys into frontend code; silently route all prompts through one default hosted account; remove local models to simplify the UI.

**Trade-offs:** users must manage their own cloud credentials for BYOK. Provider choice is also a privacy and data-sharing choice. Local inference reduces external model transfer only when retrieval, ingestion, embeddings, and logs are also local.

**Status:** provider settings, encryption, testing, default selection, and privacy messaging are implemented.

## 8. Frontend prototype and full-stack integration

### Action 21 — Build and refine the frontend before completing the backend

**Action taken:** the interface was prototyped and then extended with note controls and AI-provider screens before the connected full-stack version was assembled.

**Need:** visualising the workspace early allowed the product structure and main workflows to be reviewed before every backend endpoint existed.

**Reason for the approach:** a prototype exposes navigation and usability problems earlier than building APIs for an interface that has not been shaped.

**Alternatives considered:** backend-first development with a temporary admin UI; build the entire product only after all endpoints are finished.

**Trade-offs:** prototype UI can create a false impression of completed functionality if demo data is mistaken for persisted backend data. The full-stack version therefore had to connect the relevant controls to authenticated API endpoints and database persistence.

**Status:** frontend prototype iterations were created; a full-stack V1 codebase was assembled.

### Action 22 — Connect the frontend to persistent backend APIs

**Action taken:** the Next.js frontend was connected to Spring Boot APIs for user data, notes, sources, provider connections, chat, and learning objectives.

**Need:** the application needed to progress from a frontend demonstration into a usable local application with data that survives page reloads and container restarts.

**Reason for the approach:** one backend API owns authentication, data access, persistence, and provider calls. The frontend becomes a client of those services rather than the source of truth.

**Alternatives considered:** keep the prototype in browser storage; rewrite the application as a single full-stack JavaScript stack.

**Trade-off:** API contracts must remain synchronised between Java DTOs and TypeScript types. End-to-end tests become necessary whenever either side changes.

**Status:** integrated in the repository. Complete end-to-end validation is still outstanding.

### Action 23 — Add Windows startup, stop, and diagnostic scripts

**Action taken:** PowerShell scripts were added to check Docker, generate local secrets on first setup, build and start containers, wait for service readiness, open the browser, stop containers, and diagnose failures.

**Need:** the local app should be repeatable to start without manually reconstructing environment variables and commands each time.

**Reason for the approach:** the target development environment is Windows with Docker Desktop. A launcher reduces setup friction and helps collect useful failure logs.

**Alternatives considered:** rely on users to remember raw Docker commands; require users to install Maven, Java, Node, and PostgreSQL separately.

**Trade-offs:** scripts make assumptions about the local Docker environment and must be maintained when Compose or service health endpoints change. The launcher does not replace test automation.

**Status:** scripts are implemented. The user reported the local app reached the registration screen; successful migration, authentication, uploads, and AI requests still need explicit checks.

## 9. GitHub and source-control actions

### Action 24 — Create a private GitHub repository

**Action taken:** the project was placed in the private repository personal-intelligence-os.

**Need:** keep a central, versioned source of truth, preserve changes, and enable controlled collaboration and review.

**Reason for the approach:** the GitHub repository gives the project a commit history and remote backup while keeping source access limited to authorised collaborators.

**Alternatives considered:** local-only source control; publish the code publicly from the beginning.

**Trade-off:** private repository visibility protects the contents from the general public, but it does not replace good secret hygiene. Anyone granted repository access can read the internal files. A private repository also does not automatically qualify a product for any vendor programme that has its own eligibility conditions.

**Status:** the repository metadata confirmed visibility is Private.

### Action 25 — Establish the V1 baseline commit

**Action taken:** the full-stack V1 was committed as the initial source baseline.

**Reason:** a known baseline makes later feature work reviewable and makes it possible to keep experimental work away from the stable branch.

**Verified commit:**  
- Commit: 0c8ba2047f96108fd04d7ce6fb2aabff1f15420f  
- Message: chore: establish PIOS V1 baseline

**Trade-off:** an initial baseline is only a starting checkpoint. It does not certify the code is production-ready or fully tested.

**Status:** commit is present on main and is the parent of the feature branch at the time of this record.

### Action 26 — Strengthen .gitignore and inspect committed files

**Action taken:** ignore rules were added for environment secrets, local build products, uploads, private key files, and generated output. Safe example environment files were retained.

**Need:** avoid exposing local DB passwords, JWT signing secrets, encryption keys, provider credentials, or runtime user uploads.

**Reason for the approach:** prevent the most common accidental staging of local-only files.

**Trade-off:** .gitignore does not protect a secret already tracked by Git. Credential scans and rotation are still needed. Repository privacy is not a substitute for keeping secrets out of commits.

**Status:** ignore rules were reviewed, and the baseline file set was checked for common secret-file patterns. Continue the same review for future commits.

### Action 27 — Create a feature branch for ChatGPT plan integration

**Action taken:** feature/chatgpt-plan-usage was created from main. The user fetched it, switched to the local tracking branch, and confirmed a clean working tree.

**Need:** the ChatGPT plan integration is experimental and should not be mixed into the stable V1 baseline until it can be built and tested.

**Reason for the approach:** a feature branch isolates schema changes, OAuth routes, UI, provider routing, and recovery logic.

**Alternatives considered:** commit directly to main; create a second repository for the experiment.

**Trade-off:** the feature branch can diverge from main and must be merged deliberately after review. Local developers must pull the latest remote branch before building it.

**Status:** branch exists remotely and contains the feature commits. The local checkout was originally switched at the baseline; it must be updated with git pull before using the newest files.

## 10. ChatGPT account and plan-usage feature

### 10.1 Why this feature was requested

The requirement was to use the ChatGPT account the user already signs into, rather than requiring a separate OpenAI API key.

This raised an important distinction: signing into PIOS with Google or proving a user's identity is not, by itself, permission to use that person's ChatGPT plan for model inference. Identity authentication and delegated inference permission are separate scopes and separate product capabilities.

The feature therefore had to be investigated as an official, provider-supported account connection rather than a shortcut using browser cookies, passwords, or private ChatGPT session data.

### Action 28 — Keep ordinary OpenAI API keys separate from ChatGPT account linking

**Action taken:** the existing OpenAI-compatible BYOK connection was retained, while a distinct ChatGPT-plan connection mode was designed.

**Need:** avoid misrepresenting a ChatGPT consumer subscription as an ordinary API key or silently changing the billing owner.

**Reason for the approach:** the two modes use different authorisation, token, usage, and eligibility rules. They must remain separate in the data model and UI.

**Alternatives considered:** ask the user to paste a ChatGPT password; reuse a browser cookie; call a private first-party web endpoint; pretend a ChatGPT subscription is an API key.

**Trade-off:** a proper delegated flow is significantly more complex and may not be available to every app or account. It is the only acceptable direction; the shortcuts were rejected.

**Status:** the UI and backend include a separate ChatGPT-plan connection type.

### Action 29 — Implement a local OAuth callback and PKCE flow

**Action taken:** the feature branch adds a local loopback OAuth start and callback path, one-time launch tokens, state and nonce values, a PKCE verifier/challenge, token exchange, and ID-token validation.

**Need:** bind the authorisation response to a sign-in attempt initiated by an authenticated PIOS user and reduce CSRF, replay, and account-mix-up risks.

**Reason for the approach:** a short-lived and one-time state, PKCE, nonce validation, issuer/audience checks, and a local loopback redirect create a more controlled authorisation path than receiving a token in frontend JavaScript.

**Alternatives considered:** place the OpenAI token directly in browser storage; accept a callback without state/nonce validation; send the OpenAI authorisation URL or token hints through frontend JavaScript.

**Trade-offs:** the flow is more complex and depends on OpenAI's documented client-registration and redirect requirements. A local callback also means the integration is designed for a local self-hosted runtime, not a general PIOS-hosted service.

**Status:** source implementation is committed. Live OpenAI registration and callback acceptance have not yet been verified.

### Action 30 — Add user-confirmed account linking

**Action taken:** the callback stores a short-lived pending connection. The original PIOS tab must confirm it through the authenticated PIOS API before the ChatGPT connection is activated.

**Need:** prevent the OAuth callback from directly changing the linked account without the originating PIOS session confirming the result.

**Reason for the approach:** the browser callback should not be treated as an authenticated PIOS session. A separate confirmation uses the PIOS user's existing session and checks the pending state.

**Alternatives considered:** activate the connection immediately when the callback is received; send access/refresh tokens to the browser and let React save them.

**Trade-off:** the user sees an extra confirmation step and the UI must keep the popup and original tab coordinated. In return, tokens remain on the backend and the PIOS session is required for account linking.

**Status:** implemented in source; popup flow requires browser testing.

### Action 31 — Encrypt delegated tokens and keep them server-side

**Action taken:** ID, access, and refresh tokens are encrypted using the existing local AES-GCM encryption service before being saved. The UI receives connection metadata, not token contents.

**Need:** delegated tokens may allow inference and must be treated as credentials.

**Reason for the approach:** reuse the existing encryption service and keep secrets in the backend/database boundary rather than localStorage or frontend state.

**Alternatives considered:** store tokens in the browser; persist tokens as plaintext; store tokens in an unsecured configuration file.

**Trade-offs:** the same local encryption-key backup/rotation constraint applies. This is not a replacement for a production secret manager or a security review.

**Status:** implemented in source; token exchange and refresh have not been live-tested.

### Action 32 — Check plan-use scopes separately from identity login

**Action taken:** the integration checks for both chatgpt.tokens.use.direct and resource.invoke before enabling plan inference.

**Need:** a successful identity login must not be mistaken for permission to invoke inference using ChatGPT plan access.

**Reason for the approach:** access is only enabled when the required delegated scopes are present in the token response.

**Alternatives considered:** treat any returned ID token as sufficient; infer a user's subscription tier from an email address or sign-in success.

**Trade-off:** users can be signed in but still not be authorised to use their ChatGPT plan from PIOS. That is an intentional distinction, not a connection failure.

**Status:** implemented in source. Actual entitlement and scope response behaviour depends on OpenAI eligibility and needs live verification.

### Action 33 — Add model discovery and provider activation

**Action taken:** PIOS retrieves models available to the connected ChatGPT account and lets the user select one for Ask PIOS.

**Need:** avoid guessing model names or showing model options the connected account cannot use.

**Reason for the approach:** use the model catalogue exposed to the current connected account rather than hard-coding a static list.

**Alternatives considered:** hard-code model names; allow arbitrary text model input without validation.

**Trade-off:** model catalogues can change, and the model list can be empty or unavailable if the account lacks permission. The UI must handle that without claiming that the connection is fully usable.

**Status:** API and UI code are implemented; live model discovery is unverified.

### Action 34 — Route ChatGPT-plan inference through the Responses API

**Action taken:** ChatGPT-plan connections are dispatched through a separate backend path that uses the Responses API with storage disabled and streaming enabled. PIOS only accepts a response after a completed event.

**Need:** keep the delegated connection distinct from API-key providers and respect the plan-use integration's request requirements.

**Reason for the approach:** a dedicated path avoids passing a ChatGPT OAuth token through the ordinary OpenAI API-key adapter.

**Alternatives considered:** treat the OAuth token as a normal developer API key; persist an incomplete streamed answer as if it had completed.

**Trade-off:** a dedicated adapter increases maintenance burden and must be updated against the current provider contract. Streaming and error conditions need tests.

**Status:** implementation is committed. A real inference call has not been completed in this environment.

### Action 35 — Add refresh, revoke, disconnect, and recovery paths

**Action taken:** refresh-token handling, local token deletion, remote revocation attempts, retry handling for temporary revocation errors, and recovery messages for rejected refresh tokens were added.

**Need:** delegated connections expire and can be revoked by the user or provider. A persistent stale connection should not continue to appear healthy after its grant is rejected.

**Reason for the approach:** token lifecycle is part of a real connection feature; connecting is not enough. Disconnect should remove local tokens and attempt revocation where supported.

**Alternatives considered:** store tokens indefinitely; only hide the connection in the UI; require users to delete database rows manually.

**Trade-offs:** remote revocation may fail because of network or provider errors. PIOS therefore reports whether revocation was confirmed and tells the user to revoke the grant in ChatGPT settings if it cannot confirm. Local credentials are still removed.

**Status:** implementation is committed. Remote revocation and refresh rotation have not been tested against a real authorised account.

### Action 36 — Document OpenAI eligibility and keep the integration experimental

**Action taken:** README and BUILD_VALIDATION.md explain that ChatGPT plan usage is subject to OpenAI eligibility and approval, and that this repository is private and not confirmed as an approved private client.

**Need:** do not imply that writing OAuth code guarantees OpenAI will allow the app to use a ChatGPT plan.

**Reason for the approach:** vendor-side approval, subscription eligibility, regional availability, and service policy cannot be solved by application code.

**Alternatives considered:** advertise the feature as guaranteed; make the repository public without reviewing licensing or eligibility requirements; bypass official authorisation through browser session reuse.

**Trade-off:** the feature may remain unavailable until OpenAI permits the use case. Keeping it gated and preserving BYOK/local inference avoids falsely promising access.

**Status:** eligibility caveat is documented. No OpenAI approval is claimed.

## 11. Verified repository history at the time of writing

The following commits were checked on the remote repository:

| Commit | Message | Role |
|---|---|---|
| 0c8ba2047f96108fd04d7ce6fb2aabff1f15420f | chore: establish PIOS V1 baseline | Initial full-stack V1 baseline |
| 787b4471ae0d5ee052f064116d1fb3f9f5f0d6a6 | feat(ai): add local ChatGPT plan authorization | Initial ChatGPT connection implementation |
| 8e608005916b0db232b003753c89a1feef1d3edf | fix(ai): harden ChatGPT token recovery and revocation | Token recovery and remote revocation handling |
| cb2ba165d319d86d4666a2e28010252a7f0b76d8 | fix(ai): bind saved ChatGPT registrations to verified identity | Bind reauthorisation to the previously verified identity |

At the time of this record:

- Repository visibility was confirmed as **Private**.
- main remained at the initial V1 baseline commit.
- feature/chatgpt-plan-usage contained the ChatGPT implementation commits.
- The user had fetched and checked out the feature branch before the later remote commits were added. The local branch must pull the latest remote head before rebuilding.

## 12. Current implementation map

| Area | Current implementation | Important limitation |
|---|---|---|
| Frontend | Next.js, React, TypeScript | Full typecheck and production build must be rerun after the latest branch pull |
| Backend | Java 21, Spring Boot modular monolith | Maven compile and Spring startup for the new feature are unverified |
| Database | PostgreSQL, Flyway, pgvector enabled | ChatGPT V3 migration has not been confirmed against the user's database |
| Authentication | Email/password, BCrypt, JWT | Access token currently stored in localStorage |
| Workspace | Account-scoped folders and notes | Further cross-account security tests needed |
| Files | PDF/TXT/Markdown and pasted text | Scanned PDF OCR and URL/video ingestion are not included |
| Retrieval | Keyword-scored notes and sources | No embedding generation or semantic/hybrid retrieval yet |
| AI providers | BYOK, OpenAI-compatible endpoints, Anthropic, Gemini, local compatible endpoints | Provider feature differences need adapter-level testing |
| ChatGPT plan | Separate OAuth connection, pending confirmation, encrypted token path, model discovery, Responses API route | Eligibility, live OAuth, model listing, refresh, revoke, and live inference unverified |
| Learning | Objectives and progress | No full curriculum or spaced-repetition engine |
| Deployment | Local Docker Compose | Not a production SaaS deployment |

## 13. Important trade-offs accepted so far

### 13.1 Build the product before microservices

**Benefit:** lower deployment and operational complexity while the product is small.  
**Cost:** the backend is one deployable unit; independent scaling and deployment are not available yet.  
**Recommendation:** keep the modular monolith until real workload or team boundaries justify extraction.

### 13.2 Keyword retrieval before semantic RAG

**Benefit:** a simple retrieval path validates the workspace-to-assistant flow and is easy to debug.  
**Cost:** poor recall for paraphrases and conceptual similarity.  
**Recommendation:** build an evaluated embedding and hybrid retrieval pipeline with versioned embedding models before claiming semantic RAG.

### 13.3 Local V1 before hosted SaaS

**Benefit:** more control over database, files, local model access, and user-owned provider credentials.  
**Cost:** users must run, update, back up, and secure their own installation.  
**Recommendation:** do not market the current build as a hosted multi-tenant service.

### 13.4 BYOK and local AI before PIOS-managed billing

**Benefit:** no PIOS credit ledger, upstream provider invoice, tax, payment, refunds, or gross-margin system is required for V1.  
**Cost:** setup is less seamless and the user manages keys or local runtime.  
**Recommendation:** only introduce PIOS-managed AI after metering, hard spend limits, payment, provider terms, abuse controls, and cost reconciliation exist.

### 13.5 Official ChatGPT linking rather than session reuse

**Benefit:** explicit authorisation, user-controlled consent, and no need to collect a ChatGPT password or session cookie.  
**Cost:** OAuth registration and eligibility requirements are external dependencies; the feature may be rejected or unavailable.  
**Recommendation:** retain the separate BYOK and local routes. Do not attempt to bypass provider requirements.

### 13.6 Keep internal decisions in a private repository

**Benefit:** preserve implementation reasoning, incomplete work, trade-offs, and security context without publishing it as product documentation.  
**Cost:** repository collaborators can still see the file. A folder named internal does not create per-file GitHub permissions. If the repository ever becomes public, this document would also become public unless moved or excluded.  
**Recommendation:** keep the repository private while this log is stored here. If public open-sourcing is later chosen, move the document to a separate private repository or an access-controlled internal system before changing repository visibility.

## 14. Outstanding risks and work not completed

The following are not claimed as completed:

1. Build the latest feature branch on the user's Windows/Docker machine.
2. Confirm Maven compilation and Spring application startup.
3. Confirm Flyway V3 applies cleanly to the existing local database.
4. Run backend unit and integration tests, including account isolation and OAuth state replay tests.
5. Run frontend typecheck and production build.
6. Complete a real OpenAI OAuth round trip with an account and app that are eligible.
7. Verify actual returned scopes, client registration values, and model-list response shape against the live provider.
8. Verify access-token expiry and refresh-token rotation.
9. Verify remote revocation and local cleanup.
10. Verify a complete Ask PIOS request using a ChatGPT-plan model and confirm usage/error behaviour.
11. Review request rate limits, response-size limits, prompt/context privacy, provider timeouts, and exception redaction.
12. Before public deployment, migrate localStorage authentication to secure HttpOnly cookies with a reviewed CSRF approach.
13. Add robust SSRF/egress protection for custom provider endpoints, rate limits, spend limits, backup/restore, account deletion/export, HTTPS, monitoring, and a security review.

These items should remain visible in issue tracking or the next release plan. They must not be silently marked complete because code has been committed.

## 15. Recommended next actions and why

| Priority | Recommended action | Why it is needed | Trade-off |
|---|---|---|---|
| 1 | Pull latest feature branch and run Docker Compose build | Establish whether the source actually compiles and the V3 migration applies | Takes time to diagnose build/dependency issues before feature testing |
| 2 | Run focused backend and frontend checks | Catch API-contract, Java compile, TypeScript, and schema problems early | More test code and maintenance, but prevents UI-only validation |
| 3 | Test ordinary BYOK and local providers first | Preserve a working inference path independent of ChatGPT approval | Does not prove the new delegated flow |
| 4 | Test OAuth using an eligible/approved OpenAI setup | Confirm dynamic registration, callback, scopes, token exchange, and user-confirmed linking | External provider eligibility may block testing |
| 5 | Test model discovery, refresh, revocation, and Ask PIOS end to end | Verify the lifecycle rather than only the connect screen | Requires a live authorised account and may expose edge cases |
| 6 | Add security and account-isolation tests | Protect private user records and delegated credentials | More engineering effort before adding new product modules |
| 7 | Build evaluated semantic retrieval | Improve the central knowledge-retrieval experience | Adds embedding costs or local compute and requires evaluation data |
| 8 | Add integrations and agent execution only after permissions and retrieval are reliable | Expands PIOS from an isolated workspace into an interconnected system | More permission, data-transfer, and workflow-safety complexity |
| 9 | Consider hosted SaaS and managed billing only with clear operational and commercial requirements | Avoid premature multi-tenant and billing architecture | Delays monetisation features but reduces financial and security risk |

## 16. Decision rule for future feature requests

Before adding a new capability, answer the following questions:

1. Which user problem does it solve?
2. Is the capability needed for the next validated product milestone?
3. Can it be implemented with an official, documented, and permitted integration?
4. What private user data will it access or send elsewhere?
5. Who owns the inference or infrastructure bill?
6. What is the smallest test that proves it works?
7. What happens when the provider, connection, or workflow fails?
8. Does this require a schema migration, a security boundary, or a new external dependency?
9. What existing capability becomes harder to maintain because of this addition?
10. What is explicitly being deferred to make room for it?

A feature should not be considered complete merely because the UI exists or code has been committed. Completion requires a defined acceptance criterion and evidence from tests or a real workflow.

## 17. Repository privacy and handling

This document is stored under docs/internal because it contains internal decision reasoning, incomplete work, engineering trade-offs, and future recommendations.

The repository is currently private, so general public visitors cannot browse it. Repository collaborators with access can read all files, including this one. The internal folder name is not an access-control mechanism.

Do not add passwords, API keys, JWT secrets, encryption keys, OAuth access/refresh tokens, user session cookies, or private customer information to this file. Record only decisions, status, non-secret identifiers such as commit hashes, and links to approved repository artefacts.

If PIOS is ever changed to a public repository:

- Review this file before changing visibility.
- Move it to an access-controlled private location or remove it from the public source history through an appropriate repository-history procedure.
- Do not assume deleting the file in a later commit removes it from previous public Git history.


## 18. Structured notes editor and diagram canvas (November 4, 2026)

### User need
The original notes screen used a basic contentEditable area with a small formatting toolbar. The requested direction is closer to a Notion-style writing surface, with slash-insertable blocks, developer/student-specific note utilities, embedded lectures, and a drawing tool for architecture and learning diagrams.

### Product and architecture decision
Keep the existing `notes.body_html` persistence model for this milestone rather than introducing a block-JSON schema and migration. This preserves existing notes and the current API contract while allowing the editor to add more block types incrementally. The editor remains backed by the existing authenticated note endpoints and user-scoped database records.

### Implemented in this change
- Added a slash-command catalogue and a **Block** toolbar action. Typing `/` opens a filtered command list; arrow keys and Enter navigate/insert commands.
- Added heading levels, paragraphs, bulleted and numbered lists, checklists, callout/quote blocks, dividers, code snippets, SQL snippets, terminal commands, HTTP/API examples, and LaTeX source blocks.
- Added a YouTube lecture embed action. The editor accepts common YouTube watch, youtu.be, shorts, and embed links, then stores only a canonical youtube-nocookie embed URL.
- Added a drawing modal with pen, line, arrow, rectangle, ellipse, eraser, colour selection, stroke width, undo and clear.
- Inserted drawings are compressed JPEG snapshots stored inside the note body. The editor/backend reject unsupported image data URLs and enforce a 90 KB image bound.
- Extended browser and server sanitisation for headings, code blocks, tables, YouTube iframes and safe raster-image snapshots. The server revalidates iframe host/path and image data before storage.
- Added editor styling for code, media, callouts, tables, slash commands and the drawing canvas.

### Files changed
- `frontend/src/components/notes-workspace.tsx`
- `frontend/src/components/note-drawing-modal.tsx` (new)
- `frontend/src/lib/notes.ts`
- `frontend/src/app/connected.css`
- `backend/src/main/java/com/pios/data/PiosDataController.java`
- `README.md`

### Trade-offs and boundaries
- HTML persistence is compatible with current notes but is less expressive than a structured block document model. A future migration should introduce typed block JSON, stable block IDs, ordering, and versioned migrations only after the interaction model is validated.
- Drawing snapshots are easy to store and display but cannot be reopened as editable vector shapes. Advanced connector routing, layers, multi-select, diagram templates, and a full Excalidraw-like object model remain future work.
- YouTube embed adds playback only. It does not download or transcribe lecture content, and the external player remains subject to YouTube availability and browser policy.
- Code blocks are syntax-language-labelled editing areas; syntax highlighting and execution are not included. LaTeX is stored as source text and is not rendered by a math engine.
- This establishes an extensible block catalogue, not an exhaustive professional tool library. More blocks for Java/Spring, databases, cloud, networking, AI/ML, mathematics, research and learning should be added based on focused user workflows rather than a large unvalidated list.

### Verification status
- Source-level checks confirm that the new editor component and sanitizer paths are present and that the GitHub changes are limited to the feature branch.
- Docker/Maven/Next.js build, browser interactions, image-save round trip, YouTube rendering, and end-to-end note persistence have not been run in this environment. They must be tested locally before merging into `main`.

---

**End of internal action and decision log.**
