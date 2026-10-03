-- Up Migration
CREATE TABLE users(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
    password_hash text NOT NULL,
    role text NOT NULL CONSTRAINT users_role_assigned CHECK (role IN ('client','creator')),
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Down Migration

DROP TABLE users;
