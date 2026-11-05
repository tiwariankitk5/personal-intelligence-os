CREATE TABLE IF NOT EXISTS auth_abuse_buckets (
    bucket_key VARCHAR(64) PRIMARY KEY,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
DELETE FROM auth_abuse_buckets;
