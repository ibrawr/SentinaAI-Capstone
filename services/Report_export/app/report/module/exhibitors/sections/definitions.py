from typing import Dict, Any, List, Optional

from app.report.module.exhibitors.constant import SECTION_LABELS

# =========================================================
# MASTER METRIC CATALOG
# =========================================================
# Single source of truth for:
# - definition
# - formula
# - interpretation
# This keeps PDF + XLSX aligned and makes the definitions

# =========================================================


DEFINITION_CATALOG: Dict[str, Dict[str, str]] = {
    "Occupancy Ratio": {
        "definition": "Relative occupancy level of the hall compared to capacity.",
        "formula": "current_occupancy / reference_capacity",
        "interpretation": "Higher values indicate fuller hall utilization.",
    },
    "Average Occupancy Ratio": {
        "definition": "Mean occupancy ratio across selected intervals.",
        "formula": "mean(occupancy_ratio)",
        "interpretation": "Represents typical utilization level of the hall environment.",
    },
    "Density Score": {
        "definition": "Normalized crowd concentration indicator.",
        "formula": "Derived from crowd density model",
        "interpretation": "Higher values indicate tighter crowd concentration.",
    },
    "Congestion Index": {
        "definition": "Measure of crowd movement pressure at an interval level.",
        "formula": "Derived from flow + density conditions",
        "interpretation": "Higher values indicate restricted movement.",
    },
    "Average Congestion": {
        "definition": "Mean congestion index across the selected scope.",
        "formula": "mean(congestion_index)",
        "interpretation": "Represents typical movement pressure over time.",
    },
    "Comfort": {
        "definition": "Environmental comfort score within the hall.",
        "formula": "Derived comfort index",
        "interpretation": "Higher values indicate better visitor conditions.",
    },
    "Average Comfort": {
        "definition": "Mean comfort score across the selected time range.",
        "formula": "mean(comfort_index)",
        "interpretation": "Used to compare environmental quality across intervals or days.",
    },
    "Engagement Score": {
        "definition": "Interaction intensity within the hall environment.",
        "formula": "Derived engagement model",
        "interpretation": "Higher values indicate stronger interaction activity.",
    },
    "Average Engagement": {
        "definition": "Mean engagement score across the selected scope.",
        "formula": "mean(engagement_score)",
        "interpretation": "Represents typical engagement conditions around the exhibitor.",
    },
    "Median Engagement": {
        "definition": "Middle engagement value across sorted interval scores.",
        "formula": "median(engagement_score)",
        "interpretation": "Less sensitive to spikes than the mean.",
    },
    "Max Engagement": {
        "definition": "Highest engagement score observed in any interval.",
        "formula": "max(engagement_score)",
        "interpretation": "Represents the strongest single-interval interaction condition.",
    },
    "Min Engagement": {
        "definition": "Lowest engagement score observed in any interval.",
        "formula": "min(engagement_score)",
        "interpretation": "Represents the weakest single-interval interaction condition.",
    },
    "Net Flow": {
        "definition": "Net change in visitor movement after accounting for inflow and outflow.",
        "formula": "Total Inflow - Total Outflow",
        "interpretation": "Positive values indicate accumulation of visitors, while negative values indicate dispersal.",
    },
    "Peak Traffic Window": {
        "definition": "The interval in which inflow reaches its highest observed value.",
        "formula": "argmax(inflow_count)",
        "interpretation": "Identifies the strongest visitor exposure window.",
    },
    "Peak Engagement Window": {
        "definition": "The interval in which engagement reaches its highest observed value.",
        "formula": "argmax(engagement_score)",
        "interpretation": "Identifies the strongest interaction-quality window.",
    },
    "Lowest Engagement Window": {
        "definition": "The interval in which engagement reaches its lowest observed value.",
        "formula": "argmin(engagement_score)",
        "interpretation": "Identifies the weakest interaction-quality window.",
    },
    "Busiest Hour Band": {
        "definition": "The hour-of-day band with the highest average inflow across the selected period.",
        "formula": "argmax(mean(inflow_count by hour))",
        "interpretation": "Helps identify the time of day with the strongest recurring visitor activity.",
    },
    "Best Hour Band": {
        "definition": "The hour-of-day band with the strongest recurring hall conditions.",
        "formula": "argmax(mean(target_metric by hour))",
        "interpretation": "Used to identify the most favorable recurring operating window.",
    },
    "Busiest Day": {
        "definition": "The calendar day with the highest aggregated inflow.",
        "formula": "argmax(sum(inflow_count by day))",
        "interpretation": "Identifies the strongest event day for visitor exposure.",
    },
    "Best Day": {
        "definition": "The day with the strongest average engagement or strongest comparative operating conditions.",
        "formula": "argmax(mean(target_metric by day)) or argmax(composite day score)",
        "interpretation": "Indicates which event day provided the strongest surrounding hall environment.",
    },
    "Weakest Day": {
        "definition": "The day with the weakest comparative operating conditions.",
        "formula": "argmin(composite day score)",
        "interpretation": "Indicates which event day performed least favorably overall.",
    },
    "Peak Contribution (%)": {
        "definition": "Share of total inflow contributed by the peak interval or peak aggregated period.",
        "formula": "Peak Inflow Value / Total Inflow × 100",
        "interpretation": "Higher values indicate more concentration of traffic in a small number of intervals.",
    },
    "Peak vs Average Ratio": {
        "definition": "Comparison of peak activity to typical levels.",
        "formula": "Peak Value / Average Value",
        "interpretation": "Higher values indicate spiky traffic or engagement behavior.",
    },
    "Engagement Range": {
        "definition": "Spread between highest and lowest engagement score.",
        "formula": "Max Engagement - Min Engagement",
        "interpretation": "Larger ranges indicate more variation in interaction quality.",
    },
    "Consistency": {
        "definition": "Stability of engagement over time.",
        "formula": "Derived from engagement variance",
        "interpretation": "Higher consistency indicates stable interaction levels.",
    },
    "Traffic Variability": {
        "definition": "Consistency of visitor flow over time.",
        "formula": "Derived from variability measures",
        "interpretation": "High variability indicates uneven traffic distribution.",
    },
    "Pressure Score": {
        "definition": "Combined crowd pressure indicator.",
        "formula": "Occupancy Ratio × Congestion Index",
        "interpretation": "Higher values indicate crowded and constrained conditions.",
    },
    "Flow Efficiency": {
        "definition": "Balance between incoming and outgoing movement.",
        "formula": "Total Outflow / Total Inflow",
        "interpretation": "Higher values indicate smoother movement through the hall.",
    },
    "Retention": {
        "definition": "Proportion of visitors remaining within the hall.",
        "formula": "1 - Flow Efficiency",
        "interpretation": "Higher values indicate visitor accumulation.",
    },
    "Comfort-Adjusted Exposure": {
        "definition": "Exposure weighted by comfort quality.",
        "formula": "Total Inflow × (Comfort / 100)",
        "interpretation": "Rewards high traffic under good conditions.",
    },
    "Engagement Efficiency": {
        "definition": "Engagement achieved relative to visitor volume.",
        "formula": "Engagement / Inflow",
        "interpretation": "Measures how effectively traffic converts to interaction.",
    },
    "Performance Score": {
        "definition": "Composite daily performance metric.",
        "formula": "Weighted normalized score (flow + comfort + congestion + engagement)",
        "interpretation": "Used to compare overall day-level performance.",
    },
}

