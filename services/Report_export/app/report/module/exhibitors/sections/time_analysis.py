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


def _fmt_num(value: Any, decimals: int = 1) -> str:
    try:
        v = float(value)
        if pd.isna(v):
            return "0"
        return f"{v:.{decimals}f}"
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


def _strip_tz(series: pd.Series) -> pd.Series:
    s = pd.to_datetime(series, errors="coerce")
    try:
        if getattr(s.dt, "tz", None) is not None:
            return s.dt.tz_localize(None)
    except Exception:
        pass
    return s


def _format_hour_band(hour_value: Any) -> str:
    try:
        h = int(hour_value)
        return f"{h:02d}:00 - {h:02d}:59"
    except Exception:
        return "N/A"


def _format_period_label(value: Any, frequency: str) -> str:
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        return "N/A"

    freq = (frequency or "hourly").strip().lower()

    if freq == "daily":
        return ts.strftime("%Y-%m-%d")

    if freq == "weekly":
        start = ts
        end = start + pd.Timedelta(days=6)
        return f"{start.strftime('%Y-%m-%d')} to {end.strftime('%Y-%m-%d')}"

    if freq == "monthly":
        return ts.strftime("%Y-%m")

    end = ts + pd.Timedelta(hours=1)
    return f"{ts.strftime('%Y-%m-%d %H:%M')} to {end.strftime('%H:%M')}"


def _build_scope_label(
    scope: Optional[Dict[str, Any]],
    hall_series: Optional[pd.Series] = None,
) -> str:
    """Create a readable hall-scope label."""
    scope = scope or {}

    hall_names = scope.get("hall_names") or []
    hall_ids = scope.get("hall_ids") or []

    if hall_names:
        if len(hall_names) == 1:
            return str(hall_names[0])
        return f"{len(hall_names)} selected halls"

    if hall_ids:
        if len(hall_ids) == 1:
            return f"hall {hall_ids[0]}"
        return f"{len(hall_ids)} selected halls"

    if hall_series is not None:
        vals = [str(v).strip() for v in hall_series.dropna().tolist() if str(v).strip()]
        uniq = list(dict.fromkeys(vals))
        if len(uniq) == 1:
            return uniq[0]
        if len(uniq) > 1:
            return f"{len(uniq)} halls"

    return "the selected hall scope"


def _get_frequency(filters: Any) -> str:
    raw = getattr(filters, "frequency", "Hourly")
    freq = str(raw or "Hourly").strip().lower()
    if freq not in {"hourly", "daily", "weekly", "monthly"}:
        return "hourly"
    return freq


# =========================================================
# MAIN SECTION
# =========================================================

