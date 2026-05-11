from datetime import datetime
from typing import Any, Dict, List, Optional

from app.data.loader import load_sentina_df
from app.data.filter import apply_date_zone_facility_filters, apply_bucketing
from app.report.module.operations.constant import SECTION_LABELS
from app.report.module.operations.sections.executive import build_executive_section
from app.report.module.operations.sections.hall_utilization import build_hall_utilization_section
from app.report.module.operations.sections.event_impact import build_event_impact_section
from app.report.module.operations.sections.peak_congestion import build_peak_congestion_section
from app.report.module.operations.sections.stress_index import build_stress_index_section
from app.report.module.operations.sections.definitions import build_definitions_section
from app.report.schemas import ReportFilters


ALLOWED_SECTIONS: List[str] = [
    "hall_utilization",
    "event_impact",
    "peak_congestion",
    "stress_index",
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


def build_operations_report(
    filters: ReportFilters,
    mode: str,
    datasets: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    requested = _clean_list(filters.sections)
    selected = [s for s in requested if s in ALLOWED_SECTIONS and s in SECTION_LABELS]

    if not selected:
        selected = [s for s in ALLOWED_SECTIONS if s in SECTION_LABELS]

    preloaded_rows = None
    if isinstance(datasets, dict):
        preloaded_rows = datasets.get("rows") or datasets.get("metrics")

    df = load_sentina_df(preloaded_rows=preloaded_rows)
    df = apply_date_zone_facility_filters(df, filters)
    df = apply_bucketing(df, filters)

    zones = _clean_list(filters.zones)
    facilities = _clean_list(filters.facilities)

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

    _add_section("executive", build_executive_section(df, filters))

    for key in selected:
        if key == "hall_utilization":
            _add_section("hall_utilization", build_hall_utilization_section(df, filters))
        elif key == "event_impact":
            _add_section("event_impact", build_event_impact_section(df, filters))
        elif key == "peak_congestion":
            _add_section("peak_congestion", build_peak_congestion_section(df, filters))
        elif key == "stress_index":
            _add_section("stress_index", build_stress_index_section(df, filters))

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
            "report_type": "operations",
            "date_from": str(filters.date_from),
            "date_to": str(filters.date_to),
            "zones": ", ".join(zones) if zones else "All",
            "facilities": ", ".join(facilities) if facilities else "All",
            "aggregation_level": filters.frequency,
            "included_sections": [s.get("title") for s in sections if s.get("title")],
            "custom_notes": filters.custom_notes,
        },
        "pdf_sections": sections,
        "xlsx": {"sheets": xlsx_sheets},
    }

    return payload
