from typing import Dict, Any, Optional, List
import pandas as pd

from app.report.module.exhibitors.constant import SECTION_LABELS


def _pick_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if pd.isna(value):
            return default
        return int(round(float(value)))
    except Exception:
        return default


def _fmt_num(value: Any, decimals: int = 1) -> str:
    try:
        v = float(value)
        if pd.isna(v):
            return "0"
        if decimals == 0:
            return f"{int(round(v)):,}"
        return f"{v:,.{decimals}f}"
    except Exception:
        return "0"


def _fmt_pct(value: Any, decimals: int = 1) -> str:
    try:
        v = float(value)
        if pd.isna(v):
            return "0%"
        if 0 <= v <= 1:
            v *= 100
        return f"{v:.{decimals}f}%"
    except Exception:
        return "0%"


def _classify_traffic(avg_inflow: float) -> str:
    if avg_inflow >= 100:
        return "High"
    if avg_inflow >= 40:
        return "Moderate"
    return "Low"


def _classify_density(avg_density: float) -> str:
    if avg_density >= 0.75:
        return "High"
    if avg_density >= 0.4:
        return "Moderate"
    return "Low"


def _format_interval_label(ts: Any, frequency: str) -> str:
    dt = pd.to_datetime(ts, errors="coerce")
    if pd.isna(dt):
        return "N/A"

    if getattr(dt, "tzinfo", None) is not None:
        dt = dt.tz_localize(None)

    freq = (frequency or "").strip().lower()

    if freq == "daily":
        return dt.strftime("%Y-%m-%d")

    if freq == "weekly":
        week_start = dt.to_period("W").start_time
        week_end = dt.to_period("W").end_time
        return f"{week_start.strftime('%Y-%m-%d')} to {week_end.strftime('%Y-%m-%d')}"

    if freq == "monthly":
        return dt.strftime("%Y-%m")

    hour_end = dt + pd.Timedelta(hours=1)
    return f"{dt.strftime('%Y-%m-%d %H:%M')} to {hour_end.strftime('%H:%M')}"


def _format_peak_window(ts: Any, frequency: str) -> str:
    dt = pd.to_datetime(ts, errors="coerce")
    if pd.isna(dt):
        return "N/A"

    if getattr(dt, "tzinfo", None) is not None:
        dt = dt.tz_localize(None)

    freq = (frequency or "").strip().lower()

    if freq == "daily":
        return dt.strftime("%Y-%m-%d")
    if freq == "weekly":
        week_start = dt.to_period("W").start_time
        week_end = dt.to_period("W").end_time
        return f"{week_start.strftime('%Y-%m-%d')} to {week_end.strftime('%Y-%m-%d')}"
    if freq == "monthly":
        return dt.strftime("%Y-%m")

    return dt.strftime("%Y-%m-%d %H:%M")


