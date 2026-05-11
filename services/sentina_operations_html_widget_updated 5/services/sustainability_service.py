from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Tuple

import pandas as pd

from services.data_loader import load_analytics_df, load_events_df, latest_available_date
from services.operations_service import FilterPayload


def _normalize_bool(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin(['1', 'true', 'yes'])


def _safe_div(numerator: float, denominator: float) -> float:
    return float(numerator) / float(denominator) if denominator else 0.0


class SustainabilityAnalyticsService:
    def __init__(self) -> None:
        self.df = load_analytics_df().copy()
        self.df['isEvent'] = _normalize_bool(self.df['isEvent'])
        self.df['isOvercrowdedFlag'] = _normalize_bool(self.df['isOvercrowded']).astype(int)
        self.df['isQueueFlag'] = _normalize_bool(self.df['isQueue']).astype(int)
        self.events_df = load_events_df().copy()
        self.latest_date = pd.to_datetime(latest_available_date()).date()

    def resolve_dates(self, payload: FilterPayload) -> Tuple[pd.Timestamp, pd.Timestamp]:
        latest = pd.Timestamp(self.latest_date)

        if payload.time_range == 'today':
            start = latest
            end = latest
        elif payload.time_range == 'yesterday':
            start = latest - timedelta(days=1)
            end = start
        elif payload.time_range == 'last_7_days':
            start = latest - timedelta(days=6)
            end = latest
        else:
            start = pd.Timestamp(payload.start_date or str(self.latest_date))
            end = pd.Timestamp(payload.end_date or str(self.latest_date))

        return start.normalize(), end.normalize()

    def filter_df(self, payload: FilterPayload) -> pd.DataFrame:
        df = self.df.copy()
        start, end = self.resolve_dates(payload)
        df = df[(df['timestamp'] >= start) & (df['timestamp'] < end + timedelta(days=1))]

        if payload.scope_type == 'custom':
            hall_ids = [hall_id for hall_id in payload.hall_ids if hall_id]
            zone_ids = [zone_id for zone_id in payload.zone_ids if zone_id]

            if hall_ids:
                df = df[df['hallId'].isin(hall_ids)]
            elif zone_ids:
                df = df[df['zoneId'].isin(zone_ids)]

        return df.sort_values('timestamp')

    def _top_hall_rows(self, filtered: pd.DataFrame, metric: str, top_n: int = 5) -> List[Dict[str, Any]]:
        if filtered.empty:
            return []

        grouped = (
            filtered.groupby(['hallId', 'hallName'], as_index=False)
            .agg(
                metric_value=(metric, 'sum'),
                avg_efficiency=('energyEfficiencyScore', 'mean'),
                avg_comfort=('comfortIndex', 'mean'),
                carbon_kg=('carbonKgCO2', 'sum'),
            )
            .sort_values('metric_value', ascending=False)
            .head(top_n)
        )

        return [
            {
                'hall_id': row['hallId'],
                'hall_name': row['hallName'],
                'metric_value': round(float(row['metric_value']), 2),
                'avg_efficiency': round(float(row['avg_efficiency']), 1),
                'avg_comfort': round(float(row['avg_comfort']), 1),
                'carbon_kg': round(float(row['carbon_kg']), 2),
            }
            for _, row in grouped.iterrows()
        ]

    def overview(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {'cards': [], 'rows': []}

        total_hvac = float(filtered['hvacEnergyKWh'].sum())
        total_carbon = float(filtered['carbonKgCO2'].sum())
        avg_efficiency = float(filtered['energyEfficiencyScore'].mean())
        avg_comfort = float(filtered['comfortIndex'].mean())
        green_share = float(
            (filtered['sustainabilityStatus'].astype(str).str.lower() == 'green').mean() * 100
        )

        top_halls = self._top_hall_rows(filtered, 'hvacEnergyKWh')
        top_hall = top_halls[0]['hall_name'] if top_halls else '—'

        return {
            'cards': [
                {'label': 'HVAC energy', 'value': f'{total_hvac:,.1f} kWh'},
                {'label': 'Carbon', 'value': f'{total_carbon:,.1f} kg CO2'},
                {'label': 'Avg efficiency', 'value': f'{avg_efficiency:.1f}'},
                {'label': 'Avg comfort', 'value': f'{avg_comfort:.1f}'},
            ],
            'rows': top_halls,
            'meta': {
                'green_share': round(green_share, 1),
                'top_hall': top_hall,
            },
        }

    def energy(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {'series': [], 'kpis': [], 'badges': []}

        grouped = (
            filtered.groupby('timestamp', as_index=False)
            .agg(
                hvacEnergyKWh=('hvacEnergyKWh', 'sum'),
                currentOccupancy=('currentOccupancy', 'sum'),
            )
            .sort_values('timestamp')
        )

        total_energy = float(grouped['hvacEnergyKWh'].sum())
        avg_interval = float(grouped['hvacEnergyKWh'].mean())
        peak_idx = int(grouped['hvacEnergyKWh'].idxmax())
        peak_row = grouped.loc[peak_idx]
        peak_energy = float(grouped['hvacEnergyKWh'].to_numpy()[peak_idx])
        energy_per_person = _safe_div(total_energy, float(grouped['currentOccupancy'].sum()))

        return {
            'x_axis_label': 'Time',
            'y_axis_label': 'HVAC energy (kWh)',
            'series': [
                {
                    'name': 'HVAC Energy',
                    'points': [
                        {'x': str(row['timestamp']), 'y': round(float(row['hvacEnergyKWh']), 2)}
                        for _, row in grouped.iterrows()
                    ],
                }
            ],
            'kpis': [
                {'label': 'Total HVAC energy', 'value': f'{total_energy:,.1f} kWh'},
                {'label': 'Avg interval energy', 'value': f'{avg_interval:,.1f} kWh'},
                {'label': 'Peak interval', 'value': f'{peak_energy:,.1f} kWh'},
                {'label': 'kWh per person', 'value': f'{energy_per_person:.3f}'},
            ],
            'badges': [
                {'label': 'Peak energy period', 'value': str(peak_row['timestamp'])},
            ],
        }

    def comfort(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {'series': [], 'kpis': [], 'badges': []}

        grouped = (
            filtered.groupby('timestamp', as_index=False)
            .agg(
                comfortIndex=('comfortIndex', 'mean'),
                tempComfortScore=('tempComfortScore', 'mean'),
                humidityComfortScore=('humidityComfortScore', 'mean'),
                indoorTempC=('indoorTempC', 'mean'),
                humidityPct=('humidityPct', 'mean'),
            )
            .sort_values('timestamp')
        )

        worst_row = grouped.loc[grouped['comfortIndex'].idxmin()]

        return {
            'x_axis_label': 'Time',
            'y_axis_label': 'Comfort score',
            'series': [
                {
                    'name': 'Comfort Index',
                    'points': [
                        {'x': str(r['timestamp']), 'y': round(float(r['comfortIndex']), 2)}
                        for _, r in grouped.iterrows()
                    ],
                },
                {
                    'name': 'Temp Comfort',
                    'points': [
                        {'x': str(r['timestamp']), 'y': round(float(r['tempComfortScore']), 2)}
                        for _, r in grouped.iterrows()
                    ],
                },
                {
                    'name': 'Humidity Comfort',
                    'points': [
                        {'x': str(r['timestamp']), 'y': round(float(r['humidityComfortScore']), 2)}
                        for _, r in grouped.iterrows()
                    ],
                },
            ],
            'kpis': [
                {'label': 'Avg comfort', 'value': f"{grouped['comfortIndex'].mean():.1f}"},
                {'label': 'Worst comfort', 'value': f"{grouped['comfortIndex'].min():.1f}"},
                {'label': 'Avg indoor temp', 'value': f"{grouped['indoorTempC'].mean():.1f} C"},
                {'label': 'Avg humidity', 'value': f"{grouped['humidityPct'].mean():.1f}%"},
            ],
            'badges': [
                {'label': 'Worst comfort period', 'value': str(worst_row['timestamp'])},
            ],
        }

    def event_overview(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {'series': [], 'kpis': [], 'rows': [], 'badges': []}

        event_only = filtered[
            filtered['isEvent']
            & filtered['eventId'].notna()
            & (filtered['eventId'] != 'No Event')
        ].copy()
        if event_only.empty:
            return {'series': [], 'kpis': [], 'rows': [], 'badges': []}

        grouped = (
            event_only.groupby('eventId', as_index=False)
            .agg(
                event_intervals=('eventId', 'size'),
                total_hvac_energy=('hvacEnergyKWh', 'sum'),
                total_carbon=('carbonKgCO2', 'sum'),
                avg_efficiency=('energyEfficiencyScore', 'mean'),
                avg_comfort=('comfortIndex', 'mean'),
                avg_occupancy=('currentOccupancy', 'mean'),
                avg_occupancy_ratio=('occupancyRatio', 'mean'),
                total_inflow=('inflowCount', 'sum'),
                total_outflow=('outflowCount', 'sum'),
                overcrowded_intervals=('isOvercrowdedFlag', 'sum'),
                queue_intervals=('isQueueFlag', 'sum'),
            )
            .sort_values('total_hvac_energy', ascending=False)
        )
        grouped['net_flow'] = grouped['total_inflow'] - grouped['total_outflow']
        grouped['event_share_pct'] = grouped['total_hvac_energy'].apply(
            lambda value: round(_safe_div(float(value), float(filtered['hvacEnergyKWh'].sum())) * 100, 1)
        )
        grouped['overcrowded_share_pct'] = grouped.apply(
            lambda row: round(_safe_div(float(row['overcrowded_intervals']), float(row['event_intervals'])) * 100, 1),
            axis=1,
        )
        grouped['queue_share_pct'] = grouped.apply(
            lambda row: round(_safe_div(float(row['queue_intervals']), float(row['event_intervals'])) * 100, 1),
            axis=1,
        )

        events_meta = self.events_df[[
            'eventId', 'eventName', 'startDateTimeUtc', 'endDateTimeUtc', 'expectedAttendanceTotal'
        ]].copy()
        grouped = grouped.merge(events_meta, on='eventId', how='left')
        grouped['eventName'] = grouped['eventName'].fillna(grouped['eventId'])
        grouped['event_window'] = grouped.apply(
            lambda row: f"{pd.Timestamp(row['startDateTimeUtc']).date()} to {pd.Timestamp(row['endDateTimeUtc']).date()}"
            if pd.notna(row['startDateTimeUtc']) and pd.notna(row['endDateTimeUtc'])
            else 'Window unavailable',
            axis=1,
        )

        top_energy_row = grouped.iloc[0]
        top_inflow_row = grouped.sort_values('total_inflow', ascending=False).iloc[0]
        top_occupancy_row = grouped.sort_values('avg_occupancy_ratio', ascending=False).iloc[0]

        if len(grouped) == 1:
            focus_row = grouped.iloc[0]
            focus_label = str(focus_row['eventName'])
        else:
            focus_row = top_energy_row
            focus_label = f"{len(grouped)} events in range"

        kpis = [
            {'label': 'Focus', 'value': focus_label},
            {'label': 'Events in range', 'value': int(len(grouped))},
            {'label': 'Selected event energy', 'value': f"{float(event_only['hvacEnergyKWh'].sum()):,.1f} kWh"},
            {'label': 'Selected event carbon', 'value': f"{float(event_only['carbonKgCO2'].sum()):,.1f} kg CO2"},
            {'label': 'Top event', 'value': str(top_energy_row['eventName'])},
            {'label': 'Top inflow event', 'value': str(top_inflow_row['eventName'])},
        ]

        rows = [
            {
                'event_id': row['eventId'],
                'event_name': row['eventName'],
                'event_window': row['event_window'],
                'event_intervals': int(row['event_intervals']),
                'total_hvac_energy_kwh': round(float(row['total_hvac_energy']), 1),
                'total_carbon_kg': round(float(row['total_carbon']), 1),
                'avg_efficiency': round(float(row['avg_efficiency']), 1),
                'avg_comfort': round(float(row['avg_comfort']), 1),
                'avg_occupancy_ratio': round(float(row['avg_occupancy_ratio']), 3),
                'avg_occupancy': round(float(row['avg_occupancy']), 1),
                'total_inflow': int(row['total_inflow']),
                'total_outflow': int(row['total_outflow']),
                'net_flow': int(row['net_flow']),
                'overcrowded_share_pct': round(float(row['overcrowded_share_pct']), 1),
                'queue_share_pct': round(float(row['queue_share_pct']), 1),
                'event_share_pct': round(float(row['event_share_pct']), 1),
            }
            for _, row in grouped.iterrows()
        ]

        badges = [
            {'label': 'Top event by energy', 'value': str(top_energy_row['eventName'])},
            {'label': 'Top event by inflow', 'value': str(top_inflow_row['eventName'])},
            {'label': 'Highest avg occupancy', 'value': str(top_occupancy_row['eventName'])},
        ]

        if len(grouped) == 1:
            single_event = grouped.iloc[0]
            daily = event_only[event_only['eventId'] == single_event['eventId']].copy()
            daily['day'] = daily['timestamp'].dt.strftime('%Y-%m-%d')
            daily_grouped = (
                daily.groupby('day', as_index=False)
                .agg(
                    hvacEnergyKWh=('hvacEnergyKWh', 'sum'),
                    carbonKgCO2=('carbonKgCO2', 'sum'),
                    avgOccupancyRatio=('occupancyRatio', 'mean'),
                )
                .sort_values('day')
            )
            series = [
                {
                    'name': 'HVAC energy',
                    'points': [
                        {'x': row['day'], 'y': round(float(row['hvacEnergyKWh']), 2)}
                        for _, row in daily_grouped.iterrows()
                    ],
                },
                {
                    'name': 'Carbon',
                    'points': [
                        {'x': row['day'], 'y': round(float(row['carbonKgCO2']), 2)}
                        for _, row in daily_grouped.iterrows()
                    ],
                },
            ]
        else:
            daily = event_only.copy()
            daily['day'] = daily['timestamp'].dt.strftime('%Y-%m-%d')
            top_event_ids = grouped.head(4)['eventId'].tolist()
            daily = daily[daily['eventId'].isin(top_event_ids)]
            daily_grouped = (
                daily.groupby(['day', 'eventId'], as_index=False)
                .agg(hvacEnergyKWh=('hvacEnergyKWh', 'sum'))
                .merge(grouped[['eventId', 'eventName']], on='eventId', how='left')
                .sort_values(['eventName', 'day'])
            )
            series = []
            for event_id, event_group in daily_grouped.groupby('eventId'):
                event_name = str(event_group['eventName'].iloc[0] or event_id)
                series.append(
                    {
                        'name': event_name,
                        'points': [
                            {'x': row['day'], 'y': round(float(row['hvacEnergyKWh']), 2)}
                            for _, row in event_group.iterrows()
                        ],
                    }
                )

        return {
            'x_axis_label': 'Day',
            'y_axis_label': 'HVAC energy (kWh)',
            'series': series,
            'kpis': kpis,
            'rows': rows,
            'table_rows': rows,
            'badges': badges,
            'meta': {
                'event_count': int(len(grouped)),
                'top_event_name': str(top_energy_row['eventName']),
                'top_event_energy': round(float(top_energy_row['total_hvac_energy']), 1),
                'top_inflow_event_name': str(top_inflow_row['eventName']),
            },
        }

    def efficiency_and_carbon(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {'series': [], 'kpis': [], 'badges': []}

        grouped = (
            filtered.groupby('timestamp', as_index=False)
            .agg(
                carbonKgCO2=('carbonKgCO2', 'sum'),
                energyEfficiencyScore=('energyEfficiencyScore', 'mean'),
            )
            .sort_values('timestamp')
        )

        peak_carbon = grouped.loc[grouped['carbonKgCO2'].idxmax()]
        lowest_efficiency = grouped.loc[grouped['energyEfficiencyScore'].idxmin()]

        hall_rank = (
            filtered.groupby(['hallId', 'hallName'], as_index=False)
            .agg(
                carbonKgCO2=('carbonKgCO2', 'sum'),
                energyEfficiencyScore=('energyEfficiencyScore', 'mean'),
            )
        )
        hall_rank['risk_score'] = hall_rank['carbonKgCO2'] - hall_rank['energyEfficiencyScore']
        worst_hall = hall_rank.sort_values('risk_score', ascending=False).iloc[0]

        green_share = float(
            (filtered['sustainabilityStatus'].astype(str).str.lower() == 'green').mean() * 100
        )

        return {
            'x_axis_label': 'Time',
            'y_axis_label': 'Carbon (kg CO2)',
            'series': [
                {
                    'name': 'Carbon Emissions',
                    'points': [
                        {'x': str(r['timestamp']), 'y': round(float(r['carbonKgCO2']), 2)}
                        for _, r in grouped.iterrows()
                    ],
                }
            ],
            'kpis': [
                {'label': 'Total carbon', 'value': f"{filtered['carbonKgCO2'].sum():,.1f} kg CO2"},
                {'label': 'Avg efficiency', 'value': f"{filtered['energyEfficiencyScore'].mean():.1f}"},
                {'label': 'Green intervals', 'value': f'{green_share:.1f}%'},
                {'label': 'Highest-risk hall', 'value': str(worst_hall['hallName'])},
            ],
            'badges': [
                {'label': 'Peak carbon period', 'value': str(peak_carbon['timestamp'])},
                {'label': 'Lowest efficiency period', 'value': str(lowest_efficiency['timestamp'])},
            ],
        }

    def compare_periods(self, payload: FilterPayload) -> Dict[str, Any]:
        current = self.filter_df(payload)
        if current.empty:
            return {'rows': []}

        start, end = self.resolve_dates(payload)
        compare = payload.compare_with or 'yesterday'
        delta = timedelta(days=7) if compare == 'last_7_days' else timedelta(days=1)

        previous_payload = FilterPayload(
            analysis_type=payload.analysis_type,
            metric=payload.metric,
            scope_type=payload.scope_type,
            zone_ids=payload.zone_ids,
            hall_ids=payload.hall_ids,
            time_range='custom',
            start_date=str((start - delta).date()),
            end_date=str((end - delta).date()),
            compare_with=None,
            limit=payload.limit,
        )
        previous = self.filter_df(previous_payload)

        def metric_row(name: str, current_value: float, previous_value: float) -> Dict[str, Any]:
            delta_value = current_value - previous_value
            delta_pct = (_safe_div(delta_value, previous_value) * 100) if previous_value else 0.0
            return {
                'metric': name,
                'current': round(float(current_value), 2),
                'previous': round(float(previous_value), 2),
                'delta': round(float(delta_value), 2),
                'delta_pct': round(float(delta_pct), 2),
            }

        rows = [
            metric_row('HVAC energy (kWh)', current['hvacEnergyKWh'].sum(), previous['hvacEnergyKWh'].sum()),
            metric_row('Carbon (kg CO2)', current['carbonKgCO2'].sum(), previous['carbonKgCO2'].sum()),
            metric_row('Avg efficiency', current['energyEfficiencyScore'].mean(), previous['energyEfficiencyScore'].mean()),
            metric_row('Avg comfort', current['comfortIndex'].mean(), previous['comfortIndex'].mean()),
        ]

        return {
            'rows': rows,
            'current_label': f'{start.date()} to {end.date()}',
            'previous_label': f'{(start - delta).date()} to {(end - delta).date()}',
        }


service = SustainabilityAnalyticsService()
