CREATE TABLE IF NOT EXISTS user_consents (
    user_id          UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    terms_version    TEXT        NOT NULL,
    privacy_version  TEXT        NOT NULL,
    age_14_confirmed BOOLEAN     NOT NULL CHECK (age_14_confirmed),
    agreed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, terms_version, privacy_version)
);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