def build_traffic_overview_section(
    df: pd.DataFrame,
    filters,
    event_row: Optional[Dict[str, Any]] = None,
    exhibitor_row: Optional[Dict[str, Any]] = None,
    assignments_df: Optional[pd.DataFrame] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    title = SECTION_LABELS.get("traffic_overview", "Booth Traffic Overview")
    scope = scope or {}

    if df is None or df.empty:
        return {
            "key": "traffic_overview",
            "title": title,
            "subtitle": "Hall-level traffic conditions and movement patterns surrounding the exhibitor’s booth, providing relative context against other halls.",
            "blocks": [
                {
                    "title": "Traffic Summary",
                    "subtitle": "Key traffic indicators for the selected exhibitor scope.",
                    "summary": ["No traffic data was available for the selected exhibitor scope."],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Total Inflow", "Details": "0"},
                        {"Attribute": "Total Outflow", "Details": "0"},
                        {"Attribute": "Average Inflow per Interval", "Details": "0"},
                        {"Attribute": "Peak Traffic Window", "Details": "N/A"},
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    work = df.copy()

    ts_col = _pick_col(work, ["bucket_ts", "ts", "timestamp", "datetime"])
    inflow_col = _pick_col(work, ["inflow_count", "inflowCount"])
    outflow_col = _pick_col(work, ["outflow_count", "outflowCount"])
    occupancy_col = _pick_col(work, ["current_occupancy", "currentOccupancy"])
    occupancy_ratio_col = _pick_col(work, ["occupancy_ratio", "occupancyRatio"])
    density_col = _pick_col(work, ["density_score", "densityScore"])
    congestion_col = _pick_col(work, ["flow_congestion_index", "flowCongestionIndex"])
    queue_col = _pick_col(work, ["is_queue", "isQueue"])
    overcrowded_col = _pick_col(work, ["is_overcrowded", "isOvercrowded"])
    hall_col = _pick_col(work, ["hall_name", "hallName"])

    if not ts_col:
        return {
            "key": "traffic_overview",
            "title": title,
            "subtitle": "Hall-level traffic conditions and movement patterns surrounding the exhibitor’s booth, providing relative context against other halls.",
            "blocks": [
                {
                    "title": "Traffic Summary",
                    "subtitle": "No valid timestamp column was found for traffic analysis.",
                    "summary": ["This section could not be generated because the dataset has no usable timestamp field."],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Status", "Details": "Timestamp column missing"}
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    work[ts_col] = pd.to_datetime(work[ts_col], errors="coerce")
    freq = str(getattr(filters, "frequency", "Hourly")).strip().lower()

    if not work.empty:
        if freq == "hourly":
            work["_bucket"] = work[ts_col].dt.floor("h")
        elif freq == "daily":
            work["_bucket"] = work[ts_col].dt.floor("d")
        elif freq == "weekly":
            work["_bucket"] = work[ts_col].dt.to_period("W").dt.start_time
        elif freq == "monthly":
            work["_bucket"] = work[ts_col].dt.to_period("M").dt.start_time
        else:
            work["_bucket"] = work[ts_col]

        agg_map: Dict[str, str] = {}

        for col in [inflow_col, outflow_col]:
            if col:
                agg_map[col] = "sum"

        for col in [occupancy_col, occupancy_ratio_col, density_col, congestion_col]:
            if col:
                agg_map[col] = "mean"

        for col in [queue_col, overcrowded_col]:
            if col:
                agg_map[col] = "mean"

        grouped = work.groupby("_bucket", dropna=True).agg(agg_map).reset_index()
        grouped = grouped.rename(columns={"_bucket": ts_col})

        if hall_col and hall_col in work.columns:
            hall_values = work[hall_col].dropna().astype(str).unique().tolist()
            if hall_values:
                grouped[hall_col] = hall_values[0]

        work = grouped

    total_inflow = _safe_int(work[inflow_col].fillna(0).sum()) if inflow_col else 0
    total_outflow = _safe_int(work[outflow_col].fillna(0).sum()) if outflow_col else 0

    avg_inflow = _safe_float(work[inflow_col].mean()) if inflow_col else 0.0
    avg_outflow = _safe_float(work[outflow_col].mean()) if outflow_col else 0.0
    avg_occupancy = _safe_float(work[occupancy_col].mean()) if occupancy_col else 0.0
    avg_occupancy_ratio = _safe_float(work[occupancy_ratio_col].mean()) if occupancy_ratio_col else 0.0
    avg_density = _safe_float(work[density_col].mean()) if density_col else 0.0
    avg_congestion = _safe_float(work[congestion_col].mean()) if congestion_col else 0.0

    queue_share = None
    if queue_col and queue_col in work.columns:
        queue_share = _safe_float(work[queue_col].fillna(False).astype(int).mean()) * 100

    overcrowded_share = None
    if overcrowded_col and overcrowded_col in work.columns:
        overcrowded_share = _safe_float(work[overcrowded_col].fillna(False).astype(int).mean()) * 100

    peak_window = "N/A"
    peak_inflow_value = 0.0

    if inflow_col and ts_col and inflow_col in work.columns:
        valid_peak = work[[ts_col]].copy()
        valid_peak["inflow_value"] = pd.to_numeric(work[inflow_col], errors="coerce")
        valid_peak = valid_peak.dropna(subset=["inflow_value"])

        if not valid_peak.empty:
            peak_idx = valid_peak["inflow_value"].idxmax()
            peak_inflow_value = _safe_float(valid_peak.at[peak_idx, "inflow_value"])
            peak_ts_raw = valid_peak.at[peak_idx, ts_col]
            peak_window = _format_peak_window(peak_ts_raw, getattr(filters, "frequency", "Hourly"))

    busiest_day = "N/A"
    if ts_col in work.columns and inflow_col and work[ts_col].notna().any():
        day_flow = (
            work.assign(_day=work[ts_col].dt.strftime("%Y-%m-%d"))
            .groupby("_day", dropna=True)[inflow_col]
            .sum()
        )
        if not day_flow.empty:
            busiest_day = str(day_flow.idxmax())

    busiest_hour_band = "N/A"
    if freq == "hourly" and ts_col in work.columns and inflow_col and work[ts_col].notna().any():
        hour_flow = work.groupby(work[ts_col].dt.hour)[inflow_col].sum()
        if not hour_flow.empty:
            peak_hour = int(hour_flow.idxmax())
            busiest_hour_band = f"{peak_hour:02d}:00 - {peak_hour:02d}:59"

    traffic_level = _classify_traffic(avg_inflow)
    density_level = _classify_density(avg_density if density_col else avg_occupancy_ratio)

    hall_value = "N/A"
    if hall_col and hall_col in work.columns:
        halls = work[hall_col].dropna().astype(str).unique().tolist()
        if halls:
            hall_value = ", ".join(halls[:3])
            if len(halls) > 3:
                hall_value += f" +{len(halls) - 3} more"
    if hall_value == "N/A":
        hall_value = ", ".join(scope.get("hall_names") or []) or "N/A"

    summary_line = (
        f"Traffic conditions around <strong> {hall_value} </strong> indicate "
        f"<strong> {traffic_level.lower()} </strong> activity relative to other halls, "
        f"with <strong> {total_inflow:,} </strong> total inflow observed and a peak at "
        f"<strong> {peak_window} </strong>."
    )

    block_summary = {
        "title": "Traffic Summary",
        "subtitle": "Key traffic indicators for the selected exhibitor scope.",
        "summary": [summary_line],
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Total Inflow", "Details": f"{total_inflow:,}"},
            {"Attribute": "Total Outflow", "Details": f"{total_outflow:,}"},
            {"Attribute": "Average Inflow per Interval", "Details": _fmt_num(avg_inflow, 2)},
            {"Attribute": "Average Outflow per Interval", "Details": _fmt_num(avg_outflow, 2)},
            {"Attribute": "Average Occupancy", "Details": _fmt_num(avg_occupancy, 2) if occupancy_col else "N/A"},
            {"Attribute": "Average Occupancy Ratio", "Details": _fmt_pct(avg_occupancy_ratio, 1) if occupancy_ratio_col else "N/A"},
            {"Attribute": "Peak Traffic Window", "Details": peak_window},
            {"Attribute": "Peak Inflow Value", "Details": _fmt_num(peak_inflow_value, 0)},
            {"Attribute": "Busiest Hour Band", "Details": busiest_hour_band},
            {"Attribute": "Busiest Day", "Details": busiest_day},
        ],
    }

    block_conditions = {
        "title": "Traffic Conditions",
        "subtitle": "Crowding and movement conditions across the selected scope.",
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Traffic Level", "Details": traffic_level},
            {"Attribute": "Density Level", "Details": density_level},
            {"Attribute": "Average Congestion Index", "Details": _fmt_num(avg_congestion, 2) if congestion_col else "N/A"},
            {"Attribute": "Queue Time", "Details": _fmt_pct(queue_share / 100.0, 1) if queue_share is not None else "N/A"},
            {"Attribute": "Overcrowded Time", "Details": _fmt_pct(overcrowded_share / 100.0, 1) if overcrowded_share is not None else "N/A"},
        ],
    }

    trend_rows: List[Dict[str, Any]] = []
    xlsx_rows: List[Dict[str, Any]] = []

    base_cols = [ts_col]
    for col in [inflow_col, outflow_col, occupancy_col, occupancy_ratio_col, density_col, congestion_col]:
        if col:
            base_cols.append(col)

    trend_df = work[base_cols].copy().sort_values(ts_col)


    rename_map = {ts_col: "Time Interval"}
    if inflow_col:
        rename_map[inflow_col] = "Inflow"
    if outflow_col:
        rename_map[outflow_col] = "Outflow"
    if occupancy_col:
        rename_map[occupancy_col] = "Current Occupancy"
    if occupancy_ratio_col:
        rename_map[occupancy_ratio_col] = "Occupancy Ratio"
    if density_col:
        rename_map[density_col] = "Density Score"
    if congestion_col:
        rename_map[congestion_col] = "Congestion Index"

    trend_df = trend_df.rename(columns=rename_map)

    if "Inflow" in trend_df.columns:
        trend_df["Inflow"] = pd.to_numeric(trend_df["Inflow"], errors="coerce").fillna(0)

    if "Outflow" in trend_df.columns:
        trend_df["Outflow"] = pd.to_numeric(trend_df["Outflow"], errors="coerce").fillna(0)
    else:
        trend_df["Outflow"] = 0

    trend_df["Net Flow"] = trend_df["Inflow"] - trend_df["Outflow"]

    xlsx_rows = [
        {str(k): v for k, v in row.items()}
        for row in trend_df.to_dict(orient="records")
    ]

    pdf_df = trend_df.copy()
    if "Time Interval" in pdf_df.columns:
        pdf_df["Time Interval"] = pdf_df["Time Interval"].apply(
            lambda x: _format_interval_label(x, getattr(filters, "frequency", "Hourly"))
        )
    else:
        pdf_df["Time Interval"] = "N/A"

    trend_rows = [
        {str(k): v for k, v in row.items()}
        for row in pdf_df.to_dict(orient="records")
    ]

    trend_columns = [
        k for k in [
            "Time Interval",
            "Inflow",
            "Outflow",
            "Net Flow",
            "Current Occupancy",
            "Occupancy Ratio",
            "Density Score",
            "Congestion Index",
        ]
        if trend_rows and k in trend_rows[0]
    ]

    top_rows: List[Dict[str, Any]] = []
    top_columns: List[str] = []

    if trend_rows:
        top_df = pd.DataFrame(trend_rows)

        if "Inflow" in top_df.columns:
            top_df["Inflow"] = pd.to_numeric(top_df["Inflow"], errors="coerce").fillna(0)
        else:
            top_df["Inflow"] = 0

        if "Outflow" in top_df.columns:
            top_df["Outflow"] = pd.to_numeric(top_df["Outflow"], errors="coerce").fillna(0)
        else:
            top_df["Outflow"] = 0

        top_df["Net Flow"] = top_df["Inflow"] - top_df["Outflow"]

        if "Occupancy Ratio" in top_df.columns:
            top_df["Occupancy Ratio"] = pd.to_numeric(top_df["Occupancy Ratio"], errors="coerce").round(2)

        if "Congestion Index" in top_df.columns:
            top_df["Congestion Index"] = pd.to_numeric(top_df["Congestion Index"], errors="coerce").round(2)

        top_df["Inflow"] = top_df["Inflow"].round(0).astype(int)
        top_df["Outflow"] = top_df["Outflow"].round(0).astype(int)
        top_df["Net Flow"] = top_df["Net Flow"].round(0).astype(int)

        top_df = top_df.sort_values("Inflow", ascending=False).head(10)

        top_rows = [
            {str(k): v for k, v in row.items()}
            for row in top_df.to_dict(orient="records")
        ]

        top_columns = [
            k for k in [
                "Time Interval",
                "Inflow",
                "Outflow",
                "Net Flow",
                "Occupancy Ratio",
                "Congestion Index",
            ]
            if k in top_df.columns
        ]

    freq_label = str(getattr(filters, "frequency", "Hourly")).strip().lower()

    if freq_label == "daily":
        top_title = "Peak Traffic Days"
    elif freq_label == "weekly":
        top_title = "Peak Traffic Weeks"
    elif freq_label == "monthly":
        top_title = "Peak Traffic Months"
    else:
        top_title = "Peak Traffic Hours"

    block_top = {
        "title": top_title,
        "subtitle": "Top-performing time intervals ranked by total inflow within the exhibitor’s hall context.",
        "columns": top_columns if top_rows else ["Attribute", "Details"],
        "table_rows": top_rows if top_rows else [
            {"Attribute": "Status", "Details": "No traffic intervals available for the selected scope."}
        ],
    }

    peak_share = (peak_inflow_value / total_inflow * 100) if total_inflow else 0

    block_insights = {
        "title": "Traffic Insights",
        "subtitle": "Key observations derived from traffic patterns.",
        "columns": ["Metric", "Value"],
        "table_rows": [
            {"Metric": "Peak Contribution (%)", "Value": f"{peak_share:.1f}%"},
            {"Metric": "Average Inflow", "Value": _fmt_num(avg_inflow, 2)},
            {"Metric": "Peak vs Average Ratio", "Value": _fmt_num(peak_inflow_value / (avg_inflow or 1), 2)},
            {"Metric": "Traffic Variability", "Value": "High" if peak_share > 5 else "Moderate"},
        ],
    }

    return {
        "key": "traffic_overview",
        "title": title,
        "subtitle": "Hall-level traffic conditions and movement patterns surrounding the exhibitor’s booth, providing relative context against other halls.",
        "blocks": [
            block_summary,
            block_conditions,
            block_top,
            block_insights,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": [
            {
                "name": "Traffic Overview",
                "columns": trend_columns,
                "rows": xlsx_rows,
            }
        ],
        "used_metrics": [
            "Occupancy Ratio",
            "Average Occupancy Ratio",
            "Congestion Index",
            "Average Congestion",
            "Net Flow",
            "Peak Traffic Window",
            "Busiest Hour Band",
            "Busiest Day",
            "Peak Contribution (%)",
            "Peak vs Average Ratio",
            "Traffic Variability",
        ],
    }