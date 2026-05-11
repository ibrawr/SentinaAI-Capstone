from typing import Any, Dict, List
import pandas as pd




def build_occupancy_section(df: pd.DataFrame, filters: Any) -> Dict[str, Any]:
    # ---------------------------------------------------------
    # Guard
    # ---------------------------------------------------------
    if df.empty or "currentOccupancy" not in df.columns:
        section = {
            "title": "Occupancy & Events Overview",
            "subtitle": "No occupancy data available for the selected filters.",
            "columns": ["Message"],
            "table_rows": [{"Message": "No occupancy data available for the selected filters."}],
            "summary": ["Try changing date range / zones / facilities."],
        }
        xlsx_sheet = {
            "name": "Occupancy & Events Detail",
            "columns": ["Message"],
            "rows": [{"Message": "No occupancy data after filtering."}],
        }
        return {"pdf_section": section, "xlsx_sheets": [xlsx_sheet]}

    if "hallName" not in df.columns:
        df = df.assign(hallName="Unknown")
    if "zoneId" not in df.columns:
        df = df.assign(zoneId="Unknown")
    if "hallCapacity" not in df.columns:
        df = df.assign(hallCapacity=None)

    has_events = ("isEvent" in df.columns) and ("eventId" in df.columns)

    df_ev = (
        df[(df["isEvent"] == True)].copy()
        if ("isEvent" in df.columns)
        else df.iloc[0:0].copy()
    )

    # ---------------------------------------------------------
    # Bucket x Hall x Zone aggregation
    # ---------------------------------------------------------
    occ = (
        df.groupby(["bucket", "hallName", "zoneId"], dropna=False)
          .agg(
              avg_occupancy=("currentOccupancy", "mean"),
              peak_occupancy=("currentOccupancy", "max"),
              hallCapacity=("hallCapacity", "max"),
          )
          .reset_index()
    )

    occ["avg_occupancy"] = pd.to_numeric(occ["avg_occupancy"], errors="coerce").fillna(0).round(1)
    occ["peak_occupancy"] = pd.to_numeric(occ["peak_occupancy"], errors="coerce").fillna(0).astype(int)

    # % capacity avg (safe)
    cap_num = pd.to_numeric(occ["hallCapacity"], errors="coerce")

    occ["pct_capacity_avg"] = (
        (occ["avg_occupancy"] / cap_num) * 100
    )

    # Set invalid capacity rows to NaN (not None)
    occ.loc[cap_num <= 0, "pct_capacity_avg"] = float("nan")

    occ["pct_capacity_avg"] = occ["pct_capacity_avg"].round(1)

    # ---- EVENTS: compute event_count + event_ids from df_ev, then merge ----
    has_events = ("isEvent" in df.columns) and ("eventId" in df.columns)

    if has_events:
        df_ev = df[df["isEvent"] == True].copy()

        ev_bucket = (
            df_ev.groupby(["bucket", "hallName", "zoneId"])["eventId"]
                .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                .reset_index(name="event_ids_list")
        )
        ev_bucket["event_count"] = ev_bucket["event_ids_list"].apply(len)
        ev_bucket["event_ids"] = ev_bucket["event_ids_list"].apply(lambda ids: ", ".join(ids))
        ev_bucket = ev_bucket.drop(columns=["event_ids_list"])
    else:
        ev_bucket = pd.DataFrame(columns=["bucket", "hallName", "zoneId", "event_count", "event_ids"])

    occ = occ.merge(ev_bucket, on=["bucket", "hallName", "zoneId"], how="left")
    occ["event_count"] = pd.to_numeric(occ["event_count"], errors="coerce").fillna(0).astype(int)
    occ["event_ids"] = occ["event_ids"].fillna("")

    # ---------------------------------------------------------
    # Events per bucket x hall x zone (FULL list, no cap)
    # ---------------------------------------------------------
    if has_events and not df_ev.empty:
        ev_bucket = (
            df_ev.groupby(["bucket", "hallName", "zoneId"])["eventId"]
                .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                .reset_index(name="event_ids_list")
        )
        ev_bucket["event_count"] = ev_bucket["event_ids_list"].apply(len)
        ev_bucket["event_ids"] = ev_bucket["event_ids_list"].apply(lambda ids: ";".join(ids))
        ev_bucket = ev_bucket.drop(columns=["event_ids_list"])
    else:
        ev_bucket = pd.DataFrame(
            columns=["bucket", "hallName", "zoneId", "event_count", "event_ids"]
        )


    # ---------------------------------------------------------
    # Hall summary (for PDF overview table)
    # ---------------------------------------------------------
    hall_summary = (
        occ.groupby(["hallName", "zoneId"], dropna=False)
           .agg(
               avg_occupancy=("avg_occupancy", "mean"),
               peak_occupancy=("peak_occupancy", "max"),
               hallCapacity=("hallCapacity", "max"),
               total_event_count=("event_count", "sum"),
           )
           .reset_index()
    )

    peak_time_per_hall = (
        occ.sort_values(["hallName", "zoneId", "peak_occupancy"], ascending=[True, True, False])
           .drop_duplicates(["hallName", "zoneId"])
           [["hallName", "zoneId", "bucket"]]
           .rename(columns={"bucket": "peak_time"})
    )
    hall_summary = hall_summary.merge(peak_time_per_hall, on=["hallName", "zoneId"], how="left")

    # ---------------------------------------------------------
    # Overall peak moment (for PDF summary lines)
    # ---------------------------------------------------------
    overall_peak_time = overall_peak_hall = overall_peak_zone = "—"
    overall_peak_val = 0
    if len(occ.index) > 0:
        peak_row = occ.sort_values("peak_occupancy", ascending=False).iloc[0]
        overall_peak_time = str(peak_row["bucket"])
        overall_peak_hall = str(peak_row["hallName"])
        overall_peak_zone = str(peak_row["zoneId"])
        overall_peak_val = int(peak_row["peak_occupancy"])

    total_unique_events = int(df_ev["eventId"].nunique()) if has_events and not df_ev.empty else 0

    # ---------------------------------------------------------
    # PDF rows (hall summary)
    # ---------------------------------------------------------
    pdf_rows: List[Dict[str, Any]] = []
    for _, r in hall_summary.iterrows():
        cap = pd.to_numeric(r["hallCapacity"], errors="coerce")
        peak_pct: Any = "N/A"
        if pd.notna(cap) and float(cap) > 0:
            peak_pct = round((float(r["peak_occupancy"]) / float(cap)) * 100, 1)

        pdf_rows.append({
            "Hall": str(r["hallName"]),
            "Zone": str(r["zoneId"]),
            "Capacity": int(cap) if pd.notna(cap) else "—",
            "Avg Occupancy": round(float(r["avg_occupancy"]), 1) if pd.notna(r["avg_occupancy"]) else 0.0,
            "Peak Occupancy": int(r["peak_occupancy"]),
            "Peak Time": str(r["peak_time"]) if pd.notna(r.get("peak_time")) else "—",
            "Peak % Capacity": peak_pct,
            "Event Count": int(r["total_event_count"]),
            "Event IDs": "—",  # keep overview clean; detail goes to XLSX
        })

    section = {
        "title": "Occupancy & Events Overview",
        "subtitle": "Executive summary of occupancy and event activity by hall.",
        "columns": [
            "Hall","Zone","Capacity","Avg Occupancy","Peak Occupancy",
            "Peak Time","Peak % Capacity","Event Count","Event IDs",
        ],
        "table_rows": pdf_rows if pdf_rows else [{"Message": "No data."}],
        "summary": [
            f"<strong>Peak Moment</strong><br>{overall_peak_time} | {overall_peak_hall} ({overall_peak_zone})<br><br>",
            f"<strong>Context at peak</strong><br>Occupancy: {overall_peak_val} people<br><br>",
            f"<strong>Coverage</strong><br>• Halls included: {len(hall_summary)}<br>• Total unique events in period: {total_unique_events}<br><br>",
        ],
    }

    # ---------------------------------------------------------
    # XLSX detail sheet (NO CAP on rows)
    # ---------------------------------------------------------
    xlsx_rows: List[Dict[str, Any]] = []
    for _, r in occ.sort_values(["hallName", "zoneId", "bucket"]).iterrows():
        xlsx_rows.append({
            "Time Bucket": str(r["bucket"]),
            "Hall": str(r["hallName"]),
            "Zone": str(r["zoneId"]),
            "Capacity": r["hallCapacity"],
            "Avg Occupancy": float(r["avg_occupancy"]),
            "Peak Occupancy": int(r["peak_occupancy"]),
            "% Capacity (avg)": r["pct_capacity_avg"],
            "Event Count": int(r["event_count"]),
            "Event IDs": str(r["event_ids"]),
        })

    xlsx_sheet = {
        "name": "Occupancy & Events Detail",
        "columns": [
            "Time Bucket","Hall","Zone","Capacity",
            "Avg Occupancy","Peak Occupancy","% Capacity (avg)",
            "Event Count","Event IDs",
        ],
        "rows": xlsx_rows,
    }

    return {"pdf_section": section, 
            "xlsx_sheets": [xlsx_sheet],
            "used_metrics": [
                "Capacity",
                "Average Occupancy",
                "Peak Occupancy",
                "Peak % Capacity",
                "Event Count",
                "Event IDs",
            ]
            }
