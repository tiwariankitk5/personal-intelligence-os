CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_app_users_email UNIQUE (email)
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_user_profiles_user UNIQUE (user_id),
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
);

CREATE TABLE user_profile_roles (
    profile_id UUID NOT NULL,
    role VARCHAR(60) NOT NULL,
    CONSTRAINT fk_profile_roles_profile FOREIGN KEY (profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
    CONSTRAINT uk_profile_roles UNIQUE (profile_id, role)
);

CREATE TABLE user_profile_interests (
    profile_id UUID NOT NULL,
    interest VARCHAR(100) NOT NULL,
    CONSTRAINT fk_profile_interests_profile FOREIGN KEY (profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
    CONSTRAINT uk_profile_interests UNIQUE (profile_id, interest)
);

CREATE TABLE user_profile_goals (
    profile_id UUID NOT NULL,
    goal VARCHAR(100) NOT NULL,
    CONSTRAINT fk_profile_goals_profile FOREIGN KEY (profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
    CONSTRAINT uk_profile_goals UNIQUE (profile_id, goal)
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    workspace_type VARCHAR(30) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES app_users (id) ON DELETE CASCADE
);

CREATE INDEX idx_workspaces_owner ON workspaces (owner_id);
CREATE UNIQUE INDEX uk_one_default_workspace_per_owner
    ON workspaces (owner_id) WHERE is_default = TRUE;