def build_time_analysis_section(
    df: pd.DataFrame,
    filters,
    event_row: Optional[Dict[str, Any]] = None,
    exhibitor_row: Optional[Dict[str, Any]] = None,
    assignments_df: Optional[pd.DataFrame] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Operating Environment Analysis

    IMPORTANT DESIGN:
    1. Primary Analysis -> uses selected aggregation (hourly/daily/weekly/monthly)
    2. Day Pattern      -> always included
    3. Hour Pattern     -> always included

    This is intentionally framed as HALL-WISE environment analysis around the booth,
    not direct booth-level measurement.
    """

    title = "Operating Environment Analysis"
    scope = scope or {}

    # =========================================================
    # SECTION 1: EMPTY / INVALID DATA HANDLING
    # =========================================================
    if df is None or df.empty:
        return {
            "key": "time_analysis",
            "title": title,
            "subtitle": "No hall-level activity data was available for the selected exhibitor scope.",
            "blocks": [
                {
                    "title": "Environment Summary",
                    "subtitle": "No operating-environment data could be evaluated.",
                    "summary": [
                        "No hall-level records were available to analyse the operating environment surrounding the exhibitor’s booth."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Status", "Details": "No Data"}
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
    # SECTION 2: COLUMN DETECTION
    # =========================================================
    ts_col = _pick_col(work, ["bucket_ts", "ts", "timestamp", "datetime"])
    hall_col = _pick_col(work, ["hall_name", "hallName"])

    inflow_col = _pick_col(work, ["inflow_count", "inflowCount", "inflow"])
    outflow_col = _pick_col(work, ["outflow_count", "outflowCount", "outflow"])
    occupancy_ratio_col = _pick_col(work, ["occupancy_ratio", "occupancyRatio"])
    congestion_col = _pick_col(work, ["flow_congestion_index", "flowCongestionIndex"])
    comfort_col = _pick_col(work, ["comfort_index", "comfortIndex"])
    engagement_col = _pick_col(work, ["engagement_truth", "engagement_score", "engagementScore"])

    if not ts_col:
        return {
            "key": "time_analysis",
            "title": title,
            "subtitle": "Time-based hall analysis could not be generated because of invalid timestamp.",
            "blocks": [
                {
                    "title": "Environment Summary",
                    "subtitle": "Timestamp information is required to evaluate operating patterns over time.",
                    "summary": [
                        "This section could not be generated because no usable timestamp column was found in the selected hall-level."
                    ],
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

    if inflow_col is None:
        return {
            "key": "time_analysis",
            "title": title,
            "subtitle": "Time-based hall analysis could not be generated because inflow data is missing.",
            "blocks": [
                {
                    "title": "Environment Summary",
                    "subtitle": "Visitor movement is required for operating-environment analysis.",
                    "summary": [
                        "This section could not be generated because no inflow metric was found in the selected hall-level."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Status", "Details": "Inflow metric missing"}
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    # =========================================================
    # SECTION 3: DATETIME CLEANING + BASIC TIME FEATURES
    # =========================================================
    work[ts_col] = _strip_tz(work[ts_col])
    work = work.dropna(subset=[ts_col]).copy()

    if work.empty:
        return {
            "key": "time_analysis",
            "title": title,
            "subtitle": "No valid timestamps remained after cleaning the selected hall-level dataset.",
            "blocks": [
                {
                    "title": "Environment Summary",
                    "subtitle": "Datetime cleanup removed all usable records.",
                    "summary": [
                        "No valid time records remained after cleaning, so operating-environment patterns could not be evaluated."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Status", "Details": "No valid timestamps after cleaning"}
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    frequency = _get_frequency(filters)

    work["analysis_day"] = work[ts_col].dt.day_name()
    work["analysis_hour"] = work[ts_col].dt.hour

    # =========================================================
    # SECTION 4: PRIMARY ANALYSIS -> USES SELECTED AGGREGATION
    # =========================================================
    if frequency == "hourly":
        work["analysis_period"] = work[ts_col].dt.floor("h")
    elif frequency == "daily":
        work["analysis_period"] = work[ts_col].dt.floor("d")
    elif frequency == "weekly":
        work["analysis_period"] = work[ts_col].dt.to_period("W").apply(lambda p: p.start_time)
    elif frequency == "monthly":
        work["analysis_period"] = work[ts_col].dt.to_period("M").apply(lambda p: p.start_time)
    else:
        work["analysis_period"] = work[ts_col].dt.floor("h")

    agg_map: Dict[str, str] = {inflow_col: "mean"}

    if outflow_col:
        agg_map[outflow_col] = "mean"
    if occupancy_ratio_col:
        agg_map[occupancy_ratio_col] = "mean"
    if congestion_col:
        agg_map[congestion_col] = "mean"
    if comfort_col:
        agg_map[comfort_col] = "mean"
    if engagement_col:
        agg_map[engagement_col] = "mean"

    primary_df = (
        work.groupby("analysis_period", dropna=False)
        .agg(agg_map)
        .reset_index()
        .sort_values("analysis_period")
        .reset_index(drop=True)
    )

    primary_df["Period"] = primary_df["analysis_period"].apply(
        lambda x: _format_period_label(x, frequency)
    )

    # =========================================================
    # SECTION 5: DAY PATTERN -> ALWAYS INCLUDED
    # =========================================================
    day_df = (
        work.groupby("analysis_day", dropna=False)
        .agg({inflow_col: "mean"})
        .reset_index()
    )

    day_order = [
        "Monday", "Tuesday", "Wednesday", "Thursday",
        "Friday", "Saturday", "Sunday"
    ]
    day_df["sort_key"] = day_df["analysis_day"].apply(
        lambda x: day_order.index(x) if x in day_order else 999
    )
    day_df = day_df.sort_values("sort_key").reset_index(drop=True)

    # =========================================================
    # SECTION 6: HOUR PATTERN -> ALWAYS INCLUDED
    # =========================================================
    hour_df = (
        work.groupby("analysis_hour", dropna=False)
        .agg({inflow_col: "mean"})
        .reset_index()
        .sort_values("analysis_hour")
        .reset_index(drop=True)
    )

    # =========================================================
    # SECTION 7: BEST / WORST WINDOWS FROM PRIMARY ANALYSIS
    # =========================================================
    best_period_label = "N/A"
    weakest_period_label = "N/A"
    best_period_value = 0.0
    weakest_period_value = 0.0

    if not primary_df.empty:
        best_idx = primary_df[inflow_col].idxmax()
        weak_idx = primary_df[inflow_col].idxmin()

        if best_idx in primary_df.index:
            best_period_label = str(primary_df.loc[best_idx, "Period"])
            best_period_value = _safe_float(primary_df.loc[best_idx, inflow_col])

        if weak_idx in primary_df.index:
            weakest_period_label = str(primary_df.loc[weak_idx, "Period"])
            weakest_period_value = _safe_float(primary_df.loc[weak_idx, inflow_col])

    best_day = "N/A"
    best_day_value = 0.0
    weakest_day = "N/A"
    weakest_day_value = 0.0

    if not day_df.empty:
        best_day_idx = day_df[inflow_col].idxmax()
        weak_day_idx = day_df[inflow_col].idxmin()

        if best_day_idx in day_df.index:
            best_day = str(day_df.loc[best_day_idx, "analysis_day"])
            best_day_value = _safe_float(day_df.loc[best_day_idx, inflow_col])

        if weak_day_idx in day_df.index:
            weakest_day = str(day_df.loc[weak_day_idx, "analysis_day"])
            weakest_day_value = _safe_float(day_df.loc[weak_day_idx, inflow_col])

    best_hour_band = "N/A"
    best_hour_value = 0.0
    weakest_hour_band = "N/A"
    weakest_hour_value = 0.0

    if not hour_df.empty:
        best_hour_idx = hour_df[inflow_col].idxmax()
        weak_hour_idx = hour_df[inflow_col].idxmin()

        if best_hour_idx in hour_df.index:
            best_hour_band = _format_hour_band(hour_df.loc[best_hour_idx, "analysis_hour"])
            best_hour_value = _safe_float(hour_df.loc[best_hour_idx, inflow_col])

        if weak_hour_idx in hour_df.index:
            weakest_hour_band = _format_hour_band(hour_df.loc[weak_hour_idx, "analysis_hour"])
            weakest_hour_value = _safe_float(hour_df.loc[weak_hour_idx, inflow_col])

    # =========================================================
    # SECTION 8: CONTEXT METRICS
    # =========================================================
    avg_inflow = _safe_float(work[inflow_col].mean())
    avg_outflow = _safe_float(work[outflow_col].mean()) if outflow_col else 0.0
    avg_occupancy_ratio = _safe_float(work[occupancy_ratio_col].mean()) if occupancy_ratio_col else 0.0
    avg_congestion = _safe_float(work[congestion_col].mean()) if congestion_col else 0.0
    avg_comfort = _safe_float(work[comfort_col].mean()) if comfort_col else 0.0
    avg_engagement = _safe_float(work[engagement_col].mean()) if engagement_col else 0.0

    scope_label = _build_scope_label(scope, work[hall_col] if hall_col else None)

    # =========================================================
    # SECTION 9: INTELLIGENT TITLE/SUBTITLE/SUMMARY
    # =========================================================
    frequency_label_map = {
        "hourly": "hour-level",
        "daily": "day-level",
        "weekly": "week-level",
        "monthly": "month-level",
    }
    frequency_label = frequency_label_map.get(frequency, "time-based")

    subtitle = (
        f"Hall-level activity patterns representing the operating environment surrounding the exhibitor’s booth "
        f"for {scope_label}. The primary analysis is shown at {frequency_label} aggregation, while day and hour "
        f"patterns are included as supporting context."
    )

    summary_lines = [
        f"The strongest surrounding hall activity was observed during <b> {best_period_label} </b>, where average inflow reached <b>{_fmt_num(best_period_value, 1)}</b>. This represents the highest potential visitor exposure window for the exhibitor.",
        f"The weakest surrounding activity was observed during <b> {weakest_period_label} </b>, where inflow fell to <b>{_fmt_num(weakest_period_value, 1)}</b>, indicating a comparatively quieter operating environment.",
        f"Across recurring patterns, <b> {best_day} </b> showed the strongest average hall movement, while the peak hour band was <b>{best_hour_band}</b>, helping identify when the surrounding hall environment is typically most favorable."
    ]

    # =========================================================
    # SECTION 10: BLOCK 1 -> PRIMARY ANALYSIS (USES AGGREGATION)
    # =========================================================
    primary_rows: List[Dict[str, Any]] = []
    for _, r in primary_df.iterrows():
        row: Dict[str, Any] = {
            "Period": str(r["Period"]),
            "Average Inflow": _fmt_num(r[inflow_col], 1),
        }
        if outflow_col:
            row["Average Outflow"] = _fmt_num(r[outflow_col], 1)
        if occupancy_ratio_col:
            row["Occupancy Ratio"] = _fmt_pct(r[occupancy_ratio_col], 1)
        if congestion_col:
            row["Congestion"] = _fmt_num(r[congestion_col], 2)
        if comfort_col:
            row["Comfort"] = _fmt_num(r[comfort_col], 2)
        if engagement_col:
            row["Engagement"] = _fmt_num(r[engagement_col], 2)
        primary_rows.append(row)

    primary_columns = list(primary_rows[0].keys()) if primary_rows else ["Period", "Average Inflow"]

    block_primary = {
        "title": "Primary Time-Based Analysis",
        "subtitle": f"Main operating-environment view using the selected {frequency} aggregation level.",
        "summary": summary_lines,
        "columns": primary_columns,
        "table_rows": primary_rows,
    }

    # =========================================================
    # SECTION 11: BLOCK 2 -> DAY PATTERN (ALWAYS INCLUDED)
    # =========================================================
    day_rows: List[Dict[str, Any]] = []
    for _, r in day_df.iterrows():
        day_rows.append(
            {
                "Day": str(r["analysis_day"]),
                "Average Inflow": _fmt_num(r[inflow_col], 1),
            }
        )

    block_day = {
        "title": "Day Pattern",
        "subtitle": f"This breakdown shows which days typically provide stronger or weaker surrounding hall activity for the exhibitor, independent of the selected main aggregation level.",
        "columns": ["Day", "Average Inflow"],
        "table_rows": day_rows,
    }

    # =========================================================
    # SECTION 12: BLOCK 3 -> HOUR PATTERN (ALWAYS INCLUDED)
    # =========================================================
    hour_rows: List[Dict[str, Any]] = []
    for _, r in hour_df.iterrows():
        hour_rows.append(
            {
                "Hour Band": _format_hour_band(r["analysis_hour"]),
                "Average Inflow": _fmt_num(r[inflow_col], 1),
            }
        )

    block_hour = {
        "title": "Hour Pattern",
        "subtitle":f"This view highlights when the surrounding hall environment is usually busiest during the day, helping identify the most favorable exposure windows even when the primary analysis is grouped daily, weekly, or monthly." ,
        "columns": ["Hour Band", "Average Inflow"],
        "table_rows": hour_rows,
    }

    # =========================================================
    # SECTION 13: BLOCK 4 -> CONTEXT METRICS
    # =========================================================
    context_rows: List[Dict[str, Any]] = [
        {"Metric": "Average Inflow", "Value": _fmt_num(avg_inflow, 1)},
        {"Metric": "Average Outflow", "Value": _fmt_num(avg_outflow, 1)},
        {"Metric": "Average Occupancy Ratio", "Value": _fmt_pct(avg_occupancy_ratio, 1)},
        {"Metric": "Average Congestion", "Value": _fmt_num(avg_congestion, 2)},
        {"Metric": "Average Comfort", "Value": _fmt_num(avg_comfort, 2)},
        {"Metric": "Average Engagement", "Value": _fmt_num(avg_engagement, 2)},
        {"Metric": "Best Day", "Value": best_day},
        {"Metric": "Weakest Day", "Value": weakest_day},
        {"Metric": "Best Hour Band", "Value": best_hour_band},
        {"Metric": "Weakest Hour Band", "Value": weakest_hour_band},
    ]

    block_context = {
        "title": "Hall Conditions During Operation",
        "subtitle":f"These metrics provide environmental context for the exhibitor by describing surrounding visitor movement and general hall conditions.",
        "columns": ["Metric", "Value"],
        "table_rows": context_rows,
    }

    # =========================================================
    # SECTION 14: XLSX SHEETS
    # =========================================================

    operating_env_rows: List[Dict[str, Any]] = []

    raw_df = work.copy().sort_values(ts_col).reset_index(drop=True)

    for _, r in raw_df.iterrows():
        ts_value = pd.to_datetime(r[ts_col], errors="coerce")

        operating_env_rows.append({
            "Time Interval": ts_value.strftime("%Y-%m-%d %H:%M") if pd.notna(ts_value) else "",
            "Date": ts_value.strftime("%Y-%m-%d") if pd.notna(ts_value) else "",
            "Hour": ts_value.strftime("%H:%M") if pd.notna(ts_value) else "",
            "Inflow": r[inflow_col] if inflow_col else "",
            "Outflow": r[outflow_col] if outflow_col else "",
            "Occupancy Ratio": r[occupancy_ratio_col] if occupancy_ratio_col else "",
            "Congestion": r[congestion_col] if congestion_col else "",
            "Comfort": r[comfort_col] if comfort_col else "",
            "Engagement": r[engagement_col] if engagement_col else "",
        })

    xlsx_sheets = [
        {
            "name": "Operating Environment Analysis",
            "columns": [
                "Time Interval",
                "Date",
                "Hour",
                "Inflow",
                "Outflow",
                "Occupancy Ratio",
                "Congestion",
                "Comfort",
                "Engagement",
            ],
            "rows": operating_env_rows,
        }
    ]
    # =========================================================
    # SECTION 15: FINAL RETURN
    # =========================================================
    return {
        "key": "time_analysis",
        "title": title,
        "subtitle": subtitle,
        "blocks": [
            block_primary,
            block_day,
            block_hour,
            block_context,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": xlsx_sheets,
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