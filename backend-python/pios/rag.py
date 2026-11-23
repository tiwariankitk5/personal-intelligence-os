import logging
import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field

from . import gateway
from .db import view
from .security import Model, current_user, fail, pool

router = APIRouter(prefix="/api/v1/ai/retrieval", dependencies=[Depends(current_user)])
log = logging.getLogger("pios.rag")
PASSAGES = '''SELECT c.id AS chunk_id,coalesce(n.id,k.id) AS id,coalesce(n.title,k.title) AS title,
 CASE WHEN n.id IS NOT NULL THEN 'note' ELSE 'source' END AS type,c.chunk_index,c.content AS excerpt
 FROM content_chunks c LEFT JOIN notes n ON n.id=c.note_id AND n.user_id=c.user_id
 LEFT JOIN knowledge_sources k ON k.id=c.source_id AND k.user_id=c.user_id
 WHERE c.user_id=%s AND (n.id IS NOT NULL AND n.is_archived=false OR k.id IS NOT NULL)'''
RESET = "state='pending',failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,version=gen_random_uuid(),updated_at=now()"


def settings(conn, uid):
    return conn.execute('''SELECT s.*,p.base_url,p.encrypted_api_key,p.provider_type FROM rag_settings s
        LEFT JOIN ai_provider_connections p ON p.id=s.provider_id AND p.user_id=s.user_id WHERE s.user_id=%s''', (uid,)).fetchone()


def status(conn, uid):
    config = settings(conn, uid)
    result = {"enabled": bool(config and config["enabled"]), "providerId": config["provider_id"] if config else None,
              "model": config["model_name"] if config else "text-embedding-3-small", "dimensions": config["dimensions"] if config else 1536,
              "requestDimensions": bool(config and config["request_dimensions"]), "dailyCallLimit": config["daily_call_limit"] if config else 100,
              "dailyInputLimit": config["daily_input_limit"] if config else 100000,
              "configured": bool(config and config["enabled"] and config["provider_type"] == "OPENAI_COMPATIBLE")}
    result["documents"] = conn.execute("SELECT count(*) n FROM rag_documents WHERE user_id=%s", (uid,)).fetchone()["n"]
    result["truncatedDocuments"] = conn.execute("SELECT count(*) n FROM rag_documents WHERE user_id=%s AND truncated", (uid,)).fetchone()["n"]
    result["states"] = conn.execute("SELECT state,count(*) AS count FROM rag_documents WHERE user_id=%s GROUP BY state", (uid,)).fetchall()
    result["chunks"] = conn.execute("SELECT count(*) n FROM content_chunks WHERE user_id=%s", (uid,)).fetchone()["n"]
    result["embeddedChunks"] = conn.execute("SELECT count(*) n FROM content_chunks WHERE user_id=%s AND embedding_profile=%s AND embedding IS NOT NULL", (uid, config["profile"])).fetchone()["n"] if config else 0
    error = conn.execute("SELECT last_error FROM rag_documents WHERE user_id=%s AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1", (uid,)).fetchone()
    result["lastError"] = error["last_error"] if error else None
    result["usage"] = conn.execute("SELECT calls,reserved_input,reported_tokens,failed_calls FROM rag_daily_usage WHERE user_id=%s AND usage_day=%s", (uid, datetime.now(timezone.utc).date())).fetchone() or {"calls": 0, "reserved_input": 0, "reported_tokens": 0, "failed_calls": 0}
    return result


class Configuration(Model):
    provider_id: UUID | None = None
    model: str = Field(min_length=1, max_length=180)
    dimensions: int = Field(ge=1, le=3072)
    request_dimensions: bool = False
    enabled: bool = False
    daily_call_limit: int = Field(ge=1, le=1000)
    daily_input_limit: int = Field(ge=1000, le=1000000)
    consent: bool = False


