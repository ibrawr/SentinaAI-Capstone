from __future__ import annotations

from typing import Any, Iterable, Optional

import pandas as pd

DATA_PATH = "app/data/sample/sentina_sust_full_15min_with_events_mapped (1).csv"

NUMERIC_COLUMNS = [
    "dayOfWeek",
    "hallCapacity",
    "currentOccupancy",
    "threshold",
    "occupancyRatio",
    "inflowCount",
    "outflowCount",
    "flowCongestionIndex",
    "hourOfDay",
    "dayOfYear",
    "outdoorTempC",
    "humidityPct",
    "indoorTempC",
    "tempComfortScore",
    "humidityComfortScore",
    "crowdComfortPenalty",
    "comfortIndex",
    "hvacEnergyKWh",
    "carbonKgCO2",
    "energyEfficiencyScore",
    "xCoord",
    "yCoord",
    "day_of_week",
    "hall_capacity",
    "current_occupancy",
    "occupancy_ratio",
    "inflow_count",
    "outflow_count",
    "flow_congestion_index",
    "hour_of_day",
    "day_of_year",
    "outdoor_temp_c",
    "humidity_pct",
    "indoor_temp_c",
    "temp_comfort_score",
    "humidity_comfort_score",
    "crowd_comfort_penalty",
    "comfort_index",
    "hvac_energy_kwh",
    "carbon_kg_co2",
    "energy_efficiency_score",
    "x_coord",
    "y_coord",
]

BOOLEAN_COLUMNS = [
    "isHoliday",
    "isEvent",
    "isOvercrowded",
    "isQueue",
    "isWeekend",
    "is_holiday",
    "is_event",
    "is_overcrowded",
    "is_queue",
    "is_weekend",
]


def _to_bool(value: Any):
    if pd.isna(value):
        return pd.NA
    if isinstance(value, bool):
        return value

    text = str(value).strip().lower()
    if text in {"true", "t", "1", "yes", "y"}:
        return True
    if text in {"false", "f", "0", "no", "n"}:
        return False
    return pd.NA


def _normalize_timestamp(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "timestamp" in out.columns:
        out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce", utc=True)
    elif "time" in out.columns:
        out["timestamp"] = pd.to_datetime(out["time"], errors="coerce", utc=True)
    elif "datetime" in out.columns:
        out["timestamp"] = pd.to_datetime(out["datetime"], errors="coerce", utc=True)
    else:
        raise ValueError("Dataset must contain a timestamp/time/datetime column.")
    return out


def _normalize_types(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    for column in NUMERIC_COLUMNS:
        if column in out.columns:
            out[column] = pd.to_numeric(out[column], errors="coerce")

    for column in BOOLEAN_COLUMNS:
        if column in out.columns:
            out[column] = out[column].map(_to_bool).astype("boolean")

    return out


def load_sentina_df(preloaded_rows: Optional[Iterable[dict[str, Any]]] = None) -> pd.DataFrame:
    if preloaded_rows is not None:
        df = pd.DataFrame(list(preloaded_rows))
        if df.empty:
            return pd.DataFrame(columns=["timestamp"])
        return _normalize_types(_normalize_timestamp(df))

    df = pd.read_csv(DATA_PATH)
    return _normalize_types(_normalize_timestamp(df))