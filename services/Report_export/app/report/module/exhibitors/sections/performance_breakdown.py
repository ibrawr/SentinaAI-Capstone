from typing import Dict, Any, Optional, List
import pandas as pd

from app.report.module.exhibitors.constant import SECTION_LABELS


# =========================================================
# HELPERS
# =========================================================

def _pick_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """Return the first matching column name from candidates."""
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert any value to float."""
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _fmt_num(value: Any, decimals: int = 2) -> str:
    """Format a numeric value for PDF display."""
    try:
        v = float(value)
        if pd.isna(v):
            return "0"
        return f"{v:.{decimals}f}"
    except Exception:
        return "0"


def _fmt_pct(value: Any, decimals: int = 1) -> str:
    """Format either ratio or percentage."""
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
    """Convert to datetime and drop timezone if present."""
    s = pd.to_datetime(series, errors="coerce")
    try:
        if getattr(s.dt, "tz", None) is not None:
            return s.dt.tz_localize(None)
    except Exception:
        pass
    return s


def _normalize_series(series: pd.Series) -> pd.Series:
    """
    Min-max normalize a numeric series to 0..1.
    If constant, return 0.5 for all rows to avoid divide-by-zero.
    """
    s = pd.to_numeric(series, errors="coerce").fillna(0.0)
    s_min = float(s.min())
    s_max = float(s.max())

    if s_max == s_min:
        return pd.Series([0.5] * len(s), index=s.index)

    return (s - s_min) / (s_max - s_min)


def _scope_label(scope: Optional[Dict[str, Any]], hall_series: Optional[pd.Series] = None) -> str:
    """Build a readable hall scope label."""
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


# =========================================================
# MAIN SECTION
# =========================================================

def build_performance_breakdown_section(
    df: pd.DataFrame,
    filters,
    event_row: Optional[Dict[str, Any]] = None,
    exhibitor_row: Optional[Dict[str, Any]] = None,
    assignments_df: Optional[pd.DataFrame] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    PERFORMANCE BREAKDOWN

    IMPORTANT DESIGN CHOICE:
    - This section ALWAYS compares performance by DAY
    - It does NOT follow selected hourly/daily/weekly/monthly aggregation
    - Reason: the purpose here is day-vs-day comparison across the exhibitor's event presence
    - All insights remain hall-level context, not booth-level measurement
    """

    title = SECTION_LABELS.get("performance_breakdown", "Performance Breakdown")
    scope = scope or {}

    # =========================================================
    # BLOCK 1: EMPTY DATA / SAFE RETURN
    # =========================================================
    if df is None or df.empty:
        return {
            "key": "performance_breakdown",
            "title": title,
            "subtitle": "Daily comparative analysis could not be generated because no hall-level records were available for the selected exhibitor scope.",
            "blocks": [
                {
                    "title": "Daily Performance Summary",
                    "subtitle": "No daily comparison was possible.",
                    "summary": [
                        "No hall-level records were available to compare operating conditions across the exhibitor’s event days."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [{"Attribute": "Status", "Details": "No Data"}],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    work = df.copy()

    # =========================================================
    # BLOCK 2: COLUMN DETECTION
    # =========================================================
    ts_col = _pick_col(work, ["bucket_ts", "ts", "timestamp", "datetime"])
    hall_col = _pick_col(work, ["hall_name", "hallName"])

    inflow_col = _pick_col(work, ["inflow_count", "inflowCount", "inflow"])
    outflow_col = _pick_col(work, ["outflow_count", "outflowCount", "outflow"])
    occupancy_ratio_col = _pick_col(work, ["occupancy_ratio", "occupancyRatio"])
    congestion_col = _pick_col(work, ["flow_congestion_index", "flowCongestionIndex"])
    comfort_col = _pick_col(work, ["comfort_index", "comfortIndex"])
    engagement_col = _pick_col(work, ["engagement_truth", "engagement_score", "engagementScore"])

    if not ts_col or not inflow_col:
        return {
            "key": "performance_breakdown",
            "title": title,
            "subtitle": "Daily comparative analysis could not be generated because key hall-level metrics were missing.",
            "blocks": [
                {
                    "title": "Daily Performance Summary",
                    "subtitle": "Required inputs were not available.",
                    "summary": [
                        "This section needs at least a valid timestamp field and inflow metric to compare daily operating conditions."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [
                        {"Attribute": "Timestamp Available", "Details": "Yes" if ts_col else "No"},
                        {"Attribute": "Inflow Available", "Details": "Yes" if inflow_col else "No"},
                    ],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    # =========================================================
    # BLOCK 3: DATETIME CLEANING
    # =========================================================
    work[ts_col] = _strip_tz(work[ts_col])
    work = work.dropna(subset=[ts_col]).copy()

    if work.empty:
        return {
            "key": "performance_breakdown",
            "title": title,
            "subtitle": "Daily comparative analysis could not be generated because no valid timestamps remained after cleaning.",
            "blocks": [
                {
                    "title": "Daily Performance Summary",
                    "subtitle": "No valid daily comparison was possible.",
                    "summary": [
                        "All records were removed after timestamp cleaning, so no event-day comparison could be performed."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [{"Attribute": "Status", "Details": "No valid timestamps"}],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    # =========================================================
    # BLOCK 4: FORCE DAILY GROUPING
    # =========================================================
    work["analysis_day"] = work[ts_col].dt.strftime("%Y-%m-%d")

    agg_map: Dict[str, str] = {
        inflow_col: "sum",   # daily total inflow
    }

    if outflow_col:
        agg_map[outflow_col] = "sum"
    if occupancy_ratio_col:
        agg_map[occupancy_ratio_col] = "mean"
    if congestion_col:
        agg_map[congestion_col] = "mean"
    if comfort_col:
        agg_map[comfort_col] = "mean"
    if engagement_col:
        agg_map[engagement_col] = "mean"

    daily_df = (
        work.groupby("analysis_day", dropna=False)
        .agg(agg_map)
        .reset_index()
        .sort_values("analysis_day")
        .reset_index(drop=True)
    )

    if daily_df.empty:
        return {
            "key": "performance_breakdown",
            "title": title,
            "subtitle": "No daily comparative view could be generated for the selected hall scope.",
            "blocks": [
                {
                    "title": "Daily Performance Summary",
                    "subtitle": "No grouped daily records were available.",
                    "summary": [
                        "The report could not derive a day-level comparison from the selected hall-level dataset."
                    ],
                    "columns": ["Attribute", "Details"],
                    "table_rows": [{"Attribute": "Status", "Details": "No grouped daily records"}],
                }
            ],
            "summary": [],
            "columns": [],
            "table_rows": [],
            "xlsx_sheets": [],
        }

    # =========================================================
    # BLOCK 5: DERIVED DAILY METRICS
    # =========================================================
    # Daily outflow fallback
    if outflow_col and outflow_col in daily_df.columns:
        daily_df["daily_outflow"] = pd.to_numeric(daily_df[outflow_col], errors="coerce").fillna(0.0)
    else:
        daily_df["daily_outflow"] = 0.0

    daily_df["daily_inflow"] = pd.to_numeric(daily_df[inflow_col], errors="coerce").fillna(0.0)
    daily_df["net_flow"] = daily_df["daily_inflow"] - daily_df["daily_outflow"]

    # Flow efficiency = throughput balance
    daily_df["flow_efficiency"] = daily_df["daily_outflow"] / daily_df["daily_inflow"].replace(0, pd.NA)
    daily_df["flow_efficiency"] = pd.to_numeric(daily_df["flow_efficiency"], errors="coerce").fillna(0.0)

    # Retention = how much inflow was not immediately matched by outflow
    daily_df["retention"] = 1.0 - daily_df["flow_efficiency"]
    daily_df["retention"] = daily_df["retention"].clip(lower=-1.0, upper=1.0)

    # Occupancy / congestion / comfort / engagement safe series
    if occupancy_ratio_col and occupancy_ratio_col in daily_df.columns:
        daily_df["avg_occupancy_ratio"] = pd.to_numeric(daily_df[occupancy_ratio_col], errors="coerce").fillna(0.0)
    else:
        daily_df["avg_occupancy_ratio"] = 0.0

    if congestion_col and congestion_col in daily_df.columns:
        daily_df["avg_congestion"] = pd.to_numeric(daily_df[congestion_col], errors="coerce").fillna(0.0)
    else:
        daily_df["avg_congestion"] = 0.0

    if comfort_col and comfort_col in daily_df.columns:
        daily_df["avg_comfort"] = pd.to_numeric(daily_df[comfort_col], errors="coerce").fillna(0.0)
    else:
        daily_df["avg_comfort"] = 0.0

    if engagement_col and engagement_col in daily_df.columns:
        daily_df["avg_engagement"] = pd.to_numeric(daily_df[engagement_col], errors="coerce").fillna(0.0)
    else:
        daily_df["avg_engagement"] = 0.0

    # Pressure score = occupancy ratio × congestion
    daily_df["pressure_score"] = daily_df["avg_occupancy_ratio"] * daily_df["avg_congestion"]

    # Comfort-adjusted exposure = inflow × normalized comfort
    # comfort is assumed in a larger scale like 0-100 in your data, so divide by 100
    daily_df["comfort_adjusted_exposure"] = daily_df["daily_inflow"] * (daily_df["avg_comfort"] / 100.0)

    # Engagement efficiency = engagement per visitor exposure
    daily_df["engagement_efficiency"] = daily_df["avg_engagement"] / daily_df["daily_inflow"].replace(0, pd.NA)
    daily_df["engagement_efficiency"] = pd.to_numeric(daily_df["engagement_efficiency"], errors="coerce").fillna(0.0)

    # =========================================================
    # BLOCK 6: COMPOSITE DAILY SCORE
    # =========================================================
    norm_inflow = _normalize_series(daily_df["daily_inflow"])
    norm_engagement = _normalize_series(daily_df["avg_engagement"])
    norm_comfort = _normalize_series(daily_df["avg_comfort"])
    norm_retention = _normalize_series(daily_df["retention"])
    norm_congestion = _normalize_series(daily_df["avg_congestion"])

    # Lower congestion is better, so use (1 - normalized congestion)
    daily_df["performance_score"] = (
        0.30 * norm_inflow +
        0.20 * norm_engagement +
        0.20 * norm_comfort +
        0.15 * (1.0 - norm_congestion) +
        0.15 * norm_retention
    )

    # =========================================================
    # BLOCK 7: IDENTIFY BEST / WORST DAYS
    # =========================================================
    best_idx = daily_df["performance_score"].idxmax()
    worst_idx = daily_df["performance_score"].idxmin()

    best_day = str(daily_df.loc[best_idx, "analysis_day"])
    worst_day = str(daily_df.loc[worst_idx, "analysis_day"])

    best_score = _safe_float(daily_df.loc[best_idx, "performance_score"])
    worst_score = _safe_float(daily_df.loc[worst_idx, "performance_score"])

    best_inflow = _safe_float(daily_df.loc[best_idx, "daily_inflow"])
    best_comfort = _safe_float(daily_df.loc[best_idx, "avg_comfort"])
    best_congestion = _safe_float(daily_df.loc[best_idx, "avg_congestion"])

    worst_inflow = _safe_float(daily_df.loc[worst_idx, "daily_inflow"])
    worst_comfort = _safe_float(daily_df.loc[worst_idx, "avg_comfort"])
    worst_congestion = _safe_float(daily_df.loc[worst_idx, "avg_congestion"])

    scope_label = _scope_label(scope, work[hall_col] if hall_col else None)

    # =========================================================
    # BLOCK 8: SUMMARY NARRATIVE
    # =========================================================
    summary_lines = [
        f"The strongest day-level operating environment around <b>{scope_label}</b> was <b>{best_day}</b>, supported by higher inflow, a stronger comfort profile, and a better overall daily performance score of <b>{_fmt_num(best_score, 3)}</b>.",
        f"The weakest day was <b>{worst_day}</b>, where the surrounding hall environment recorded lower overall performance with a score of <b>{_fmt_num(worst_score, 3)}</b>.",
        f"Compared day by day, this section evaluates not only visitor volume but also how comfortably and efficiently the hall environment operated around the exhibitor’s booth."
    ]

    # =========================================================
    # BLOCK 9: PDF TABLE 1 -> DAILY COMPARISON
    # =========================================================
    comparison_rows: List[Dict[str, Any]] = []

    for _, r in daily_df.iterrows():
        comparison_rows.append({
            "Day": r["analysis_day"],
            "Total Inflow": _fmt_num(r["daily_inflow"], 0),
            "Total Outflow": _fmt_num(r["daily_outflow"], 0),
            "Net Flow": _fmt_num(r["net_flow"], 0),
            "Avg Occupancy Ratio": _fmt_pct(r["avg_occupancy_ratio"], 1),
            "Avg Congestion": _fmt_num(r["avg_congestion"], 2),
            "Avg Comfort": _fmt_num(r["avg_comfort"], 2),
            "Avg Engagement": _fmt_num(r["avg_engagement"], 2),
            "Performance Score": _fmt_num(r["performance_score"], 3),
        })

    block_daily_comparison = {
        "title": "Daily Performance Comparison",
        "subtitle": "Day-by-day comparison of the surrounding hall environment across the exhibitor’s event presence.",
        "summary": summary_lines,
        "columns": [
            "Day",
            "Total Inflow",
            "Total Outflow",
            "Net Flow",
            "Avg Occupancy Ratio",
            "Avg Congestion",
            "Avg Comfort",
            "Avg Engagement",
            "Performance Score",
        ],
        "table_rows": comparison_rows,
    }

    # =========================================================
    # BLOCK 10: PDF TABLE 2 -> DAILY DERIVED METRICS
    # =========================================================
    derived_rows: List[Dict[str, Any]] = []

    for _, r in daily_df.iterrows():
        derived_rows.append({
            "Day": r["analysis_day"],
            "Flow Efficiency": _fmt_num(r["flow_efficiency"], 3),
            "Retention": _fmt_num(r["retention"], 3),
            "Pressure Score": _fmt_num(r["pressure_score"], 3),
            "Comfort-Adjusted Exposure": _fmt_num(r["comfort_adjusted_exposure"], 2),
            "Engagement Efficiency": _fmt_num(r["engagement_efficiency"], 5),
        })

    block_derived = {
        "title": "Derived Daily Metrics",
        "subtitle": "These measures go beyond simple counts by comparing flow balance, pressure, comfort-adjusted exposure, and engagement efficiency across event days.",
        "columns": [
            "Day",
            "Flow Efficiency",
            "Retention",
            "Pressure Score",
            "Comfort-Adjusted Exposure",
            "Engagement Efficiency",
        ],
        "table_rows": derived_rows,
    }

    # =========================================================
    # BLOCK 11: PDF TABLE 3 -> BEST VS WORST DAY SUMMARY
    # =========================================================
    best_worst_rows = [
        {"Metric": "Best Day", "Value": best_day},
        {"Metric": "Best Day Score", "Value": _fmt_num(best_score, 3)},
        {"Metric": "Best Day Inflow", "Value": _fmt_num(best_inflow, 0)},
        {"Metric": "Best Day Comfort", "Value": _fmt_num(best_comfort, 2)},
        {"Metric": "Best Day Congestion", "Value": _fmt_num(best_congestion, 2)},
        {"Metric": "Weakest Day", "Value": worst_day},
        {"Metric": "Weakest Day Score", "Value": _fmt_num(worst_score, 3)},
        {"Metric": "Weakest Day Inflow", "Value": _fmt_num(worst_inflow, 0)},
        {"Metric": "Weakest Day Comfort", "Value": _fmt_num(worst_comfort, 2)},
        {"Metric": "Weakest Day Congestion", "Value": _fmt_num(worst_congestion, 2)},
    ]

    block_best_worst = {
        "title": "Best vs Weakest Day",
        "subtitle": "High-level comparison of the strongest and weakest surrounding hall conditions across the exhibitor’s active days.",
        "summary": [
            f"<b>{best_day}</b> delivered the strongest surrounding environment overall, while <b>{worst_day}</b> was the weakest day when all major daily conditions were considered together."
        ],
        "columns": ["Metric", "Value"],
        "table_rows": best_worst_rows,
    }

    # =========================================================
    # BLOCK 12: XLSX -> RAW DAILY COMPARISON ONLY
    # =========================================================
    # Keep Excel flat and useful: one analysis-ready daily table
    xlsx_rows: List[Dict[str, Any]] = []

    for _, r in daily_df.iterrows():
        xlsx_rows.append({
            "Day": r["analysis_day"],
            "Total Inflow": r["daily_inflow"],
            "Total Outflow": r["daily_outflow"],
            "Net Flow": r["net_flow"],
            "Avg Occupancy Ratio": r["avg_occupancy_ratio"],
            "Avg Congestion": r["avg_congestion"],
            "Avg Comfort": r["avg_comfort"],
            "Avg Engagement": r["avg_engagement"],
            "Flow Efficiency": r["flow_efficiency"],
            "Retention": r["retention"],
            "Pressure Score": r["pressure_score"],
            "Comfort-Adjusted Exposure": r["comfort_adjusted_exposure"],
            "Engagement Efficiency": r["engagement_efficiency"],
            "Performance Score": r["performance_score"],
        })

    xlsx_sheets = [
        {
            "name": "Performance Breakdown",
            "columns": [
                "Day",
                "Total Inflow",
                "Total Outflow",
                "Net Flow",
                "Avg Occupancy Ratio",
                "Avg Congestion",
                "Avg Comfort",
                "Avg Engagement",
                "Flow Efficiency",
                "Retention",
                "Pressure Score",
                "Comfort-Adjusted Exposure",
                "Engagement Efficiency",
                "Performance Score",
            ],
            "rows": xlsx_rows,
        }
    ]

    # =========================================================
    # BLOCK 13: FINAL RETURN
    # =========================================================
    return {
        "key": "performance_breakdown",
        "title": title,
        "subtitle": "Daily comparative analysis of the surrounding hall environment across the exhibitor’s event period. This section is fixed at day level to enable meaningful cross-day comparison, independent of the selected main aggregation level.",
        "blocks": [
            block_daily_comparison,
            block_derived,
            block_best_worst,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": xlsx_sheets,
        "used_metrics": [
            "Net Flow",
            "Average Occupancy Ratio",
            "Average Congestion",
            "Average Comfort",
            "Average Engagement",
            "Pressure Score",
            "Flow Efficiency",
            "Retention",
            "Comfort-Adjusted Exposure",
            "Engagement Efficiency",
            "Performance Score",
            "Best Day",
            "Weakest Day",
        ],
    }