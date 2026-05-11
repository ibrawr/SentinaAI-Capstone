import pandas as pd

def _safe_mean_numeric(series_like, ndigits=3):
    s = pd.to_numeric(pd.Series(series_like), errors="coerce").dropna()
    if len(s) == 0:
        return "—"
    return round(float(s.mean()), ndigits)

def build_energy_section(df: pd.DataFrame, filters) -> dict:
    # -----------------------
    # Guard / required column
    # -----------------------
    if df.empty or "hvacEnergyKWh" not in df.columns:
        msg = {
            "title": "Energy Consumption",
            "subtitle": "No energy data available for the selected filters.",
            "columns": ["Message"],
            "table_rows": [{"Message": "No HVAC energy (hvacEnergyKWh) data available for the selected filters."}],
            "summary": ["Try changing date range / zones / facilities."],
        }
        return msg

    # Ensure columns exist (no .get)
    if "hallName" not in df.columns:
        df = df.assign(hallName="Unknown")
    if "zoneId" not in df.columns:
        df = df.assign(zoneId="Unknown")
    if "currentOccupancy" not in df.columns:
        df = df.assign(currentOccupancy=0)

    has_outdoor = "outdoorTempC" in df.columns
    has_indoor  = "indoorTempC" in df.columns
    has_events  = ("isEvent" in df.columns) and ("eventId" in df.columns)
    has_ts      = "timestamp" in df.columns

    # df_ev defined once (avoid referenced-before-assignment)
    if has_events:
        df_ev = df[df["isEvent"] == True].copy()
    else:
        df_ev = df.iloc[0:0].copy()

    # -----------------------
    # Detail: bucket×hall×zone
    # -----------------------
    agg_dict = {
        "total_kwh": ("hvacEnergyKWh", "sum"),
        "avg_occupancy": ("currentOccupancy", "mean"),
    }
    if has_outdoor:
        agg_dict["avg_outdoor_temp"] = ("outdoorTempC", "mean")
    if has_indoor:
        agg_dict["avg_indoor_temp"] = ("indoorTempC", "mean")

    energy_detail = (
        df.groupby(["bucket", "hallName", "zoneId"], dropna=False)
          .agg(**agg_dict)
          .reset_index()
    )

    energy_detail["total_kwh"] = pd.to_numeric(energy_detail["total_kwh"], errors="coerce").fillna(0.0)
    energy_detail["avg_occupancy"] = pd.to_numeric(energy_detail["avg_occupancy"], errors="coerce").fillna(0.0)

    # temp delta
    if has_outdoor and has_indoor:
        energy_detail["avg_outdoor_temp"] = pd.to_numeric(energy_detail["avg_outdoor_temp"], errors="coerce")
        energy_detail["avg_indoor_temp"]  = pd.to_numeric(energy_detail["avg_indoor_temp"], errors="coerce")
        energy_detail["temp_delta"] = (energy_detail["avg_indoor_temp"] - energy_detail["avg_outdoor_temp"]).round(2)
        energy_detail["temp_delta"] = energy_detail["temp_delta"].fillna("")
    else:
        energy_detail["temp_delta"] = ""

    # kWh / occupant (avoid divide-by-zero)
    denom = energy_detail["avg_occupancy"].replace(0, pd.NA)
    energy_detail["kwh_per_occupant"] = (energy_detail["total_kwh"] / denom).round(2)
    energy_detail["kwh_per_occupant"] = energy_detail["kwh_per_occupant"].fillna("")

    # ---- formatting/rounding for readability (PDF + table) ----
    energy_detail["total_kwh"] = energy_detail["total_kwh"].round(2)
    energy_detail["avg_occupancy"] = energy_detail["avg_occupancy"].round(2)

    if has_outdoor and "avg_outdoor_temp" in energy_detail.columns:
        energy_detail["avg_outdoor_temp"] = pd.to_numeric(energy_detail["avg_outdoor_temp"], errors="coerce").round(2)

    if has_indoor and "avg_indoor_temp" in energy_detail.columns:
        energy_detail["avg_indoor_temp"] = pd.to_numeric(energy_detail["avg_indoor_temp"], errors="coerce").round(2)

    # -----------------------
    # Event IDs per bucket×hall×zone (FULL)
    # -----------------------
    if has_events and not df_ev.empty:
        ev_bucket = (
            df_ev.groupby(["bucket", "hallName", "zoneId"])["eventId"]
                .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                .reset_index(name="event_ids_list")
        )
        ev_bucket["Event IDs"] = ev_bucket["event_ids_list"].apply(lambda ids: ", ".join(ids))
        ev_bucket["Event Count"] = ev_bucket["event_ids_list"].apply(len)
        ev_bucket = ev_bucket.drop(columns=["event_ids_list"])
    else:
        ev_bucket = pd.DataFrame(columns=["bucket", "hallName", "zoneId", "Event IDs", "Event Count"])

    energy_detail = energy_detail.merge(ev_bucket, on=["bucket", "hallName", "zoneId"], how="left")

    if "Event IDs" not in energy_detail.columns:
        energy_detail["Event IDs"] = ""
    if "Event Count" not in energy_detail.columns:
        energy_detail["Event Count"] = 0

    energy_detail["Event IDs"] = energy_detail["Event IDs"].fillna("")
    energy_detail["Event Count"] = pd.to_numeric(energy_detail["Event Count"], errors="coerce").fillna(0).astype(int)

    # -----------------------
    # Peak energy moment (row from energy_detail)
    # -----------------------
    if len(energy_detail) > 0:
        peak_idx = energy_detail["total_kwh"].idxmax()
        pr = energy_detail.loc[peak_idx]

        # IMPORTANT: loc() can return DataFrame if index is duplicated → force Series
        if not isinstance(pr, pd.Series):
            pr = pr.iloc[0]

        peak_bucket = str(pr["bucket"]) if "bucket" in pr.index else "—"
        peak_hall   = str(pr["hallName"]) if "hallName" in pr.index else "—"
        peak_zone   = str(pr["zoneId"]) if "zoneId" in pr.index else "—"

        peak_total_kwh = 0.0
        if "total_kwh" in pr.index and str(pr["total_kwh"]).lower() not in ("", "nan", "none"):
            peak_total_kwh = float(pr["total_kwh"])

        peak_occ = 0.0
        if "avg_occupancy" in pr.index and str(pr["avg_occupancy"]).lower() not in ("", "nan", "none"):
            peak_occ = float(pr["avg_occupancy"])
        peak_occ_int = int(round(peak_occ))

        peak_outdoor = "—"
        peak_indoor  = "—"
        peak_delta   = "—"

        if has_outdoor and "avg_outdoor_temp" in pr.index:
            v = pr["avg_outdoor_temp"]
            peak_outdoor = v if str(v).lower() not in ("", "nan", "none") else "—"

        if has_indoor and "avg_indoor_temp" in pr.index:
            v = pr["avg_indoor_temp"]
            peak_indoor = v if str(v).lower() not in ("", "nan", "none") else "—"

        if has_outdoor and has_indoor and "temp_delta" in pr.index:
            v = pr["temp_delta"]
            peak_delta = v if str(v).lower() not in ("", "nan", "none") else "—"

        peak_kwh_per_occ = "—"
        if "kwh_per_occupant" in pr.index:
            v = pr["kwh_per_occupant"]
            peak_kwh_per_occ = v if str(v).lower() not in ("", "nan", "none") else "—"

        # NOTE: energy_detail usually has "event_ids" (lowercase), NOT "Event IDs"
        peak_event_ids = "—"
        if "event_ids" in pr.index:
            v = pr["event_ids"]
            peak_event_ids = v if str(v).strip().lower() not in ("", "nan", "none") else "—"
        elif "Event IDs" in pr.index:   # keep compatibility if you used that name
            v = pr["Event IDs"]
            peak_event_ids = v if str(v).strip().lower() not in ("", "nan", "none") else "—"

    else:
        peak_bucket = peak_hall = peak_zone = "—"
        peak_total_kwh = 0.0
        peak_occ_int = 0
        peak_outdoor = peak_indoor = peak_delta = "—"
        peak_kwh_per_occ = "—"
        peak_event_ids = "—"

    # -----------------------
    # Top event by occupancy (from df_ev raw rows)
    # -----------------------
    top_event_line = "Top event by occupancy: —"
    if has_events and not df_ev.empty and "currentOccupancy" in df_ev.columns:
        occ_series = pd.to_numeric(df_ev["currentOccupancy"], errors="coerce")
        occ_series = occ_series.fillna(-1)

        idx = occ_series.idxmax()
        r = df_ev.loc[idx]

        eid = str(r["eventId"])
        hall = str(r["hallName"])
        zone = str(r["zoneId"])
        v = r["currentOccupancy"]
        if isinstance(v, pd.Series):
            v = v.iloc[0]
        try:
            occ_val = int(round(float(v)))
        except Exception:
            occ_val = 0

        t = "—"
        if has_ts:
            t = str(r["timestamp"])

        top_event_line = f"Top event by occupancy: {eid} at {t} — {hall} ({zone}) reached {occ_val} occupants."

    # Total unique events
    total_unique_events = 0
    if has_events and not df_ev.empty:
        total_unique_events = int(df_ev["eventId"].nunique())
    
    # ============================================================
    # 2) Peak Window table (5–10 rows max), no blank
    # ============================================================
    peak_window_rows = []
    peak_window_cols = ["Time Bucket", "Hall", "Zone", "Total kWh", "Avg Occupancy"]
    if has_outdoor:
        peak_window_cols.append("Avg Outdoor Temp (°C)")
    if has_indoor:
        peak_window_cols.append("Avg Indoor Temp (°C)")
    if has_outdoor and has_indoor:
        peak_window_cols.append("Temp Δ (°C)")
    peak_window_cols += ["kWh / Occupant", "Event IDs"]

    if len(energy_detail) > 0:
        win = energy_detail[
            (energy_detail["hallName"] == peak_hall) &
            (energy_detail["zoneId"] == peak_zone)
        ].copy()

        win = win.sort_values("bucket").reset_index(drop=True)

        # find peak bucket index inside the hall/zone subset
        peak_pos = 0
        if len(win) > 0:
            # safest: find rows with bucket==peak_bucket, take first match
            match = win.index[win["bucket"] == peak_bucket]
            if len(match) > 0:
                peak_pos = int(match[0])

        # slice around peak_pos to get up to 10 rows
        start_i = max(0, peak_pos - 4)
        end_i = min(len(win), start_i + 10)
        win = win.iloc[start_i:end_i]

        for _, r in win.iterrows():
            row = {
                "Time Bucket": str(r["bucket"]),
                "Hall": str(r["hallName"]),
                "Zone": str(r["zoneId"]),
                "Total kWh": float(r["total_kwh"]),
                "Avg Occupancy": round(float(r["avg_occupancy"]), 1),
                "kWh / Occupant": r["kwh_per_occupant"],
                "Event IDs": r["Event IDs"] if str(r["Event IDs"]).strip() != "" else "—",
            }
            if has_outdoor:
                row["Avg Outdoor Temp (°C)"] = r["avg_outdoor_temp"] if "avg_outdoor_temp" in r.index else ""
            if has_indoor:
                row["Avg Indoor Temp (°C)"] = r["avg_indoor_temp"] if "avg_indoor_temp" in r.index else ""
            if has_outdoor and has_indoor:
                row["Temp Δ (°C)"] = r["temp_delta"]
            peak_window_rows.append(row)

    # cannot be blank
    if len(peak_window_rows) == 0:
        peak_window_rows = [{
            "Time Bucket": "—",
            "Hall": "—",
            "Zone": "—",
            "Total kWh": 0.0,
            "Avg Occupancy": 0,
            "kWh / Occupant": "—",
            "Event IDs": "—",
        }]
        if has_outdoor:
            peak_window_rows[0]["Avg Outdoor Temp (°C)"] = "—"
        if has_indoor:
            peak_window_rows[0]["Avg Indoor Temp (°C)"] = "—"
        if has_outdoor and has_indoor:
            peak_window_rows[0]["Temp Δ (°C)"] = "—"

    # ============================================================
    # 1) Executive  
    # ============================================================
    event_impact_line = (
        "No active event during this peak period"
        if peak_event_ids == "—"
        else f"Occurred during event(s): {peak_event_ids}"
        )
    
    exec_summary_block = {
    "subtitle": "Peak energy moment with contextual signals (time-aware).",
    "summary": [
        f"<strong>Peak energy moment</strong><br>{peak_bucket} — {peak_hall} ({peak_zone})<br><br>"
        f"<strong>Context at peak</strong><br>"
        f"• Occupancy: {peak_occ_int} people<br>"
        f"• Outdoor temperature: {peak_outdoor} °C<br>"
        f"• Indoor temperature: {peak_indoor} °C<br>"
        f"• Temp Δ: {peak_delta} °C<br>"
        f"• Energy per occupant: {peak_kwh_per_occ} kWh/person<br><br>"
        f"<strong>Event impact</strong><br>{event_impact_line}<br><br>",
        f"<strong>{top_event_line}</strong>"
    ],
    
}

    # ============================================================
    # 3) Hall-first summary table
    # ============================================================
    hall_exec = (
        energy_detail.groupby(["hallName", "zoneId"], dropna=False)
            .agg(
                total_kwh=("total_kwh", "sum"),
                avg_kwh_per_occupant=("kwh_per_occupant", lambda s: _safe_mean_numeric(s, 3)),
                peak_kwh=("total_kwh", "max"),
            )
            .reset_index()
    )

    peak_time_per_hall = (
        energy_detail.sort_values(["hallName", "zoneId", "total_kwh"], ascending=[True, True, False])
            .drop_duplicates(["hallName", "zoneId"])
            [["hallName", "zoneId", "bucket"]]
            .rename(columns={"bucket": "peak_time"})
    )
    hall_exec = hall_exec.merge(peak_time_per_hall, on=["hallName", "zoneId"], how="left")

    # unique events per hall
    if has_events and not df_ev.empty:
        hall_events = (
            df_ev.groupby(["hallName", "zoneId"])["eventId"]
                .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                .reset_index(name="event_ids_list")
        )
        hall_events["Event IDs"] = hall_events["event_ids_list"].apply(lambda ids: ", ".join(ids))
        hall_events["Event Count"] = hall_events["event_ids_list"].apply(len).astype(int)
        hall_events = hall_events.drop(columns=["event_ids_list"])
    else:
        hall_events = pd.DataFrame(columns=["hallName", "zoneId", "Event IDs", "Event Count"])

    hall_exec = hall_exec.merge(hall_events, on=["hallName", "zoneId"], how="left")

    if "Event IDs" not in hall_exec.columns:
        hall_exec["Event IDs"] = ""
    if "Event Count" not in hall_exec.columns:
        hall_exec["Event Count"] = 0

    hall_exec["Event IDs"] = hall_exec["Event IDs"].fillna("")
    hall_exec["Event Count"] = pd.to_numeric(hall_exec["Event Count"], errors="coerce").fillna(0).astype(int)

    hall_exec["total_kwh"] = pd.to_numeric(hall_exec["total_kwh"], errors="coerce").fillna(0.0).round(2)
    hall_exec["peak_kwh"] = pd.to_numeric(hall_exec["peak_kwh"], errors="coerce").fillna(0.0).round(2)

    hall_rows = []
    for _, r in hall_exec.sort_values(["total_kwh"], ascending=False).iterrows():
        event_ids_txt = r["Event IDs"] if str(r["Event IDs"]).strip() != "" else "—"
        hall_rows.append({
            "Hall": str(r["hallName"]),
            "Zone": str(r["zoneId"]),
            "Total kWh": float(r["total_kwh"]),
            "Avg kWh / Occupant": r["avg_kwh_per_occupant"],
            "Peak kWh": float(r["peak_kwh"]),
            "Peak Time": str(r["peak_time"]),
            "Event Count": int(r["Event Count"]),
            "Event IDs": event_ids_txt,
        })

    hall_summary_section = {
        "title": "Energy Consumption: Hall Summary",
        "subtitle": "Hall-first executive view (where energy went overall).",
        "columns": ["Hall", "Zone", "Total kWh", "Avg kWh / Occupant", "Peak kWh", "Peak Time", "Event Count", "Event IDs"],
        "table_rows": hall_rows if len(hall_rows) > 0 else [{"Message": "No energy rows after filtering."}],
        "summary": [
            f"<strong>Halls included:</strong> {len(hall_exec)}",
            f"<strong>Total unique events in period:</strong> {total_unique_events}",
        ],
    }

    # ============================================================
    # 4) Event vs Non-event breakdown
    # ============================================================
    ev_rows = []
    if "isEvent" in df.columns:
        df_event = df[df["isEvent"] == True].copy()
        df_nonev = df[df["isEvent"] != True].copy()

        def _row(label, dfx):
            total_kwh = float(pd.to_numeric(dfx["hvacEnergyKWh"], errors="coerce").fillna(0.0).sum()) if len(dfx) > 0 else 0.0
            avg_occ = float(pd.to_numeric(dfx["currentOccupancy"], errors="coerce").fillna(0.0).mean()) if len(dfx) > 0 else 0.0
            denom = avg_occ if avg_occ != 0 else None
            kwh_per_occ = round(total_kwh / denom, 3) if denom else "—"

            out_t = "—"
            in_t  = "—"
            if has_outdoor and len(dfx) > 0:
                out_t = round(float(pd.to_numeric(dfx["outdoorTempC"], errors="coerce").dropna().mean()), 1) if len(pd.to_numeric(dfx["outdoorTempC"], errors="coerce").dropna()) > 0 else "—"
            if has_indoor and len(dfx) > 0:
                in_t = round(float(pd.to_numeric(dfx["indoorTempC"], errors="coerce").dropna().mean()), 1) if len(pd.to_numeric(dfx["indoorTempC"], errors="coerce").dropna()) > 0 else "—"

            return {
                "Mode": label,
                "Total kWh": round(total_kwh, 2),
                "Avg Occupancy": round(avg_occ, 1),
                "kWh / Occupant": kwh_per_occ,
                "Avg Outdoor Temp (°C)": out_t if has_outdoor else "",
                "Avg Indoor Temp (°C)": in_t if has_indoor else "",
            }

        ev_rows.append(_row("During Events", df_event))
        ev_rows.append(_row("Non-Event Time", df_nonev))
    else:
        ev_rows = [{"Mode": "—", "Total kWh": 0.0, "Avg Occupancy": 0.0, "kWh / Occupant": "—"}]

    ev_cols = ["Mode", "Total kWh", "Avg Occupancy", "kWh / Occupant"]
    if has_outdoor:
        ev_cols.append("Avg Outdoor Temp (°C)")
    if has_indoor:
        ev_cols.append("Avg Indoor Temp (°C)")

    event_vs_nonevent_section = {
        "title": "Energy Consumption: Events vs Non-Events",
        "subtitle": "Quick comparison of energy use during event windows vs normal time.",
        "columns": ev_cols,
        "table_rows": ev_rows,
        "summary": [],
    }

    # ============================================================
    # 5) Top 3 most energy-intensive events
    # ============================================================
    top_event_rows = []
    if has_events and not df_ev.empty:
        ev_grp = (
            df_ev.groupby(["eventId", "hallName", "zoneId"], dropna=False)
                .agg(
                    total_kwh=("hvacEnergyKWh", "sum"),
                    peak_occupancy=("currentOccupancy", "max"),
                )
                .reset_index()
        )
        ev_grp["total_kwh"] = pd.to_numeric(ev_grp["total_kwh"], errors="coerce").fillna(0.0)
        ev_grp["peak_occupancy"] = pd.to_numeric(ev_grp["peak_occupancy"], errors="coerce").fillna(0.0)

        ev_grp = ev_grp.sort_values("total_kwh", ascending=False).head(3)

        for _, r in ev_grp.iterrows():
            top_event_rows.append({
                "Event ID": str(r["eventId"]),
                "Hall": str(r["hallName"]),
                "Zone": str(r["zoneId"]),
                "Total kWh": round(float(r["total_kwh"]), 2),
                "Peak Occupancy": int(round(float(r["peak_occupancy"]))),
            })
    else:
        top_event_rows = [{"Event ID": "—", "Hall": "—", "Zone": "—", "Total kWh": 0.0, "Peak Occupancy": 0}]

    top_events_section = {
        "title": "Energy Consumption: Top Events",
        "subtitle": "Top 3 most energy-intensive events in the selected period.",
        "columns": ["Event ID", "Hall", "Zone", "Total kWh", "Peak Occupancy"],
        "table_rows": top_event_rows,
        "summary": [],
    }

    peak_window_block = {
        "title": "Peak Window",
        "subtitle": "A short window around the peak energy moment (5–10 buckets).",
        "columns": peak_window_cols,
        "table_rows": peak_window_rows,
    }

    hall_summary_block = {
        "title": "Hall Summary",
        "subtitle": "Hall-first executive view (where energy went overall).",
        "summary": [
            f"<strong>Halls included:</strong> {len(hall_exec)}",
            f"<strong>Total unique events in period:</strong> {total_unique_events}",
        ],
        "columns": ["Hall","Zone","Total kWh","Avg kWh / Occupant","Peak kWh","Peak Time","Event Count","Event IDs"],
        "table_rows": hall_rows if len(hall_rows) > 0 else [{"Message": "No energy rows after filtering."}],
    }
    

    event_vs_nonevent_block = {
        "title": "Events vs Non-Events",
        "subtitle": "Quick comparison of energy use during event windows vs normal time.",
        "columns": ev_cols,
        "table_rows": ev_rows,
    }

    top_events_block = {
        "title": "Top Events",
        "subtitle": "Top 3 most energy-intensive events in the selected period.",
        "columns": ["Event ID", "Hall", "Zone", "Total kWh", "Peak Occupancy"],
        "table_rows": top_event_rows,
        }
    
    energy_section = {
    "title": "Energy Consumption",
    "subtitle": "HVAC energy usage patterns, peak windows, and event impact.",
    "blocks": [
        exec_summary_block,
        peak_window_block,
        hall_summary_block,
        event_vs_nonevent_block,
        top_events_block,
    ],
    }

    # ============================================================
    # XLSX DETAIL SHEET (FULL, dynamic columns)
    # ============================================================
    base_map = [
        ("bucket", "Time Bucket"),
        ("hallName", "Hall"),
        ("zoneId", "Zone"),
        ("total_kwh", "Total kWh"),
        ("avg_occupancy", "Avg Occupancy"),
        ("avg_outdoor_temp", "Avg Outdoor Temp (°C)"),
        ("avg_indoor_temp", "Avg Indoor Temp (°C)"),
        ("temp_delta", "Temp Δ (°C)"),
        ("kwh_per_occupant", "kWh / Occupant"),
        ("Event Count", "Event Count"),
        ("Event IDs", "Event IDs"),
    ]

    present = [(src, label) for (src, label) in base_map if src in energy_detail.columns]

    xlsx_columns = [label for (_, label) in present]

    xlsx_rows = []
    for _, r in energy_detail.sort_values(["hallName", "zoneId", "bucket"]).iterrows():
        row = {}
        for src, label in present:
            v = r[src]

            if pd.isna(v):
                v = ""

            row[label] = v
        xlsx_rows.append(row)

    xlsx_sheet = {
        "name": "Energy Detail",
        "columns": xlsx_columns,
        "rows": xlsx_rows,
    }
    
    return {
    **energy_section,
    "xlsx_sheets": [xlsx_sheet],
    "used_metrics": [
        "Total Energy Consumption (kWh)",
        "Peak Energy Usage",
        "Average Energy Usage",
        "kWh / Occupant",
        "Occupancy-Adjusted Energy",
        "Energy Intensity",
        "Average Occupancy",
        "Average Outdoor Temp (°C)",
        "Average Indoor Temp (°C)",
        "Temp Δ (°C)",
        "Event Count",
        "Event IDs",
    ]

}