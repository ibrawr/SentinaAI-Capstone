from typing import Dict, Any
from app.report.module.operations.constant import SECTION_LABELS


# =========================================================
# MASTER METRIC CATALOG
# =========================================================
DEFINITION_CATALOG = {
    "Operational Stress Index": {
        "definition": "Composite metric measuring operational pressure using occupancy, event presence, and crowd discomfort.",
        "formula": "0.6 × Occupancy Ratio + 0.2 × Event Presence + 0.2 × Normalized Crowd Comfort Penalty",
        "interpretation": "Higher values indicate greater operational strain. Maximum value is 1.",
    },
    "Peak Stress": {
        "definition": "Maximum observed stress index within the selected period for a hall or time window.",
        "formula": "max(stress_index)",
        "interpretation": "Represents the worst-case operational condition observed.",
    },
    "Average Stress": {
        "definition": "Mean stress index across the selected period.",
        "formula": "mean(stress_index)",
        "interpretation": "Higher values indicate sustained operational pressure over time.",
    },
    "Stress Delta": {
        "definition": "Difference in average stress between event-active and non-event periods.",
        "formula": "Avg Stress During Events - Avg Stress Non-Event",
        "interpretation": "Higher values indicate that events materially increase operational pressure.",
    },
    "Occupancy Ratio": {
        "definition": "Proportion of current occupancy relative to hall capacity.",
        "formula": "currentOccupancy / hallCapacity",
        "interpretation": "Values close to 1 indicate the hall is near or at full capacity.",
    },
    "Average Occupancy": {
        "definition": "Mean number of occupants across the selected period.",
        "formula": "mean(currentOccupancy)",
        "interpretation": "Higher values indicate more sustained hall usage.",
    },
    "Peak Occupancy": {
        "definition": "Highest observed occupancy in any bucket.",
        "formula": "max(currentOccupancy)",
        "interpretation": "Higher values indicate peak crowd pressure.",
    },
    "Occupancy Delta": {
        "definition": "Difference in average occupancy between event-active and non-event periods.",
        "formula": "Avg Occupancy During Events - Avg Occupancy Non-Event",
        "interpretation": "Higher values indicate stronger crowd buildup during events.",
    },
    "% Capacity (Avg)": {
        "definition": "Average occupancy expressed as a percentage of hall capacity.",
        "formula": "(Average Occupancy / Hall Capacity) × 100",
        "interpretation": "Indicates typical utilization level.",
    },
    "% Capacity (Peak)": {
        "definition": "Peak occupancy expressed as a percentage of hall capacity.",
        "formula": "(Peak Occupancy / Hall Capacity) × 100",
        "interpretation": "Indicates maximum utilization reached.",
    },
    "Utilization": {
        "definition": "Average hall usage level relative to configured capacity.",
        "formula": "Derived or normalized utilization indicator",
        "interpretation": "Higher values indicate heavier sustained use of the hall.",
    },
    "Utilization Score": {
        "definition": "Weighted indicator of how effectively space is being used.",
        "formula": "Weighted combination of occupancy, capacity usage, and event activity",
        "interpretation": "Higher values indicate stronger overall hall utilization.",
    },
    "Utilization Delta": {
        "definition": "Difference in utilization between event-active and non-event periods.",
        "formula": "Utilization During Events - Utilization Non-Event",
        "interpretation": "Higher values indicate that events significantly increase utilization.",
    },
    "Event Presence": {
        "definition": "Binary indicator of whether an event is active in a time bucket.",
        "formula": "1 if event active else 0",
        "interpretation": "1 indicates event active, 0 indicates no event.",
    },
    "Event Windows": {
        "definition": "Number of time buckets where at least one event was active.",
        "formula": "count(isEvent = True)",
        "interpretation": "Higher values indicate more frequent event activity.",
    },
    "Event Active Hours": {
        "definition": "Total duration of event activity.",
        "formula": "Event Active Buckets × bucket duration",
        "interpretation": "Higher values indicate longer event influence on operations.",
    },
    "Event Count": {
        "definition": "Number of events active in a time bucket or linked to a ranked congestion window.",
        "formula": "count(active events in bucket)",
        "interpretation": "Higher values indicate more overlapping event load in the same interval.",
    },
    "Unique Events": {
        "definition": "Number of distinct events observed in the selected hall or grouping.",
        "formula": "count(distinct event_id)",
        "interpretation": "Higher values indicate broader event activity across the selected period.",
    },
    "Event Share": {
        "definition": "Share of total event-active time or event activity attributable to a hall.",
        "formula": "Hall Event Active Hours / Total Event Active Hours",
        "interpretation": "Higher values indicate greater concentration of event activity in that hall.",
    },
    "Event IDs": {
        "definition": "Identifiers of events linked to the given operational window or hall peak.",
        "formula": "List of event_id values associated with the selected record",
        "interpretation": "Used to trace which specific events contributed to an operational peak.",
    },
    "Crowd Comfort Penalty": {
        "definition": "Raw measure of crowd discomfort derived from occupancy conditions.",
        "formula": "min(occupancyRatio × 40, 40)",
        "interpretation": "Higher values indicate greater discomfort or congestion.",
    },
    "Normalized Crowd Comfort Penalty": {
        "definition": "Penalty scaled relative to the maximum observed penalty in the dataset.",
        "formula": "avg_penalty / max(avg_penalty across dataset)",
        "interpretation": "Ranges from 0 to 1, where 1 represents the highest observed discomfort.",
    },
    "Maximum Stress Condition": {
        "definition": "Theoretical condition where operational stress reaches its maximum.",
        "formula": "Occurs when Occupancy Ratio = 1, Event Presence = 1, and Normalized Penalty = 1 → Stress = 1.0",
        "interpretation": "All contributing factors maximized results in stress = 1.",
    },
    "Peak Congestion Window": {
        "definition": "Time interval with the highest observed operational stress or congestion.",
        "formula": "Rank by stress index, then peak occupancy",
        "interpretation": "Represents the most critical operational period.",
    },
}


