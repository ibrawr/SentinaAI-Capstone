from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from services.data_loader import (
    load_event_assignments_df,
    load_events_df,
    load_exhibitors_df,
    load_exhibitor_metrics_df,
)


@dataclass
class ExhibitorFilterPayload:
    analysis_type: str
    exhibitor_id: str
    event_id: Optional[str]
    booth_id: Optional[str]
    zone_ids: List[str]
    hall_ids: List[str]
    start_date: Optional[str]
    end_date: Optional[str]
    compare_with: Optional[str]
    aggregation: str = 'hourly'
    limit: int = 5


def _as_utc_timestamp(value: Any) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        return ts.tz_localize('UTC')
    return ts.tz_convert('UTC')


class ExhibitorAnalyticsService:
    def __init__(self) -> None:
        self.assignments_df = load_event_assignments_df().copy()
        self.events_df = load_events_df().copy()
        self.exhibitors_df = load_exhibitors_df().copy()
        self.metrics_df = load_exhibitor_metrics_df().copy()

    def _merged_assignments(self, exhibitor_id: str) -> pd.DataFrame:
        assignments = self.assignments_df[self.assignments_df['exhibitorId'].astype(str) == str(exhibitor_id)].copy()
        if assignments.empty:
            assignments = self.assignments_df.copy()

        merged = assignments.merge(self.events_df, on='eventId', how='left', suffixes=('', '_event'))
        return merged.sort_values(['endDateTimeUtc', 'assignedAt'], ascending=[False, False])

    def _normalize_assignment_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(row)
        start_ts = _as_utc_timestamp(normalized['startDateTimeUtc'])
        end_ts = _as_utc_timestamp(normalized['endDateTimeUtc'])

        exhibitor_profile = self.exhibitors_df[self.exhibitors_df['exhibitorId'].astype(str) == str(normalized['exhibitorId'])]
        if not exhibitor_profile.empty:
            for key, value in exhibitor_profile.iloc[0].to_dict().items():
                normalized.setdefault(key, value)

        normalized['eventStartDate'] = start_ts.date().isoformat()
        normalized['eventEndDate'] = end_ts.date().isoformat()
        normalized['eventStartTs'] = start_ts
        normalized['eventEndTs'] = end_ts
        normalized['effectiveExhibitorId'] = str(normalized['exhibitorId'])
        return normalized

    def resolve_assignments(self, exhibitor_id: str) -> List[Dict[str, Any]]:
        merged = self._merged_assignments(exhibitor_id)
        return [self._normalize_assignment_row(row.to_dict()) for _, row in merged.iterrows()]

    def resolve_assignment(self, exhibitor_id: str, event_id: Optional[str] = None) -> Dict[str, Any]:
        merged = self._merged_assignments(exhibitor_id)

        if event_id:
            selected = merged[merged['eventId'].astype(str) == str(event_id)]
            if not selected.empty:
                merged = selected

        return self._normalize_assignment_row(merged.iloc[0].to_dict())

    def resolve_previous_event_assignment(self, assignment: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        assignments = self.assignments_df[self.assignments_df['exhibitorId'] == assignment['exhibitorId']].copy()
        merged = assignments.merge(self.events_df, on='eventId', how='left')
        merged = merged.sort_values('startDateTimeUtc')
        current_start = _as_utc_timestamp(assignment['startDateTimeUtc'])
        prior = merged[pd.to_datetime(merged['startDateTimeUtc']) < current_start]
        if prior.empty:
            return None
        row = prior.iloc[-1].to_dict()
        row['eventStartTs'] = _as_utc_timestamp(row['startDateTimeUtc'])
        row['eventEndTs'] = _as_utc_timestamp(row['endDateTimeUtc'])
        row['eventStartDate'] = row['eventStartTs'].date().isoformat()
        row['eventEndDate'] = row['eventEndTs'].date().isoformat()
        return row

    def resolve_dates(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Tuple[pd.Timestamp, pd.Timestamp]:
        event_start = _as_utc_timestamp(assignment['eventStartTs']).normalize()
        event_end = _as_utc_timestamp(assignment['eventEndTs']).normalize()
        start = _as_utc_timestamp(payload.start_date or assignment['eventStartDate']).normalize()
        end = _as_utc_timestamp(payload.end_date or assignment['eventEndDate']).normalize()
        start = max(start, event_start)
        end = min(end, event_end)
        if end < start:
            end = start
        return start, end

    def filter_df(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> pd.DataFrame:
        df = self.metrics_df.copy()
        event_id = payload.event_id or str(assignment['eventId'])
        booth_zone = payload.zone_ids[0] if payload.zone_ids else str(assignment['zoneId'])
        booth_hall = payload.hall_ids[0] if payload.hall_ids else str(assignment['hallId'])
        start, end = self.resolve_dates(payload, assignment)

        df = df[df['eventId'] == event_id]
        df = df[df['zoneId'] == booth_zone]
        df = df[df['hallId'] == booth_hall]
        df = df[(df['bucket_ts'] >= start) & (df['bucket_ts'] < end + timedelta(days=1))]
        return df.sort_values('bucket_ts')

    def event_df(self, assignment: Dict[str, Any]) -> pd.DataFrame:
        payload = ExhibitorFilterPayload(
            analysis_type='event',
            exhibitor_id=str(assignment['exhibitorId']),
            event_id=str(assignment['eventId']),
            booth_id=str(assignment['boothId']),
            zone_ids=[str(assignment['zoneId'])],
            hall_ids=[str(assignment['hallId'])],
            start_date=assignment['eventStartDate'],
            end_date=assignment['eventEndDate'],
            compare_with=None,
        )
        return self.filter_df(payload, assignment)

    def _bucket_series(self, df: pd.DataFrame, aggregation: str) -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(
                columns=['label', 'inflowCount', 'outflowCount', 'netFlow', 'occupancyRatio', 'flowCongestionIndex', 'engagement_truth', 'comfortIndex']
            )

        work = df.copy()
        if aggregation == 'daily':
            work['label'] = work['bucket_ts'].dt.strftime('%Y-%m-%d')
            grouped = work.groupby('label', as_index=False).agg(
                inflowCount=('inflowCount', 'sum'),
                outflowCount=('outflowCount', 'sum'),
                occupancyRatio=('occupancyRatio', 'mean'),
                flowCongestionIndex=('flowCongestionIndex', 'mean'),
                engagement_truth=('engagement_truth', 'mean'),
                comfortIndex=('comfortIndex', 'mean'),
            )
        else:
            work['label'] = work['bucket_ts'].dt.strftime('%Y-%m-%d %H:%M')
            grouped = work[['label', 'inflowCount', 'outflowCount', 'occupancyRatio', 'flowCongestionIndex', 'engagement_truth', 'comfortIndex']].copy()

        grouped['netFlow'] = grouped['inflowCount'] - grouped['outflowCount']
        return grouped

    def _build_chart(
        self,
        grouped: pd.DataFrame,
        series_fields: List[Tuple[str, str]],
        x_axis: str = 'Time',
        y_axis: str = 'Value',
    ) -> Dict[str, Any]:
        table_rows = grouped.to_dict(orient='records')
        if grouped.empty:
            return {'series': [], 'table_rows': table_rows, 'x_axis_label': x_axis, 'y_axis_label': y_axis}

        if len(grouped) == 1:
            return {'series': [], 'table_rows': table_rows, 'x_axis_label': x_axis, 'y_axis_label': y_axis}

        return {
            'x_axis_label': x_axis,
            'y_axis_label': y_axis,
            'series': [
                {
                    'name': label,
                    'points': [{'x': row['label'], 'y': round(float(row[field]), 3)} for _, row in grouped.iterrows()],
                }
                for field, label in series_fields
            ],
            'table_rows': table_rows,
        }

    def overview(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        event_df = self.event_df(assignment)
        grouped = self._bucket_series(selected, payload.aggregation)

        intervals = int(len(selected))
        avg_engagement = float(selected['engagement_truth'].mean()) if not selected.empty else 0.0
        avg_inflow = float(selected['inflowCount'].mean()) if not selected.empty else 0.0
        avg_occupancy = float(selected['occupancyRatio'].mean()) if not selected.empty else 0.0
        best_label = grouped.sort_values('inflowCount', ascending=False).iloc[0]['label'] if not grouped.empty else 'N/A'

        cards = [
            {'label': 'Event', 'value': str(assignment['eventName'])},
            {'label': 'Booth', 'value': str(assignment['boothCode'])},
            {'label': 'Hall', 'value': str(assignment['hallName'])},
            {'label': 'Package', 'value': str(assignment.get('packageTier') or 'N/A')},
            {'label': 'Intervals analysed', 'value': intervals},
            {'label': 'Avg engagement', 'value': round(avg_engagement, 3)},
            {'label': 'Avg inflow', 'value': round(avg_inflow, 2)},
            {'label': 'Avg occupancy ratio', 'value': round(avg_occupancy, 3)},
        ]
        assignment_rows = [{
            'event_name': str(assignment['eventName']),
            'event_window': f"{assignment['eventStartDate']} to {assignment['eventEndDate']}",
            'booth_code': str(assignment['boothCode']),
            'hall': str(assignment['hallName']),
            'zone': str(assignment['zoneId']),
            'booth_size_type': str(assignment.get('boothSizeType') or 'N/A'),
            'booth_area_sqm': float(assignment.get('boothAreaSqm') or 0),
            'package_tier': str(assignment.get('packageTier') or 'N/A'),
            'amount_paid_aed': float(assignment.get('amountPaidAed') or 0),
            'analysed_time_intervals': intervals,
        }]
        return {
            'cards': cards,
            'rows': assignment_rows,
            'summary': {
                'best_window': best_label,
                'event_average_inflow': round(float(event_df['inflowCount'].mean()), 2) if not event_df.empty else 0.0,
            },
        }

    def traffic_context(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        grouped = self._bucket_series(selected, payload.aggregation)
        if selected.empty:
            return {'kpis': [], 'rows': [], 'series': []}
        selected = selected.copy()
        selected['netFlow'] = selected['inflowCount'] - selected['outflowCount']
        peak = selected.sort_values('inflowCount', ascending=False).iloc[0]
        busy_day = selected.assign(day=selected['bucket_ts'].dt.strftime('%Y-%m-%d')).groupby('day')['inflowCount'].sum().sort_values(ascending=False)
        kpis = [
            {'label': 'Total inflow', 'value': int(selected['inflowCount'].sum())},
            {'label': 'Total outflow', 'value': int(selected['outflowCount'].sum())},
            {'label': 'Net flow', 'value': int(selected['netFlow'].sum())},
            {'label': 'Avg occupancy ratio', 'value': round(float(selected['occupancyRatio'].mean()), 3)},
            {'label': 'Avg congestion', 'value': round(float(selected['flowCongestionIndex'].mean()), 3)},
            {'label': 'Peak inflow', 'value': int(peak['inflowCount'])},
        ]
        rows = grouped.sort_values('inflowCount', ascending=False).head(payload.limit).to_dict(orient='records')
        chart = self._build_chart(
            grouped,
            [('inflowCount', 'Inflow'), ('outflowCount', 'Outflow'), ('netFlow', 'Net flow')],
            x_axis='Time band',
            y_axis='Visitor movement',
        )
        return {
            'kpis': kpis,
            'rows': rows,
            'summary': {
                'peak_period': peak['bucket_ts'].strftime('%Y-%m-%d %H:%M'),
                'busiest_day': busy_day.index[0] if not busy_day.empty else 'N/A',
            },
            **chart,
        }

    def engagement(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        grouped = self._bucket_series(selected, payload.aggregation)
        if selected.empty:
            return {'kpis': [], 'rows': [], 'series': []}
        peak = selected.sort_values('engagement_truth', ascending=False).iloc[0]
        low = selected.sort_values('engagement_truth', ascending=True).iloc[0]
        avg_engagement = float(selected['engagement_truth'].mean())
        engagement_level = 'High' if avg_engagement >= 0.66 else 'Moderate' if avg_engagement >= 0.4 else 'Low'
        std_engagement = float(selected['engagement_truth'].std(ddof=0) or 0.0)
        consistency = 'High' if std_engagement <= 0.12 else 'Moderate' if std_engagement <= 0.22 else 'Variable'
        bins = pd.cut(selected['engagement_truth'], bins=[-1, 0.4, 0.66, 2], labels=['Low', 'Moderate', 'High'])
        dist = bins.value_counts(normalize=True).reindex(['High', 'Moderate', 'Low']).fillna(0.0)
        kpis = [
            {'label': 'Average', 'value': round(avg_engagement, 3)},
            {'label': 'Median', 'value': round(float(selected['engagement_truth'].median()), 3)},
            {'label': 'Max', 'value': round(float(selected['engagement_truth'].max()), 3)},
            {'label': 'Min', 'value': round(float(selected['engagement_truth'].min()), 3)},
            {'label': 'Level', 'value': engagement_level},
            {'label': 'Consistency', 'value': consistency},
        ]
        chart = self._build_chart(grouped, [('engagement_truth', 'Engagement')], x_axis='Time band', y_axis='Engagement score')
        badges = [{'label': key, 'value': f"{round(float(value) * 100, 1)}%"} for key, value in dist.items()]
        rows = grouped.sort_values('engagement_truth', ascending=False).head(payload.limit).to_dict(orient='records')
        return {
            'kpis': kpis,
            'badges': badges,
            'rows': rows,
            'summary': {
                'peak_period': peak['bucket_ts'].strftime('%Y-%m-%d %H:%M'),
                'lowest_period': low['bucket_ts'].strftime('%Y-%m-%d %H:%M'),
            },
            **chart,
        }

    def operating_environment(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        if selected.empty:
            return {'kpis': [], 'rows': [], 'series': []}
        day_pattern = selected.assign(day=selected['bucket_ts'].dt.strftime('%Y-%m-%d')).groupby('day', as_index=False).agg(
            inflowCount=('inflowCount', 'mean'),
            outflowCount=('outflowCount', 'mean'),
            occupancyRatio=('occupancyRatio', 'mean'),
            flowCongestionIndex=('flowCongestionIndex', 'mean'),
            comfortIndex=('comfortIndex', 'mean'),
            engagement_truth=('engagement_truth', 'mean'),
        )
        day_pattern['label'] = day_pattern['day']
        hour_pattern = selected.groupby('hour', as_index=False).agg(
            inflowCount=('inflowCount', 'mean'),
            outflowCount=('outflowCount', 'mean'),
            occupancyRatio=('occupancyRatio', 'mean'),
            flowCongestionIndex=('flowCongestionIndex', 'mean'),
            comfortIndex=('comfortIndex', 'mean'),
            engagement_truth=('engagement_truth', 'mean'),
        )
        hour_pattern['label'] = hour_pattern['hour'].map(lambda h: f'{int(h):02d}:00')
        best_day = day_pattern.sort_values('engagement_truth', ascending=False).iloc[0]
        weak_day = day_pattern.sort_values('engagement_truth', ascending=True).iloc[0]
        best_hour = hour_pattern.sort_values('engagement_truth', ascending=False).iloc[0]
        weak_hour = hour_pattern.sort_values('engagement_truth', ascending=True).iloc[0]
        kpis = [
            {'label': 'Avg inflow', 'value': round(float(selected['inflowCount'].mean()), 2)},
            {'label': 'Avg outflow', 'value': round(float(selected['outflowCount'].mean()), 2)},
            {'label': 'Avg occupancy', 'value': round(float(selected['occupancyRatio'].mean()), 3)},
            {'label': 'Avg congestion', 'value': round(float(selected['flowCongestionIndex'].mean()), 3)},
            {'label': 'Avg comfort', 'value': round(float(selected['comfortIndex'].mean()), 2)},
            {'label': 'Avg engagement', 'value': round(float(selected['engagement_truth'].mean()), 3)},
        ]
        chart = self._build_chart(
            day_pattern,
            [('occupancyRatio', 'Occupancy ratio'), ('flowCongestionIndex', 'Congestion')],
            x_axis='Day',
            y_axis='Occupancy / congestion',
        )

        table_rows = hour_pattern[['label', 'occupancyRatio', 'flowCongestionIndex', 'comfortIndex', 'engagement_truth']].rename(
            columns={
                'label': 'hour_band',
                'occupancyRatio': 'avg_occupancy_ratio',
                'flowCongestionIndex': 'avg_congestion',
                'comfortIndex': 'avg_comfort',
                'engagement_truth': 'avg_engagement',
            }
        )
        return {
            'kpis': kpis,
            'rows': table_rows.to_dict(orient='records'),
            'table_rows': table_rows.to_dict(orient='records'),
            'summary': {
                'best_day': best_day['label'],
                'quiet_day': weak_day['label'],
                'best_hour': best_hour['label'],
                'weakest_hour': weak_hour['label'],
            },
            **chart,
        }

    def performance(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        if selected.empty:
            return {'kpis': [], 'rows': []}
        total_inflow = float(selected['inflowCount'].sum())
        max_inflow = float(selected['inflowCount'].max())
        avg_inflow = float(selected['inflowCount'].mean())
        peak_contribution = (max_inflow / total_inflow * 100.0) if total_inflow else 0.0
        peak_vs_avg = (max_inflow / avg_inflow) if avg_inflow else 0.0
        traffic_variability = float(selected['inflowCount'].std(ddof=0) or 0.0)
        engagement_variability = float(selected['engagement_truth'].std(ddof=0) or 0.0)
        engagement_range = float(selected['engagement_truth'].max() - selected['engagement_truth'].min())
        consistency_profile = 'Stable' if engagement_variability <= 0.12 else 'Balanced' if engagement_variability <= 0.22 else 'Volatile'
        kpis = [
            {'label': 'Peak contribution %', 'value': round(peak_contribution, 2)},
            {'label': 'Peak vs average', 'value': round(peak_vs_avg, 2)},
            {'label': 'Traffic variability', 'value': round(traffic_variability, 2)},
            {'label': 'Engagement variability', 'value': round(engagement_variability, 3)},
            {'label': 'Engagement range', 'value': round(engagement_range, 3)},
            {'label': 'Consistency', 'value': consistency_profile},
        ]
        rows = [{
            'metric': 'Peak contribution %',
            'value': round(peak_contribution, 2),
        }, {
            'metric': 'Peak vs average ratio',
            'value': round(peak_vs_avg, 2),
        }, {
            'metric': 'Traffic variability',
            'value': round(traffic_variability, 2),
        }, {
            'metric': 'Engagement variability',
            'value': round(engagement_variability, 3),
        }]
        return {'kpis': kpis, 'rows': rows}

    def _summary_kpis(self, df: pd.DataFrame) -> Dict[str, float]:
        if df.empty:
            return {
                'inflow': 0.0,
                'outflow': 0.0,
                'net_flow': 0.0,
                'occupancy_ratio': 0.0,
                'congestion': 0.0,
                'engagement': 0.0,
                'comfort': 0.0,
            }
        return {
            'inflow': float(df['inflowCount'].sum()),
            'outflow': float(df['outflowCount'].sum()),
            'net_flow': float((df['inflowCount'] - df['outflowCount']).sum()),
            'occupancy_ratio': float(df['occupancyRatio'].mean()),
            'congestion': float(df['flowCongestionIndex'].mean()),
            'engagement': float(df['engagement_truth'].mean()),
            'comfort': float(df['comfortIndex'].mean()),
        }

    def comparison(self, payload: ExhibitorFilterPayload, assignment: Dict[str, Any]) -> Dict[str, Any]:
        selected = self.filter_df(payload, assignment)
        event_df = self.event_df(assignment)
        baseline_label = payload.compare_with or 'event_average'
        baseline_df = pd.DataFrame()
        current_start, current_end = self.resolve_dates(payload, assignment)
        span_days = max(1, (current_end - current_start).days + 1)

        if baseline_label == 'previous_day_same_event':
            baseline_payload = ExhibitorFilterPayload(**{**payload.__dict__, 'start_date': (current_start - timedelta(days=1)).date().isoformat(), 'end_date': (current_end - timedelta(days=1)).date().isoformat(), 'compare_with': None})
            baseline_df = self.filter_df(baseline_payload, assignment)
        elif baseline_label == 'previous_matched_hour_band':
            current_hours = sorted(selected['hour'].unique().tolist()) if not selected.empty else []
            if current_hours:
                target_hours = [(hour - 1) % 24 for hour in current_hours]
                same_days = sorted(selected['bucket_ts'].dt.normalize().unique())
                baseline_df = event_df[event_df['hour'].isin(target_hours) & event_df['bucket_ts'].dt.normalize().isin(same_days)]
        elif baseline_label == 'previous_event':
            previous_assignment = self.resolve_previous_event_assignment(assignment)
            if previous_assignment is not None:
                previous_event_df = self.event_df(previous_assignment)
                start_prev = _as_utc_timestamp(previous_assignment['eventStartTs']).normalize()
                end_prev = start_prev + timedelta(days=span_days - 1)
                baseline_df = previous_event_df[(previous_event_df['bucket_ts'] >= start_prev) & (previous_event_df['bucket_ts'] < end_prev + timedelta(days=1))]
        elif baseline_label == 'best_day_in_event':
            ranked = event_df.assign(day=event_df['bucket_ts'].dt.strftime('%Y-%m-%d')).groupby('day')['inflowCount'].sum().sort_values(ascending=False)
            if not ranked.empty:
                baseline_df = event_df[event_df['bucket_ts'].dt.strftime('%Y-%m-%d') == ranked.index[0]]
        elif baseline_label == 'weakest_day_in_event':
            ranked = event_df.assign(day=event_df['bucket_ts'].dt.strftime('%Y-%m-%d')).groupby('day')['inflowCount'].sum().sort_values(ascending=True)
            if not ranked.empty:
                baseline_df = event_df[event_df['bucket_ts'].dt.strftime('%Y-%m-%d') == ranked.index[0]]
        else:
            baseline_df = event_df
            baseline_label = 'event_average'

        current_kpis = self._summary_kpis(selected)
        baseline_kpis = self._summary_kpis(baseline_df)
        rows = []
        for key, label in [
            ('inflow', 'Inflow'),
            ('outflow', 'Outflow'),
            ('net_flow', 'Net flow'),
            ('occupancy_ratio', 'Occupancy ratio'),
            ('congestion', 'Congestion'),
            ('engagement', 'Engagement'),
            ('comfort', 'Comfort'),
        ]:
            current_value = current_kpis[key]
            baseline_value = baseline_kpis[key]
            rows.append({
                'metric': label,
                'current': round(current_value, 3),
                'baseline': round(baseline_value, 3),
                'delta': round(current_value - baseline_value, 3),
            })
        return {
            'rows': rows,
            'summary': {
                'current_label': f'{current_start.date().isoformat()} to {current_end.date().isoformat()}',
                'baseline_label': baseline_label.replace('_', ' '),
            },
        }


service = ExhibitorAnalyticsService()
