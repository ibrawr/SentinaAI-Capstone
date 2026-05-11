/**
 * Displays and manages live alert popups for operations, sustainability, and SOC
 * sections by polling the alerts API, queueing unseen alerts, persisting seen and
 * dismissed state in session storage, and routing users to alert detail pages.
 * This component uses React Router navigation, section-to-domain mappings, and
 * LiveAlertOverlay.css styling for the modal presentation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "./LiveAlertOverlay.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const sectionDomainMap = {
  operations: "OPERATIONS",
  sustainability: "SUSTAINABILITY",
  soc: "SECURITY",
};

const sectionRouteMap = {
  operations: "/operations",
  sustainability: "/sustainability",
  soc: "/soc",
};

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeJsonParse(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeAlert(alert) {
  if (!alert || typeof alert !== "object") return null;
  return {
    ...alert,
    alert_id: Number(alert.alert_id),
    severity: String(alert.severity || "MEDIUM").toUpperCase(),
    status: String(alert.status || "NEW").toUpperCase(),
  };
}

function enqueueUnique(existingQueue, incomingAlerts) {
  const known = new Set(existingQueue.map((item) => Number(item.alert_id)));
  const merged = [...existingQueue];

  for (const rawAlert of incomingAlerts) {
    const alert = normalizeAlert(rawAlert);
    if (!alert) continue;
    if (known.has(alert.alert_id)) continue;
    known.add(alert.alert_id);
    merged.push(alert);
  }

  return merged.sort((a, b) => Number(b.alert_id) - Number(a.alert_id));
}

export default function LiveAlertOverlay({ section, pollMs = 2500 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const domain = sectionDomainMap[section] || null;
  const routePrefix = sectionRouteMap[section] || null;

  const [queue, setQueue] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const mountedRef = useRef(false);
  const pollingRef = useRef(false);
  const lastSeenIdRef = useRef(0);
  const dismissedIdsRef = useRef(new Set());

  const storageKeyBase = useMemo(() => {
    if (!domain) return null;
    return `sentina.liveAlert.${domain}`;
  }, [domain]);

  const dismissActive = useCallback(() => {
    setActiveAlert((current) => {
      if (current?.alert_id) {
        dismissedIdsRef.current.add(Number(current.alert_id));
      }
      return null;
    });
  }, []);

  const persistState = useCallback(() => {
    if (!storageKeyBase) return;
    try {
      sessionStorage.setItem(`${storageKeyBase}.lastSeenId`, String(lastSeenIdRef.current || 0));
      sessionStorage.setItem(
        `${storageKeyBase}.dismissedIds`,
        JSON.stringify(Array.from(dismissedIdsRef.current).slice(-100))
      );
    } catch {
    }
  }, [storageKeyBase]);

  useEffect(() => {
    if (!storageKeyBase) return;

    try {
      const savedLastSeen = Number(sessionStorage.getItem(`${storageKeyBase}.lastSeenId`) || 0);
      if (Number.isFinite(savedLastSeen) && savedLastSeen > 0) {
        lastSeenIdRef.current = savedLastSeen;
      }

      const savedDismissed = JSON.parse(sessionStorage.getItem(`${storageKeyBase}.dismissedIds`) || "[]");
      if (Array.isArray(savedDismissed)) {
        dismissedIdsRef.current = new Set(savedDismissed.map((value) => Number(value)).filter(Number.isFinite));
      }
    } catch {
      lastSeenIdRef.current = 0;
      dismissedIdsRef.current = new Set();
    }
  }, [storageKeyBase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const bootstrap = useCallback(async () => {
    if (!domain || !storageKeyBase) {
      setBootstrapped(true);
      return;
    }

    setBootstrapped(true);

    try {
      const res = await axios.get(`${API_BASE}/alerts`, {
        params: {
          domain,
          status: "NEW",
          sort: "detected_desc",
          page: 1,
          pageSize: 1,
        },
      });

      const latestId = Number(res.data?.rows?.[0]?.alert_id || 0);
      if (Number.isFinite(latestId) && latestId > 0) {
        lastSeenIdRef.current = latestId;
        persistState();
      }
    } catch {
    } finally {
      if (mountedRef.current) {
        setBootstrapped(true);
      }
    }
  }, [domain, persistState, storageKeyBase]);

  const pollForAlerts = useCallback(async () => {
    if (!domain || !bootstrapped || pollingRef.current) return;
    pollingRef.current = true;

    try {
      const res = await axios.get(`${API_BASE}/alerts/live`, {
        params: {
          domain,
          status: "NEW",
          since_alert_id: lastSeenIdRef.current || 0,
          limit: 10,
        },
      });

      const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
      if (!rows.length) return;

      const unseen = rows.filter((alert) => !dismissedIdsRef.current.has(Number(alert.alert_id)));
      const maxId = Math.max(...rows.map((alert) => Number(alert.alert_id)).filter(Number.isFinite));

      if (Number.isFinite(maxId) && maxId > lastSeenIdRef.current) {
        lastSeenIdRef.current = maxId;
        persistState();
      }

      if (!unseen.length || !mountedRef.current) return;

      setQueue((currentQueue) => enqueueUnique(currentQueue, unseen));
    } catch {
    } finally {
      pollingRef.current = false;
    }
  }, [bootstrapped, domain, persistState]);

  useEffect(() => {
    if (!domain) return undefined;
    bootstrap();
    return undefined;
  }, [bootstrap, domain]);

  useEffect(() => {
    if (!bootstrapped || !domain) return undefined;

    pollForAlerts();
    const timer = window.setInterval(pollForAlerts, Math.max(1500, Number(pollMs) || 2500));

    return () => window.clearInterval(timer);
  }, [bootstrapped, domain, pollForAlerts, pollMs]);

  useEffect(() => {
    if (!activeAlert && queue.length) {
      setActiveAlert(queue[0]);
      setQueue((currentQueue) => currentQueue.slice(1));
    }
  }, [activeAlert, queue]);

  useEffect(() => {
    if (!activeAlert) return;
    persistState();
  }, [activeAlert, persistState]);

  useEffect(() => {
    return () => persistState();
  }, [persistState]);

  if (!domain || !routePrefix || !activeAlert) {
    return null;
  }

  const severityClass = String(activeAlert.severity || "MEDIUM").toLowerCase();
  const ruleName = activeAlert.rule_name || activeAlert.rule_key || "Alert";
  const recommendedAction =
    activeAlert.recommended_action || activeAlert.response_action || "Review alert details immediately.";
  const metadata = safeJsonParse(activeAlert.metadata);
  const sourceLabel =
    metadata.source === "AI_ENGINE"
      ? "AI Engine"
      : metadata.source === "RULE_ENGINE"
        ? "Rule Engine"
        : metadata.source || "Alert Stream";
  const aiActionLabel = metadata.ai_action ? toTitleCase(metadata.ai_action) : null;

  const openDetails = () => {
    if (activeAlert?.alert_id) {
      dismissedIdsRef.current.add(Number(activeAlert.alert_id));
      persistState();
      navigate(`${routePrefix}/alerts/${activeAlert.alert_id}`, {
        state: {
          fromLiveAlert: true,
          previousPath: location.pathname,
        },
      });
      setActiveAlert(null);
    }
  };

  return (
    <div className="liveAlertOverlay" role="presentation">
      <div className={`liveAlertModal severity-${severityClass}`} role="alertdialog" aria-modal="true" aria-live="assertive">
        <button
          type="button"
          className="liveAlertClose"
          onClick={dismissActive}
          aria-label="Dismiss live alert"
        >
          ×
        </button>

        <div className="liveAlertTitle">{toTitleCase(activeAlert.severity)}!</div>

        <div className="liveAlertMetaRow">
          <div>
            <span>Device ID</span>
            <strong>
              {activeAlert.device_id ||
                metadata.camera_device_id ||
                metadata.env_device_id ||
                "—"}
            </strong>
          </div>
          <div>
            <span>Zone</span>
            <strong>{activeAlert.zone_id || "—"}</strong>
          </div>
          <div>
            <span>Hall</span>
            <strong>{activeAlert.hall_id || "—"}</strong>
          </div>
        </div>

        <div className="liveAlertBody">
          <p className="liveAlertRule">{ruleName}</p>
          <p>{activeAlert.message || "A new alert has been triggered."}</p>
          <p className="liveAlertSource"><strong>Source:</strong> {sourceLabel}{aiActionLabel ? ` • ${aiActionLabel}` : ""}</p>
          <p className="liveAlertAction"><strong>Recommended action:</strong> {recommendedAction}</p>
        </div>

        <div className="liveAlertFooter">
          <span>{formatDateTime(activeAlert.detected_at)}</span>
          {queue.length ? <span>{queue.length} more waiting</span> : <span>Status: {toTitleCase(activeAlert.status)}</span>}
        </div>

        <button type="button" className="liveAlertDetailsBtn" onClick={openDetails}>
          Alert Details
        </button>
      </div>
    </div>
  );
}