# =========================================================
# HELPERS
# =========================================================



def _resolve_active_metrics(used_metrics: List[str]) -> List[Dict[str, str]]:
    """
    Resolve the active metric rows based on which sections are included.
    Keeps order stable and removes duplicates.
    """
    used_metrics = list(dict.fromkeys(used_metrics))

    rows: List[Dict[str, str]] = []
    for metric_name in used_metrics:
        meta = DEFINITION_CATALOG.get(metric_name)
        if not meta:
            continue

        rows.append({
            "Metric": metric_name,
            "Definition": meta["definition"],
            "Formula / Logic": meta["formula"],
            "Interpretation": meta["interpretation"],
        })

    return rows


def _build_pdf_definition_rows(active_metrics: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return [
        {
            "Metric": r["Metric"],
            "Definition": r["Definition"],
            "Interpretation": r["Interpretation"],
        }
        for r in active_metrics
    ]


def _build_pdf_calculation_rows(active_metrics: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Keep only non-obvious calculations in the PDF calculation table.
    """
    keep_metrics = {
        "Net Flow",
        "Peak Contribution (%)",
        "Peak vs Average Ratio",
        "Pressure Score",
        "Flow Efficiency",
        "Retention",
        "Comfort-Adjusted Exposure",
        "Engagement Efficiency",
        "Performance Score",
        "Occupancy Ratio",
        "Average Occupancy Ratio",
    }

    return [
        {
            "Metric": r["Metric"],
            "Formula / Logic": r["Formula / Logic"],
        }
        for r in active_metrics
        if r["Metric"] in keep_metrics
    ]


# =========================================================
# MAIN SECTION
# =========================================================
def build_definitions_section(
    filters: Optional[Any] = None,
    used_metrics: Optional[List[str]] = None,
) -> Dict[str, Any]:
    title = SECTION_LABELS.get("definitions", "Definitions and Calculation Logic")
    used_metrics = used_metrics or []

    active_metrics = _resolve_active_metrics(used_metrics)

    if not active_metrics:
        fallback_names = [
            "Occupancy Ratio",
            "Congestion Index",
            "Comfort",
            "Engagement Score",
            "Pressure Score",
            "Flow Efficiency",
            "Retention",
            "Performance Score",
        ]
        active_metrics = _resolve_active_metrics(fallback_names)

    block_scope = {
        "title": "Scope and Interpretation Notes",
        "summary": [
            "All analytics in this report are derived from <strong> hall-level activity patterns </strong> surrounding the exhibitor’s booth.",
            "These metrics describe the <strong> operating environment </strong>, including visitor movement, crowd pressure, comfort, congestion, and engagement conditions.",
            "They should be interpreted as <strong> contextual exposure and indicators </strong>, rather than direct booth-exclusive measurements.",
            "Most sections follow the selected aggregation level; however, <strong> Performance Breakdown is fixed at daily level </strong> to enable meaningful comparison across event days.",
        ],
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {
                "Attribute": "Analytical Scope",
                "Details": "Hall-level operating environment surrounding the exhibitor's booth",
            },
            {
                "Attribute": "Primary Use",
                "Details": "Exposure, engagement, and performance context",
            },
            {
                "Attribute": "Booth Limitation",
                "Details": "Not direct booth-level measurement",
            },
            {
                "Attribute": "Aggregation Behavior",
                "Details": "Mixed (user-selected + fixed daily comparison)",
            },
        ],
    }

    block_metric_definitions = {
        "title": "Metric Definitions",
        "subtitle": "Definitions and interpretation of key metrics.",
        "columns": ["Metric", "Definition", "Interpretation"],
        "table_rows": _build_pdf_definition_rows(active_metrics),
    }

    block_calculation_logic = {
        "title": "Calculation Logic",
        "subtitle": "How key derived metrics are calculated.",
        "columns": ["Metric", "Formula / Logic"],
        "table_rows": _build_pdf_calculation_rows(active_metrics),
    }

    xlsx_sheets = [
        {
            "name": "Definitions",
            "columns": ["Metric", "Definition", "Formula / Logic", "Interpretation"],
            "rows": active_metrics,
        }
    ]

    return {
        "key": "definitions",
        "title": title,
        "subtitle": "Definitions and calculation logic for key exhibitor report metrics.",
        "blocks": [
            block_scope,
            block_metric_definitions,
            block_calculation_logic,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": xlsx_sheets,
    }