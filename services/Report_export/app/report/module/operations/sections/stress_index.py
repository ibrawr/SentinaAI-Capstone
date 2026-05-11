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


def build_stress_index_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:
    """
    Operational Stress Index

    Stress index (consistent with other sections):
      stress = 0.6*(occupancy/capacity) + 0.2*(event_flag) + 0.2*(penalty_norm)

    PDF: multiple blocks
    XLSX: one detail sheet (hall ranking full, no cap)
    """

    # -----------------------
    # Guard
    # -----------------------
    if df is None or len(df) == 0:
        return {
            "title": "Operational Stress Index",
            "subtitle": "No operational data available for the selected filters.",
            "blocks": [],
        }

    # Ensure base cols
    if "hallName" not in df.columns:
        df = df.assign(hallName="Unknown")
    if "zoneId" not in df.columns:
        df = df.assign(zoneId="Unknown")
    if "bucket" not in df.columns:
        df = df.assign(bucket="—")
    if "currentOccupancy" not in df.columns:
        df = df.assign(currentOccupancy=0)
    if "isEvent" not in df.columns:
        df = df.assign(isEvent=False)

    df["currentOccupancy"] = pd.to_numeric(df["currentOccupancy"], errors="coerce").fillna(0.0)

    has_capacity = "hallCapacity" in df.columns
    has_penalty = "crowdComfortPenalty" in df.columns
    has_events = ("eventId" in df.columns)

    if has_capacity:
        df["hallCapacity"] = pd.to_numeric(df["hallCapacity"], errors="coerce")

    if has_penalty:
        df["crowdComfortPenalty"] = pd.to_numeric(df["crowdComfortPenalty"], errors="coerce").fillna(0.0)
    else:
        df["crowdComfortPenalty"] = 0.0

    # -----------------------
    # Build window-level table: bucket×hall×zone
    # -----------------------
    agg = {
        "avg_occupancy": ("currentOccupancy", "mean"),
        "peak_occupancy": ("currentOccupancy", "max"),
    }
    if has_capacity:
        agg["capacity"] = ("hallCapacity", "max")
    agg["avg_penalty"] = ("crowdComfortPenalty", "mean")

    win = (
        df.groupby(["bucket", "hallName", "zoneId"], dropna=False)
          .agg(**agg)
          .reset_index()
    )

    win["avg_occupancy"] = pd.to_numeric(win["avg_occupancy"], errors="coerce").fillna(0.0)
    win["peak_occupancy"] = pd.to_numeric(win["peak_occupancy"], errors="coerce").fillna(0.0)

    if has_capacity:
        win["capacity"] = pd.to_numeric(win["capacity"], errors="coerce")

    win["avg_penalty"] = pd.to_numeric(win["avg_penalty"], errors="coerce").fillna(0.0)

    # Event context per window (event count + IDs)
    win["Event Count"] = 0
    win["Event IDs"] = ""

    if has_events:
        df_ev = df[df["isEvent"] == True].copy()
        if len(df_ev) > 0:
            ev_bucket = (
                df_ev.groupby(["bucket", "hallName", "zoneId"])["eventId"]
                    .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                    .reset_index(name="event_ids_list")
            )
            ev_bucket["Event Count"] = ev_bucket["event_ids_list"].apply(len)
            ev_bucket["Event IDs"] = ev_bucket["event_ids_list"].apply(lambda ids: ", ".join(ids))
            ev_bucket = ev_bucket.drop(columns=["event_ids_list"])

            win = win.drop(columns=["Event Count", "Event IDs"], errors="ignore")
            win = win.merge(ev_bucket, on=["bucket", "hallName", "zoneId"], how="left")

            win["Event Count"] = (
                pd.to_numeric(win["Event Count"], errors="coerce")
                .fillna(0)
                .astype(int)
            )
            win["Event IDs"] = win["Event IDs"].fillna("")
    # -----------------------
    # Stress Index
    # -----------------------
    if has_capacity:
        cap_num = win["capacity"].replace(0, pd.NA)
        occ_ratio = (win["avg_occupancy"] / cap_num).fillna(0.0)
    else:
        max_avg = float(win["avg_occupancy"].max()) if len(win) > 0 else 1.0
        occ_ratio = win["avg_occupancy"] / (max_avg or 1.0)

    ev_flag = (win["Event Count"] > 0).astype(int)

    max_pen = float(win["avg_penalty"].max()) if len(win) > 0 else 1.0
    pen_norm = (win["avg_penalty"] / (max_pen or 1.0)).fillna(0.0)

    win["stress_index"] = (occ_ratio * 0.6 + ev_flag * 0.2 + pen_norm * 0.2).round(4)

    # -----------------------
    # Overall summary (event vs non-event)
    # -----------------------
    ev_stress = 0.0
    ne_stress = 0.0
    if len(win) > 0:
        ev_win = win[win["Event Count"] > 0]
        ne_win = win[win["Event Count"] <= 0]
        ev_stress = round(float(ev_win["stress_index"].mean()), 4) if len(ev_win) > 0 else 0.0
        ne_stress = round(float(ne_win["stress_index"].mean()), 4) if len(ne_win) > 0 else 0.0

    avg_stress = round(float(win["stress_index"].mean()), 4) if len(win) > 0 else 0.0
    delta = round(ev_stress - ne_stress, 4)

    block1 = {
        "title": "Overall Stress Summary",
        "subtitle": "Stress index averages across event vs non-event windows.",
        "columns": ["Metric", "Value"],
        "table_rows": [
            {"Metric": "Avg Stress (All Windows)", "Value": avg_stress},
            {"Metric": "Avg Stress (During Events)", "Value": ev_stress},
            {"Metric": "Avg Stress (Non-Event)", "Value": ne_stress},
            {"Metric": "Stress Delta (Event - Non)", "Value": delta},
        ],
        "summary": [],
    }

    # -----------------------
    # Hall ranking by avg stress
    # -----------------------
    hall = (
        win.groupby(["hallName", "zoneId"], dropna=False)
           .agg(
               avg_stress=("stress_index", "mean"),
               peak_stress=("stress_index", "max"),
               avg_occ=("avg_occupancy", "mean"),
               peak_occ=("peak_occupancy", "max"),
               event_windows=("Event Count", lambda s: int((pd.to_numeric(s, errors="coerce").fillna(0) > 0).sum())),
           )
           .reset_index()
    )

    hall["avg_stress"] = pd.to_numeric(hall["avg_stress"], errors="coerce").fillna(0.0).round(4)
    hall["peak_stress"] = pd.to_numeric(hall["peak_stress"], errors="coerce").fillna(0.0).round(4)
    hall["avg_occ"] = pd.to_numeric(hall["avg_occ"], errors="coerce").fillna(0.0).round(1)
    hall["peak_occ"] = pd.to_numeric(hall["peak_occ"], errors="coerce").fillna(0.0).round(0).astype(int)
    hall["event_windows"] = pd.to_numeric(hall["event_windows"], errors="coerce").fillna(0).astype(int)

    hall_ranked = hall.sort_values("avg_stress", ascending=False).reset_index(drop=True)
    hall_ranked["rank"] = hall_ranked.index + 1

    top_n = 10
    rows2: List[Dict[str, Any]] = []
    for _, r in hall_ranked.head(top_n).iterrows():
        rows2.append({
            "Rank": int(r["rank"]),
            "Hall": _safe_str(r["hallName"]),
            "Zone": _safe_str(r["zoneId"]),
            "Avg Stress": float(r["avg_stress"]),
            "Peak Stress": float(r["peak_stress"]),
            "Avg Occ": float(r["avg_occ"]),
            "Peak Occ": int(r["peak_occ"]),
            "Event Windows": int(r["event_windows"]),
        })

    block2 = {
        "title": "Hall Stress Ranking (Top 10)",
        "subtitle": "Halls/zones with the highest sustained operational stress.",
        "columns": ["Rank", "Hall", "Zone", "Avg Stress", "Peak Stress", "Avg Occ", "Peak Occ", "Event Windows"],
        "table_rows": rows2 if rows2 else [{"Message": "No hall ranking rows."}],
    }

    # -----------------------
    # Top stress moments (bucket×hall×zone)
    # -----------------------
    win_ranked = win.sort_values("stress_index", ascending=False).reset_index(drop=True)
    win_ranked["rank"] = win_ranked.index + 1

    rows3: List[Dict[str, Any]] = []
    for _, r in win_ranked.head(top_n).iterrows():
        rows3.append({
            "Rank": int(r["rank"]),
            "Time Bucket": _safe_str(r["bucket"]),
            "Hall": _safe_str(r["hallName"]),
            "Zone": _safe_str(r["zoneId"]),
            "Avg Occ": round(_safe_float(r["avg_occupancy"]), 1),
            "Stress": float(r["stress_index"]),
            "Event IDs": _safe_str(r["Event IDs"], "—") if str(r["Event IDs"]).strip() else "—",
        })

    block3 = {
        "title": "Top Stress Moments (Top 10)",
        "subtitle": "Highest-stress windows across the selected period.",
        "columns": ["Rank", "Time Bucket", "Hall", "Zone", "Avg Occ", "Stress", "Event IDs"],
        "table_rows": rows3 if rows3 else [{"Message": "No stress windows found."}],
    }

    # -----------------------
    # XLSX Detail (FULL hall ranking table)
    # -----------------------
    xlsx_cols_map = [
        ("rank", "Rank"),
        ("hallName", "Hall"),
        ("zoneId", "Zone"),
        ("avg_stress", "Avg Stress"),
        ("peak_stress", "Peak Stress"),
        ("avg_occ", "Avg Occupancy"),
        ("peak_occ", "Peak Occupancy"),
        ("event_windows", "Event Windows"),
    ]

    xlsx_cols = [label for (_, label) in xlsx_cols_map]
    xlsx_rows: List[Dict[str, Any]] = []
    for _, r in hall_ranked.iterrows():
        row = {}
        for src, label in xlsx_cols_map:
            v = r[src] if src in hall_ranked.columns else ""
            if pd.isna(v):
                v = ""
            row[label] = v
        xlsx_rows.append(row)

    xlsx_sheet = {
        "name": "Operational Stress Detail",
        "columns": xlsx_cols,
        "rows": xlsx_rows,
    }

    # -----------------------
    # Return section
    # -----------------------
    section = {
        "title": "Operational Stress Index",
        "subtitle": "Stress scoring across halls, time windows, and event context.",
        "blocks": [block1, block2, block3],
        "xlsx_sheets": [xlsx_sheet],
        "used_metrics": [
            "Operational Stress Index",
            "Average Stress",
            "Peak Stress",
            "Stress Delta",
            "Occupancy Ratio",
            "Average Occupancy",
            "Peak Occupancy",
            "Event Presence",
            "Event Windows",
            "Crowd Comfort Penalty",
            "Normalized Crowd Comfort Penalty",
            "Maximum Stress Condition",
        ]
    }
    return section