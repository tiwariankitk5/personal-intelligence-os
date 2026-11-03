CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE note_folders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    color VARCHAR(24) NOT NULL DEFAULT '#7e9b8b',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_note_folders_user_name UNIQUE (user_id, name)
);
CREATE INDEX idx_note_folders_user ON note_folders(user_id);

CREATE TABLE notes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES note_folders(id) ON DELETE SET NULL,
    title VARCHAR(240) NOT NULL,
    body_html TEXT NOT NULL DEFAULT '',
    plain_text TEXT NOT NULL DEFAULT '',
    color VARCHAR(24) NOT NULL DEFAULT 'sage',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX idx_notes_user_folder ON notes(user_id, folder_id);
CREATE INDEX idx_notes_user_pinned ON notes(user_id, is_pinned) WHERE is_archived = FALSE;

CREATE TABLE knowledge_sources (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title VARCHAR(400) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    collection_name VARCHAR(120) NOT NULL DEFAULT 'Inbox',
    original_file_name VARCHAR(500),
    storage_key VARCHAR(80),
    source_url TEXT,
    mime_type VARCHAR(160),
    full_text TEXT NOT NULL DEFAULT '',
    byte_size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_user_updated ON knowledge_sources(user_id, updated_at DESC);

CREATE TABLE content_chunks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_chunks_user ON content_chunks(user_id);

CREATE TABLE ai_provider_connections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    display_name VARCHAR(120) NOT NULL,
    provider_type VARCHAR(40) NOT NULL,
    model_name VARCHAR(180) NOT NULL,
    base_url TEXT,
    encrypted_api_key TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_providers_user ON ai_provider_connections(user_id);
CREATE UNIQUE INDEX uk_ai_provider_default_per_user ON ai_provider_connections(user_id) WHERE is_default = TRUE;

CREATE TABLE learning_objectives (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category VARCHAR(120) NOT NULL DEFAULT 'General',
    target_date DATE,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_learning_objectives_user ON learning_objectives(user_id, updated_at DESC);

CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);

CREATE TABLE ai_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_messages_conversation ON ai_messages(user_id, conversation_id, created_at);
