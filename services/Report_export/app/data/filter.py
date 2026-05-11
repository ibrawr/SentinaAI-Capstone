from __future__ import annotations

import pandas as pd


def _pick_column(df: pd.DataFrame, *names: str) -> str | None:
    for name in names:
        if name in df.columns:
            return name
    return None


def apply_date_zone_facility_filters(df: pd.DataFrame, filters) -> pd.DataFrame:
    out = df.copy()

    timestamp_col = _pick_column(out, "timestamp", "bucket_ts", "ts")
    if timestamp_col is None:
        raise ValueError("Dataset must include a timestamp column.")

    if timestamp_col != "timestamp":
        out["timestamp"] = pd.to_datetime(out[timestamp_col], errors="coerce", utc=True)
    else:
        out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce", utc=True)

    start = pd.to_datetime(getattr(filters, "date_from"), utc=True)
    end = pd.to_datetime(getattr(filters, "date_to"), utc=True) + pd.Timedelta(days=1)
    out = out[(out["timestamp"] >= start) & (out["timestamp"] < end)]

    zones = getattr(filters, "zones", None) or []
    facilities = getattr(filters, "facilities", None) or []

    if isinstance(zones, str):
        zones = [zones]
    if isinstance(facilities, str):
        facilities = [facilities]

    zone_col = _pick_column(out, "zoneId", "zone_id")
    facility_col = _pick_column(out, "hallId", "hall_id")
    facility_name_col = _pick_column(out, "hallName", "hall_name")

    if zones and zone_col:
        out = out[out[zone_col].astype(str).isin([str(v) for v in zones])]

    if facilities:
        facility_values = [str(v) for v in facilities]
        if facility_col and facility_name_col:
            out = out[
                out[facility_col].astype(str).isin(facility_values)
                | out[facility_name_col].astype(str).isin(facility_values)
            ]
        elif facility_col:
            out = out[out[facility_col].astype(str).isin(facility_values)]
        elif facility_name_col:
            out = out[out[facility_name_col].astype(str).isin(facility_values)]

    return out


def apply_bucketing(df: pd.DataFrame, filters) -> pd.DataFrame:
    out = df.copy()
    out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce", utc=True)
    freq = (getattr(filters, "frequency", "Hourly") or "Hourly").lower()

    if freq == "daily":
        out["bucket"] = out["timestamp"].dt.date.astype(str)
    elif freq == "weekly":
        out["bucket"] = out["timestamp"].dt.to_period("W").astype(str)
    elif freq == "monthly":
        out["bucket"] = out["timestamp"].dt.to_period("M").astype(str)
    else:
        out["bucket"] = out["timestamp"].dt.floor("h").astype(str)

    return out
