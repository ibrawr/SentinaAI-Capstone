from typing import Any, Dict, List
import pandas as pd


def _safe_float(x, default=0.0):
    try:
        v = float(x)
        if str(v).lower() in ("nan", "none"):
            return default
        return v
    except Exception:
        return default


def build_event_impact_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:
    """
    Compare:
    - During Events vs Non-Event
    - Occupancy delta
    - Utilization delta
    - Stress index delta
    """

    if df is None or len(df) == 0:
        return {
            "title": "Event Impact Analysis",
            "subtitle": "No operational data available.",
            "blocks": [],
        }

    # ----------------------------
    # Required columns (safe defaults)
    # ----------------------------
    if "hallName" not in df.columns:
        df = df.assign(hallName="Unknown")
    if "zoneId" not in df.columns:
        df = df.assign(zoneId="Unknown")
    if "currentOccupancy" not in df.columns:
        df = df.assign(currentOccupancy=0)

    # If isEvent missing, infer from eventId if available
    if "isEvent" not in df.columns:
        if "eventId" in df.columns:
            df = df.assign(isEvent=df["eventId"].notna())
        else:
            df = df.assign(isEvent=False)

    # currentOccupancy numeric
    df["currentOccupancy"] = pd.to_numeric(df["currentOccupancy"], errors="coerce").fillna(0)

    # Force isEvent to boolean (handles TRUE/FALSE strings)
    if df["isEvent"].dtype != bool:
        df["isEvent"] = (
            df["isEvent"]
            .astype(str)
            .str.strip()
            .str.lower()
            .isin(["true", "1", "yes", "y"])
        )

    has_capacity = "hallCapacity" in df.columns
    has_penalty = "crowdComfortPenalty" in df.columns

    # ----------------------------
    # Stress Index Calculation
    # ----------------------------
    if has_capacity:
        cap = pd.to_numeric(df["hallCapacity"], errors="coerce").replace(0, pd.NA)
        ratio = (df["currentOccupancy"] / cap).fillna(0)
    elif "occupancyRatio" in df.columns:
        ratio = pd.to_numeric(df["occupancyRatio"], errors="coerce").fillna(0)
    else:
        max_occ = df["currentOccupancy"].max() or 1
        ratio = df["currentOccupancy"] / max_occ

    event_flag = df["isEvent"].astype(int)
    penalty = (
        pd.to_numeric(df["crowdComfortPenalty"], errors="coerce").fillna(0)
        if has_penalty
        else 0
    )

    df["__stress__"] = (ratio * 0.6) + (event_flag * 0.2) + (penalty * 0.2)

    # ----------------------------
    # Split Event vs Non-Event
    # ----------------------------
    df_event = df[df["isEvent"]]
    df_nonev = df[~df["isEvent"]]

    def _aggregate(dfx: pd.DataFrame):
        if len(dfx) == 0:
            return 0.0, 0.0, 0.0

        avg_occ = float(dfx["currentOccupancy"].mean())

        # Utilization: prefer occupancyRatio if present
        if "occupancyRatio" in dfx.columns:
            util = float(pd.to_numeric(dfx["occupancyRatio"], errors="coerce").fillna(0).mean())
        elif has_capacity:
            cap_local = pd.to_numeric(dfx["hallCapacity"], errors="coerce").replace(0, pd.NA)
            util = float((dfx["currentOccupancy"] / cap_local).fillna(0).mean())
        else:
            util = 0.0

        stress = float(dfx["__stress__"].mean())
        return round(avg_occ, 1), round(util, 3), round(stress, 3)

    ev_occ, ev_util, ev_stress = _aggregate(df_event)
    ne_occ, ne_util, ne_stress = _aggregate(df_nonev)

    # Deltas
    delta_occ = round(ev_occ - ne_occ, 1)
    delta_util = round(ev_util - ne_util, 3)
    delta_stress = round(ev_stress - ne_stress, 3)

    # ----------------------------
    # PDF Block 1: Overall Comparison (TEMPLATE COMPATIBLE)
    # ----------------------------
    block1_columns = ["Metric", "During Events", "Non-Event", "Delta"]
    block1_rows = [
        {"Metric": "Avg Occupancy", "During Events": ev_occ, "Non-Event": ne_occ, "Delta": delta_occ},
        {"Metric": "Utilization", "During Events": ev_util, "Non-Event": ne_util, "Delta": delta_util},
        {"Metric": "Stress Index", "During Events": ev_stress, "Non-Event": ne_stress, "Delta": delta_stress},
    ]

    block1 = {
        "title": "Overall Impact",
        "subtitle": "Operational differences during event vs non-event periods.",
        "columns": block1_columns,
        "table_rows": block1_rows,   # <-- MUST be table_rows for your template
    }

    # ----------------------------
    # Hall-Level Comparison (TEMPLATE COMPATIBLE)
    # ----------------------------
    hall_rows: List[Dict[str, Any]] = []
    halls = df.groupby(["hallName", "zoneId"], dropna=False).size().reset_index()[["hallName", "zoneId"]]

    for _, hz in halls.iterrows():
        hall = hz["hallName"]
        zone = hz["zoneId"]

        sub = df[(df["hallName"] == hall) & (df["zoneId"] == zone)]
        sub_ev = sub[sub["isEvent"]]
        sub_ne = sub[~sub["isEvent"]]

        ev_occ_h, ev_util_h, ev_stress_h = _aggregate(sub_ev)
        ne_occ_h, ne_util_h, ne_stress_h = _aggregate(sub_ne)

        # IMPORTANT: keys must match columns EXACTLY because template uses row[col]
        hall_rows.append({
            "Hall": hall,
            "Zone": zone,
            "Occ Δ": round(ev_occ_h - ne_occ_h, 1),
            "Util Δ": round(ev_util_h - ne_util_h, 3),
            "Stress Δ": round(ev_stress_h - ne_stress_h, 3),
        })

    block2_columns = ["Hall", "Zone", "Occ Δ", "Util Δ", "Stress Δ"]
    if not hall_rows:
        hall_rows = [{"Hall": "—", "Zone": "—", "Occ Δ": 0, "Util Δ": 0, "Stress Δ": 0}]

    block2 = {
        "title": "Hall-Level Event Impact",
        "subtitle": "Change in operational intensity during events.",
        "columns": block2_columns,
        "table_rows": hall_rows,     # <-- MUST be table_rows for your template
    }

    # ----------------------------
    # XLSX Detail (optional; doesn't affect PDF)
    # ----------------------------
    xlsx_sheet = {
        "name": "Event Impact Detail",
        "columns": block2_columns,
        "rows": hall_rows if hall_rows and hall_rows[0].get("Hall") != "—" else [],
    }

    return {
        "title": "Event Impact Analysis",
        "subtitle": "Operational shifts attributable to event activity.",
        "blocks": [block1, block2],
        "xlsx_sheets": [xlsx_sheet],
        "used_metrics": [
            "Average Occupancy",
            "Occupancy Delta",
            "Utilization",
            "Utilization Delta",
            "Operational Stress Index",
            "Average Stress",
            "Stress Delta",
            "Event Presence",
        ]

    }