from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import pandas as pd


EVENTS_PATH = "app/data/sample/events.csv"
EXHIBITORS_PATH = "app/data/sample/exhibitors.csv"
ASSIGNMENTS_PATH = "app/data/sample/event_exhibitor_booth_assignments.csv"
METRICS_PATH = "app/data/sample/syn_zone_metrics_15mins.csv"


def _rename_if_exists(df: pd.DataFrame, rename_map: Dict[str, str]) -> pd.DataFrame:
    applicable = {old: new for old, new in rename_map.items() if old in df.columns}
    return df.rename(columns=applicable)


def _normalize_events(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty and not len(events.columns):
        events = pd.DataFrame(columns=["event_id", "event_name", "venue_id", "venue_name", "start_datetime_utc", "end_datetime_utc", "expected_attendance_total", "expected_exhibitors", "status", "person_in_charge_name", "person_in_charge_email", "created_at", "updated_at"])
    events = _rename_if_exists(
        events,
        {
            "eventId": "event_id",
            "eventName": "event_name",
            "venueId": "venue_id",
            "venueName": "venue_name",
            "startDateTimeUtc": "start_datetime_utc",
            "endDateTimeUtc": "end_datetime_utc",
            "expectedAttendanceTotal": "expected_attendance_total",
            "expectedExhibitors": "expected_exhibitors",
            "personInChargeName": "person_in_charge_name",
            "personInChargeEmail": "person_in_charge_email",
            "createdAt": "created_at",
            "updatedAt": "updated_at",
        },
    )

    for col in ["start_datetime_utc", "end_datetime_utc", "created_at", "updated_at"]:
        if col in events.columns:
            events[col] = pd.to_datetime(events[col], errors="coerce", utc=True)

    return events


def _normalize_exhibitors(exhibitors: pd.DataFrame) -> pd.DataFrame:
    if exhibitors.empty and not len(exhibitors.columns):
        exhibitors = pd.DataFrame(columns=["exhibitor_id", "exhibitor_name", "industry", "hq_country", "status", "created_at", "updated_at"])
    exhibitors = _rename_if_exists(
        exhibitors,
        {
            "exhibitorId": "exhibitor_id",
            "exhibitorName": "exhibitor_name",
            "hqCountry": "hq_country",
            "createdAt": "created_at",
            "updatedAt": "updated_at",
        },
    )

    for col in ["created_at", "updated_at"]:
        if col in exhibitors.columns:
            exhibitors[col] = pd.to_datetime(exhibitors[col], errors="coerce", utc=True)

    return exhibitors


def _normalize_assignments(assignments: pd.DataFrame) -> pd.DataFrame:
    if assignments.empty and not len(assignments.columns):
        assignments = pd.DataFrame(columns=["event_id", "exhibitor_id", "booth_id", "booth_code", "zone_id", "hall_id", "hall_name", "booth_size_type", "booth_area_sqm", "package_tier", "discount_pct", "amount_paid_aed", "assigned_at", "status"])
    assignments = _rename_if_exists(
        assignments,
        {
            "eventId": "event_id",
            "exhibitorId": "exhibitor_id",
            "boothId": "booth_id",
            "boothCode": "booth_code",
            "zoneId": "zone_id",
            "hallId": "hall_id",
            "hallName": "hall_name",
            "boothSizeType": "booth_size_type",
            "boothAreaSqm": "booth_area_sqm",
            "packageTier": "package_tier",
            "discountPct": "discount_pct",
            "amountPaidAed": "amount_paid_aed",
            "assignedAt": "assigned_at",
        },
    )

    if "assigned_at" in assignments.columns:
        assignments["assigned_at"] = pd.to_datetime(assignments["assigned_at"], errors="coerce", utc=True)

    return assignments


def _normalize_metrics(metrics: pd.DataFrame) -> pd.DataFrame:
    if metrics.empty and not len(metrics.columns):
        metrics = pd.DataFrame(columns=["node_id", "event_id", "zone_id", "hall_id", "hall_name", "bucket_ts", "occupancy_ratio", "inflow_count", "outflow_count", "flow_congestion_index", "is_event", "is_overcrowded", "is_queue", "crowd_comfort_penalty", "comfort_index", "density_score", "hour", "day_of_week", "is_weekend", "engagement_truth"])
    metrics = _rename_if_exists(
        metrics,
        {
            "ts": "bucket_ts",
            "eventId": "event_id",
            "zoneId": "zone_id",
            "hallId": "hall_id",
            "hallName": "hall_name",
            "isEvent": "is_event",
            "hourOfDay": "hour",
            "densityScore": "density_score",
            "occupancyRatio": "occupancy_ratio",
            "inflowCount": "inflow_count",
            "outflowCount": "outflow_count",
            "flowCongestionIndex": "flow_congestion_index",
            "isOvercrowded": "is_overcrowded",
            "isQueue": "is_queue",
            "crowdComfortPenalty": "crowd_comfort_penalty",
            "comfortIndex": "comfort_index",
            "engagementTruth": "engagement_truth",
        },
    )

    if "bucket_ts" not in metrics.columns:
        raise ValueError("Exhibitor metrics dataset must contain 'bucket_ts' or 'ts'.")

    metrics["bucket_ts"] = pd.to_datetime(metrics["bucket_ts"], errors="coerce", utc=True)
    return metrics


def _df_from_rows(rows: Optional[Iterable[dict[str, Any]]]) -> pd.DataFrame:
    if rows is None:
        return pd.DataFrame()
    return pd.DataFrame(list(rows))


def load_exhibitor_tables(preloaded: Optional[Dict[str, Any]] = None) -> Dict[str, pd.DataFrame]:
    if preloaded is not None:
        events = _normalize_events(_df_from_rows(preloaded.get("events")))
        exhibitors = _normalize_exhibitors(_df_from_rows(preloaded.get("exhibitors")))
        assignments = _normalize_assignments(_df_from_rows(preloaded.get("assignments")))
        metrics = _normalize_metrics(_df_from_rows(preloaded.get("metrics")))
        return {
            "events": events,
            "exhibitors": exhibitors,
            "assignments": assignments,
            "metrics": metrics,
        }

    events = _normalize_events(pd.read_csv(EVENTS_PATH))
    exhibitors = _normalize_exhibitors(pd.read_csv(EXHIBITORS_PATH))
    assignments = _normalize_assignments(pd.read_csv(ASSIGNMENTS_PATH))
    metrics = _normalize_metrics(pd.read_csv(METRICS_PATH))

    return {
        "events": events,
        "exhibitors": exhibitors,
        "assignments": assignments,
        "metrics": metrics,
    }
