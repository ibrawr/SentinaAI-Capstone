from __future__ import annotations
import pandas as pd
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from services.data_loader import load_analytics_df, load_venue_df, latest_available_date


@dataclass
class FilterPayload:
    analysis_type: str
    metric: Optional[str]
    scope_type: str
    zone_ids: List[str]
    hall_ids: List[str]
    time_range: str
    start_date: Optional[str]
    end_date: Optional[str]
    compare_with: Optional[str]
    limit: int = 5


def _normalize_bool(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin(["1", "true", "yes"])


class OperationsAnalyticsService:
    def __init__(self) -> None:
        self.df = load_analytics_df().copy()
        self.df["isOvercrowded"] = _normalize_bool(self.df["isOvercrowded"])
        self.df["isQueue"] = _normalize_bool(self.df["isQueue"])
        self.venue_df = load_venue_df().copy()
        self.latest_date = pd.to_datetime(latest_available_date()).date()
    
    def resolve_dates(self, payload: FilterPayload) -> Tuple[pd.Timestamp, pd.Timestamp]:
        latest = pd.Timestamp(self.latest_date)

        if payload.time_range == "today":
            start = latest
            end = latest
        elif payload.time_range == "yesterday":
            start = latest - timedelta(days=1)
            end = start
        elif payload.time_range == "last_7_days":
            start = latest - timedelta(days=6)
            end = latest
        else:
            start_raw = payload.start_date or str(self.latest_date)
            end_raw = payload.end_date or str(self.latest_date)
            start = pd.Timestamp(start_raw)
            end = pd.Timestamp(end_raw)

        start = pd.Timestamp(start).normalize()
        end = pd.Timestamp(end).normalize()
        return start, end

    def filter_df(self, payload: FilterPayload) -> pd.DataFrame:
        df = self.df.copy()
        start, end = self.resolve_dates(payload)
        df = df[(df["timestamp"] >= start) & (df["timestamp"] < end + timedelta(days=1))]

        if payload.scope_type == "custom":
            hall_ids = [hall_id for hall_id in payload.hall_ids if hall_id]
            zone_ids = [zone_id for zone_id in payload.zone_ids if zone_id]

            if hall_ids:
                df = df[df["hallId"].isin(hall_ids)]
            elif zone_ids:
                df = df[df["zoneId"].isin(zone_ids)]

        return df.sort_values("timestamp")

    def _latest_snapshot(self, payload: FilterPayload) -> pd.DataFrame:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return filtered
        latest_ts = filtered["timestamp"].max()
        return filtered[filtered["timestamp"] == latest_ts].copy()

    def live_overview(self, payload: FilterPayload) -> Dict[str, Any]:
        snap = self._latest_snapshot(payload)

        if snap.empty:
            return {
                "summary": {
                    "total_current_occupancy": 0,
                    "busiest_hall": {},
                    "overcrowded_count": 0,
                    "congestion_hotspot": {},
                    "latest_timestamp": None,
                },
                "tables": [],
            }

        total_current = int(snap["currentOccupancy"].sum())
        busiest = snap.sort_values("occupancyRatio", ascending=False).iloc[0]
        hotspots = snap.sort_values("flowCongestionIndex", ascending=False).head(3)
        overcrowded_count = int(snap["isOvercrowded"].sum())

        summary = {
            "total_current_occupancy": total_current,
            "busiest_hall": {
                "hall_id": busiest["hallId"],
                "hall_name": busiest["hallName"],
                "occupancy_ratio": round(float(busiest["occupancyRatio"]), 3),
            },
            "overcrowded_count": overcrowded_count,
            "congestion_hotspot": {
                "hall_id": hotspots.iloc[0]["hallId"],
                "hall_name": hotspots.iloc[0]["hallName"],
                "flow_congestion_index": round(float(hotspots.iloc[0]["flowCongestionIndex"]), 3),
            },
            "latest_timestamp": str(snap["timestamp"].max()),
        }

        table_rows = [
            {
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "current_occupancy": int(row["currentOccupancy"]),
                "occupancy_ratio": round(float(row["occupancyRatio"]), 3),
                "capacity": int(row["hallCapacity"]),
                "status": "Overcrowded" if bool(row["isOvercrowded"]) else "Stable",
            }
            for _, row in snap.sort_values("occupancyRatio", ascending=False).iterrows()
        ]

        return {
            "summary": summary,
            "tables": [
                {
                    "title": "Latest hall overview",
                    "columns": list(table_rows[0].keys()) if table_rows else [],
                    "rows": table_rows,
                }
            ],
        }

    def occupancy_summary(self, payload: FilterPayload) -> Dict[str, Any]:
        return self.live_overview(payload)

    def venue_occupancy(self, payload: FilterPayload) -> Dict[str, Any]:
        snap = self._latest_snapshot(payload)
        rows = []

        for _, row in snap.sort_values("occupancyRatio", ascending=False).iterrows():
            rows.append(
                {
                    "hall_id": row["hallId"],
                    "hall_name": row["hallName"],
                    "current_occupancy": int(row["currentOccupancy"]),
                    "occupancy_ratio": round(float(row["occupancyRatio"]), 3),
                    "capacity": int(row["hallCapacity"]),
                    "status": "Overcrowded" if bool(row["isOvercrowded"]) else row["crowdDensityClass"].title(),
                }
            )

        selected = rows[0] if rows else None

        return {
            "kpis": rows if not payload.hall_ids else [r for r in rows if r["hall_id"] in payload.hall_ids],
            "highlight": selected,
        }

    def top_busiest_halls(self, payload: FilterPayload) -> Dict[str, Any]:
        snap = self._latest_snapshot(payload)
        ranked = snap.sort_values(["occupancyRatio", "currentOccupancy"], ascending=False).head(payload.limit)

        rows = [
            {
                "rank": idx + 1,
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "current_occupancy": int(row["currentOccupancy"]),
                "occupancy_ratio": round(float(row["occupancyRatio"]), 3),
                "flow_congestion_index": round(float(row["flowCongestionIndex"]), 3),
            }
            for idx, (_, row) in enumerate(ranked.iterrows())
        ]

        return {"rows": rows, "top": rows[0] if rows else None}

    def hall_performance(self, payload: FilterPayload) -> Dict[str, Any]:
        return self.top_busiest_halls(payload)

    def overcrowded_areas(self, payload: FilterPayload) -> Dict[str, Any]:
        snap = self._latest_snapshot(payload)
        filtered = snap[snap["isOvercrowded"]].copy()
        filtered = snap.copy()
        filtered = filtered.sort_values("occupancyRatio", ascending=False)

        rows = [
            {
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "current_occupancy": int(row["currentOccupancy"]),
                "threshold": int(row["threshold"]),
                "occupancy_ratio": round(float(row["occupancyRatio"]), 3),
                "recommended_action": row["recommendedAction"],
            }
            for _, row in filtered.iterrows()
        ]

        return {"rows": rows}

    def congestion_hotspots(self, payload: FilterPayload) -> Dict[str, Any]:
        snap = self._latest_snapshot(payload)
        ranked = snap.sort_values("flowCongestionIndex", ascending=False).head(payload.limit)

        rows = [
            {
                "rank": idx + 1,
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "flow_congestion_index": round(float(row["flowCongestionIndex"]), 3),
                "queue": bool(row["isQueue"]),
                "queue_length_class": row["queueLengthClass"],
                "recommended_action": row["recommendedAction"],
            }
            for idx, (_, row) in enumerate(ranked.iterrows())
        ]

        return {"rows": rows, "top": rows[0] if rows else None}

    def queue_hotspots(self, payload: FilterPayload) -> Dict[str, Any]:
        ranked = snap[snap["isQueue"]]  # type: ignore[index]
        ranked = ranked.sort_values(by="flowCongestionIndex", ascending=False)

        rows = [
            {
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "queue_length_class": row["queueLengthClass"],
                "flow_congestion_index": round(float(row["flowCongestionIndex"]), 3),
            }
            for _, row in ranked.iterrows()
        ]

        return {"rows": rows}

    def crowd_movement(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)

        if filtered.empty:
            return {
                "title": "Crowd Movement",
                "total_inflow": 0,
                "total_outflow": 0,
                "net_flow": 0,
                "avg_congestion": 0,
                "overcrowded_intervals": 0,
                "queue_intervals": 0,
                "peak_period_label": "N/A",
                "series": [],
                "rows": [],
            }

        inflow_col = "inflowCount"
        outflow_col = "outflowCount"

        df = filtered.copy()
        df[inflow_col] = df[inflow_col].fillna(0)
        df[outflow_col] = df[outflow_col].fillna(0)
        df["netFlow"] = df[inflow_col] - df[outflow_col]
        df["movementTotal"] = df[inflow_col] + df[outflow_col]

        total_inflow = int(df[inflow_col].sum())
        total_outflow = int(df[outflow_col].sum())
        net_flow = int(df["netFlow"].sum())
        avg_congestion = round(float(df["flowCongestionIndex"].mean()), 3)
        overcrowded_intervals = int(df["isOvercrowded"].sum())
        queue_intervals = int(df["isQueue"].sum())

        metric_cols = [inflow_col, outflow_col, "netFlow", "movementTotal"]

        grouped = (
            df.groupby("timestamp", as_index=False)
            .agg({col: "sum" for col in metric_cols})
            .sort_values(by="timestamp")
            .reset_index(drop=True)
        )

        peak_row = grouped.loc[grouped["movementTotal"].idxmax()]
        peak_period_label = str(peak_row["timestamp"])

        series = [
            {
                "name": "Inflow",
                "points": [
                    {"x": str(row["timestamp"]), "y": int(row[inflow_col])}
                    for _, row in grouped.iterrows()
                ],
            },
            {
                "name": "Outflow",
                "points": [
                    {"x": str(row["timestamp"]), "y": int(row[outflow_col])}
                    for _, row in grouped.iterrows()
                ],
            },
            {
                "name": "Net Flow",
                "points": [
                    {"x": str(row["timestamp"]), "y": int(row["netFlow"])}
                    for _, row in grouped.iterrows()
                ],
            },
        ]

        group_cols = ["hallId", "hallName"]
        agg_cols = [
            inflow_col,
            outflow_col,
            "netFlow",
            "movementTotal",
            "flowCongestionIndex",
            "isOvercrowded",
            "isQueue",
        ]

        agg_map = {
            inflow_col: "sum",
            outflow_col: "sum",
            "netFlow": "sum",
            "movementTotal": "sum",
            "flowCongestionIndex": "mean",
            "isOvercrowded": "sum",
            "isQueue": "sum",
        }

        hall_group = df[group_cols + agg_cols].copy()
        hall_group = hall_group.groupby(group_cols, dropna=False, as_index=False).agg(agg_map)
        hall_group = df[group_cols + agg_cols].copy()
        rows = [
            {
                "hall_id": row["hallId"],
                "hall_name": row["hallName"],
                "total_inflow": int(row[inflow_col]),
                "total_outflow": int(row[outflow_col]),
                "net_flow": int(row["netFlow"]),
                "movement_total": int(row["movementTotal"]),
                "avg_congestion": round(float(row["flowCongestionIndex"]), 3),
                "overcrowded_intervals": int(row["isOvercrowded"]),
                "queue_intervals": int(row["isQueue"]),
            }
            for _, row in hall_group.head(payload.limit or 5).iterrows()
        ]

        return {
            "title": "Crowd Movement",
            "x_axis_label": "Time",
            "y_axis_label": "People count",
            "total_inflow": total_inflow,
            "total_outflow": total_outflow,
            "net_flow": net_flow,
            "avg_congestion": avg_congestion,
            "overcrowded_intervals": overcrowded_intervals,
            "queue_intervals": queue_intervals,
            "peak_period_label": peak_period_label,
            "series": series,
            "rows": rows,
        }

    def event_wise_breakdown(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)

        if filtered.empty:
            return {"rows": []}

        grouped = filtered.groupby("eventId", dropna=False).agg(
            average_occupancy=("currentOccupancy", "mean"),
            max_occupancy=("currentOccupancy", "max"),
            average_ratio=("occupancyRatio", "mean"),
            overcrowded_intervals=("isOvercrowded", "sum"),
        ).reset_index()

        rows = [
            {
                "event_id": row["eventId"],
                "average_occupancy": round(float(row["average_occupancy"]), 1),
                "max_occupancy": int(row["max_occupancy"]),
                "average_ratio": round(float(row["average_ratio"]), 3),
                "overcrowded_intervals": int(row["overcrowded_intervals"]),
            }
            for _, row in grouped.sort_values("average_ratio", ascending=False).iterrows()
        ]

        return {"rows": rows}

    def event_performance(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)

        if filtered.empty:
            return {
                "summary": {
                    "peak_occupancy": 0,
                    "busiest_hall": {},
                },
                "rows": [],
            }

        busiest = filtered.sort_values("occupancyRatio", ascending=False).iloc[0]

        summary = {
            "peak_occupancy": int(filtered["currentOccupancy"].max()),
            "busiest_hall": {
                "hall_id": busiest["hallId"],
                "hall_name": busiest["hallName"],
                "occupancy_ratio": round(float(busiest["occupancyRatio"]), 3),
            },
        }

        breakdown = self.event_wise_breakdown(payload)
        return {
            "summary": summary,
            "rows": breakdown.get("rows", []),
        }

    def compare_periods(self, payload: FilterPayload) -> Dict[str, Any]:
        current = self.filter_df(payload)
        current_value = current["currentOccupancy"].mean() if not current.empty else 0

        compare_payload = FilterPayload(
            **{
                **payload.__dict__,
                "time_range": payload.compare_with or "yesterday",
                "start_date": None,
                "end_date": None,
            }
        )
        previous = self.filter_df(compare_payload)
        previous_value = previous["currentOccupancy"].mean() if not previous.empty else 0

        current_label = (
            f"{payload.start_date} to {payload.end_date}"
            if payload.start_date and payload.end_date and payload.start_date != payload.end_date
            else payload.start_date or payload.end_date or "selected range"
        )
        previous_label = payload.compare_with or "yesterday"

        rows = [
            {
                "period": current_label,
                "average_occupancy": round(float(current_value), 1),
            },
            {
                "period": previous_label,
                "average_occupancy": round(float(previous_value), 1),
            },
        ]

        delta = round(float(current_value - previous_value), 1)
        pct = round((delta / previous_value) * 100, 1) if previous_value else None

        return {"rows": rows, "delta": delta, "percent_change": pct, "current_label": current_label, "previous_label": previous_label}

    def time_comparison(self, payload: FilterPayload) -> Dict[str, Any]:
        return self.compare_periods(payload)

    def peak_time_detection(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)
        if filtered.empty:
            return {}

        peak_df = filtered[["timestamp", "currentOccupancy"]].copy()
        peak_df = peak_df.groupby("timestamp", as_index=False).agg(
            {"currentOccupancy": "sum"}
        )

        peak_df = peak_df.nlargest(1, "currentOccupancy").reset_index(drop=True)
        peak = peak_df.iloc[0]

        return {
            "peak_timestamp": str(peak["timestamp"]),
            "peak_occupancy": int(peak["currentOccupancy"]),
        }
    def trends(self, payload: FilterPayload) -> Dict[str, Any]:
        filtered = self.filter_df(payload)

        if filtered.empty:
            return {"title": "Explore Trends", "series": [], "summary": {}}

        metric = payload.metric or "occupancy_trend"
        group = filtered.groupby("timestamp")

        if metric == "venue_trend":
            series = group["currentOccupancy"].sum().reset_index(name="value")
            title = "Venue occupancy trend"

        elif metric == "flow_trend":
            series = (
                filtered.groupby("timestamp", as_index=False)[["inflowCount", "outflowCount"]]
                .sum()
            )
            title = "Flow trend"

            total_movement = int((series["inflowCount"] + series["outflowCount"]).sum())
            movement_total = series["inflowCount"] + series["outflowCount"]
            peak_idx = movement_total.idxmax()
            peak_row = series.iloc[int(peak_idx)]

            return {
                "title": title,
                "summary": {
                    "total_movement": int(float(total_movement)),
                    "peak_period": str(peak_row["timestamp"]),
                },
                "x_axis_label": "Time",
                "y_axis_label": "People count",
                "series": [
                {
                    "name": "Inflow",
                    "points": [
                        {"x": str(row["timestamp"]), "y": int(float(row["inflowCount"]))}
                        for _, row in series.iterrows()
                    ],
                },
                {
                    "name": "Outflow",
                    "points": [
                        {"x": str(row["timestamp"]), "y": int(float(row["outflowCount"]))}
                        for _, row in series.iterrows()
                    ],
                },
                ],
            }

        elif metric == "congestion_trend":
            series = group["flowCongestionIndex"].mean().reset_index(name="value")
            title = "Congestion trend"

        elif metric == "queue_trend":
            series = group["isQueue"].sum().reset_index(name="value")
            title = "Queue trend"

        else:
            series = group["occupancyRatio"].mean().reset_index(name="value")
            title = "Occupancy trend"

        peak_series = series.nlargest(1, "value")
        low_series = series.nsmallest(1, "value")

        peak_row = peak_series.iloc[0]
        low_row = low_series.iloc[0]

        strongest_day = filtered.groupby(filtered["timestamp"].dt.date)["currentOccupancy"].mean().sort_values(ascending=False)
        quietest_day = filtered.groupby(filtered["timestamp"].dt.date)["currentOccupancy"].mean().sort_values(ascending=True)

        return {
            "title": title,
            "summary": {
                "peak_period": str(peak_row["timestamp"]),
                "peak_value": round(float(peak_row["value"]), 3),
                "lowest_period": str(low_row["timestamp"]),
                "lowest_value": round(float(low_row["value"]), 3),
                "best_day": str(strongest_day.index[0]) if not strongest_day.empty else None,
                "best_day_value": round(float(strongest_day.iloc[0]), 3) if not strongest_day.empty else None,
                "quiet_day": str(quietest_day.index[0]) if not quietest_day.empty else None,
                "quiet_day_value": round(float(quietest_day.iloc[0]), 3) if not quietest_day.empty else None,
            },
            "x_axis_label": "Time",
            "y_axis_label": "Metric value",
            "series": [
                {
                    "name": title,
                    "points": [
                        {"x": str(r.timestamp), "y": round(float(getattr(r, "value")), 3)}
                        for r in series.itertuples(index=False)
                    ],
                }
            ],
        }

    def explore_trends(self, payload: FilterPayload) -> Dict[str, Any]:
            return self.trends(payload)


service = OperationsAnalyticsService()
