from datetime import datetime
from typing import Any, Dict, List, Optional

from app.data.loader import load_sentina_df
from app.data.filter import apply_date_zone_facility_filters, apply_bucketing
from app.report.module.sustainability.constant import SECTION_LABELS
from app.report.module.sustainability.sections.occupancy import build_occupancy_section
from app.report.module.sustainability.sections.energy import build_energy_section
from app.report.module.sustainability.sections.environment import build_environmental_section
from app.report.schemas import ReportFilters
from app.report.module.sustainability.sections.definitions import build_definitions_section


ALLOWED_SECTIONS: List[str] = ["energy", "environment", "occupancy"]


def _clean_list(values):
    if not values:
        return []
    if isinstance(values, list) and len(values) == 1 and str(values[0]).strip().lower() == "string":
        return []
    return [str(v) for v in values if str(v).strip()]


def build_sustainability_report(
    filters: ReportFilters,
    mode: str,
    datasets: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    requested = _clean_list(getattr(filters, "sections", None) or [])
    selected = [s for s in requested if s in ALLOWED_SECTIONS and s in SECTION_LABELS]
    if not selected:
        selected = [s for s in ALLOWED_SECTIONS if s in SECTION_LABELS]

    preloaded_rows = None
    if isinstance(datasets, dict):
        preloaded_rows = datasets.get("rows") or datasets.get("metrics")

    df = load_sentina_df(preloaded_rows=preloaded_rows)
    df = apply_date_zone_facility_filters(df, filters)
    df = apply_bucketing(df, filters)

    zones = _clean_list(getattr(filters, "zones", None))
    facilities = _clean_list(getattr(filters, "facilities", None))

    sections: List[Dict[str, Any]] = []
    xlsx_sheets: List[Dict[str, Any]] = []
    added_keys = set()
    used_metrics: List[str] = []

    def _normalize_pdf_section(key: str, sec: Dict[str, Any]) -> Dict[str, Any]:
        sec = dict(sec or {})
        sec.setdefault("key", key)
        if not sec.get("title"):
            sec["title"] = SECTION_LABELS.get(key) or key.replace("_", " ").title()
        return sec

    def _add_pdf_section(key: str, sec: Dict[str, Any]) -> None:
        if key in added_keys:
            return

        sec = _normalize_pdf_section(key, sec)
        sections.append(sec)

        for metric in sec.get("used_metrics", []) or []:
            if metric not in used_metrics:
                used_metrics.append(metric)

        added_keys.add(key)

    occ_out = build_occupancy_section(df, filters)
    occ_pdf = _normalize_pdf_section("occupancy", occ_out.get("pdf_section") or {})
    _add_pdf_section("occupancy", occ_pdf)
    xlsx_sheets.extend(occ_out.get("xlsx_sheets") or [])

    for key in selected:
        if key == "occupancy":
            continue
        if key == "energy":
            out = build_energy_section(df, filters)
            _add_pdf_section("energy", out)
            xlsx_sheets.extend(out.get("xlsx_sheets") or [])
        elif key == "environment":
            out = build_environmental_section(df, filters)
            _add_pdf_section("environment", out)
            xlsx_sheets.extend(out.get("xlsx_sheets") or [])

    defs_out = build_definitions_section(
        filters=filters,
        used_metrics=used_metrics,
    )

    defs_pdf = defs_out.get("pdf_section") if isinstance(defs_out, dict) else defs_out
    if not isinstance(defs_pdf, dict):
        defs_pdf = defs_out if isinstance(defs_out, dict) else {}

    _add_pdf_section("definitions", defs_pdf)

    if isinstance(defs_out, dict):
        xlsx_sheets.extend(defs_out.get("xlsx_sheets") or [])

    payload: Dict[str, Any] = {
        "meta": {
            "title": filters.report_title.strip(),
            "generated_at": datetime.utcnow().isoformat(),
            "generated_by": "Sentina AI",
            "report_type": "sustainability",
            "date_from": str(getattr(filters, "date_from", "")),
            "date_to": str(getattr(filters, "date_to", "")),
            "zones": ", ".join(zones) if zones else "All",
            "facilities": ", ".join(facilities) if facilities else "All",
            "aggregation_level": getattr(filters, "frequency", None),
            "included_sections": [s.get("title") for s in sections if s.get("title")],
            "custom_notes": getattr(filters, "custom_notes", None),
        },
        "pdf_sections": sections,
        "xlsx": {"sheets": xlsx_sheets},
    }
    return payload
