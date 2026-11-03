CREATE TABLE pios_runtime_settings (
    setting_key VARCHAR(120) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_chatgpt_registrations (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    client_id VARCHAR(180) NOT NULL,
    ext_agent_host_id VARCHAR(180) NOT NULL,
    openai_subject VARCHAR(240) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_ai_chatgpt_registration_client UNIQUE (client_id)
);

CREATE TABLE ai_chatgpt_oauth_attempts (
    state_hash VARCHAR(64) PRIMARY KEY,
    launch_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    nonce VARCHAR(180) NOT NULL,
    encrypted_pkce_verifier TEXT NOT NULL,
    redirect_uri VARCHAR(500) NOT NULL,
    client_id VARCHAR(180),
    ext_agent_host_id VARCHAR(180) NOT NULL,
    encrypted_authorization_url TEXT NOT NULL,
    launch_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_ai_chatgpt_oauth_attempt_expiry ON ai_chatgpt_oauth_attempts(expires_at);

CREATE TABLE ai_chatgpt_pending_connections (
    state_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    openai_client_id VARCHAR(180) NOT NULL,
    openai_subject VARCHAR(240) NOT NULL,
    email VARCHAR(320),
    display_name VARCHAR(240),
    picture_url TEXT,
    encrypted_id_token TEXT NOT NULL,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    granted_scopes TEXT NOT NULL DEFAULT '',
    plan_usage_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_ai_chatgpt_pending_expiry ON ai_chatgpt_pending_connections(expires_at);
CREATE INDEX idx_ai_chatgpt_pending_user ON ai_chatgpt_pending_connections(user_id);

CREATE TABLE ai_chatgpt_connections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    openai_client_id VARCHAR(180) NOT NULL,
    openai_subject VARCHAR(240) NOT NULL,
    email VARCHAR(320),
    display_name VARCHAR(240),
    picture_url TEXT,
    encrypted_id_token TEXT,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    granted_scopes TEXT NOT NULL DEFAULT '',
    plan_usage_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    token_expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_ai_chatgpt_identity UNIQUE (openai_client_id, openai_subject)
);
CREATE INDEX idx_ai_chatgpt_connections_user ON ai_chatgpt_connections(user_id);
