CREATE TABLE auth_abuse_buckets (
    bucket_key VARCHAR(64) PRIMARY KEY,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_auth_abuse_expiry ON auth_abuse_buckets(expires_at);
