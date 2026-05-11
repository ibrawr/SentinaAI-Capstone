/**
 * Displays the alert details page for a selected alert, including alert metadata,
 * trigger metrics, and available response actions. This page uses React Router
 * navigation and route params, fetches alert details and actions from the alerts
 * API, and applies role-based domain handling with AlertDetailsPage.css styling.
 */

import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./AlertDetailsPage.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const role = localStorage.getItem("role") || sessionStorage.getItem("role");

const roleDomainMap = {
  operations_manager: "OPERATIONS",
  sustainability_manager: "SUSTAINABILITY",
  soc_analyst: "SECURITY",
  exhibitor: "EXHIBITOR",
};

const domain = roleDomainMap[role] || "OPERATIONS";

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMetricLabel(alert) {
  if (domain === "SECURITY") {
    return "Trigger Value";
  }

  const path = String(alert?.field_path || "").toLowerCase();
  if (path.includes("occup")) return "Current Occupancy";
  if (path.includes("co2")) return "CO₂ Reading";
  if (path.includes("humid")) return "Humidity";
  if (path.includes("temp")) return "Temperature";
  return "Trigger Value";
}

function getInfoFields(alert) {
  return [
    { label: "Alert ID", value: alert.alert_id ?? "-" },
    { label: "Rule", value: alert.rule_name || alert.rule_key || "-" },
    { label: "Priority", value: alert.severity || "-", badge: true },
    { label: "Domain", value: alert.domain || domain },
    { label: "Zone", value: alert.zone_id || "-" },
    { label: "Hall", value: alert.hall_id || "-" },
    { label: "Device", value: alert.device_id || "-" },
    { label: "Detected At", value: formatDateTime(alert.detected_at) },
    { label: "Event Time", value: formatDateTime(alert.event_timestamp) },
    { label: "Status", value: alert.status || "-" },
    { label: "Response Type", value: alert.response_type || alert.default_response_type || "Manual" },
    { label: "Action Status", value: alert.action_status || "Pending" },
  ];
}

