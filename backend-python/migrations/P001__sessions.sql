-- Deliberately separate from Spring's Java-serialized sessions. Users sign in once after cutover.
CREATE TABLE python_sessions (
    token_hash varchar(64) PRIMARY KEY,
    user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
    csrf_token varchar(128) NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX python_sessions_expiry ON python_sessions(expires_at);
