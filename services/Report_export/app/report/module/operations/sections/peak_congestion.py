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


def build_peak_congestion_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:
    """

    - Identify and rank the most congested time buckets (bucket×hall×zone)
    - Include occupancy, capacity %, stress index, and event context
    """

    # -----------------------
    # Guard
    # -----------------------
    if df is None or len(df) == 0:
        return {
            "title": "Peak Congestion Windows",
            "subtitle": "No operational data available for the selected filters.",
            "blocks": [],
        }

    # Ensure base columns
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

    # -----------------------
    # Aggregate: bucket × hall × zone
    # -----------------------
    agg = {
        "avg_occupancy": ("currentOccupancy", "mean"),
        "peak_occupancy": ("currentOccupancy", "max"),
        "rows": ("currentOccupancy", "size"),
    }
    if has_capacity:
        agg["capacity"] = ("hallCapacity", "max")

    if has_penalty:
        agg["avg_penalty"] = ("crowdComfortPenalty", "mean")

    detail = (
        df.groupby(["bucket", "hallName", "zoneId"], dropna=False)
          .agg(**agg)
          .reset_index()
    )

    detail["avg_occupancy"] = pd.to_numeric(detail["avg_occupancy"], errors="coerce").fillna(0.0).round(1)
    detail["peak_occupancy"] = pd.to_numeric(detail["peak_occupancy"], errors="coerce").fillna(0.0).round(0).astype(int)

    if has_capacity:
        detail["capacity"] = pd.to_numeric(detail["capacity"], errors="coerce")
        cap_num = detail["capacity"].replace(0, pd.NA)

        detail["pct_capacity_avg"] = ((detail["avg_occupancy"] / cap_num) * 100).round(1)
        detail["pct_capacity_peak"] = ((detail["peak_occupancy"] / cap_num) * 100).round(1)
        detail.loc[detail["capacity"].isna() | (detail["capacity"] <= 0), ["pct_capacity_avg", "pct_capacity_peak"]] = pd.NA
    else:
        detail["capacity"] = pd.NA
        detail["pct_capacity_avg"] = pd.NA
        detail["pct_capacity_peak"] = pd.NA

    if has_penalty and "avg_penalty" in detail.columns:
        detail["avg_penalty"] = pd.to_numeric(detail["avg_penalty"], errors="coerce").fillna(0.0).round(3)
    else:
        detail["avg_penalty"] = 0.0

    # -----------------------
    # Event context per bucket×hall×zone
    # -----------------------
    detail["Event Count"] = 0
    detail["Event IDs"] = ""

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

            detail = detail.drop(columns=["Event Count", "Event IDs"], errors="ignore")
            detail = detail.merge(ev_bucket, on=["bucket", "hallName", "zoneId"], how="left")

            detail["Event Count"] = (
                pd.to_numeric(detail["Event Count"], errors="coerce")
                .fillna(0)
                .astype(int)
            )
            detail["Event IDs"] = detail["Event IDs"].fillna("")

    # -----------------------
    # Stress index (same family as exec/event impact)
    # -----------------------
    if has_capacity:
        cap_num = detail["capacity"].replace(0, pd.NA)
        occ_ratio = (detail["avg_occupancy"] / cap_num).fillna(0.0)
    else:
        max_avg = float(detail["avg_occupancy"].max()) if len(detail) > 0 else 1.0
        occ_ratio = detail["avg_occupancy"] / (max_avg or 1.0)

    # event flag at window level: 1 if event_count>0
    ev_flag = (detail["Event Count"] > 0).astype(int)

    # penalty normalized (if present) — keep simple: clamp by max
    if has_penalty:
        max_pen = float(detail["avg_penalty"].max()) if len(detail) > 0 else 1.0
        pen_norm = (detail["avg_penalty"] / (max_pen or 1.0)).fillna(0.0)
    else:
        pen_norm = 0.0

    detail["stress_index"] = (occ_ratio * 0.6 + ev_flag * 0.2 + pen_norm * 0.2).round(4)

    # -----------------------
    # Rank congestion windows
    # priority: stress_index (primary), then peak occupancy
    # -----------------------
    ranked = detail.sort_values(["stress_index", "peak_occupancy"], ascending=[False, False]).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    # -----------------------
    # PDF Block 1: Top 10 congestion windows (overall)
    # -----------------------
    top_n = 10
    rows1: List[Dict[str, Any]] = []
    for _, r in ranked.head(top_n).iterrows():
        rows1.append({
            "Rank": int(r["rank"]),
            "Time Bucket": _safe_str(r["bucket"]),
            "Hall": _safe_str(r["hallName"]),
            "Zone": _safe_str(r["zoneId"]),
            "Peak Occ": int(r["peak_occupancy"]),
            "%Cap Peak": "" if pd.isna(r["pct_capacity_peak"]) else float(r["pct_capacity_peak"]),
            "Stress": float(r["stress_index"]),
            "Event Count": int(r["Event Count"]),
        })

    cols1 = ["Rank", "Time Bucket", "Hall", "Zone", "Peak Occ", "%Cap Peak", "Stress", "Event Count"]

    headline = "No congestion windows detected."
    if len(ranked) > 0:
        r0 = ranked.iloc[0]
        headline = (
            f"Highest congestion window: {r0['bucket']} — {r0['hallName']} ({r0['zoneId']}) "
            f"with stress score {r0['stress_index']}."
        )

    block1 = {
        "title": "Top Congestion Windows (Overall)",
        "subtitle": "Highest-stress operational windows ranked across all halls and zones.",
        "summary": [f"<strong>Headline</strong><br>{headline}<br><br>"],
        "columns": cols1,
        "table_rows": rows1 if rows1 else [{"Message": "No ranked windows."}],
    }

    # -----------------------
    # 2: Peak per hall/zone (1 row per hall/zone)
    # -----------------------
    per_hz = (
        ranked.sort_values(["hallName", "zoneId", "stress_index"], ascending=[True, True, False])
              .drop_duplicates(["hallName", "zoneId"])
    )
    rows2: List[Dict[str, Any]] = []
    for _, r in per_hz.head(top_n).iterrows():
        rows2.append({
            "Hall": _safe_str(r["hallName"]),
            "Zone": _safe_str(r["zoneId"]),
            "Peak Time": _safe_str(r["bucket"]),
            "Peak Occ": int(r["peak_occupancy"]),
            "%Cap Peak": "" if pd.isna(r["pct_capacity_peak"]) else float(r["pct_capacity_peak"]),
            "Stress": float(r["stress_index"]),
            "Event IDs": _safe_str(r["Event IDs"], "—") if str(r["Event IDs"]).strip() else "—",
        })

    block2 = {
        "title": "Peak Window Per Hall",
        "subtitle": "Worst (highest stress) window observed in each hall/zone.",
        "columns": ["Hall", "Zone", "Peak Time", "Peak Occ", "%Cap Peak", "Stress", "Event IDs"],
        "table_rows": rows2 if rows2 else [{"Message": "No per-hall peaks."}],
    }

    # -----------------------
    #3: Event-linked peaks (top 10 where events are present)
    # -----------------------
    block3 = None
    ev_ranked = ranked[ranked["Event Count"] > 0].copy()
    if len(ev_ranked) > 0:
        rows3: List[Dict[str, Any]] = []
        for _, r in ev_ranked.head(top_n).iterrows():
            rows3.append({
                "Time Bucket": _safe_str(r["bucket"]),
                "Hall": _safe_str(r["hallName"]),
                "Zone": _safe_str(r["zoneId"]),
                "Peak Occ": int(r["peak_occupancy"]),
                "Stress": float(r["stress_index"]),
                "Event IDs": _safe_str(r["Event IDs"], "—") if str(r["Event IDs"]).strip() else "—",
            })

        block3 = {
            "title": "Event-Linked Congestion Peaks",
            "subtitle": "Top congestion windows that occurred during active events.",
            "columns": ["Time Bucket", "Hall", "Zone", "Peak Occ", "Stress", "Event IDs"],
            "table_rows": rows3 if rows3 else [{"Message": "No event-linked windows."}],
        }

    # -----------------------
    # XLSX Detail
    # -----------------------
    xlsx_cols_map = [
        ("rank", "Rank"),
        ("bucket", "Time Bucket"),
        ("hallName", "Hall"),
        ("zoneId", "Zone"),
        ("avg_occupancy", "Avg Occupancy"),
        ("peak_occupancy", "Peak Occupancy"),
        ("capacity", "Capacity"),
        ("pct_capacity_avg", "% Capacity (Avg)"),
        ("pct_capacity_peak", "% Capacity (Peak)"),
        ("avg_penalty", "Avg Crowd Penalty"),
        ("Event Count", "Event Count"),
        ("Event IDs", "Event IDs"),
        ("stress_index", "Stress Index"),
    ]

    xlsx_cols = [label for (_, label) in xlsx_cols_map]
    xlsx_rows: List[Dict[str, Any]] = []

    for _, r in ranked.iterrows():
        row = {}
        for src, label in xlsx_cols_map:
            v = r[src] if src in ranked.columns else ""
            if pd.isna(v):
                v = ""
            row[label] = v
        xlsx_rows.append(row)

    xlsx_sheet = {
        "name": "Peak Congestion Detail",
        "columns": xlsx_cols,
        "rows": xlsx_rows,
    }

    # -----------------------
    # Return
    # -----------------------
    blocks = [block1, block2]
    if block3:
        blocks.append(block3)

    section = {
        "title": "Peak Congestion Windows",
        "subtitle": "Time-aware ranking of highest-stress operational windows.",
        "blocks": blocks,
        "xlsx_sheets": [xlsx_sheet],
        "used_metrics": [
            "Peak Congestion Window",
            "Peak Occupancy",
            "% Capacity (Peak)",
            "Peak Stress",
            "Event Count",
            "Event IDs",
        ]
    }
    return section