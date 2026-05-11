from typing import Dict, Any


# =========================================================
# MASTER METRIC CATALOG
# =========================================================

DEFINITION_CATALOG = {
    "Capacity": {
        "definition": "Configured maximum occupancy capacity of the hall.",
        "formula": "Reference hall capacity value",
        "interpretation": "Used as the baseline for utilization and peak-capacity comparisons.",
    },
    "Average Occupancy": {
        "definition": "Mean number of occupants across the selected period.",
        "formula": "average(current_occupancy)",
        "interpretation": "Higher values indicate more sustained hall usage.",
    },
    "Peak Occupancy": {
        "definition": "Highest observed occupancy in any time bucket.",
        "formula": "max(current_occupancy)",
        "interpretation": "Represents the strongest crowd load observed.",
    },
    "Peak % Capacity": {
        "definition": "Peak occupancy expressed as a percentage of configured hall capacity.",
        "formula": "(Peak Occupancy / Capacity) × 100",
        "interpretation": "Values close to 100% indicate the hall reached full designed occupancy.",
    },
    "Event Count": {
        "definition": "Number of events associated with the hall or selected grouping in the period.",
        "formula": "count(distinct event_id) or grouped event count",
        "interpretation": "Higher values indicate broader event activity within the selected scope.",
    },
    "Event IDs": {
        "definition": "Identifiers of events linked to the selected hall, peak window, or grouped record.",
        "formula": "List of event_id values associated with the record",
        "interpretation": "Used to trace which specific events contributed to the observed result.",
    },
    "Total Energy Consumption (kWh)": {
        "definition": "Total energy consumed within the selected time period.",
        "formula": "sum(energy_kwh)",
        "interpretation": "Higher values indicate greater energy usage.",
    },
    "HVAC Energy Consumption (kWh)": {
        "definition": "Energy consumed specifically by HVAC systems.",
        "formula": "sum(hvac_energy_kwh)",
        "interpretation": "Indicates cooling and heating load contribution to total energy use.",
    },
    "Carbon Emissions (kg CO2)": {
        "definition": "Estimated carbon emissions associated with energy consumption.",
        "formula": "energy_kwh × emission_factor",
        "interpretation": "Higher values indicate greater environmental impact.",
    },
    "Peak Energy Usage": {
        "definition": "Maximum energy consumption observed within a time bucket.",
        "formula": "max(energy_kwh across time buckets)",
        "interpretation": "Represents peak load conditions.",
    },
    "Average Energy Usage": {
        "definition": "Average energy consumption across the selected period.",
        "formula": "average(energy_kwh)",
        "interpretation": "Indicates the general consumption trend over time.",
    },
    "kWh / Occupant": {
        "definition": "Energy consumption normalized by occupancy level.",
        "formula": "energy_kwh / max(current_occupancy, 1)",
        "interpretation": "Helps compare energy usage more fairly across different crowd levels.",
    },
    "Occupancy-Adjusted Energy": {
        "definition": "Energy consumption normalized by occupancy levels.",
        "formula": "energy_kwh / max(current_occupancy, 1)",
        "interpretation": "Used to compare halls or intervals with different people counts.",
    },
    "Energy Intensity": {
        "definition": "Energy consumed per unit occupancy or per square meter.",
        "formula": "energy_kwh / hall_area OR energy_kwh / occupancy",
        "interpretation": "Lower values indicate better efficiency.",
    },
    "Energy Efficiency Score": {
        "definition": "Normalized score reflecting how efficiently energy is used relative to demand.",
        "formula": "1 - normalized_energy_consumption",
        "interpretation": "Ranges from 0 to 1. Higher values indicate better efficiency.",
    },
    "Normalized Energy Consumption": {
        "definition": "Average energy consumption scaled relative to the maximum observed value.",
        "formula": "avg_energy / max(avg_energy across dataset)",
        "interpretation": "Ranges from 0 to 1 and supports score-based comparison.",
    },
    "Normalized Carbon Emissions": {
        "definition": "Average carbon emissions scaled relative to the maximum observed value.",
        "formula": "avg_carbon / max(avg_carbon across dataset)",
        "interpretation": "Ranges from 0 to 1 and supports sustainability scoring.",
    },
    "Sustainability Score": {
        "definition": "Composite sustainability score combining energy efficiency and carbon impact.",
        "formula": "0.5 × (1 - normalized_energy) + 0.5 × (1 - normalized_carbon)",
        "interpretation": "Higher values indicate more sustainable operation.",
    },
    "Maximum Efficiency Condition": {
        "definition": "Theoretical condition where efficiency is highest and sustainability score approaches 1.",
        "formula": "Occurs when energy consumption and emissions are at minimum",
        "interpretation": "Represents the most favorable energy-performance condition.",
    },
    "Average Outdoor Temp (°C)": {
        "definition": "Mean outdoor temperature across the selected grouping or time window.",
        "formula": "average(outdoor_temp_c)",
        "interpretation": "Provides environmental context for cooling and energy demand.",
    },
    "Average Indoor Temp (°C)": {
        "definition": "Mean indoor temperature across the selected grouping or time window.",
        "formula": "average(indoor_temp_c)",
        "interpretation": "Used to assess internal thermal conditions and comfort performance.",
    },
    "Temp Δ (°C)": {
        "definition": "Difference between indoor and outdoor temperature.",
        "formula": "Indoor Temperature - Outdoor Temperature",
        "interpretation": "Shows the thermal gap being maintained by the venue environment.",
    },
    "Humidity (%)": {
        "definition": "Relative humidity level within the selected hall or time bucket.",
        "formula": "observed humidity percentage",
        "interpretation": "Used as a direct environmental condition indicator affecting comfort.",
    },
    "Average Humidity (%)": {
        "definition": "Mean relative humidity across the selected scope.",
        "formula": "average(humidity_pct)",
        "interpretation": "Used to compare humidity conditions across halls or periods.",
    },
    "Comfort Index": {
        "definition": "Composite comfort score derived from indoor temperature, humidity, and related environmental conditions.",
        "formula": "Derived comfort model",
        "interpretation": "Higher values indicate better environmental comfort.",
    },
    "Comfort Status": {
        "definition": "Categorical interpretation of the comfort index.",
        "formula": "Rule-based classification from Comfort Index thresholds",
        "interpretation": "Labels conditions such as acceptable or uncomfortable.",
    },
    "Worst Comfort": {
        "definition": "Lowest comfort index observed for a hall during the selected period.",
        "formula": "min(comfort_index)",
        "interpretation": "Represents the most uncomfortable observed condition.",
    },
    "Worst Time": {
        "definition": "Time bucket in which the lowest comfort index was observed.",
        "formula": "argmin(comfort_index)",
        "interpretation": "Identifies when the weakest environmental condition occurred.",
    },
    "Top Discomfort Moment": {
        "definition": "A ranked time window with the lowest comfort or highest thermal stress.",
        "formula": "Rank by lowest comfort_index",
        "interpretation": "Highlights the most critical discomfort condition observed.",
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

    for metric in used_metrics:
        if metric in DEFINITION_CATALOG and metric not in seen:
            ordered.append(metric)
            seen.add(metric)

    return ordered


def _build_pdf_definition_rows(metric_names):
    rows = []
    for metric in metric_names:
        meta = DEFINITION_CATALOG[metric]
        rows.append({
            "Metric": metric,
            "Definition": meta["definition"],
            "Interpretation": meta["interpretation"],
        })
    return rows


def _build_pdf_calculation_rows(metric_names):
    keep = {
        "Peak % Capacity",
        "Total Energy Consumption (kWh)",
        "HVAC Energy Consumption (kWh)",
        "Carbon Emissions (kg CO2)",
        "kWh / Occupant",
        "Occupancy-Adjusted Energy",
        "Energy Intensity",
        "Energy Efficiency Score",
        "Normalized Energy Consumption",
        "Normalized Carbon Emissions",
        "Sustainability Score",
        "Maximum Efficiency Condition",
        "Average Outdoor Temp (°C)",
        "Average Indoor Temp (°C)",
        "Temp Δ (°C)",
        "Average Humidity (%)",
        "Comfort Index",
        "Comfort Status",
        "Worst Comfort",
        "Worst Time",
        "Top Discomfort Moment",
    }

    rows = []
    for metric in metric_names:
        if metric in keep:
            rows.append({
                "Metric": metric,
                "Formula / Logic": DEFINITION_CATALOG[metric]["formula"],
            })
    return rows


# =========================================================
# MAIN FUNCTION
# =========================================================

def build_definitions_section(filters=None, used_metrics=None) -> dict:

    metric_names = _resolve_active_metrics(used_metrics)

    # ===============================
    # PDF BLOCK 1: Metric Definitions
    # ===============================
    block1 = {
        "title": "Metric Definitions",
        "subtitle": "Definitions and interpretation of sustainability, energy, occupancy, and environmental metrics.",
        "columns": ["Metric", "Definition", "Interpretation"],
        "table_rows": _build_pdf_definition_rows(metric_names),
    }

    # ===============================
    # PDF BLOCK 2: Calculation Logic
    # ===============================
    block2 = {
        "title": "Calculation Logic",
        "subtitle": "How sustainability metrics are derived.",
        "columns": ["Metric", "Formula / Logic"],
        "table_rows": _build_pdf_calculation_rows(metric_names),
    }

    # ===============================
    # XLSX DEFINITIONS SHEET
    # ===============================
    rows = []
    for metric in metric_names:
        meta = DEFINITION_CATALOG[metric]
        rows.append({
            "Metric": metric,
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
        "subtitle": "Reference guide for energy, occupancy, environmental, and sustainability calculations.",
        "blocks": [block1, block2],
        "xlsx_sheets": [xlsx_sheet],
    }