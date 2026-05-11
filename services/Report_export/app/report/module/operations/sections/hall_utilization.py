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


def build_hall_utilization_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:

    # -----------------------
    # Guard
    # -----------------------
    if df is None or len(df) == 0:
        msg = {
            "title": "Hall Utilization Ranking",
            "subtitle": "No operational data available for the selected filters.",
            "blocks": [],
        }
        return msg  # no xlsx sheets either

    # Ensure minimum columns exist
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

    # bucket length (minutes) from filters.frequency
    # If you already bucket to 15-min always, keep it fixed at 15.
    freq = str(getattr(filters, "frequency", "") or "").lower()
    bucket_minutes = 15
    if "30" in freq:
        bucket_minutes = 30
    elif "60" in freq or "hour" in freq:
        bucket_minutes = 60
    elif "120" in freq:
        bucket_minutes = 120

    # Clean numeric occupancy/capacity
    df["currentOccupancy"] = pd.to_numeric(df["currentOccupancy"], errors="coerce").fillna(0.0)
    if has_capacity:
        df["hallCapacity"] = pd.to_numeric(df["hallCapacity"], errors="coerce")

    # -----------------------
    # Base aggregation: hall × zone
    # -----------------------
    agg = {
        "avg_occupancy": ("currentOccupancy", "mean"),
        "peak_occupancy": ("currentOccupancy", "max"),
        "buckets_seen": ("bucket", "nunique"),
    }
    if has_capacity:
        agg["capacity"] = ("hallCapacity", "max")

    hz = (
        df.groupby(["hallName", "zoneId"], dropna=False)
          .agg(**agg)
          .reset_index()
    )

    hz["avg_occupancy"] = pd.to_numeric(hz["avg_occupancy"], errors="coerce").fillna(0.0).round(1)
    hz["peak_occupancy"] = pd.to_numeric(hz["peak_occupancy"], errors="coerce").fillna(0.0).round(0).astype(int)

    if has_capacity:
        hz["capacity"] = pd.to_numeric(hz["capacity"], errors="coerce")

        cap_num = hz["capacity"].replace(0, pd.NA)
        hz["pct_capacity_avg"] = ((hz["avg_occupancy"] / cap_num) * 100).round(1)
        hz["pct_capacity_peak"] = ((hz["peak_occupancy"] / cap_num) * 100).round(1)
        hz.loc[hz["capacity"].isna() | (hz["capacity"] <= 0), ["pct_capacity_avg", "pct_capacity_peak"]] = pd.NA
    else:
        hz["capacity"] = pd.NA
        hz["pct_capacity_avg"] = pd.NA
        hz["pct_capacity_peak"] = pd.NA
    

    # -----------------------
    # Event activity metrics
    # -----------------------
    hz["event_active_buckets"] = 0
    hz["event_active_hours"] = 0.0
    hz["unique_events"] = 0
    hz["event_active_share"] = 0.0

    if has_events:
        df_ev = df[df["isEvent"] == True].copy()

        if len(df_ev) > 0:
            ev_active = (
                df_ev.groupby(["hallName", "zoneId"])["bucket"]
                    .nunique()
                    .reset_index(name="event_active_buckets")
            )

            ev_unique = (
                df_ev.groupby(["hallName", "zoneId"])["eventId"]
                    .apply(lambda s: len({str(x) for x in s.dropna()}))
                    .reset_index(name="unique_events")
            )

            hz = hz.drop(columns=["event_active_buckets", "unique_events"], errors="ignore")

            hz = hz.merge(ev_active, on=["hallName", "zoneId"], how="left")
            hz = hz.merge(ev_unique, on=["hallName", "zoneId"], how="left")

            hz["event_active_buckets"] = (
                pd.to_numeric(hz["event_active_buckets"], errors="coerce")
                .fillna(0)
                .astype(int)
            )

            hz["unique_events"] = (
                pd.to_numeric(hz["unique_events"], errors="coerce")
                .fillna(0)
                .astype(int)
            )

            hz["event_active_hours"] = (hz["event_active_buckets"] * (bucket_minutes / 60.0)).round(2)
            denom = hz["buckets_seen"].replace(0, pd.NA)
            hz["event_active_share"] = (hz["event_active_buckets"] / denom).fillna(0.0).round(3)
    
    # -----------------------
    # Utilization score for ranking
    # -----------------------
    if has_capacity:
        cap = hz["capacity"].replace(0, pd.NA)
        avg_ratio = (hz["avg_occupancy"] / cap).fillna(0.0)
        peak_ratio = (hz["peak_occupancy"] / cap).fillna(0.0)
        hz["util_score"] = (avg_ratio * 0.5 + peak_ratio * 0.3 + hz["event_active_share"] * 0.2).round(4)
    else:
        # normalize by max
        max_avg = float(hz["avg_occupancy"].max()) if len(hz) > 0 else 1.0
        max_peak = float(hz["peak_occupancy"].max()) if len(hz) > 0 else 1.0
        hz["util_score"] = (
            (hz["avg_occupancy"] / (max_avg or 1.0)) * 0.6 +
            (hz["peak_occupancy"] / (max_peak or 1.0)) * 0.4
        ).round(4)

    hz_ranked = hz.sort_values("util_score", ascending=False).reset_index(drop=True)
    hz_ranked["rank"] = hz_ranked.index + 1

    # -----------------------
    # 1: Top utilization ranking
    # -----------------------
    top_n = 10
    pdf_rows_1: List[Dict[str, Any]] = []
    for _, r in hz_ranked.head(top_n).iterrows():
        pdf_rows_1.append({
            "Rank": int(r["rank"]),
            "Hall": str(r["hallName"]),
            "Zone": str(r["zoneId"]),
            "Avg Occ": float(r["avg_occupancy"]),
            "Peak Occ": int(r["peak_occupancy"]),
            "%Cap Avg": "" if pd.isna(r["pct_capacity_avg"]) else float(r["pct_capacity_avg"]),
            "%Cap Peak": "" if pd.isna(r["pct_capacity_peak"]) else float(r["pct_capacity_peak"]),
            "Event Hrs": float(r["event_active_hours"]),
            "Util Score": float(r["util_score"]),
        })

    block1_cols = ["Rank", "Hall", "Zone", "Avg Occ", "Peak Occ", "%Cap Avg", "%Cap Peak", "Event Hrs", "Util Score"]

    # headline
    headline = "No utilization ranking available."
    if len(hz_ranked) > 0:
        r0 = hz_ranked.iloc[0]
        headline = (
            f"Top utilized area: {r0['hallName']} ({r0['zoneId']}) "
            f"with utilization score {r0['util_score']}."
        )

    block1 = {
        "title": "Utilization Ranking (Top 10)",
        "subtitle": "Ranked by combined occupancy + capacity usage + event activity.",
        "summary": [f"<strong>Headline</strong><br>{headline}<br><br>"],
        "columns": block1_cols,
        "table_rows": pdf_rows_1 if pdf_rows_1 else [{"Message": "No ranked rows."}],
    }

    # -----------------------
    # 2: Capacity utilization view (Top 10 by % cap avg)
    # -----------------------
    block2 = None
    if has_capacity:
        cap_sorted = hz_ranked.copy()
        cap_sorted["__pct__"] = pd.to_numeric(cap_sorted["pct_capacity_avg"], errors="coerce").fillna(-1)
        cap_sorted = cap_sorted.sort_values("__pct__", ascending=False)

        rows2 = []
        for _, r in cap_sorted.head(top_n).iterrows():
            rows2.append({
                "Hall": str(r["hallName"]),
                "Zone": str(r["zoneId"]),
                "Capacity": "" if pd.isna(r["capacity"]) else int(r["capacity"]),
                "%Cap Avg": "" if pd.isna(r["pct_capacity_avg"]) else float(r["pct_capacity_avg"]),
                "%Cap Peak": "" if pd.isna(r["pct_capacity_peak"]) else float(r["pct_capacity_peak"]),
            })

        block2 = {
            "title": "Capacity Utilization (Top 10)",
            "subtitle": "Which halls are closest to capacity under normal and peak conditions.",
            "columns": ["Hall", "Zone", "Capacity", "%Cap Avg", "%Cap Peak"],
            "table_rows": rows2 if rows2 else [{"Message": "No capacity rows."}],
        }

    # -----------------------
    # 3: Event activity (Top 10 by event hours)
    # -----------------------
    block3 = None
    if has_events:
        ev_sorted = hz_ranked.sort_values("event_active_hours", ascending=False)
        rows3 = []
        for _, r in ev_sorted.head(top_n).iterrows():
            rows3.append({
                "Hall": str(r["hallName"]),
                "Zone": str(r["zoneId"]),
                "Event Active (hrs)": float(r["event_active_hours"]),
                "Unique Events": int(r["unique_events"]),
                "Event Share": float(r["event_active_share"]),
            })

        block3 = {
            "title": "Event Activity (Top 10)",
            "subtitle": "Where event-time concentration is highest in the selected period.",
            "columns": ["Hall", "Zone", "Event Active (hrs)", "Unique Events", "Event Share"],
            "table_rows": rows3 if rows3 else [{"Message": "No event activity rows."}],
        }

    # -----------------------
    # XLSX Detail 
    # -----------------------
    # Details-only XLSX: export full hz_ranked
    xlsx_cols_map = [
        ("rank", "Rank"),
        ("hallName", "Hall"),
        ("zoneId", "Zone"),
        ("avg_occupancy", "Avg Occupancy"),
        ("peak_occupancy", "Peak Occupancy"),
        ("capacity", "Capacity"),
        ("pct_capacity_avg", "% Capacity (Avg)"),
        ("pct_capacity_peak", "% Capacity (Peak)"),
        ("event_active_buckets", "Event Active Buckets"),
        ("event_active_hours", "Event Active Hours"),
        ("unique_events", "Unique Events"),
        ("event_active_share", "Event Active Share"),
        ("util_score", "Utilization Score"),
    ]

    xlsx_cols = [label for (_, label) in xlsx_cols_map]
    xlsx_rows = []
    for _, r in hz_ranked.iterrows():
        row = {}
        for src, label in xlsx_cols_map:
            v = r[src] if src in hz_ranked.columns else ""
            if pd.isna(v):
                v = ""
            row[label] = v
        xlsx_rows.append(row)

    xlsx_sheet = {
        "name": "Hall Utilization Detail",
        "columns": xlsx_cols,
        "rows": xlsx_rows,
    }

    # -----------------------
    # Return section (PDF blocks + XLSX sheets)
    # -----------------------
    blocks = [block1]
    if block2:
        blocks.append(block2)
    if block3:
        blocks.append(block3)

    section = {
        "title": "Hall Utilization Ranking",
        "subtitle": "Occupancy, capacity usage, and event-active time by hall.",
        "blocks": blocks,
        "xlsx_sheets": [xlsx_sheet],
        "used_metrics": [
            "Average Occupancy",
            "Peak Occupancy",
            "% Capacity (Avg)",
            "% Capacity (Peak)",
            "Event Active Hours",
            "Utilization Score",
            "Unique Events",
            "Event Share",
        ]
    }
    return section