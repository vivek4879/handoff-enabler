-- Up Migration
CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY CONSTRAINT sessions_token_hash_length CHECK (octet_length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT sessions_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Down Migration
DROP TABLE sessions;
