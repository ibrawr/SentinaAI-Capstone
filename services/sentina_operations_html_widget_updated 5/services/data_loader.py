from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict, List

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
ANALYTICS_CSV = DATA_DIR / 'sentina_sust_full_15min_with_events_mapped (1).csv'
VENUE_CSV = DATA_DIR / 'Venue Dataset.csv'
EXHIBITOR_ASSIGNMENTS_CSV = DATA_DIR / 'event_exhibitor_booth_assignments.csv'
EVENTS_CSV = DATA_DIR / 'events.csv'
EXHIBITORS_CSV = DATA_DIR / 'exhibitors.csv'
EXHIBITOR_METRICS_CSV = DATA_DIR / 'syn_zone_metrics_15mins.csv'


@lru_cache(maxsize=1)
def load_analytics_df() -> pd.DataFrame:
    df = pd.read_csv(ANALYTICS_CSV)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df['date'] = df['timestamp'].dt.date
    df['eventId'] = df['eventId'].fillna('No Event')
    return df


@lru_cache(maxsize=1)
def load_venue_df() -> pd.DataFrame:
    return pd.read_csv(VENUE_CSV)


@lru_cache(maxsize=1)
def latest_available_date() -> str:
    df = load_analytics_df()
    return str(df['date'].max())


@lru_cache(maxsize=1)
def earliest_available_date() -> str:
    df = load_analytics_df()
    return str(df['date'].min())


@lru_cache(maxsize=1)
def get_zone_options() -> List[Dict[str, str]]:
    venue = load_venue_df()
    zones = venue[['zoneId']].drop_duplicates().sort_values(by='zoneId')
    return [{'value': str(row.zoneId), 'label': str(row.zoneId)} for row in zones.itertuples(index=False)]


@lru_cache(maxsize=1)
def get_halls_by_zone() -> Dict[str, List[Dict[str, str]]]:
    venue = load_venue_df()
    grouped: Dict[str, List[Dict[str, str]]] = {}

    for zone_id, group in venue.groupby('zoneId'):
        zone_key = str(zone_id)
        hall_rows = group[['hallId', 'hallName']].drop_duplicates().sort_values(by='hallName')
        grouped[zone_key] = [
            {
                'value': str(row.hallId),
                'label': f"{str(row.hallName)} ({str(row.hallId)})",
            }
            for row in hall_rows.itertuples(index=False)
        ]

    return grouped


@lru_cache(maxsize=1)
def load_event_assignments_df() -> pd.DataFrame:
    df = pd.read_csv(EXHIBITOR_ASSIGNMENTS_CSV)
    df['assignedAt'] = pd.to_datetime(df['assignedAt'])
    return df


@lru_cache(maxsize=1)
def load_events_df() -> pd.DataFrame:
    df = pd.read_csv(EVENTS_CSV)
    df['startDateTimeUtc'] = pd.to_datetime(df['startDateTimeUtc'], utc=True)
    df['endDateTimeUtc'] = pd.to_datetime(df['endDateTimeUtc'], utc=True)
    df['createdAt'] = pd.to_datetime(df['createdAt'], utc=True)
    df['updatedAt'] = pd.to_datetime(df['updatedAt'], utc=True)
    return df


@lru_cache(maxsize=1)
def load_exhibitors_df() -> pd.DataFrame:
    df = pd.read_csv(EXHIBITORS_CSV)
    return df


@lru_cache(maxsize=1)
def load_exhibitor_metrics_df() -> pd.DataFrame:
    df = pd.read_csv(EXHIBITOR_METRICS_CSV)
    df['bucket_ts'] = pd.to_datetime(df['bucket_ts'], utc=True)
    return df
