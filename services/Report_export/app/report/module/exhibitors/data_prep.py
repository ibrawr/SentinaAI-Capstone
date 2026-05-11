from typing import Dict, Any, List, Optional

import pandas as pd

from app.data.loader_exhibitors import load_exhibitor_tables
from app.report.schemas import ReportFilters


def _clean_list(values) -> List[str]:
    if not values:
        return []
    if isinstance(values, list) and len(values) == 1 and str(values[0]).strip().lower() == "string":
        return []
    return [str(v).strip() for v in values if str(v).strip()]


def _ensure_datetime(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if col in df.columns:
        df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
    return df


def _first_row(df: pd.DataFrame) -> Dict[str, Any]:
    if df is None or df.empty:
        return {}
    return {str(k): v for k, v in df.iloc[0].to_dict().items()}


def prepare_exhibitor_report_data(
    filters: ReportFilters,
    tables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    loaded_tables = load_exhibitor_tables(preloaded=tables)

    events = loaded_tables["events"].copy()
    exhibitors = loaded_tables["exhibitors"].copy()
    assignments = loaded_tables["assignments"].copy()
    metrics = loaded_tables["metrics"].copy()

    booth_ids = _clean_list(getattr(filters, "booth_ids", None))

    events = _ensure_datetime(events, "start_datetime_utc")
    events = _ensure_datetime(events, "end_datetime_utc")
    metrics = _ensure_datetime(metrics, "bucket_ts")

    event_id = str(getattr(filters, "event_id", "") or "").strip()
    exhibitor_id = str(getattr(filters, "exhibitor_id", "") or "").strip()

    if not event_id:
        raise ValueError("event_id is required for exhibitor reports.")

    if not exhibitor_id:
        raise ValueError("exhibitor_id is required for exhibitor reports.")

    event_df = events[events["event_id"].astype(str) == event_id].copy()
    if event_df.empty:
        raise ValueError(f"No event found for event_id='{event_id}'.")

    event_row = _first_row(event_df)
    event_start = event_row.get("start_datetime_utc")
    event_end = event_row.get("end_datetime_utc")

    if pd.isna(event_start) or pd.isna(event_end):
        raise ValueError("Event start/end datetime is missing or invalid.")

    exhibitor_df = exhibitors[exhibitors["exhibitor_id"].astype(str) == exhibitor_id].copy()
    if exhibitor_df.empty:
        raise ValueError(f"No exhibitor found for exhibitor_id='{exhibitor_id}'.")

    exhibitor_row = _first_row(exhibitor_df)

    scoped_assignments = assignments[
        (assignments["event_id"].astype(str) == event_id)
        & (assignments["exhibitor_id"].astype(str) == exhibitor_id)
    ].copy()

    if scoped_assignments.empty:
        raise ValueError(
            f"No booth assignment found for exhibitor_id='{exhibitor_id}' in event_id='{event_id}'."
        )

    if booth_ids:
        allowed_booths = set(scoped_assignments["booth_id"].astype(str).tolist())
        requested_booths = set(booth_ids)
        invalid = sorted(list(requested_booths - allowed_booths))
        if invalid:
            raise ValueError(
                f"Requested booth_ids are not assigned to exhibitor '{exhibitor_id}' for event '{event_id}': {', '.join(invalid)}"
            )
        scoped_assignments = scoped_assignments[
            scoped_assignments["booth_id"].astype(str).isin(booth_ids)
        ].copy()

    resolved_booth_ids = scoped_assignments["booth_id"].astype(str).dropna().unique().tolist()
    resolved_hall_ids = (
        scoped_assignments["hall_id"].astype(str).dropna().unique().tolist()
        if "hall_id" in scoped_assignments.columns
        else []
    )
    resolved_zone_ids = (
        scoped_assignments["zone_id"].astype(str).dropna().unique().tolist()
        if "zone_id" in scoped_assignments.columns
        else []
    )

    scoped_metrics = metrics.copy()

    if "event_id" in scoped_metrics.columns:
        scoped_metrics = scoped_metrics[scoped_metrics["event_id"].astype(str) == event_id].copy()

    scoped_metrics = scoped_metrics[
        (scoped_metrics["bucket_ts"] >= event_start) & (scoped_metrics["bucket_ts"] <= event_end)
    ].copy()

    if resolved_hall_ids and "hall_id" in scoped_metrics.columns:
        scoped_metrics = scoped_metrics[
            scoped_metrics["hall_id"].astype(str).isin(resolved_hall_ids)
        ].copy()

    if resolved_zone_ids and "zone_id" in scoped_metrics.columns:
        scoped_metrics = scoped_metrics[
            scoped_metrics["zone_id"].astype(str).isin(resolved_zone_ids)
        ].copy()

    date_from_ts = pd.to_datetime(filters.date_from, utc=True)
    date_to_ts = pd.to_datetime(filters.date_to, utc=True) + pd.Timedelta(days=1)
    scoped_metrics = scoped_metrics[
        (scoped_metrics["bucket_ts"] >= date_from_ts) & (scoped_metrics["bucket_ts"] < date_to_ts)
    ].copy()

    hall_names = (
        scoped_assignments["hall_name"].dropna().astype(str).unique().tolist()
        if "hall_name" in scoped_assignments.columns
        else []
    )
    booth_codes = (
        scoped_assignments["booth_code"].dropna().astype(str).unique().tolist()
        if "booth_code" in scoped_assignments.columns
        else []
    )

    return {
        "event": event_row,
        "exhibitor": exhibitor_row,
        "assignments": scoped_assignments.reset_index(drop=True),
        "metrics": scoped_metrics.reset_index(drop=True),
        "scope": {
            "event_id": event_id,
            "exhibitor_id": exhibitor_id,
            "booth_ids": resolved_booth_ids,
            "booth_codes": booth_codes,
            "hall_ids": resolved_hall_ids,
            "hall_names": hall_names,
            "zone_ids": resolved_zone_ids,
            "event_start": event_start,
            "event_end": event_end,
            "metrics_rows": int(len(scoped_metrics)),
            "assignments_rows": int(len(scoped_assignments)),
        },
    }
