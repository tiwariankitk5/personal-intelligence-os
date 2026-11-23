# Semantic retrieval milestone

## Configure

Open **AI providers → Semantic retrieval**. Select an embedding-capable OpenAI-compatible connection, model and its actual vector dimensions (1–3072). Chat and embedding models are independent; a provider's chat connectivity test does not prove embedding support.

Enable the consent checkbox and save. This authorizes automatic embedding of note/source chunks and query embedding at that endpoint. Cloud provider charges and data policies apply. Local compatible endpoints remain restricted by the existing operator policy. No real user's provider is enabled automatically.

Defaults are 100 embedding calls and 100,000 conservative input units per user/UTC day. A unit is an input UTF-8 byte plus a small per-string allowance, **not a token price or dollar cap**. Calls reserve shared SQL budgets before outbound requests; uncertain/failed calls remain charged against the reservation. Provider-reported tokens are tracked separately when supplied. Query and indexing calls share the budget. Chat generation has separate billing and is not covered by these embedding limits.

The panel shows progress, failures, usage, partial/truncated documents and passage previews. Refreshing status does not call a model. Pending jobs also refresh automatically. Retry resumes incomplete jobs; **Rebuild embeddings** creates a fresh profile, including when a provider updates weights under the same model name. Disabling stops future processing/retrieval; already-running requests cannot be recalled and stored vectors remain in the private database until overwritten or content is deleted.

## Architecture and correctness

- V6 atomically refreshes chunks through PostgreSQL triggers for note/source inserts and text/title edits. Metadata-only saves do not rebuild unchanged chunks. Archive/delete removes affected chunks; restore queues new work. Existing content is backfilled without changing note bodies.
- Chunks contain at most 1,600 Unicode characters, with 200-character overlap. To bound initial work, retrieval covers the first 200,000 characters of each document, including title; larger documents are explicitly reported as truncated. This is a current product limit, including keyword retrieval.
- Workers claim documents with `FOR UPDATE SKIP LOCKED`, two-minute leases and unique lease tokens. At most eight chunks are embedded per batch. Content versions and profile/lease checks reject responses arriving after edits, deletes, rebuilds or configuration changes. No network call is held inside an indexing transaction. Expired leases resume work; provider failures retry three times with backoff, then require user action. Budget-paused work resumes next UTC day.
- OpenAI-compatible `/embeddings` calls use the existing endpoint policy, no redirects, timeouts and a 2 MB response cap. Vectors must have exact dimensions, finite numeric values, nonzero norms, complete unique indices and the correct batch size. Dimension reduction is requested only when the user selects it for a supporting model.
- PostgreSQL English full-text matches and exact pgvector cosine neighbors are combined by reciprocal rank fusion. Candidate pools are 20 per method; answers receive up to five passages, at most two from one document. Semantic candidates currently require cosine distance ≤0.65. Exact per-account search is used; no ANN/HNSW scaling claim is made.
- Every query, job, provider lookup, budget and source join is account-scoped. New profiles prevent mixing model/dimension spaces. Missing/unready/failed/budget-limited embeddings fall back to keyword matches with an explicit reason. A partial semantic index is disclosed.
- Prompts contain exact numbered passages and treat their content as untrusted evidence. Only referenced, in-range passage numbers become returned citations; unsupported numeric references are marked and uncited answers with available evidence are labelled unverified. Expand citations to read the actual supplied excerpt. This validates references, **not factual entailment or model truthfulness**. Conversation citations are historical snapshots; deleting a note removes future retrieval but does not erase past conversation text.
- Chat/provider network calls finish before the short atomic conversation/message persistence transaction.

## Evidence and limits

- 37 Java tests passed, including embedding protocol validation, malformed vectors, fusion/diversity and citation-number/excerpt integrity, alongside existing security tests. Frontend tests, typecheck and production build passed.
- `scripts/rag-smoke-test.mjs` runs real PostgreSQL/pgvector and actual HTTP calls to the explicitly deterministic `scripts/rag-test-provider.mjs`. It covers consent, both content types, account isolation, history, edits during in-flight jobs, archive/delete, profile changes/rebuild, provider failure/retry, usage, shared budget races and fallback. Local checks included two worker instances and ten simultaneous searches. The fixture is a protocol oracle, not a semantic model.
- Browser checks verified settings/consent, real-model passage previews, independent chat and embedding routes, hybrid indication and expandable citation excerpts. Chat generation in that browser test used the labelled deterministic fixture; no paid chat model or factual-answer benchmark was run.
- A separate real local evaluation used quantized `Xenova/all-MiniLM-L6-v2` (384 dimensions), Transformers.js 4.3.2, on the eight cases in `evaluation/rag-cases.json`. Keyword recall@5/MRR/top-1: **0.50**. Hybrid: **0.75**. Event publication and flashcard scheduling questions missed. See `evaluation/minilm-2026-11-05.json`. These small English examples do not establish production quality, multilingual performance or performance on large/private corpora. Threshold/model selection needs a larger held-out evaluation; do not tune solely to these eight cases.
- Repeat with an actual compatible embedding endpoint using `scripts/rag-evaluate.mjs` and its documented environment variables. It creates a synthetic account/corpus, reports both baselines and usage, then disables its semantic processing. No keys/session cookies are included in the report. Dependency/model caches used for the local CPU experiment are ignored artifacts, not app dependencies.
- Remaining production work includes representative relevance/abstention/answer-quality evaluation, hosted concurrency/abuse controls beyond embedding budgets, upload/OCR isolation, trusted ingress, backups and larger-corpus latency/scaling checks.

## API

All routes require authentication and existing CSRF protection on writes:

- `GET /api/v1/ai/retrieval/settings`: current configuration, indexing status and daily usage.
- `PUT /api/v1/ai/retrieval/settings`: own provider/model/dimensions, consent and budgets.
- `POST /api/v1/ai/retrieval/search`: query → retrieval mode, warning and exact passages; may consume a query-embedding call.
- `POST /api/v1/ai/retrieval/retry`: resume incomplete work.
- `POST /api/v1/ai/retrieval/rebuild`: invalidate profiles and re-embed all eligible content within budgets.
- Chat responses now include `retrievalMode`, `retrievalWarning` and numbered chunk/excerpt citations.

Protocol references: [OpenAI embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create), [pgvector](https://github.com/pgvector/pgvector), [MiniLM model card](https://huggingface.co/Xenova/all-MiniLM-L6-v2).
