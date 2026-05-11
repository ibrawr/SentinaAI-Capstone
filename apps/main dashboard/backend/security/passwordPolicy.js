/**
 * Validates passwords against length, character, identity-based, and strength
 * requirements for the main dashboard authentication system.
 */
const zxcvbn = require("zxcvbn");

const SYMBOL_REGEX = /[^A-Za-z0-9]/;
const UPPER_REGEX = /[A-Z]/;
const LOWER_REGEX = /[a-z]/;
const DIGIT_REGEX = /[0-9]/;

function validatePassword(password, { email, name } = {}) {
  const errors = [];

  if (!password || typeof password !== "string") {
    return { ok: false, errors: ["Password is required."] };
  }

  if (password.length < 12) errors.push("Password must be at least 12 characters long.");
  if (!UPPER_REGEX.test(password)) errors.push("Password must include at least 1 uppercase letter.");
  if (!LOWER_REGEX.test(password)) errors.push("Password must include at least 1 lowercase letter.");
  if (!DIGIT_REGEX.test(password)) errors.push("Password must include at least 1 number.");
  if (!SYMBOL_REGEX.test(password)) errors.push("Password must include at least 1 symbol.");

  const lowered = password.toLowerCase();

  if (email) {
    const emailLocal = String(email).split("@")[0]?.toLowerCase();
    if (emailLocal && emailLocal.length >= 3 && lowered.includes(emailLocal)) {
      errors.push("Password must not contain your email/username.");
    }
  }

  if (name) {
    const parts = String(name)
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 3);

    for (const p of parts) {
      if (lowered.includes(p)) {
        errors.push("Password must not contain your name.");
        break;
      }
    }
  }

  const zx = zxcvbn(password, [email || "", name || ""]);
  if (zx.score < 3) {
    errors.push("Password is too weak. Use a longer passphrase with mixed characters.");
  }

  return { ok: errors.length === 0, errors, score: zx.score, feedback: zx.feedback };
}

module.exports = { validatePassword };