-- Shared quotas for every web instance. No raw email, IP, cookie or text.
CREATE TABLE request_limits (
 scope text NOT NULL CHECK(scope IN ('PUBLIC_API','EMAIL_GLOBAL','EMAIL_ACCOUNT','ACTOR_READ','ACTOR_WRITE','GROUP_CREATE','MODEL_GLOBAL')),
 subject_digest text NOT NULL CHECK(subject_digest ~ '^[a-f0-9]{64}$'),
 hits integer NOT NULL CHECK(hits BETWEEN 1 AND 1000000),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(scope,subject_digest)
);
CREATE INDEX request_limits_expiry ON request_limits(expires_at);
ALTER TABLE request_limits ENABLE ROW LEVEL SECURITY;
-- No browser policies; only the restricted server role receives access.
