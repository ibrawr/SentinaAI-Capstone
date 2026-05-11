import pandas as pd

def _safe_float(x, default=0.0):
    try:
        if isinstance(x, pd.Series):
            if len(x) == 0:
                return default
            x = x.iloc[0]
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
        if isinstance(x, pd.Series):
            if len(x) == 0:
                return default
            x = x.iloc[0]
        s = str(x).strip()
        if s == "" or s.lower() in ("nan", "none", "nat"):
            return default
        return s
    except Exception:
        return default

def build_environmental_section(df: pd.DataFrame, filters) -> dict:
        if df is None or len(df) == 0:

            """
        Environmental Metrics (Temp, CO₂, Humidity):
        • Executive narrative 
        • Peak window context 
        • Hall-first table 
        • Event vs non-event 
        • Top discomfort moments 
        """

        # -----------------------
        # Guard
        # -----------------------
        if df is None or len(df) == 0:
            msg = {
                "title": "Environmental Metrics",
                "subtitle": "No environmental data available for the selected filters.",
                "summary": ["Try changing date range / zones / facilities."],
                "columns": ["Message"],
                "table_rows": [{"Message": "No rows available after filtering."}],
            }
            return msg

        if "hallName" not in df.columns:
            df = df.assign(hallName="Unknown")
        if "zoneId" not in df.columns:
            df = df.assign(zoneId="Unknown")
        if "bucket" not in df.columns:
            df = df.assign(bucket="—")
        if "currentOccupancy" not in df.columns:
            df = df.assign(currentOccupancy=0)

        has_indoor = "indoorTempC" in df.columns
        has_outdoor = "outdoorTempC" in df.columns
        has_humidity = "humidityPct" in df.columns
        has_comfort_index = "comfortIndex" in df.columns
        has_comfort_status = "comfortStatus" in df.columns
        has_crowd_penalty = "crowdComfortPenalty" in df.columns

        has_events = ("isEvent" in df.columns) and ("eventId" in df.columns)
        has_ts = "timestamp" in df.columns

        co2_col = None
        for cand in ["co2ppm", "co2Ppm", "CO2ppm", "CO2PPM", "co2", "CO2"]:
            if cand in df.columns:
                co2_col = cand
                break
        has_co2 = co2_col is not None

        if not (has_indoor or has_outdoor or has_humidity or has_co2 or has_comfort_index):
            msg = {
                "title": "Environmental Metrics",
                "subtitle": "No environmental columns found in dataset for the selected filters.",
                "summary": [
                    "Expected at least one of: indoorTempC, outdoorTempC, humidityPct, CO₂ column, comfortIndex."
                ],
                "columns": ["Message"],
                "table_rows": [{"Message": "No usable environmental columns were detected."}],
            }
            return {"pdf_section": msg, "csv_section": None}

   
        if has_events:
            df_ev = df[df["isEvent"] == True].copy()
        else:
            df_ev = df.iloc[0:0].copy()

        # -----------------------
        # Detail aggregation: bucket × hall × zone
        # -----------------------
        agg_dict = {
            "avg_occupancy": ("currentOccupancy", "mean"),
        }
        if has_indoor:
            agg_dict["avg_indoor_temp"] = ("indoorTempC", "mean")
        if has_outdoor:
            agg_dict["avg_outdoor_temp"] = ("outdoorTempC", "mean")
        if has_humidity:
            agg_dict["avg_humidity"] = ("humidityPct", "mean")
        if has_co2:
            agg_dict["avg_co2"] = (co2_col, "mean")
        if has_comfort_index:
            agg_dict["avg_comfort_index"] = ("comfortIndex", "mean")
        if has_crowd_penalty:
            agg_dict["avg_crowd_penalty"] = ("crowdComfortPenalty", "mean")

        env_detail = (
            df.groupby(["bucket", "hallName", "zoneId"], dropna=False)
            .agg(**agg_dict)
            .reset_index()
        )

        # Numeric cleanup + rounding (readability)
        env_detail["avg_occupancy"] = pd.to_numeric(env_detail["avg_occupancy"], errors="coerce").fillna(0.0).round(1)

        if has_indoor and "avg_indoor_temp" in env_detail.columns:
            env_detail["avg_indoor_temp"] = pd.to_numeric(env_detail["avg_indoor_temp"], errors="coerce").round(2)
            env_detail["avg_indoor_temp"] = env_detail["avg_indoor_temp"].fillna("")

        if has_outdoor and "avg_outdoor_temp" in env_detail.columns:
            env_detail["avg_outdoor_temp"] = pd.to_numeric(env_detail["avg_outdoor_temp"], errors="coerce").round(2)
            env_detail["avg_outdoor_temp"] = env_detail["avg_outdoor_temp"].fillna("")

        if has_humidity and "avg_humidity" in env_detail.columns:
            env_detail["avg_humidity"] = pd.to_numeric(env_detail["avg_humidity"], errors="coerce").round(2)
            env_detail["avg_humidity"] = env_detail["avg_humidity"].fillna("")

        if has_co2 and "avg_co2" in env_detail.columns:
            env_detail["avg_co2"] = pd.to_numeric(env_detail["avg_co2"], errors="coerce").round(0)
            env_detail["avg_co2"] = env_detail["avg_co2"].fillna("")

        if has_comfort_index and "avg_comfort_index" in env_detail.columns:
            env_detail["avg_comfort_index"] = pd.to_numeric(env_detail["avg_comfort_index"], errors="coerce").round(2)
            env_detail["avg_comfort_index"] = env_detail["avg_comfort_index"].fillna("")

        if has_crowd_penalty and "avg_crowd_penalty" in env_detail.columns:
            env_detail["avg_crowd_penalty"] = pd.to_numeric(env_detail["avg_crowd_penalty"], errors="coerce").round(2)
            env_detail["avg_crowd_penalty"] = env_detail["avg_crowd_penalty"].fillna("")

        # Optional: temp delta (indoor - outdoor)
        if has_indoor and has_outdoor:
            a = pd.to_numeric(env_detail["avg_indoor_temp"], errors="coerce")
            b = pd.to_numeric(env_detail["avg_outdoor_temp"], errors="coerce")
            env_detail["temp_delta"] = (a - b).round(2)
            env_detail["temp_delta"] = env_detail["temp_delta"].fillna("")
        else:
            env_detail["temp_delta"] = ""

        # Comfort status per bucket×hall×zone (if available)
        if has_comfort_status:
            st = (
                df.groupby(["bucket", "hallName", "zoneId"], dropna=False)["comfortStatus"]
                .apply(lambda s: s.dropna().astype(str).value_counts().index[0] if len(s.dropna()) > 0 else "—")
                .reset_index(name="comfort_status")
            )
            env_detail = env_detail.merge(st, on=["bucket", "hallName", "zoneId"], how="left")
            if "comfort_status" in env_detail.columns:
                env_detail["comfort_status"] = env_detail["comfort_status"].fillna("—")
        else:
            env_detail["comfort_status"] = "—"

        # Event IDs per bucket×hall×zone
        if has_events and len(df_ev) > 0:
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

        env_detail = env_detail.merge(ev_bucket, on=["bucket", "hallName", "zoneId"], how="left")

        if "Event IDs" not in env_detail.columns:
            env_detail["Event IDs"] = ""
        if "Event Count" not in env_detail.columns:
            env_detail["Event Count"] = 0

        env_detail["Event IDs"] = env_detail["Event IDs"].fillna("")
        env_detail["Event Count"] = pd.to_numeric(env_detail["Event Count"], errors="coerce").fillna(0).astype(int)

        # -----------------------
        # Peak discomfort moment
        # Prefer: lowest comfortIndex (if available), else worst by indoor temp (highest)
        # -----------------------
        peak_bucket = "—"
        peak_hall = "—"
        peak_zone = "—"
        peak_occ = 0
        peak_indoor = "—"
        peak_outdoor = "—"
        peak_humidity = "—"
        peak_co2 = "—"
        peak_delta = "—"
        peak_comfort = "—"
        peak_status = "—"
        peak_penalty = "—"
        peak_event_ids = "—"

        if len(env_detail) > 0:
            if has_comfort_index and "avg_comfort_index" in env_detail.columns:
                # lowest comfortIndex = worst
                ci = pd.to_numeric(env_detail["avg_comfort_index"], errors="coerce")
                ci = ci.fillna(10**9)
                peak_idx = ci.idxmin()
            elif has_indoor and "avg_indoor_temp" in env_detail.columns:
                it = pd.to_numeric(env_detail["avg_indoor_temp"], errors="coerce")
                it = it.fillna(-10**9)
                peak_idx = it.idxmax()
            else:
                peak_idx = 0

            pr = env_detail.loc[peak_idx]
            if not isinstance(pr, pd.Series):
                pr = pr.iloc[0]

            if "bucket" in pr.index:
                peak_bucket = _safe_str(pr["bucket"], "—")
            if "hallName" in pr.index:
                peak_hall = _safe_str(pr["hallName"], "—")
            if "zoneId" in pr.index:
                peak_zone = _safe_str(pr["zoneId"], "—")

            if "avg_occupancy" in pr.index:
                peak_occ = _safe_int(pr["avg_occupancy"], 0)

            if has_indoor and "avg_indoor_temp" in pr.index:
                peak_indoor = pr["avg_indoor_temp"] if str(pr["avg_indoor_temp"]).lower() not in ("", "nan", "none") else "—"
            if has_outdoor and "avg_outdoor_temp" in pr.index:
                peak_outdoor = pr["avg_outdoor_temp"] if str(pr["avg_outdoor_temp"]).lower() not in ("", "nan", "none") else "—"
            if has_humidity and "avg_humidity" in pr.index:
                peak_humidity = pr["avg_humidity"] if str(pr["avg_humidity"]).lower() not in ("", "nan", "none") else "—"
            if has_co2 and "avg_co2" in pr.index:
                peak_co2 = pr["avg_co2"] if str(pr["avg_co2"]).lower() not in ("", "nan", "none") else "—"

            if "temp_delta" in pr.index:
                peak_delta = pr["temp_delta"] if str(pr["temp_delta"]).lower() not in ("", "nan", "none") else "—"

            if has_comfort_index and "avg_comfort_index" in pr.index:
                peak_comfort = pr["avg_comfort_index"] if str(pr["avg_comfort_index"]).lower() not in ("", "nan", "none") else "—"

            if "comfort_status" in pr.index:
                peak_status = _safe_str(pr["comfort_status"], "—")

            if has_crowd_penalty and "avg_crowd_penalty" in pr.index:
                peak_penalty = pr["avg_crowd_penalty"] if str(pr["avg_crowd_penalty"]).lower() not in ("", "nan", "none") else "—"

            if "Event IDs" in pr.index:
                s = _safe_str(pr["Event IDs"], "")
                peak_event_ids = s if s != "—" and s != "" else "—"

        # Total unique events in period
        total_unique_events = 0
        if has_events and len(df_ev) > 0:
            total_unique_events = int(df_ev["eventId"].nunique())

        # -----------------------
        # Top event by occupancy (raw events)
        # -----------------------
        top_event_line = "Top event by occupancy: —"
        if has_events and len(df_ev) > 0 and "currentOccupancy" in df_ev.columns:
            occ_series = pd.to_numeric(df_ev["currentOccupancy"], errors="coerce").fillna(-1)
            idx = occ_series.idxmax()
            r = df_ev.loc[idx]
            if not isinstance(r, pd.Series):
                r = r.iloc[0]

            eid = _safe_str(r["eventId"], "—") if "eventId" in r.index else "—"
            hall = _safe_str(r["hallName"], "—") if "hallName" in r.index else "—"
            zone = _safe_str(r["zoneId"], "—") if "zoneId" in r.index else "—"
            occ_val = _safe_int(r["currentOccupancy"], 0) if "currentOccupancy" in r.index else 0

            t = "—"
            if has_ts and "timestamp" in r.index:
                t = _safe_str(r["timestamp"], "—")

            top_event_line = f"Top event by occupancy: {eid} at {t} — {hall} ({zone}) reached {occ_val} occupants."

        # ============================================================
        # BLOCK 1) Executive narrative
        # ============================================================
        event_impact_line = "No active event during this peak period"
        if peak_event_ids != "—":
            event_impact_line = f"Occurred during event(s): {peak_event_ids}"

        # Build context bullets dynamically (only show what exists)
        context_lines = []
        context_lines.append(f"• Occupancy: {peak_occ} people")
        if has_outdoor:
            context_lines.append(f"• Outdoor temperature: {peak_outdoor} °C")
        if has_indoor:
            context_lines.append(f"• Indoor temperature: {peak_indoor} °C")
        if has_indoor and has_outdoor:
            context_lines.append(f"• Temp Δ: {peak_delta} °C")
        if has_humidity:
            context_lines.append(f"• Humidity: {peak_humidity} %")
        if has_co2:
            context_lines.append(f"• CO₂: {peak_co2} ppm")
        if has_crowd_penalty:
            context_lines.append(f"• Crowd penalty: {peak_penalty}")
        if has_comfort_index:
            context_lines.append(f"• Comfort index: {peak_comfort} ({peak_status})")

        exec_summary_block = {
            "subtitle": "Peak environmental stress moment with contextual signals (time-aware).",
            "summary": [
                f"<strong>Peak stress moment</strong><br>{peak_bucket} — {peak_hall} ({peak_zone})<br><br>"
                f"<strong>Context at peak</strong><br>" + "<br>".join(context_lines) + "<br><br>"
                f"<strong>Event impact</strong><br>{event_impact_line}<br><br>",
                f"<strong>{top_event_line}</strong>",
            ],
        }

        # ============================================================
        # BLOCK 2) Peak Window (5–10 rows, cannot be blank)
        # ============================================================
        peak_window_cols = ["Time Bucket", "Hall", "Avg Occupancy"]
        if has_indoor:
            peak_window_cols.append("Avg Indoor Temp (°C)")
        if has_humidity:
            peak_window_cols.append("Avg Humidity (%)")
        if has_co2:
            peak_window_cols.append("Avg CO₂ (ppm)")
        if has_comfort_index:
            peak_window_cols.append("Comfort Index")
        peak_window_cols += ["Comfort Status", "Event IDs"]

        peak_window_rows = []
        if len(env_detail) > 0:
            win = env_detail[
                (env_detail["hallName"] == peak_hall) &
                (env_detail["zoneId"] == peak_zone)
            ].copy()

            win = win.sort_values("bucket").reset_index(drop=True)

            peak_pos = 0
            if len(win) > 0:
                match = win.index[win["bucket"] == peak_bucket]
                if len(match) > 0:
                    peak_pos = int(match[0])

            start_i = max(0, peak_pos - 4)
            end_i = min(len(win), start_i + 10)
            win = win.iloc[start_i:end_i]

            for _, rr in win.iterrows():
                row = {
                    "Time Bucket": _safe_str(rr["bucket"], "—"),
                    "Hall": _safe_str(rr["hallName"], "—"),
                    "Zone": _safe_str(rr["zoneId"], "—"),
                    "Avg Occupancy": _safe_float(rr["avg_occupancy"], 0.0),
                    "Comfort Status": _safe_str(rr["comfort_status"], "—") if "comfort_status" in rr.index else "—",
                    "Event IDs": _safe_str(rr["Event IDs"], "—") if str(rr["Event IDs"]).strip() != "" else "—",
                }

                if has_outdoor:
                    row["Avg Outdoor Temp (°C)"] = rr["avg_outdoor_temp"] if ("avg_outdoor_temp" in rr.index and str(rr["avg_outdoor_temp"]).lower() not in ("", "nan", "none")) else "—"
                if has_indoor:
                    row["Avg Indoor Temp (°C)"] = rr["avg_indoor_temp"] if ("avg_indoor_temp" in rr.index and str(rr["avg_indoor_temp"]).lower() not in ("", "nan", "none")) else "—"
                if has_indoor and has_outdoor:
                    row["Temp Δ (°C)"] = rr["temp_delta"] if ("temp_delta" in rr.index and str(rr["temp_delta"]).lower() not in ("", "nan", "none")) else "—"
                if has_humidity:
                    row["Avg Humidity (%)"] = rr["avg_humidity"] if ("avg_humidity" in rr.index and str(rr["avg_humidity"]).lower() not in ("", "nan", "none")) else "—"
                if has_co2:
                    row["Avg CO₂ (ppm)"] = rr["avg_co2"] if ("avg_co2" in rr.index and str(rr["avg_co2"]).lower() not in ("", "nan", "none")) else "—"
                if has_comfort_index:
                    row["Comfort Index"] = rr["avg_comfort_index"] if ("avg_comfort_index" in rr.index and str(rr["avg_comfort_index"]).lower() not in ("", "nan", "none")) else "—"

                peak_window_rows.append(row)

        if len(peak_window_rows) == 0:
            # cannot be blank
            fallback = {
                "Time Bucket": "—",
                "Hall": "—",
                "Zone": "—",
                "Avg Occupancy": 0,
                "Comfort Status": "—",
                "Event IDs": "—",
            }
            if has_outdoor:
                fallback["Avg Outdoor Temp (°C)"] = "—"
            if has_indoor:
                fallback["Avg Indoor Temp (°C)"] = "—"
            if has_indoor and has_outdoor:
                fallback["Temp Δ (°C)"] = "—"
            if has_humidity:
                fallback["Avg Humidity (%)"] = "—"
            if has_co2:
                fallback["Avg CO₂ (ppm)"] = "—"
            if has_comfort_index:
                fallback["Comfort Index"] = "—"
            peak_window_rows = [fallback]

        peak_window_block = {
            "title": "Peak Window",
            "subtitle": "A short window around the peak stress moment (5–10 buckets).",
            "columns": peak_window_cols,
            "table_rows": peak_window_rows,
        }

        # ============================================================
        # BLOCK 3) Hall Summary
        # ============================================================
        hall_agg = {
        "avg_occupancy": ("avg_occupancy", lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)),
        }

        if has_indoor:
            hall_agg["avg_indoor_temp"] = (
                "avg_indoor_temp",
                lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)
            )

        if has_outdoor:
            hall_agg["avg_outdoor_temp"] = (
                "avg_outdoor_temp",
                lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)
            )

        if has_humidity:
            hall_agg["avg_humidity"] = (
                "avg_humidity",
                lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)
            )

        if has_co2:
            hall_agg["avg_co2"] = (
                "avg_co2",
                lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)
            )

        if has_comfort_index:
            hall_agg["avg_comfort_index"] = (
                "avg_comfort_index",
                lambda s: round(pd.to_numeric(s, errors="coerce").mean(), 2)
            )

            hall_summary = (
                env_detail.groupby(["hallName", "zoneId"], dropna=False)
                .agg(**hall_agg)
                .reset_index()
            )

        # percent acceptable (if comfortStatus exists)
        if has_comfort_status:
            acc = (
                df.groupby(["hallName", "zoneId"], dropna=False)["comfortStatus"]
                .apply(lambda s: round(100.0 * (pd.Series(s.astype(str)) == "acceptable").mean(), 1) if len(s) > 0 else 0.0)
                .reset_index(name="pct_acceptable")
            )
            hall_summary = hall_summary.merge(acc, on=["hallName", "zoneId"], how="left")
        else:
            hall_summary["pct_acceptable"] = ""

        # worst comfort (min) + time (bucket) if comfortIndex exists
        if has_comfort_index:
            worst = (
                env_detail.copy()
            )
            ci = pd.to_numeric(worst["avg_comfort_index"], errors="coerce").fillna(10**9)
            worst["__ci__"] = ci
            worst = worst.sort_values(["hallName", "zoneId", "__ci__"], ascending=[True, True, True])
            worst = worst.drop_duplicates(["hallName", "zoneId"])[["hallName", "zoneId", "bucket", "avg_comfort_index"]]
            worst = worst.rename(columns={"bucket": "worst_time", "avg_comfort_index": "worst_comfort"})
            hall_summary = hall_summary.merge(worst, on=["hallName", "zoneId"], how="left")
        else:
            hall_summary["worst_time"] = ""
            hall_summary["worst_comfort"] = ""

        # Events per hall
        if has_events and len(df_ev) > 0:
            hall_events = (
                df_ev.groupby(["hallName", "zoneId"])["eventId"]
                    .apply(lambda s: sorted({str(x) for x in s.dropna()}))
                    .reset_index(name="event_ids_list")
            )
            hall_events["Event IDs"] = hall_events["event_ids_list"].apply(lambda ids: ", ".join(ids))
            hall_events["Event Count"] = hall_events["event_ids_list"].apply(len).astype(int)
            hall_events = hall_events.drop(columns=["event_ids_list"])
            hall_summary = hall_summary.merge(hall_events, on=["hallName", "zoneId"], how="left")
        else:
            hall_summary["Event Count"] = 0
            hall_summary["Event IDs"] = ""

        hall_summary["Event Count"] = pd.to_numeric(hall_summary["Event Count"], errors="coerce").fillna(0).astype(int)
        hall_summary["Event IDs"] = hall_summary["Event IDs"].fillna("")

        halls_count = int(hall_summary["hallName"].nunique()) if len(hall_summary) > 0 else 0
        zones_count = int(hall_summary["zoneId"].nunique()) if len(hall_summary) > 0 else 0

        hall_cols = ["Hall", "Zone"]
        if has_comfort_index:
            hall_cols += ["Avg Comfort", "Worst Comfort", "Worst Time"]
        if has_indoor:
            hall_cols.append("Avg Indoor Temp (°C)")
        if has_humidity:
            hall_cols.append("Avg Humidity (%)")
        if has_co2:
            hall_cols.append("Avg CO₂ (ppm)")
        hall_cols += ["Event IDs"]

        hall_rows = []
        if len(hall_summary) > 0:
            # sort by worst comfort (ascending) if available, else by occupancy desc
            if has_comfort_index and "worst_comfort" in hall_summary.columns:
                tmp = pd.to_numeric(hall_summary["worst_comfort"], errors="coerce").fillna(10**9)
                hall_summary = hall_summary.assign(__worst__=tmp).sort_values("__worst__", ascending=True)
            else:
                tmp = pd.to_numeric(hall_summary["avg_occupancy"], errors="coerce").fillna(0.0)
                hall_summary = hall_summary.assign(__occ__=tmp).sort_values("__occ__", ascending=False)

            for _, rr in hall_summary.iterrows():
                row = {
                    "Hall": _safe_str(rr["hallName"], "—"),
                    "Zone": _safe_str(rr["zoneId"], "—"),
                    "Avg Occupancy": round(_safe_float(rr["avg_occupancy"], 0.0), 1),
                    "Event Count": int(rr["Event Count"]),
                    "Event IDs": rr["Event IDs"] if str(rr["Event IDs"]).strip() != "" else "—",
                }

                if has_comfort_index:
                    row["Avg Comfort"] = rr["avg_comfort_index"] if ("avg_comfort_index" in rr.index and str(rr["avg_comfort_index"]).lower() not in ("", "nan", "none")) else "—"
                    row["Worst Comfort"] = rr["worst_comfort"] if ("worst_comfort" in rr.index and str(rr["worst_comfort"]).lower() not in ("", "nan", "none")) else "—"
                    row["Worst Time"] = _safe_str(rr["worst_time"], "—") if "worst_time" in rr.index else "—"

                if has_comfort_status:
                    row["% Acceptable"] = rr["pct_acceptable"] if ("pct_acceptable" in rr.index and str(rr["pct_acceptable"]).lower() not in ("nan", "none")) else "—"

                if has_indoor:
                    row["Avg Indoor Temp (°C)"] = rr["avg_indoor_temp"] if ("avg_indoor_temp" in rr.index and str(rr["avg_indoor_temp"]).lower() not in ("", "nan", "none")) else "—"
                if has_humidity:
                    row["Avg Humidity (%)"] = rr["avg_humidity"] if ("avg_humidity" in rr.index and str(rr["avg_humidity"]).lower() not in ("", "nan", "none")) else "—"
                if has_co2:
                    row["Avg CO₂ (ppm)"] = rr["avg_co2"] if ("avg_co2" in rr.index and str(rr["avg_co2"]).lower() not in ("", "nan", "none")) else "—"

                hall_rows.append(row)
        else:
            hall_rows = [{"Hall": "—", "Zone": "—", "Avg Occupancy": 0, "Event Count": 0, "Event IDs": "—"}]

        hall_summary_block = {
            "title": "Hall Summary",
            "subtitle": "Hall-first view of environmental comfort and risk areas.",
            "summary": [
                f"<strong>Halls analysed:</strong> {halls_count} across {zones_count} zone(s).",
                f"<strong>Total unique events in period:</strong> {total_unique_events}",
            ],
            "columns": hall_cols,
            "table_rows": hall_rows,
        }

        # ============================================================
        # BLOCK 4) Events vs Non-Events
        # ============================================================
        ev_cols = ["Mode", "Avg Occupancy"]
        if has_indoor:
            ev_cols.append("Avg Indoor Temp (°C)")
        if has_outdoor:
            ev_cols.append("Avg Outdoor Temp (°C)")
        if has_humidity:
            ev_cols.append("Avg Humidity (%)")
        if has_co2:
            ev_cols.append("Avg CO₂ (ppm)")
        if has_comfort_index:
            ev_cols.append("Avg Comfort Index")

        ev_rows = []
        if "isEvent" in df.columns:
            df_event = df[df["isEvent"] == True].copy()
            df_nonev = df[df["isEvent"] != True].copy()

            def _row(label, dfx):
                avg_occ = 0.0
                if "currentOccupancy" in dfx.columns and len(dfx) > 0:
                    avg_occ = float(pd.to_numeric(dfx["currentOccupancy"], errors="coerce").fillna(0.0).mean())

                row = {"Mode": label, "Avg Occupancy": round(avg_occ, 1)}

                if has_indoor:
                    it = pd.to_numeric(dfx["indoorTempC"], errors="coerce").dropna() if ("indoorTempC" in dfx.columns) else pd.Series([])
                    row["Avg Indoor Temp (°C)"] = round(float(it.mean()), 2) if len(it) > 0 else "—"
                if has_outdoor:
                    ot = pd.to_numeric(dfx["outdoorTempC"], errors="coerce").dropna() if ("outdoorTempC" in dfx.columns) else pd.Series([])
                    row["Avg Outdoor Temp (°C)"] = round(float(ot.mean()), 2) if len(ot) > 0 else "—"
                if has_humidity:
                    hu = pd.to_numeric(dfx["humidityPct"], errors="coerce").dropna() if ("humidityPct" in dfx.columns) else pd.Series([])
                    row["Avg Humidity (%)"] = round(float(hu.mean()), 2) if len(hu) > 0 else "—"
                if has_co2:
                    cc = pd.to_numeric(dfx[co2_col], errors="coerce").dropna() if (co2_col in dfx.columns) else pd.Series([])
                    row["Avg CO₂ (ppm)"] = round(float(cc.mean()), 0) if len(cc) > 0 else "—"
                if has_comfort_index:
                    ci2 = pd.to_numeric(dfx["comfortIndex"], errors="coerce").dropna() if ("comfortIndex" in dfx.columns) else pd.Series([])
                    row["Avg Comfort Index"] = round(float(ci2.mean()), 2) if len(ci2) > 0 else "—"

                return row

            ev_rows.append(_row("During Events", df_event))
            ev_rows.append(_row("Non-Event Time", df_nonev))
        else:
            ev_rows = [{"Mode": "—", "Avg Occupancy": 0}]

        event_vs_nonevent_block = {
            "title": "Events vs Non-Events",
            "subtitle": "Comparison of environmental conditions during event windows vs normal time.",
            "columns": ev_cols,
            "table_rows": ev_rows,
        }

        # ============================================================
        # BLOCK 5) Top Discomfort Moments (Top 3)
        # ============================================================
        top_cols = ["Time Bucket", "Hall", "Zone", "Avg Occupancy"]
        if has_comfort_index:
            top_cols.append("Comfort Index")
        if has_comfort_status:
            top_cols.append("Comfort Status")
        if has_indoor:
            top_cols.append("Indoor Temp (°C)")
        if has_humidity:
            top_cols.append("Humidity (%)")
        if has_co2:
            top_cols.append("CO₂ (ppm)")
        top_cols.append("Event IDs")

        top_rows = []
        if len(env_detail) > 0:
            if has_comfort_index and "avg_comfort_index" in env_detail.columns:
                tmp = pd.to_numeric(env_detail["avg_comfort_index"], errors="coerce").fillna(10**9)
                top = env_detail.assign(__ci__=tmp).sort_values("__ci__", ascending=True).head(3)
            else:
                # fallback: highest indoor temp
                if has_indoor and "avg_indoor_temp" in env_detail.columns:
                    tmp = pd.to_numeric(env_detail["avg_indoor_temp"], errors="coerce").fillna(-10**9)
                    top = env_detail.assign(__t__=tmp).sort_values("__t__", ascending=False).head(3)
                else:
                    top = env_detail.head(3)

            for _, rr in top.iterrows():
                row = {
                    "Time Bucket": _safe_str(rr["bucket"], "—"),
                    "Hall": _safe_str(rr["hallName"], "—"),
                    "Zone": _safe_str(rr["zoneId"], "—"),
                    "Avg Occupancy": round(_safe_float(rr["avg_occupancy"], 0.0), 1),
                    "Event IDs": rr["Event IDs"] if str(rr["Event IDs"]).strip() != "" else "—",
                }
                if has_comfort_index:
                    row["Comfort Index"] = rr["avg_comfort_index"] if ("avg_comfort_index" in rr.index and str(rr["avg_comfort_index"]).lower() not in ("", "nan", "none")) else "—"
                if has_comfort_status:
                    row["Comfort Status"] = _safe_str(rr["comfort_status"], "—") if "comfort_status" in rr.index else "—"
                if has_indoor:
                    row["Indoor Temp (°C)"] = rr["avg_indoor_temp"] if ("avg_indoor_temp" in rr.index and str(rr["avg_indoor_temp"]).lower() not in ("", "nan", "none")) else "—"
                if has_humidity:
                    row["Humidity (%)"] = rr["avg_humidity"] if ("avg_humidity" in rr.index and str(rr["avg_humidity"]).lower() not in ("", "nan", "none")) else "—"
                if has_co2:
                    row["CO₂ (ppm)"] = rr["avg_co2"] if ("avg_co2" in rr.index and str(rr["avg_co2"]).lower() not in ("", "nan", "none")) else "—"

                top_rows.append(row)

        if len(top_rows) == 0:
            top_rows = [{"Time Bucket": "—", "Hall": "—", "Zone": "—", "Avg Occupancy": 0, "Event IDs": "—"}]

        top_discomfort_block = {
            "title": "Top Discomfort Moments",
            "subtitle": "Top 3 worst windows (lowest comfort or highest thermal stress).",
            "columns": top_cols,
            "table_rows": top_rows,
        }

        # ============================================================
        # PDF section 
        # ============================================================
        env_section = {
            "title": "Environmental Metrics",
            "blocks": [
                exec_summary_block,
                peak_window_block,
                hall_summary_block,
                event_vs_nonevent_block,
                top_discomfort_block,
            ],
        }

        # ============================================================
        # XLSX DETAIL SHEET 
        # ============================================================
        base_map = [
            ("bucket", "Time Bucket"),
            ("hallName", "Hall"),
            ("zoneId", "Zone"),
            ("avg_occupancy", "Avg Occupancy"),

            ("avg_outdoor_temp", "Avg Outdoor Temp (°C)"),
            ("avg_indoor_temp", "Avg Indoor Temp (°C)"),
            ("temp_delta", "Temp Δ (°C)"),

            ("avg_humidity", "Avg Humidity (%)"),
            ("avg_co2", "Avg CO₂ (ppm)"),

            ("avg_comfort_index", "Avg Comfort Index"),
            ("comfort_status", "Comfort Status"),
            ("avg_crowd_penalty", "Avg Crowd Penalty"),

            ("Event Count", "Event Count"),
            ("Event IDs", "Event IDs"),
        ]

        present = [(src, label) for (src, label) in base_map if src in env_detail.columns]
        xlsx_columns = [label for (_, label) in present]

        xlsx_rows = []
        for _, r in env_detail.sort_values(["hallName", "zoneId", "bucket"]).iterrows():
            row = {}
            for src, label in present:
                v = r[src]
                if pd.isna(v):
                    v = ""
                row[label] = v
            xlsx_rows.append(row)

        xlsx_sheet = {
            "name": "Environmental Detail",
            "columns": xlsx_columns,
            "rows": xlsx_rows,
        }
    
        return {
        **env_section,
        "xlsx_sheets": [xlsx_sheet],
        "used_metrics": [
            "Average Occupancy",
            "Average Indoor Temp (°C)",
            "Average Outdoor Temp (°C)",
            "Temp Δ (°C)",
            "Humidity (%)",
            "Average Humidity (%)",
            "Comfort Index",
            "Comfort Status",
            "Worst Comfort",
            "Worst Time",
            "Top Discomfort Moment",
            "Event IDs",
        ]

    }