# =========================================================
# HELPERS
# =========================================================

def _resolve_active_metrics(used_metrics):
    if not used_metrics:
        return list(DEFINITION_CATALOG.keys())

    seen = set()
    ordered = []

    for m in used_metrics:
        if m in DEFINITION_CATALOG and m not in seen:
            ordered.append(m)
            seen.add(m)

    return ordered


def _build_pdf_definition_rows(metric_names):
    rows = []
    for m in metric_names:
        meta = DEFINITION_CATALOG[m]
        rows.append({
            "Metric": m,
            "Definition": meta["definition"],
            "Interpretation": meta["interpretation"],
        })
    return rows


def _build_pdf_calculation_rows(metric_names):
    # only meaningful / non-obvious calculations
    keep = {
        "Operational Stress Index",
        "Occupancy Ratio",
        "Crowd Comfort Penalty",
        "Normalized Crowd Comfort Penalty",
        "Peak Stress",
        "Event Windows",
        "Event Active Hours",
        "Maximum Stress Condition",
        "% Capacity (Avg)",
        "% Capacity (Peak)",
        "Utilization Score",
        "Peak Congestion Window",
    }

    rows = []
    for m in metric_names:
        if m in keep:
            rows.append({
                "Metric": m,
                "Formula / Logic": DEFINITION_CATALOG[m]["formula"],
            })
    return rows


# =========================================================
# MAIN FUNCTION
# =========================================================

def build_definitions_section(filters=None, used_metrics=None) -> dict:

    metric_names = _resolve_active_metrics(used_metrics)

    # ===============================
    # PDF BLOCK 1
    # ===============================
    block1 = {
        "title": "Metric Definitions",
        "subtitle": "Definitions and interpretation of operational metrics.",
        "columns": ["Metric", "Definition", "Interpretation"],
        "table_rows": _build_pdf_definition_rows(metric_names),
    }

    # ===============================
    # PDF BLOCK 2
    # ===============================
    block2 = {
        "title": "Calculation Logic",
        "subtitle": "How the main metrics are derived.",
        "columns": ["Metric", "Formula / Logic"],
        "table_rows": _build_pdf_calculation_rows(metric_names),
    }

    # ===============================
    # XLSX (FULL BUT FILTERED)
    # ===============================
    rows = []
    for m in metric_names:
        meta = DEFINITION_CATALOG[m]
        rows.append({
            "Metric": m,
            "Definition": meta["definition"],
            "Formula / Logic": meta["formula"],
            "Interpretation": meta["interpretation"],
        })

    xlsx_sheet = {
        "name": "Definitions",
        "columns": ["Metric", "Definition", "Formula / Logic", "Interpretation"],
        "rows": rows,
    }

    return {
        "title": "Definitions and Calculation Logic",
        "subtitle": "Reference guide for operational metrics and calculations.",
        "blocks": [block1, block2],
        "xlsx_sheets": [xlsx_sheet],
    }