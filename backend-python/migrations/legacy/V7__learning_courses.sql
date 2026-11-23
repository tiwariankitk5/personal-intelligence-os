ALTER TABLE learning_objectives ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 30 CHECK (daily_minutes BETWEEN 15 AND 240);
CREATE TABLE learning_lessons (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    objective_id UUID NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL,
    position INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
    video_id VARCHAR(11),
    start_seconds INTEGER NOT NULL DEFAULT 0 CHECK(start_seconds BETWEEN 0 AND 86400),
    end_seconds INTEGER CHECK(end_seconds BETWEEN 1 AND 86400 AND end_seconds>start_seconds),
    article TEXT NOT NULL DEFAULT '',
    completed BOOLEAN NOT NULL DEFAULT false,
    known BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(NOT(completed AND known))
);
CREATE INDEX idx_learning_lessons_objective ON learning_lessons(user_id,objective_id,position);
CREATE TABLE learning_questions (
    id UUID PRIMARY KEY,
    lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
    prompt VARCHAR(1500) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    replay_seconds INTEGER NOT NULL DEFAULT 0 CHECK(replay_seconds BETWEEN 0 AND 86400),
    source_quote TEXT NOT NULL DEFAULT '',
    passed BOOLEAN NOT NULL DEFAULT false,
    last_choice INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 2 AND 5),
    CHECK(correct_index>=0 AND correct_index<jsonb_array_length(options))
);
CREATE INDEX idx_learning_questions_lesson ON learning_questions(lesson_id,created_at,id);
CREATE TABLE learning_lesson_notes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
    seconds INTEGER NOT NULL CHECK(seconds BETWEEN 0 AND 86400),
    body TEXT NOT NULL,
    exported_note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lesson_notes_owner ON learning_lesson_notes(user_id,lesson_id,seconds);
CREATE TABLE learning_generation_usage (
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    usage_day DATE NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,usage_day)
);
