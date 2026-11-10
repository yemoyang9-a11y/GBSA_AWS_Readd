CREATE TABLE IF NOT EXISTS users (
    user_id      UUID        PRIMARY KEY,
    reader_id    UUID        NOT NULL UNIQUE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
    provider         TEXT NOT NULL CHECK (provider IN ('google', 'kakao')),
    provider_user_id TEXT NOT NULL,
    user_id          UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS ix_user_identities_user ON user_identities (user_id);

CREATE TABLE IF NOT EXISTS auth_login_codes (
    code       TEXT        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_auth_login_codes_expiry ON auth_login_codes (expires_at);

ALTER TABLE reading_position
    ADD COLUMN IF NOT EXISTS last_writer_device_id UUID;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_codes ENABLE ROW LEVEL SECURITY;