export default function AlertDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [alert, setAlert] = useState(null);
  const [actions, setActions] = useState([]);
  const [selectedActions, setSelectedActions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resolved = alert?.status === "RESOLVED" || alert?.status === "CLOSED";

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await axios.get(`${API_BASE}/alerts/${id}`, {
          params: { domain },
        });

        if (!alive) return;

        const data = res.data || {};
        const nextAlert = data.alert || null;
        setAlert(nextAlert);

        const initial = {};
        if (nextAlert?.action_taken) {
          nextAlert.action_taken
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach((entry) => {
              const key = entry.toLowerCase().replace(/\s+/g, "_");
              initial[key] = true;
            });
        }
        setSelectedActions(initial);

        if (Array.isArray(data.actions) && data.actions.length) {
          setActions(data.actions);
          return;
        }

        const actionText =
          nextAlert?.recommended_action ||
          nextAlert?.default_response_action ||
          nextAlert?.response_action ||
          "Investigate alert";

        const severity = String(nextAlert?.severity || "MEDIUM").toLowerCase();
        const isAutomated =
          String(nextAlert?.default_response_type || nextAlert?.response_type || "").toUpperCase() === "AUTOMATED" ||
          nextAlert?.auto_mitigation_enabled === true ||
          nextAlert?.auto_response_executed === true;

        setActions([
          {
            action_key: "default_action",
            action_name: actionText,
            impact: severity,
            automated: isAutomated,
          },
        ]);
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || "Failed to load alert details");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [id]);

  const toggleAction = (key) => {
    if (resolved || submitting) return;
    setSelectedActions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const triggerActions = async () => {
    const chosen = Object.keys(selectedActions).filter((key) => selectedActions[key]);
    if (!chosen.length) return;

    try {
      setSubmitting(true);
      await axios.post(
        `${API_BASE}/alerts/${id}/execute`,
        {
          actions: chosen,
          user_id: localStorage.getItem("user_id") || sessionStorage.getItem("user_id"),
        },
        {
          params: { domain },
        }
      );

      const res = await axios.get(`${API_BASE}/alerts/${id}`, { params: { domain } });
      const data = res.data || {};
      setAlert(data.alert || null);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to execute response action");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = useMemo(
    () => Object.keys(selectedActions).filter((key) => selectedActions[key]).length,
    [selectedActions]
  );

  const alertsListPath = pathname.startsWith("/soc/")
    ? "/soc/alerts"
    : pathname.startsWith("/sustainability/")
      ? "/sustainability/alerts"
      : "/operations/alerts";

  if (loading) {
    return <div className="alertDetailsLoading">Loading...</div>;
  }

  if (!alert) {
    return (
      <div className="opsTheme alertDetailsPage">
        <div className="devicesError">
          <div className="devicesErrorTitle">Error</div>
          <div className="devicesErrorBody">{error || "Alert not found."}</div>
        </div>
      </div>
    );
  }

  const infoFields = getInfoFields(alert);
  const metricLabel = getMetricLabel(alert);

  return (
    <div className={`alertDetailsPage ${domain === "SECURITY" ? "socTheme" : "opsTheme"}`}>
      <div className="alertHeader">
        <button className="alertBack" onClick={() => navigate(-1)}>
          ←
        </button>

        <div className="alertHeaderTitleWrap">
          <div className="alertHeaderTitle">Alert Overview | {formatDateTime(alert.detected_at)}</div>
          <span className={`statusPill ${String(alert.status || "").toLowerCase()}`}>{alert.status}</span>
        </div>
      </div>

      {error ? (
        <div className="devicesError" style={{ marginTop: 0 }}>
          <div className="devicesErrorTitle">Error</div>
          <div className="devicesErrorBody">{error}</div>
        </div>
      ) : null}

      <div className="alertMetricsRow">
        <div className="metricCard aiMetric">
          <div className="metricTitle">Response Mode</div>
          <div className="metricValue metricValue--text">
            {String(alert.response_type || alert.default_response_type || "MANUAL").toUpperCase()}
          </div>
        </div>

        <div className="metricCard">
          <div className="metricTitle">Threshold</div>
          <div className="metricValue">{alert.threshold_value ?? "-"}</div>
        </div>

        <div className="metricCard red">
          <div className="metricTitle">{metricLabel}</div>
          <div className="metricValue">{alert.trigger_value ?? "-"}</div>
        </div>
      </div>

      <div className="alertBody">
        <div className="alertInfoCard">
          <h2>Alert Overview</h2>

          <div className="alertGrid">
            {infoFields.map((field) => (
              <div key={field.label}>
                <label>{field.label}</label>
                <div>
                  {field.badge ? (
                    <span className={`priorityBadge ${String(field.value || "").toLowerCase()}`}>
                      {field.value}
                    </span>
                  ) : (
                    field.value
                  )}
                </div>
              </div>
            ))}

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Message</label>
              <div>{alert.message || "No description provided."}</div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Recommended Action</label>
              <div>{alert.recommended_action || alert.response_action || "Investigate alert and confirm containment steps."}</div>
            </div>
          </div>
        </div>

        <div className="alertActionsCard">
          <div className="alertActionsInner">
            <div className="alertActionsTop">
              <div>
                <h2>Response Actions</h2>
                <p>
                  Select the actions you want to execute for this alert. Rule-based actions are shown here for the SOC workflow.
                </p>
              </div>
              <div className="settingsStatusPill">{selectedCount} selected</div>
            </div>

            <div className="actionsList">
              {actions.map((action) => {
                const key = action.action_key || action.action_name;
                const checked = !!selectedActions[key];
                const automated = action.automated === true;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`actionRow ${checked ? "isSelected" : ""} ${automated ? "isAutomated" : ""}`}
                    onClick={() => toggleAction(key)}
                    disabled={resolved || submitting}
                  >
                    <div className="actionRowLeft">
                      <div className={`actionCheckbox ${checked ? "isChecked" : ""}`} />
                      <div>
                        <div className="actionName">{action.action_name}</div>
                        <div className="actionMetaRow">
                          <span className={`impact ${String(action.impact || "medium").toLowerCase()}`}>{toTitleCase(action.impact || "medium")}</span>
                          <span className={`automationBadge ${automated ? "on" : "off"}`}>
                            {automated ? "Automated" : "Manual"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="alertActionsFooter">
              <button className="secondaryBtn" type="button" onClick={() => navigate(alertsListPath)}>Back to Alerts</button>
              <button
                className="primaryBtn"
                type="button"
                onClick={triggerActions}
                disabled={resolved || submitting || selectedCount === 0}
              >
                {resolved ? "Resolved" : submitting ? "Executing..." : "Execute Selected Actions"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
