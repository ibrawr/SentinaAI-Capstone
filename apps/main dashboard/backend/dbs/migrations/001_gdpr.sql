-- GDPR Compliance Migration
-- Art.7  — Consent: track when/which version of privacy notice the user accepted
-- Art.5(1)(e) — Storage Limitation: index enables efficient time-range purge of audit logs

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS consent_version  VARCHAR(20)  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_aaal_created_at
  ON auth_access_audit_log (created_at);
