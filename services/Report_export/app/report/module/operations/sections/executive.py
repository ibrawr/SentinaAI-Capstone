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


def _safe_int(x, default=0):
    try:
        return int(round(_safe_float(x, default)))
    except Exception:
        return default


def _safe_str(x, default="—"):
    try:
        s = str(x).strip()
        if s == "" or s.lower() in ("nan", "none", "nat"):
            return default
        return s
    except Exception:
        return default


def build_executive_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:

    if df is None or len(df) == 0:
        return {
            "title": "Executive Overview",
            "subtitle": "No operational data available.",
            "columns": ["Message"],
            "table_rows": [{"Message": "No rows available after filtering."}],
        }

    # Ensure required fields
    if "hallName" not in df.columns:
        df = df.assign(hallName="Unknown")
    if "zoneId" not in df.columns:
        df = df.assign(zoneId="Unknown")
    if "bucket" not in df.columns:
        df = df.assign(bucket="—")
    if "currentOccupancy" not in df.columns:
        df = df.assign(currentOccupancy=0)

    has_capacity = "hallCapacity" in df.columns
    has_events = ("isEvent" in df.columns) and ("eventId" in df.columns)
    has_penalty = "crowdComfortPenalty" in df.columns

    # ============================================================
    # 1) Peak Occupancy Moment
    # ============================================================
    df["currentOccupancy"] = pd.to_numeric(df["currentOccupancy"], errors="coerce").fillna(0)

    peak_row = df.sort_values("currentOccupancy", ascending=False).iloc[0]

    peak_bucket = str(peak_row["bucket"])
    peak_hall = str(peak_row["hallName"])
    peak_zone = str(peak_row["zoneId"])
    peak_val = int(round(float(peak_row["currentOccupancy"])))

    # ============================================================
    # 2) Most Utilized Hall (avg occupancy)
    # ============================================================
    util = (
        df.groupby(["hallName", "zoneId"])
          .agg(avg_occ=("currentOccupancy", "mean"))
          .reset_index()
    )

    util["avg_occ"] = pd.to_numeric(util["avg_occ"], errors="coerce").fillna(0)
    busiest = util.sort_values("avg_occ", ascending=False).iloc[0]

    busiest_line = (
        f"{busiest['hallName']} ({busiest['zoneId']}) "
        f"averaged {round(float(busiest['avg_occ']),1)} occupants."
    )

    # ============================================================
    # 3) Highest Congestion Event
    # ============================================================
    top_event_line = "—"
    if has_events:
        df_ev = df[df["isEvent"] == True].copy()
        if len(df_ev) > 0:
            df_ev = df_ev.sort_values("currentOccupancy", ascending=False)
            er = df_ev.iloc[0]
            top_event_line = (
                f"{er['eventId']} at {er['bucket']} — "
                f"{er['hallName']} ({er['zoneId']}) "
                f"reached {int(round(float(er['currentOccupancy'])))} occupants."
            )

    # ============================================================
    # 4) Operational Stress Index (avg)
    # ============================================================
    """
    Stress Score =
    (occupancy / capacity) * 0.6
    + event_presence_flag * 0.2
    + crowdComfortPenalty_normalized * 0.2
    """
    stress_score = 0.0

    if has_capacity:
        cap = pd.to_numeric(df["hallCapacity"], errors="coerce")
        occ = df["currentOccupancy"]
        ratio = (occ / cap.replace(0, pd.NA)).fillna(0)

        event_flag = df["isEvent"].fillna(False).astype(int) if has_events else 0
        penalty = pd.to_numeric(df["crowdComfortPenalty"], errors="coerce").fillna(0) if has_penalty else 0

        df["__stress__"] = (
            (ratio * 0.6) +
            (event_flag * 0.2) +
            (penalty * 0.2)
        )

        stress_score = round(float(df["__stress__"].mean()), 3)

    # ============================================================
    # PDF Output
    # ============================================================
    section = {
        "title": "Executive Overview",
        "subtitle": "Operational snapshot: utilization, congestion, and stress indicators.",
        "summary": [
            f"<strong>Most Utilized Hall</strong><br>{busiest_line}<br><br>",
            f"<strong>Peak Occupancy Moment</strong><br>"
            f"{peak_bucket} — {peak_hall} ({peak_zone}) reached {peak_val} occupants.<br><br>",
            f"<strong>Highest Congestion Event</strong><br>{top_event_line}<br><br>",
            f"<strong>Average Operational Stress Score</strong><br>{stress_score}",
        ],
        "columns": [],
        "table_rows": [],
        "used_metrics": [
            "Utilization Score",
            "Average Occupancy",
            "Peak Occupancy",
            "Peak Congestion Window",
            "Operational Stress Index",
            "Average Stress",
        ]
    }

    return section