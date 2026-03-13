CREATE TABLE IF NOT EXISTS "mobile_auth_codes" (
  "code" text PRIMARY KEY,
  "token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "mobile_auth_codes_expiry" ON "mobile_auth_codes" ("expires_at");
