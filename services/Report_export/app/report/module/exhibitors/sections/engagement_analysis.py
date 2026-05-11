from typing import Dict, Any, Optional, List
import pandas as pd

from app.report.module.exhibitors.constant import SECTION_LABELS


# =========================================================
# HELPERS
# =========================================================

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


def _fmt_num(value: Any, decimals: int = 2) -> str:
    try:
        v = float(value)
        if pd.isna(v):
            return "0"
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


def _classify_engagement(avg: float) -> str:
    if avg >= 0.75:
        return "High"
    if avg >= 0.4:
        return "Moderate"
    return "Low"


def _classify_consistency(std: float) -> str:
    if std <= 0.10:
        return "Very Stable"
    if std <= 0.20:
        return "Stable"
    if std <= 0.35:
        return "Variable"
    return "Volatile"

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

    return dt.strftime("%Y-%m-%d %H:%M")


def _format_window(ts: Any, frequency: str) -> str:
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


# =========================================================
# MAIN SECTION
# =========================================================

def build_engagement_analysis_section(
    df: pd.DataFrame,
    filters,
    event_row: Optional[Dict[str, Any]] = None,
    exhibitor_row: Optional[Dict[str, Any]] = None,
    assignments_df: Optional[pd.DataFrame] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    title = SECTION_LABELS.get("engagement_analysis", "Visitor Engagement Analysis")
    scope = scope or {}
    exhibitor_row = exhibitor_row or {}

    # =========================================================
    # EMPTY DATA HANDLING
    # =========================================================
    if df is None or df.empty:
        return {
            "key": "engagement_analysis",
            "title": title,
            "subtitle": "Hall-level engagement conditions surrounding the exhibitor’s booth.",
            "blocks": [
                {
                    "title": "Engagement Summary",
                    "subtitle": "Key engagement indicators for the selected exhibitor scope.",
                    "summary": ["No engagement data was available for the selected exhibitor scope."],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Average Engagement", "Details": "0.00"},
                        {"Attribute": "Peak Engagement Window", "Details": "N/A"},
                        {"Attribute": "Lowest Engagement Window", "Details": "N/A"},
                        {"Attribute": "Consistency", "Details": "N/A"},
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    work = df.copy()

    # =========================================================
    # COLUMN DETECTION
    # =========================================================
    ts_col = _pick_col(work, ["bucket_ts", "ts", "timestamp", "datetime"])
    engagement_col = _pick_col(work, ["engagement_truth", "engagement_score", "engagementScore"])
    inflow_col = _pick_col(work, ["inflow_count", "inflowCount"])
    occupancy_ratio_col = _pick_col(work, ["occupancy_ratio", "occupancyRatio"])
    density_col = _pick_col(work, ["density_score", "densityScore"])
    congestion_col = _pick_col(work, ["flow_congestion_index", "flowCongestionIndex"])
    hall_col = _pick_col(work, ["hall_name", "hallName"])

    if not engagement_col:
        return {
            "key": "engagement_analysis",
            "title": title,
            "subtitle": "Hall-level engagement conditions surrounding the exhibitor’s booth, providing relative context.",
            "blocks": [
                {
                    "title": "Engagement Summary",
                    "subtitle": "Key engagement indicators for the selected exhibitor scope.",
                    "summary": ["The current dataset does not include an engagement field for analysis."],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Average Engagement", "Details": "N/A"},
                        {"Attribute": "Peak Engagement Window", "Details": "N/A"},
                        {"Attribute": "Lowest Engagement Window", "Details": "N/A"},
                        {"Attribute": "Consistency", "Details": "N/A"},
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    if ts_col:
        work[ts_col] = pd.to_datetime(work[ts_col], errors="coerce")


    # =========================================================
    # LOCAL FREQUENCY AGGREGATION
    # =========================================================
    freq_label = str(getattr(filters, "frequency", "Hourly")).strip().lower()

    if ts_col and not work.empty:
        if freq_label == "hourly":
            work["_bucket"] = work[ts_col].dt.floor("h")
        elif freq_label == "daily":
            work["_bucket"] = work[ts_col].dt.floor("d")
        elif freq_label == "weekly":
            work["_bucket"] = work[ts_col].dt.to_period("W").dt.start_time
        elif freq_label == "monthly":
            work["_bucket"] = work[ts_col].dt.to_period("M").dt.start_time
        else:
            work["_bucket"] = work[ts_col]

        agg_map = {}

        if engagement_col:
            agg_map[engagement_col] = "mean"
        if inflow_col:
            agg_map[inflow_col] = "sum"
        if occupancy_ratio_col:
            agg_map[occupancy_ratio_col] = "mean"
        if density_col:
            agg_map[density_col] = "mean"
        if congestion_col:
            agg_map[congestion_col] = "mean"

        grouped = work.groupby("_bucket", dropna=True).agg(agg_map).reset_index()
        grouped = grouped.rename(columns={"_bucket": ts_col})

        if hall_col and hall_col in work.columns:
            hall_values = work[hall_col].dropna().astype(str).unique().tolist()
            if hall_values:
                grouped[hall_col] = hall_values[0]

        work = grouped

    # =========================================================
    # ENGAGEMENT SERIES
    # =========================================================
    engagement_series = pd.to_numeric(work[engagement_col], errors="coerce").dropna()

    if engagement_series.empty:
        return {
            "key": "engagement_analysis",
            "title": title,
            "subtitle": "Hall-level engagement conditions surrounding the exhibitor’s booth, providing relative context rather than booth-exclusive performance.",
            "blocks": [
                {
                    "title": "Engagement Summary",
                    "subtitle": "Key engagement indicators for the selected exhibitor scope.",
                    "summary": ["No valid engagement values were found for the selected exhibitor scope."],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Average Engagement", "Details": "N/A"},
                        {"Attribute": "Peak Engagement Window", "Details": "N/A"},
                        {"Attribute": "Lowest Engagement Window", "Details": "N/A"},
                        {"Attribute": "Consistency", "Details": "N/A"},
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    # =========================================================
    # BASIC METRICS
    # =========================================================
    avg_engagement = _safe_float(engagement_series.mean())
    std_engagement = _safe_float(engagement_series.std())
    max_engagement = _safe_float(engagement_series.max())
    min_engagement = _safe_float(engagement_series.min())
    median_engagement = _safe_float(engagement_series.median())

    engagement_level = _classify_engagement(avg_engagement)
    consistency = _classify_consistency(std_engagement)

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

        return dt.strftime("%Y-%m-%d %H:%M")


    def _format_window(ts: Any, frequency: str) -> str:
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

    # =========================================================
    # PEAK + LOWEST WINDOWS
    # =========================================================
    peak_window = "N/A"
    lowest_window = "N/A"
    peak_engagement_value = 0.0
    lowest_engagement_value = 0.0

    numeric_engagement = pd.to_numeric(work[engagement_col], errors="coerce")

    if ts_col:
        valid = work[[ts_col]].copy()
        valid["engagement"] = numeric_engagement
        valid = valid.dropna(subset=["engagement"])

        if not valid.empty:
            peak_idx = valid["engagement"].idxmax()
            low_idx = valid["engagement"].idxmin()

            peak_engagement_value = _safe_float(valid.at[peak_idx, "engagement"])
            lowest_engagement_value = _safe_float(valid.at[low_idx, "engagement"])

            peak_ts = pd.to_datetime(str(valid.at[peak_idx, ts_col]), errors="coerce")
            low_ts = pd.to_datetime(str(valid.at[low_idx, ts_col]), errors="coerce")

            if pd.notna(peak_ts):
                peak_window = _format_window(peak_ts, getattr(filters, "frequency", "Hourly"))

            if pd.notna(low_ts):
                lowest_window = _format_window(low_ts, getattr(filters, "frequency", "Hourly"))
    # =========================================================
    # DISTRIBUTION
    # =========================================================
    high_share = (engagement_series >= 0.75).mean() * 100
    moderate_share = ((engagement_series >= 0.4) & (engagement_series < 0.75)).mean() * 100
    low_share = (engagement_series < 0.4).mean() * 100

    # =========================================================
    # CONTEXT METRICS
    # =========================================================
    avg_inflow = _safe_float(pd.to_numeric(work[inflow_col], errors="coerce").mean()) if inflow_col else 0.0
    avg_occupancy_ratio = _safe_float(pd.to_numeric(work[occupancy_ratio_col], errors="coerce").mean()) if occupancy_ratio_col else 0.0
    avg_density = _safe_float(pd.to_numeric(work[density_col], errors="coerce").mean()) if density_col else 0.0
    avg_congestion = _safe_float(pd.to_numeric(work[congestion_col], errors="coerce").mean()) if congestion_col else 0.0

    # =========================================================
    # BEST DAY / HOUR
    # =========================================================
    best_day = "N/A"
    if ts_col and work[ts_col].notna().any():
        day_engagement = (
            work.assign(_day=work[ts_col].dt.strftime("%Y-%m-%d"))
            .groupby("_day", dropna=True)[engagement_col]
            .mean()
        )
        if not day_engagement.empty:
            best_day = str(day_engagement.idxmax())

    best_hour_band = "N/A"
    if ts_col and work[ts_col].notna().any():
        hour_engagement = work.groupby(work[ts_col].dt.hour)[engagement_col].mean()
        if not hour_engagement.empty:
            peak_hour = int(hour_engagement.idxmax())
            best_hour_band = f"{peak_hour:02d}:00 - {peak_hour:02d}:59"

    hall_value = "N/A"
    if hall_col:
        halls = work[hall_col].dropna().astype(str).unique().tolist()
        if halls:
            hall_value = ", ".join(halls[:3])
            if len(halls) > 3:
                hall_value += f" +{len(halls) - 3} more"
    if hall_value == "N/A":
        hall_value = ", ".join(scope.get("hall_names") or []) or "N/A"

    exhibitor_name = str(
        exhibitor_row.get("exhibitor_name")
        or exhibitor_row.get("exhibitor_id")
        or getattr(filters, "exhibitor_id", "This exhibitor")
    )

    # =========================================================
    # NARRATIVE SUMMARY (FIXED CONTEXT)
    # =========================================================
    summary_line = (
        f"Engagement conditions around <strong> {hall_value} </strong> indicate "
        f"<strong> {engagement_level.lower()} </strong> interaction quality relative to surrounding hall activity, "
        f"with an average score of <strong> {_fmt_num(avg_engagement)} </strong> and a peak observed at "
        f"<strong> {peak_window} </strong>."
    )

    # =========================================================
    # BASE TREND DATA
    # =========================================================
    trend_rows: List[Dict[str, Any]] = []
    xlsx_rows: List[Dict[str, Any]] = []

    if ts_col:
        base_cols = [ts_col, engagement_col]
        for col in [inflow_col, occupancy_ratio_col, density_col, congestion_col]:
            if col:
                base_cols.append(col)

        trend_df = work[base_cols].copy().sort_values(ts_col)

        rename_map = {
            ts_col: "Time Interval",
            engagement_col: "Engagement Score",
        }
        if inflow_col:
            rename_map[inflow_col] = "Inflow"
        if occupancy_ratio_col:
            rename_map[occupancy_ratio_col] = "Occupancy Ratio"
        if density_col:
            rename_map[density_col] = "Density Score"
        if congestion_col:
            rename_map[congestion_col] = "Congestion Index"

        trend_df = trend_df.rename(columns=rename_map)

        # excel keeps raw timestamps
        xlsx_rows = [
            {str(k): v for k, v in row.items()}
            for row in trend_df.to_dict(orient="records")
        ]

        # pdf gets formatted interval labels
        pdf_df = trend_df.copy()
        pdf_df["Time Interval"] = pdf_df["Time Interval"].apply(
            lambda x: _format_interval_label(x, getattr(filters, "frequency", "Hourly"))
        )

        trend_rows = [
            {str(k): v for k, v in row.items()}
            for row in pdf_df.to_dict(orient="records")
        ]

    # =========================================================
    # PEAK ENGAGEMENT PERIODS
    # =========================================================
    top_rows: List[Dict[str, Any]] = []
    if trend_rows and "Engagement Score" in trend_rows[0]:
        top_df = pd.DataFrame(trend_rows)

        top_df["Engagement Score"] = pd.to_numeric(
            top_df["Engagement Score"], errors="coerce"
        ).round(2)

        if "Inflow" in top_df.columns:
            top_df["Inflow"] = pd.to_numeric(
                top_df["Inflow"], errors="coerce"
            ).fillna(0).round(0).astype(int)

        if "Occupancy Ratio" in top_df.columns:
            top_df["Occupancy Ratio"] = pd.to_numeric(
                top_df["Occupancy Ratio"], errors="coerce"
            ).round(2)

        if "Congestion Index" in top_df.columns:
            top_df["Congestion Index"] = pd.to_numeric(
                top_df["Congestion Index"], errors="coerce"
            ).round(2)

        top_df = top_df.sort_values("Engagement Score", ascending=False).head(10)

        top_rows = [
            {str(k): v for k, v in row.items()}
            for row in top_df.to_dict(orient="records")
        ]

    top_columns = [k for k in [
        "Time Interval",
        "Engagement Score",
        "Inflow",
        "Occupancy Ratio",
        "Congestion Index",
    ] if top_rows and k in top_rows[0]]

    # =========================================================
    # CALCULATED INSIGHTS
    # =========================================================
    peak_share = (peak_engagement_value / avg_engagement) if avg_engagement else 0.0
    engagement_range = max_engagement - min_engagement

    block_summary = {
        "title": "Engagement Summary",
        "subtitle": "Key engagement indicators for the selected exhibitor scope.",
        "summary": [summary_line],
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Average Engagement", "Details": _fmt_num(avg_engagement)},
            {"Attribute": "Median Engagement", "Details": _fmt_num(median_engagement)},
            {"Attribute": "Max Engagement", "Details": _fmt_num(max_engagement)},
            {"Attribute": "Min Engagement", "Details": _fmt_num(min_engagement)},
            {"Attribute": "Engagement Level", "Details": engagement_level},
            {"Attribute": "Consistency", "Details": consistency},
            {"Attribute": "Peak Engagement Window", "Details": peak_window},
            {"Attribute": "Lowest Engagement Window", "Details": lowest_window},
            {"Attribute": "Best Hour Band", "Details": best_hour_band},
            {"Attribute": "Best Day", "Details": best_day},
        ],
    }

    block_distribution = {
        "title": "Engagement Distribution",
        "subtitle": "Distribution of higher and lower engagement intervals across the scoped hall context.",
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "High Engagement Time", "Details": _fmt_pct(high_share / 100.0)},
            {"Attribute": "Moderate Engagement Time", "Details": _fmt_pct(moderate_share / 100.0)},
            {"Attribute": "Low Engagement Time", "Details": _fmt_pct(low_share / 100.0)},
            {"Attribute": "Average Inflow", "Details": _fmt_num(avg_inflow) if inflow_col else "N/A"},
            {"Attribute": "Average Occupancy Ratio", "Details": _fmt_pct(avg_occupancy_ratio) if occupancy_ratio_col else "N/A"},
            {"Attribute": "Average Density Score", "Details": _fmt_num(avg_density) if density_col else "N/A"},
            {"Attribute": "Average Congestion Index", "Details": _fmt_num(avg_congestion) if congestion_col else "N/A"},
        ],
    }

    if freq_label == "daily":
        top_title = "Peak Engagement Days"
    elif freq_label == "weekly":
        top_title = "Peak Engagement Weeks"
    elif freq_label == "monthly":
        top_title = "Peak Engagement Months"
    else:
        top_title = "Peak Engagement Hours"

    block_top = {
        "title": "Peak Engagement Periods",
        "subtitle": "Time intervals with the highest engagement observed around the exhibitor’s hall (relative context).",
        "columns": top_columns,
        "table_rows": top_rows,
    }

    block_insights = {
        "title": "Engagement Insights",
        "subtitle": "Key observations derived from engagement patterns.",
        "columns": ["Metric", "Value"],
        "table_rows": [
            {"Metric": "Peak vs Average Ratio", "Value": _fmt_num(peak_share)},
            {"Metric": "Engagement Range", "Value": _fmt_num(engagement_range)},
            {"Metric": "Consistency Profile", "Value": consistency},
            {"Metric": "Engagement Variability", "Value": "High" if engagement_range > 0.40 else "Moderate"},
        ],
    }

    # =========================================================
    # RETURN
    # =========================================================
    return {
        "key": "engagement_analysis",
        "title": title,
        "subtitle": "Hall-level engagement conditions surrounding the exhibitor’s booth, providing relative context rather than booth-exclusive performance.",
        "blocks": [
            block_summary,
            block_distribution,
            block_top,
            block_insights,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": [
            {
                "name": "Engagement Analysis",
                "columns": [k for k in [
                    "Time Interval",
                    "Engagement Score",
                    "Inflow",
                    "Occupancy Ratio",
                    "Density Score",
                    "Congestion Index",
                ] if trend_rows and k in trend_rows[0]],
                "rows": trend_rows,
            }
        ],
        "used_metrics": [
            "Occupancy Ratio",
            "Average Occupancy Ratio",
            "Congestion Index",
            "Average Congestion",
            "Comfort",
            "Average Comfort",
            "Average Engagement",
            "Best Day",
            "Weakest Day",
            "Best Hour Band",
        ],
    }