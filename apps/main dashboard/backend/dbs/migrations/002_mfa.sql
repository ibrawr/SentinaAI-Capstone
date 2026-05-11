-- MFA Migration
-- Adds TOTP-based multi-factor authentication support to the users table.
-- mfa_secret: base32-encoded TOTP secret (null = MFA not configured or disabled)
-- mfa_enabled: true only after user has verified their first TOTP code
-- mfa_enabled_at: audit timestamp of when MFA was activated

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret     TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mfa_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ DEFAULT NULL;