@router.get("/settings")
def get_settings(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return status(conn, uid)


@router.put("/settings")
def configure(body: Configuration, request: Request, uid: UUID = Depends(current_user)):
    if body.enabled and (not body.consent or not body.provider_id):
        fail(400, "Choose a provider and consent to embedding processing before enabling semantic retrieval.")
    if not body.model.strip():
        fail(400, "Model is required.")
    with pool(request).connection() as conn:
        conn.execute("SELECT id FROM app_users WHERE id=%s FOR UPDATE", (uid,))
        if body.provider_id and not conn.execute("SELECT 1 FROM ai_provider_connections WHERE id=%s AND user_id=%s AND provider_type='OPENAI_COMPATIBLE'", (body.provider_id, uid)).fetchone():
            fail(400, "Choose an OpenAI-compatible embedding provider from your own connections.")
        old = settings(conn, uid)
        changed = not old or any((old["provider_id"] != body.provider_id, old["model_name"] != body.model.strip(), old["dimensions"] != body.dimensions, old["request_dimensions"] != body.request_dimensions))
        profile = uuid4() if changed else old["profile"]
        conn.execute('''INSERT INTO rag_settings(user_id,provider_id,model_name,dimensions,request_dimensions,enabled,profile,daily_call_limit,daily_input_limit)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET provider_id=excluded.provider_id,model_name=excluded.model_name,
            dimensions=excluded.dimensions,request_dimensions=excluded.request_dimensions,enabled=excluded.enabled,profile=excluded.profile,
            daily_call_limit=excluded.daily_call_limit,daily_input_limit=excluded.daily_input_limit''',
                     (uid, body.provider_id, body.model.strip(), body.dimensions, body.request_dimensions, body.enabled, profile, body.daily_call_limit, body.daily_input_limit))
        conn.execute(f"UPDATE rag_documents SET {RESET} WHERE user_id=%s", (uid,))
        return status(conn, uid)


@router.post("/retry")
def retry(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        conn.execute(f"UPDATE rag_documents SET {RESET} WHERE user_id=%s AND state<>'ready'", (uid,))
        return status(conn, uid)


@router.post("/rebuild")
def rebuild(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        config = settings(conn, uid)
        if not config or not config["enabled"] or config["provider_type"] != "OPENAI_COMPATIBLE":
            fail(412, "Enable an available embedding provider before rebuilding.")
        conn.execute("UPDATE rag_settings SET profile=%s WHERE user_id=%s", (uuid4(), uid))
        conn.execute(f"UPDATE rag_documents SET {RESET} WHERE user_id=%s", (uid,))
        return status(conn, uid)


class BudgetExceeded(Exception):
    pass


def embed(db_pool, app_settings, config, inputs):
    units = sum(len(text.encode()) + 16 for text in inputs)
    day = datetime.now(timezone.utc).date()
    uid = config["user_id"]
    with db_pool.connection() as conn:
        accepted = conn.execute('''INSERT INTO rag_daily_usage(user_id,usage_day,calls,reserved_input) SELECT %s,%s,1,%s WHERE %s<=%s
            ON CONFLICT(user_id,usage_day) DO UPDATE SET calls=rag_daily_usage.calls+1,reserved_input=rag_daily_usage.reserved_input+excluded.reserved_input
            WHERE rag_daily_usage.calls<%s AND rag_daily_usage.reserved_input+excluded.reserved_input<=%s RETURNING calls''',
            (uid, day, units, units, config["daily_input_limit"], config["daily_call_limit"], config["daily_input_limit"])).fetchone()
    if not accepted:
        raise BudgetExceeded()
    try:
        vectors, tokens = gateway.embeddings(app_settings, config, inputs)
    except Exception:
        with db_pool.connection() as conn:
            conn.execute("UPDATE rag_daily_usage SET failed_calls=failed_calls+1 WHERE user_id=%s AND usage_day=%s", (uid, day))
        raise
    with db_pool.connection() as conn:
        conn.execute("UPDATE rag_daily_usage SET reported_tokens=reported_tokens+%s WHERE user_id=%s AND usage_day=%s", (tokens, uid, day))
    return vectors


def search(db_pool, app_settings, uid, query):
    terms = " OR ".join(dict.fromkeys(t for t in re.split(r"\W+", query.lower()) if len(t) > 2))[:400]
    with db_pool.connection() as conn:
        lexical = [view(r) for r in conn.execute(PASSAGES + " AND c.search_vector @@ websearch_to_tsquery('english',%s) ORDER BY ts_rank_cd(c.search_vector,websearch_to_tsquery('english',%s)) DESC,c.id LIMIT 20", (uid, terms, terms))] if terms else []
        config = settings(conn, uid)
        indexed = conn.execute("SELECT count(*) n FROM content_chunks WHERE user_id=%s AND embedding_profile=%s AND embedding IS NOT NULL", (uid, config["profile"])).fetchone()["n"] if config else 0
    warning = "Semantic retrieval is not enabled with an available embedding provider."
    if config and config["enabled"] and config["provider_type"] == "OPENAI_COMPATIBLE":
        warning = "Embeddings are not ready yet. Using keyword matches."
        if indexed:
            try:
                vector = gateway.vector_literal(embed(db_pool, app_settings, config, [query[:1600]])[0])
                with db_pool.connection() as conn:
                    semantic = [view(r) for r in conn.execute(PASSAGES + " AND c.embedding_profile=%s AND c.embedding IS NOT NULL AND vector_dims(c.embedding)=%s AND (c.embedding <=> %s::vector)<=0.65 ORDER BY c.embedding <=> %s::vector,c.id LIMIT 20", (uid, config["profile"], config["dimensions"], vector, vector))]
                    total = conn.execute("SELECT count(*) n FROM content_chunks WHERE user_id=%s", (uid,)).fetchone()["n"]
                return {"mode": "hybrid", "warning": "The semantic index is partial. Unindexed passages are searched by keywords." if indexed < total else None, "passages": gateway.fuse(lexical, semantic)}
            except BudgetExceeded:
                warning = "Daily embedding budget reached. Using keyword matches."
            except HTTPException as ex:
                warning = str(ex.detail) + " Using keyword matches."
    return {"mode": "keyword", "warning": warning, "passages": gateway.fuse(lexical, [])}


class Search(Model):
    query: str = Field(min_length=1, max_length=8000)


@router.post("/search")
def search_route(body: Search, request: Request, uid: UUID = Depends(current_user)):
    return search(pool(request), request.app.state.settings, uid, body.query.strip())


def process_next(db_pool, app_settings):
    with db_pool.connection() as conn:
        job = conn.execute('''SELECT d.id,d.user_id,d.version FROM rag_documents d JOIN rag_settings s ON s.user_id=d.user_id
            JOIN ai_provider_connections p ON p.id=s.provider_id AND p.user_id=s.user_id AND p.provider_type='OPENAI_COMPATIBLE'
            WHERE s.enabled AND (d.state='pending' OR d.state='failed' AND d.failure_count<3 AND d.retry_after<=now()
                OR d.state='budget' AND d.retry_after<=now() OR d.state='processing' AND d.lease_until<now())
            ORDER BY d.updated_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED''').fetchone()
        if not job:
            return
        config = settings(conn, job["user_id"])
        lease = uuid4()
        conn.execute("UPDATE rag_documents SET state='processing',lease_id=%s,lease_until=now()+interval '2 minutes',profile=%s WHERE id=%s", (lease, config["profile"], job["id"]))
    uid, document = job["user_id"], job["id"]
    try:
        with db_pool.connection() as conn:
            chunks = conn.execute('''SELECT c.id,c.content FROM content_chunks c JOIN rag_documents d ON d.id=c.document_id
                WHERE c.user_id=%s AND c.document_id=%s AND d.version=%s AND d.lease_id=%s
                AND (c.embedding IS NULL OR c.embedding_profile IS DISTINCT FROM %s) ORDER BY c.chunk_index LIMIT 8''', (uid, document, job["version"], lease, config["profile"])).fetchall()
        vectors = embed(db_pool, app_settings, config, [c["content"] for c in chunks]) if chunks else []
        with db_pool.connection() as conn:
            current = conn.execute('''SELECT 1 FROM rag_documents d JOIN rag_settings s ON s.user_id=d.user_id
                WHERE d.id=%s AND d.user_id=%s AND d.version=%s AND d.lease_id=%s AND s.profile=%s AND s.enabled AND s.provider_id=%s FOR UPDATE OF d''',
                (document, uid, job["version"], lease, config["profile"], config["provider_id"])).fetchone()
            if not current:
                return
            for chunk, vector in zip(chunks, vectors, strict=True):
                conn.execute("UPDATE content_chunks SET embedding=%s::vector,embedding_profile=%s,embedded_at=now() WHERE id=%s AND user_id=%s AND document_id=%s", (gateway.vector_literal(vector), config["profile"], chunk["id"], uid, document))
            remaining = conn.execute("SELECT count(*) n FROM content_chunks WHERE document_id=%s AND user_id=%s AND (embedding IS NULL OR embedding_profile IS DISTINCT FROM %s)", (document, uid, config["profile"])).fetchone()["n"]
            conn.execute("UPDATE rag_documents SET state=%s,failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", ("pending" if remaining else "ready", document))
    except Exception as ex:
        budget = isinstance(ex, BudgetExceeded)
        message = "Daily embedding budget reached. Retry tomorrow or increase the limit." if budget else "Embedding indexing failed. Check provider access, model and dimensions; then retry."
        with db_pool.connection() as conn:
            conn.execute('''UPDATE rag_documents SET state=%s,failure_count=failure_count+%s,last_error=%s,
                retry_after=CASE WHEN %s THEN (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC'
                ELSE now()+interval '60 seconds' * power(2,least(failure_count,3)) END,lease_id=NULL,lease_until=NULL,updated_at=now()
                WHERE id=%s AND user_id=%s AND version=%s AND lease_id=%s''', ("budget" if budget else "failed", 0 if budget else 1, message, budget, document, uid, job["version"], lease))
