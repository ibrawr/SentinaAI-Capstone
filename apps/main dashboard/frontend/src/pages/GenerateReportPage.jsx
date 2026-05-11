/**
 * Displays the report generation page for operations and exhibitor workflows,
 * including report configuration, multi-select zone and hall selection, section
 * toggles, aggregation settings, notes, draft saving, and final report generation.
 * This page uses report API helpers, route-based domain config from reportConfig,
 * and React Router navigation and params to load, edit, save, and generate reports.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./GenerateReportPage.css";
import {
  createReportDraft,
  fetchReport,
  fetchReportOptions,
  finalizeDraftReport,
  generateReport,
  updateReportDraft,
} from "../api/reports";
import { getDomainFromPath, REPORT_DOMAIN_CONFIG } from "../utils/reportConfig";

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);
  return {
    date_from: toDateInputValue(start),
    date_to: toDateInputValue(end),
  };
}

function MultiSelectList({
  label,
  options,
  selectedValues,
  onChange,
  getOptionValue,
  getOptionLabel,
  getOptionMeta,
  helperText,
  emptyText,
  disabled = false,
}) {
  const normalizedSelected = Array.isArray(selectedValues) ? selectedValues.map(String) : [];
  const allValues = options.map((option) => String(getOptionValue(option)));
  const selectedCount = normalizedSelected.length;
  const allSelected = allValues.length > 0 && allValues.every((value) => normalizedSelected.includes(value));

  function toggleValue(value) {
    if (disabled) return;
    const nextValue = String(value);
    const next = normalizedSelected.includes(nextValue)
      ? normalizedSelected.filter((item) => item !== nextValue)
      : [...normalizedSelected, nextValue];
    onChange(next);
  }

  function handleSelectAll() {
    if (disabled) return;
    onChange(allValues);
  }

  function handleClear() {
    if (disabled) return;
    onChange([]);
  }

  return (
    <label className="reportField">
      <span>{label}</span>

      <div className={`multiSelectCard${disabled ? " isDisabled" : ""}`}>
        <div className="multiSelectToolbar">
          <div className="multiSelectSummary">
            <strong>{selectedCount}</strong> selected
          </div>

          <div className="multiSelectToolbarActions">
            <button type="button" className="multiSelectActionBtn" onClick={handleSelectAll} disabled={disabled || !options.length || allSelected}>
              Select all
            </button>
            <button type="button" className="multiSelectActionBtn" onClick={handleClear} disabled={disabled || !normalizedSelected.length}>
              Clear
            </button>
          </div>
        </div>

        {helperText ? <div className="multiSelectHelper">{helperText}</div> : null}

        <div className="multiSelectList" role="listbox" aria-multiselectable="true">
          {options.length ? (
            options.map((option) => {
              const optionValue = String(getOptionValue(option));
              const checked = normalizedSelected.includes(optionValue);
              const meta = getOptionMeta ? getOptionMeta(option) : "";

              return (
                <button
                  key={optionValue}
                  type="button"
                  className={`multiSelectOption${checked ? " isSelected" : ""}`}
                  onClick={() => toggleValue(optionValue)}
                  aria-pressed={checked}
                  disabled={disabled}
                >
                  <span className={`multiSelectCheckbox${checked ? " isChecked" : ""}`}>{checked ? "✓" : ""}</span>

                  <span className="multiSelectTextWrap">
                    <span className="multiSelectPrimary">{getOptionLabel(option)}</span>
                    {meta ? <span className="multiSelectSecondary">{meta}</span> : null}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="multiSelectEmpty">{emptyText}</div>
          )}
        </div>
      </div>
    </label>
  );
}

export default function GenerateReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reportId } = useParams();

  const domain = getDomainFromPath(location.pathname);
  const config = REPORT_DOMAIN_CONFIG[domain];
  const isEditingDraft = Boolean(reportId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({ zones: [], facilities: [], events: [], exhibitors: [], booths: [] });

  const [form, setForm] = useState(() => ({
    report_title: "",
    ...getDefaultRange(),
    zones: [],
    facilities: [],
    sections: [...config.defaultSections],
    frequency: "Hourly",
    custom_notes: "",
    format: "pdf",
    event_id: "",
    exhibitor_id: "",
    booth_ids: [],
  }));

  const availableFacilities = useMemo(() => {
    if (!form.zones.length) return [];
    return (options.facilities || []).filter((facility) => form.zones.includes(String(facility.zone_id)));
  }, [form.zones, options.facilities]);

  const currentExhibitor = useMemo(() => {
    if (domain !== "exhibitors") return null;
    return options.currentExhibitor || null;
  }, [domain, options.currentExhibitor]);

  const selectedEvent = useMemo(() => {
    if (domain !== "exhibitors") return null;
    if (options.selectedEvent?.event_id && String(options.selectedEvent.event_id) === String(form.event_id || "")) {
      return options.selectedEvent;
    }
    return (options.events || []).find((item) => String(item.event_id) === String(form.event_id || "")) || null;
  }, [domain, form.event_id, options.events, options.selectedEvent]);

  const boothDisplayValue = useMemo(() => {
    if (domain !== "exhibitors") return "";
    return (options.booths || [])
      .map((booth) => `${booth.booth_code}${booth.hall_name ? ` • ${booth.hall_name}` : ""}`)
      .join("\n");
  }, [domain, options.booths]);

  useEffect(() => {
    let ignore = false;

    async function loadBaseOptions() {
      try {
        setLoading(true);
        setError("");

        const baseOptions = await fetchReportOptions(domain, {});
        if (ignore) return;

        setOptions((prev) => ({ ...prev, ...baseOptions }));

        if (isEditingDraft) {
          const report = await fetchReport(reportId);
          if (ignore) return;

          const filters = report?.filters_json || {};
          setForm((prev) => ({
            ...prev,
            report_title: filters.report_title || report?.report_title || "",
            date_from: toDateInputValue(filters.date_from || prev.date_from),
            date_to: toDateInputValue(filters.date_to || prev.date_to),
            zones: Array.isArray(filters.zones) ? filters.zones.map(String) : [],
            facilities: Array.isArray(filters.facilities) ? filters.facilities.map(String) : [],
            sections:
              Array.isArray(filters.sections) && filters.sections.length
                ? filters.sections.map(String)
                : [...config.defaultSections],
            frequency: filters.frequency || prev.frequency,
            custom_notes: filters.custom_notes || "",
            format: String(report?.format || prev.format).toLowerCase(),
            event_id: filters.event_id || "",
            exhibitor_id: filters.exhibitor_id || "",
            booth_ids: Array.isArray(filters.booth_ids) ? filters.booth_ids.map(String) : [],
          }));
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.response?.data?.error || err.message || "Failed to load report options.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadBaseOptions();
    return () => {
      ignore = true;
    };
  }, [config.defaultSections, domain, isEditingDraft, reportId]);

  useEffect(() => {
    if (domain !== "exhibitors") return undefined;
    let ignore = false;

    async function loadExhibitorOptions() {
      try {
        const nextOptions = await fetchReportOptions(domain, {
          eventId: form.event_id || undefined,
          exhibitorId: form.exhibitor_id || undefined,
        });
        if (ignore) return;
        setOptions((prev) => ({ ...prev, ...nextOptions }));
      } catch (err) {
        if (!ignore) {
          setError(err?.response?.data?.error || err.message || "Failed to load exhibitor options.");
        }
      }
    }

    loadExhibitorOptions();
    return () => {
      ignore = true;
    };
  }, [domain, form.event_id, form.exhibitor_id]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      facilities: prev.facilities.filter((facilityId) =>
        availableFacilities.some((item) => String(item.hall_id) === String(facilityId))
      ),
    }));
  }, [availableFacilities]);

  useEffect(() => {
    if (domain !== "exhibitors") return;
    if (!currentExhibitor?.exhibitor_id) return;
    setForm((prev) => {
      if (prev.exhibitor_id === currentExhibitor.exhibitor_id) return prev;
      return { ...prev, exhibitor_id: currentExhibitor.exhibitor_id };
    });
  }, [currentExhibitor, domain]);

  useEffect(() => {
    if (domain !== "exhibitors") return;
    setForm((prev) => {
      const next = { ...prev };
      const nextBoothIds = (options.booths || []).map((booth) => String(booth.booth_id));
      next.booth_ids = nextBoothIds;

      if (selectedEvent?.start_datetime_utc) {
        next.date_from = toDateInputValue(selectedEvent.start_datetime_utc);
      }
      if (selectedEvent?.end_datetime_utc) {
        next.date_to = toDateInputValue(selectedEvent.end_datetime_utc);
      }

      return next;
    });
  }, [domain, options.booths, selectedEvent]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleArrayValue(field, value) {
    setForm((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field] : [];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return { ...prev, [field]: next };
    });
  }

  function buildPayload() {
    return {
      format: form.format,
      filters: {
        module: domain,
        report_title: form.report_title,
        date_from: form.date_from,
        date_to: form.date_to,
        zones: form.zones,
        facilities: form.facilities,
        sections: form.sections,
        frequency: form.frequency,
        custom_notes: form.custom_notes,
        event_id: form.event_id || null,
        exhibitor_id: form.exhibitor_id || null,
        booth_ids: form.booth_ids,
      },
    };
  }

  async function handleSaveDraft() {
    try {
      setSaving(true);
      setError("");
      const payload = buildPayload();
      if (isEditingDraft) {
        await updateReportDraft(reportId, domain, payload);
      } else {
        await createReportDraft(domain, payload);
      }
      navigate(config.listPath);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    try {
      setSaving(true);
      setError("");
      if (isEditingDraft) {
        await finalizeDraftReport(reportId);
      } else {
        await generateReport(domain, buildPayload());
      }
      navigate(config.listPath, {
        state: {
          reportGeneratedToast: "Report has been successfully generated.",
        },
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to generate report.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div
      className={`generateReportPage ${config.themeClass} ${domain === "operations" ? "operationsReportPage" : ""} ${domain === "exhibitors" ? "exhibitorReportPage" : ""}`}
      style={{ "--report-accent": config.accent }}></div>;
  }

  return (
    <div
        className={`generateReportPage ${config.themeClass} ${domain === "operations" ? "operationsReportPage" : ""} ${domain === "exhibitors" ? "exhibitorReportPage" : ""}`}
        style={{ "--report-accent": config.accent }}
      >
      <div className="generateReportShell">
        <div className="generateReportHeaderRow">
          <div>
            <p>
              {isEditingDraft
                ? "Edit your saved draft and generate when ready."
                : "Configure your report and save it as a draft or generate it now."}
            </p>
          </div>
        </div>

        {error ? <div className="generateReportError">{error}</div> : null}

        <div className="generateReportCard">
          <div className="generateReportGrid">
            <section className="generateReportSection">
              <h3>Report Configuration</h3>

              <label className="reportField">
                <span>Report Name</span>
                <input
                  type="text"
                  value={form.report_title}
                  onChange={(event) => updateField("report_title", event.target.value)}
                  placeholder="Enter report name"
                />
              </label>

              <div className="reportFieldRow twoCols">
                <label className="reportField">
                  <span>Date From</span>
                  <input
                    type="date"
                    value={form.date_from}
                    onChange={(event) => updateField("date_from", event.target.value)}
                    disabled={domain === "exhibitors"}
                  />
                </label>

                <label className="reportField">
                  <span>Date To</span>
                  <input
                    type="date"
                    value={form.date_to}
                    onChange={(event) => updateField("date_to", event.target.value)}
                    disabled={domain === "exhibitors"}
                  />
                </label>
              </div>

              {domain !== "exhibitors" ? (
                <>
                  <MultiSelectList
                    label="Zones"
                    options={options.zones || []}
                    selectedValues={form.zones}
                    onChange={(next) => updateField("zones", next)}
                    getOptionValue={(zone) => zone.zone_id}
                    getOptionLabel={(zone) => zone.zone_id}
                    getOptionMeta={(zone) => (zone.venue_id ? `Venue: ${zone.venue_id}` : "")}
                    helperText="Select one or more zones. Halls will update automatically."
                    emptyText="No zones available."
                  />

                  <MultiSelectList
                    label="Halls"
                    options={availableFacilities}
                    selectedValues={form.facilities}
                    onChange={(next) => updateField("facilities", next)}
                    getOptionValue={(facility) => facility.hall_id}
                    getOptionLabel={(facility) => facility.hall_name || facility.hall_id}
                    getOptionMeta={(facility) =>
                      [facility.hall_id, facility.zone_id ? `Zone: ${facility.zone_id}` : ""].filter(Boolean).join(" • ")
                    }
                    helperText={
                      form.zones.length
                        ? "Only halls from the selected zones are shown."
                        : "Choose zone(s) first to load the relevant halls."
                    }
                    emptyText={
                      form.zones.length ? "No halls found for the selected zone(s)." : "Select at least one zone to view halls."
                    }
                    disabled={!form.zones.length}
                  />
                </>
              ) : (
                <>
                  <label className="reportField">
                    <span>Event</span>
                    <select value={form.event_id} onChange={(event) => updateField("event_id", event.target.value)}>
                      <option value="">Select event</option>
                      {(options.events || []).map((eventItem) => (
                        <option key={eventItem.event_id} value={eventItem.event_id}>
                          {eventItem.event_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="reportField">
                    <span>Exhibitor</span>
                    <input
                      type="text"
                      value={currentExhibitor ? `${currentExhibitor.exhibitor_name} (${currentExhibitor.exhibitor_id})` : form.exhibitor_id}
                      readOnly
                      disabled
                      placeholder="Linked exhibitor"
                    />
                  </label>

                  <label className="reportField">
                    <span>Booth</span>
                    <input
                      type="text"
                      value={boothDisplayValue}
                      readOnly
                      disabled
                      placeholder={form.event_id ? "Assigned booth will appear here." : "Select an event to load the assigned booth."}
                    />
                  </label>
                </>
              )}
            </section>

            <div className="generateReportMiddleColumn">
              <section className="generateReportSection">
                <h3>Include Sections</h3>
                <div className="sectionToggleList">
                  {config.sections.map((section) => {
                    const checked = form.sections.includes(section.value);
                    return (
                      <label key={section.value} className="sectionToggleItem">
                        <span>{section.label}</span>
                        <button
                          type="button"
                          className={`switchButton${checked ? " isOn" : ""}`}
                          onClick={() => toggleArrayValue("sections", section.value)}
                          aria-pressed={checked}
                        >
                          <span className="switchThumb" />
                        </button>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="generateReportSection">
                <h3>Aggregation Level</h3>
                <div className="reportField aggregationField">
                  <div className={`radioGroup ${domain !== "exhibitors" ? "radioGroupVertical" : ""}`}>
                    {config.frequencyOptions.map((option) => (
                      <label key={option} className="radioItem">
                        <input
                          type="radio"
                          name="frequency"
                          checked={form.frequency === option}
                          onChange={() => updateField("frequency", option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <section className="generateReportSection">
              <h3>Additional Notes</h3>

              <label className="reportField">
                <span>Custom Notes / Comments</span>
                <textarea className="commentsTextarea"
                  rows={9}
                  value={form.custom_notes}
                  onChange={(event) => updateField("custom_notes", event.target.value)}
                  placeholder="Add any report context, notes, or comments here."
                />
              </label>

              <section className="generateReportSection">
                <h3>Report Format</h3>
                <div className="reportField aggregationField">
                  <div className="formatChoices">
                    <label className="checkItem">
                      <input
                        type="radio"
                        name="format"
                        checked={form.format === "pdf"}
                        onChange={() => updateField("format", "pdf")}
                      />
                      <span>PDF</span>
                    </label>

                    <label className="checkItem">
                      <input
                        type="radio"
                        name="format"
                        checked={form.format === "xlsx"}
                        onChange={() => updateField("format", "xlsx")}
                      />
                      <span>XLSX</span>
                    </label>
                  </div>
                </div>
              </section>
            </section>
          </div>

          <div className="generateReportActions">
            <button type="button" className="actionBtn ghost" onClick={() => navigate(config.listPath)} disabled={saving}>
              Cancel
            </button>

            <button type="button" className="actionBtn secondary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? "Saving…" : "Save Draft"}
            </button>

            <button type="button" className="actionBtn primary" onClick={handleGenerate} disabled={saving}>
              {saving ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}