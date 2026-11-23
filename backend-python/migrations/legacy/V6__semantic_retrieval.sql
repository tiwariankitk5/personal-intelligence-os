CREATE TABLE rag_settings (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
    model_name VARCHAR(180) NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions BETWEEN 1 AND 3072),
    request_dimensions BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT false,
    profile UUID NOT NULL DEFAULT gen_random_uuid(),
    daily_call_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_call_limit BETWEEN 1 AND 1000),
    daily_input_limit INTEGER NOT NULL DEFAULT 100000 CHECK (daily_input_limit BETWEEN 1000 AND 1000000)
);
CREATE TABLE rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    note_id UUID UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
    source_id UUID UNIQUE REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    version UUID NOT NULL DEFAULT gen_random_uuid(),
    state VARCHAR(20) NOT NULL DEFAULT 'pending',
    profile UUID,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(250),
    retry_after TIMESTAMPTZ,
    lease_id UUID,
    lease_until TIMESTAMPTZ,
    truncated BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((note_id IS NULL) <> (source_id IS NULL))
);
CREATE INDEX idx_rag_documents_queue ON rag_documents(state,retry_after,updated_at);
CREATE INDEX idx_rag_documents_user ON rag_documents(user_id);
CREATE TABLE rag_daily_usage (
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    usage_day DATE NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    reserved_input BIGINT NOT NULL DEFAULT 0,
    reported_tokens BIGINT NOT NULL DEFAULT 0,
    failed_calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,usage_day)
);
ALTER TABLE content_chunks ALTER COLUMN embedding TYPE vector USING embedding::vector;
ALTER TABLE content_chunks ADD COLUMN document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE;
ALTER TABLE content_chunks ADD COLUMN embedding_profile UUID;
ALTER TABLE content_chunks ADD COLUMN embedded_at TIMESTAMPTZ;
ALTER TABLE content_chunks ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english',content)) STORED;
CREATE INDEX idx_chunks_search ON content_chunks USING gin(search_vector);
CREATE INDEX idx_chunks_profile ON content_chunks(user_id,embedding_profile);
CREATE INDEX idx_chunks_document ON content_chunks(document_id,chunk_index);

-- Atomic chunk refresh on all content writes, including non-browser/API clients.
CREATE FUNCTION pios_refresh_rag_chunks() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    doc UUID;
    combined TEXT;
    original_length INTEGER;
    is_note BOOLEAN := TG_TABLE_NAME='notes';
BEGIN
    IF is_note THEN
        IF NEW.is_archived THEN
            DELETE FROM content_chunks WHERE note_id=NEW.id;
            DELETE FROM rag_documents WHERE note_id=NEW.id;
            RETURN NEW;
        END IF;
        IF TG_OP='UPDATE' AND OLD.title IS NOT DISTINCT FROM NEW.title
                AND OLD.plain_text IS NOT DISTINCT FROM NEW.plain_text
                AND OLD.is_archived IS NOT DISTINCT FROM NEW.is_archived
                AND EXISTS(SELECT 1 FROM rag_documents WHERE note_id=NEW.id) THEN RETURN NEW; END IF;
        combined := NEW.title || E'\n' || NEW.plain_text;
        INSERT INTO rag_documents(user_id,note_id) VALUES(NEW.user_id,NEW.id)
        ON CONFLICT(note_id) DO UPDATE SET version=gen_random_uuid(),state='pending',failure_count=0,
            last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,updated_at=now()
        RETURNING id INTO doc;
        DELETE FROM content_chunks WHERE note_id=NEW.id;
    ELSE
        IF TG_OP='UPDATE' AND OLD.title IS NOT DISTINCT FROM NEW.title
                AND OLD.full_text IS NOT DISTINCT FROM NEW.full_text
                AND EXISTS(SELECT 1 FROM rag_documents WHERE source_id=NEW.id) THEN RETURN NEW; END IF;
        combined := NEW.title || E'\n' || NEW.full_text;
        INSERT INTO rag_documents(user_id,source_id) VALUES(NEW.user_id,NEW.id)
        ON CONFLICT(source_id) DO UPDATE SET version=gen_random_uuid(),state='pending',failure_count=0,
            last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,updated_at=now()
        RETURNING id INTO doc;
        DELETE FROM content_chunks WHERE source_id=NEW.id;
    END IF;
    original_length := char_length(combined);
    combined := left(combined,200000);
    UPDATE rag_documents SET truncated=(original_length>200000) WHERE id=doc;
    INSERT INTO content_chunks(id,user_id,note_id,source_id,document_id,chunk_index,content)
    SELECT gen_random_uuid(),NEW.user_id,CASE WHEN is_note THEN NEW.id ELSE NULL END,
        CASE WHEN is_note THEN NULL ELSE NEW.id END,doc,n/1400,substring(combined FROM n+1 FOR 1600)
    FROM generate_series(0,greatest(0,char_length(combined)-201),1400) n;
    RETURN NEW;
END $$;
CREATE TRIGGER notes_rag_refresh AFTER INSERT OR UPDATE OF title,plain_text,is_archived ON notes
    FOR EACH ROW EXECUTE FUNCTION pios_refresh_rag_chunks();
CREATE TRIGGER sources_rag_refresh AFTER INSERT OR UPDATE OF title,full_text ON knowledge_sources
    FOR EACH ROW EXECUTE FUNCTION pios_refresh_rag_chunks();
-- Backfill both existing notes and sources; triggers leave user content unchanged.
UPDATE notes SET plain_text=plain_text;
UPDATE knowledge_sources SET full_text=full_text;
