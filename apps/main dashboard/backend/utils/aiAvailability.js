/**
 * Provides backend AI availability checks and non-security mode control by
 * resolving the AI service base URL, checking health status, and determining
 * whether AI-primary processing should run or fallback behavior should apply.
 */

const fetchFn = typeof fetch === "function" ? fetch : require("node-fetch");

function getAiBaseUrl() {
  return String(process.env.AI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function getNonSecurityMode() {
  return String(process.env.RULE_ENGINE_NON_SECURITY_MODE || "fallback_only").toLowerCase();
}

function resolveHealthUrl() {
  return (
    process.env.AI_PRIMARY_HEALTH_URL ||
    process.env.RULE_ENGINE_AI_HEALTH_URL ||
    `${getAiBaseUrl()}/docs`
  );
}

async function isUrlReachable(url) {
  try {
    const response = await fetchFn(url, { method: "GET" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function isAiHealthy() {
  if (process.env.AI_ENGINE_HEALTHY !== undefined) {
    return String(process.env.AI_ENGINE_HEALTHY).toLowerCase() === "true";
  }

  return isUrlReachable(resolveHealthUrl());
}

async function getAiPrimaryState() {
  const mode = getNonSecurityMode();
  const healthy = await isAiHealthy();

  if (mode === "always") {
    return {
      mode,
      healthy,
      runAiPrimary: false,
      reason: "Non-security fallback is forced on.",
    };
  }

  if (mode === "never") {
    return {
      mode,
      healthy,
      runAiPrimary: healthy,
      reason: healthy
        ? "AI primary active. Non-security fallback forced off."
        : "AI unavailable and non-security fallback forced off.",
    };
  }

  return {
    mode,
    healthy,
    runAiPrimary: healthy,
    reason: healthy
      ? "AI primary active. Rule engine fallback remains off for non-security domains."
      : "AI unavailable. Rule engine fallback may handle non-security domains if configured.",
  };
}

module.exports = {
  getAiBaseUrl,
  getNonSecurityMode,
  resolveHealthUrl,
  isAiHealthy,
  getAiPrimaryState,
};
