from datetime import datetime
from typing import Dict, Any, List, Optional

from app.report.module.exhibitors.constant import SECTION_LABELS
from app.report.module.exhibitors.data_prep import prepare_exhibitor_report_data

from app.report.module.exhibitors.sections.traffic_overview import build_traffic_overview_section
from app.report.module.exhibitors.sections.engagement_analysis import build_engagement_analysis_section
from app.report.module.exhibitors.sections.time_analysis import build_time_analysis_section
from app.report.module.exhibitors.sections.booth_profile import build_booth_profile_section
from app.report.module.exhibitors.sections.performance_breakdown import build_performance_breakdown_section
from app.report.module.exhibitors.sections.definitions import build_definitions_section

from app.report.schemas import ReportFilters


ALLOWED_SECTIONS: List[str] = [
    "traffic_overview",
    "engagement_analysis",
    "time_analysis",
    "crowd_context",
    "comfort_and_congestion",
    "booth_profile",
    "performance_breakdown",
]


def _clean_list(values):
    if not values:
        return []
    if isinstance(values, list) and len(values) == 1 and str(values[0]).strip().lower() == "string":
        return []
    return [str(v) for v in values if str(v).strip()]


def _normalize_section(key: str, sec: Dict[str, Any]) -> Dict[str, Any]:
    sec = dict(sec or {})
    sec.setdefault("key", key)
    sec.setdefault("title", SECTION_LABELS.get(key, key.replace("_", " ").title()))
    sec.setdefault("subtitle", "")
    sec.setdefault("blocks", [])
    sec.setdefault("columns", [])
    sec.setdefault("table_rows", [])
    sec.setdefault("summary", [])
    sec.setdefault("xlsx_sheets", [])
    return sec


def build_exhibitors_report(
    filters: ReportFilters,
    mode: str,
    datasets: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    requested = _clean_list(filters.sections)
    selected = [s for s in requested if s in ALLOWED_SECTIONS and s in SECTION_LABELS]

    if not selected:
        selected = [s for s in ALLOWED_SECTIONS if s in SECTION_LABELS]

    prepared = prepare_exhibitor_report_data(filters, tables=datasets)

    event_row = prepared["event"]
    exhibitor_row = prepared["exhibitor"]
    assignments_df = prepared["assignments"]
    metrics_df = prepared["metrics"]
    scope = prepared["scope"]

    if "bucket_ts" in metrics_df.columns:
        metrics_df["timestamp"] = metrics_df["bucket_ts"]

    sections: List[Dict[str, Any]] = []
    xlsx_sheets: List[Dict[str, Any]] = []
    added_keys = set()
    used_metrics: List[str] = []

    def _add_section(key: str, out: Dict[str, Any]) -> None:
        if key in added_keys:
            return

        sec = _normalize_section(key, out)

        has_blocks = bool(sec.get("blocks"))
        has_table = bool(sec.get("table_rows"))
        has_summary = bool(sec.get("summary"))

        if not (has_blocks or has_table or has_summary):
            return

        sections.append(sec)
        xlsx_sheets.extend(sec.get("xlsx_sheets") or [])

        for metric in sec.get("used_metrics", []) or []:
            if metric not in used_metrics:
                used_metrics.append(metric)

        added_keys.add(key)

    _add_section(
        "booth_profile",
        build_booth_profile_section(
            metrics_df,
            filters,
            event_row=event_row,
            exhibitor_row=exhibitor_row,
            assignments_df=assignments_df,
            scope=scope,
        ),
    )

    for key in selected:
        if key == "traffic_overview":
            _add_section(
                "traffic_overview",
                build_traffic_overview_section(
                    metrics_df,
                    filters,
                    event_row=event_row,
                    exhibitor_row=exhibitor_row,
                    assignments_df=assignments_df,
                    scope=scope,
                ),
            )
        elif key == "engagement_analysis":
            _add_section(
                "engagement_analysis",
                build_engagement_analysis_section(
                    metrics_df,
                    filters,
                    event_row=event_row,
                    exhibitor_row=exhibitor_row,
                    assignments_df=assignments_df,
                    scope=scope,
                ),
            )
        elif key == "time_analysis":
            _add_section(
                "time_analysis",
                build_time_analysis_section(
                    metrics_df,
                    filters,
                    event_row=event_row,
                    exhibitor_row=exhibitor_row,
                    assignments_df=assignments_df,
                    scope=scope,
                ),
            )
        elif key == "performance_breakdown":
            _add_section(
                "performance_breakdown",
                build_performance_breakdown_section(
                    metrics_df,
                    filters,
                    event_row=event_row,
                    exhibitor_row=exhibitor_row,
                    assignments_df=assignments_df,
                    scope=scope,
                ),
            )

    _add_section(
        "definitions",
        build_definitions_section(
            filters=filters,
            used_metrics=used_metrics,
        ),
    )

    payload: Dict[str, Any] = {
        "meta": {
            "title": filters.report_title.strip(),
            "generated_at": datetime.utcnow().isoformat(),
            "generated_by": "Sentina AI",
            "report_type": "exhibitor",
            "event_id": scope["event_id"],
            "event_name": event_row.get("event_name", "N/A"),
            "exhibitor_id": scope["exhibitor_id"],
            "exhibitor_name": exhibitor_row.get("exhibitor_name", "N/A"),
            "booths": ", ".join(scope.get("booth_codes") or scope.get("booth_ids") or []),
            "halls": ", ".join(scope.get("hall_names") or []),
            "date_from": str(filters.date_from),
            "date_to": str(filters.date_to),
            "aggregation_level": filters.frequency,
            "included_sections": [s.get("title") for s in sections if s.get("title")],
            "custom_notes": filters.custom_notes,
        },
        "pdf_sections": sections,
        "xlsx": {"sheets": xlsx_sheets},
    }

    return payload
