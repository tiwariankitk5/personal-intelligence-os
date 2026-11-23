ALTER TABLE notes ADD COLUMN editor_settings TEXT NOT NULL DEFAULT '{}';

CREATE TABLE draft_sheets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    scene_data TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_draft_sheets_user ON draft_sheets(user_id, updated_at DESC);
