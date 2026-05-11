from typing import Dict, Any, Optional
import pandas as pd

from app.report.module.exhibitors.constant import SECTION_LABELS


def _unique_join(series: Optional[pd.Series], default: str = "N/A", limit: int = 5) -> str:
    if series is None or series.empty:
        return default
    vals = [str(v).strip() for v in series.dropna().tolist() if str(v).strip()]
    uniq = []
    seen = set()
    for v in vals:
        if v not in seen:
            uniq.append(v)
            seen.add(v)
    if not uniq:
        return default
    if len(uniq) <= limit:
        return ", ".join(uniq)
    return ", ".join(uniq[:limit]) + f" +{len(uniq) - limit} more"


def _safe_num(value: Any, decimals: int = 2) -> str:
    try:
        if pd.isna(value):
            return "N/A"
        v = float(value)
        if decimals == 0:
            return f"{int(round(v)):,}"
        return f"{v:,.{decimals}f}"
    except Exception:
        return "N/A"


def _time_intervals_label(df: pd.DataFrame, frequency: str) -> str:
    if df is None or df.empty:
        return "0 intervals"

    freq = (frequency or "").strip().lower()

    ts_col = None
    for col in ["bucket", "bucket_ts", "ts", "timestamp", "datetime"]:
        if col in df.columns:
            ts_col = col
            break

    if ts_col is None:
        count = len(df)
    else:
        temp = df.copy()
        temp[ts_col] = pd.to_datetime(temp[ts_col], errors="coerce")
        temp = temp.dropna(subset=[ts_col])

        if freq == "hourly":
            count = temp[ts_col].dt.floor("h").nunique()
            unit = "hour"
        elif freq == "daily":
            count = temp[ts_col].dt.floor("d").nunique()
            unit = "day"
        elif freq == "weekly":
            count = temp[ts_col].dt.to_period("W").nunique()
            unit = "week"
        elif freq == "monthly":
            count = temp[ts_col].dt.to_period("M").nunique()
            unit = "month"
        else:
            count = temp[ts_col].nunique()
            unit = "interval"

        if count != 1:
            unit += "s"

        return f"{count} {unit}"

    unit = "interval"
    if count != 1:
        unit += "s"
    return f"{count} {unit}"


def build_booth_profile_section(
    df: pd.DataFrame,
    filters,
    event_row: Optional[Dict[str, Any]] = None,
    exhibitor_row: Optional[Dict[str, Any]] = None,
    assignments_df: Optional[pd.DataFrame] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    title = SECTION_LABELS.get("booth_profile", "Booth and Exhibitor Profile")
    event_row = event_row or {}
    exhibitor_row = exhibitor_row or {}
    scope = scope or {}
    assignments_df = assignments_df.copy() if assignments_df is not None else pd.DataFrame()

    # =========================================================
    # EVENT METADATA
    # =========================================================
    event_name = str(event_row.get("event_name") or event_row.get("event_id") or getattr(filters, "event_id", "N/A"))
    event_id = str(event_row.get("event_id") or getattr(filters, "event_id", "N/A"))
    event_status = str(event_row.get("status") or "N/A")

    event_start = event_row.get("start_datetime_utc")
    event_end = event_row.get("end_datetime_utc")
    event_window = "N/A"
    if pd.notna(event_start) and pd.notna(event_end):
        event_window = (
            f"{pd.to_datetime(event_start).strftime('%Y-%m-%d %H:%M')} to "
            f"{pd.to_datetime(event_end).strftime('%Y-%m-%d %H:%M')}"
        )

    # =========================================================
    # EXHIBITOR METADATA
    # =========================================================
    contact_name = str(exhibitor_row.get("contactName") or "N/A")
    contact_email = str(exhibitor_row.get("contactEmail") or "N/A")
    contact_phone = str(exhibitor_row.get("contactPhone") or "N/A")
    exhibitor_name = str(
        exhibitor_row.get("exhibitor_name")
        or exhibitor_row.get("exhibitor_id")
        or getattr(filters, "exhibitor_id", "N/A")
    )
    exhibitor_id = str(exhibitor_row.get("exhibitor_id") or getattr(filters, "exhibitor_id", "N/A"))
    industry = str(exhibitor_row.get("industry") or "N/A")
    hq_country = str(exhibitor_row.get("hq_country") or "N/A")
    exhibitor_status = str(exhibitor_row.get("status") or "N/A")

    # =========================================================
    # ASSIGNMENT METADATA
    # =========================================================
    if assignments_df.empty:
        booth_codes = ", ".join(scope.get("booth_codes") or scope.get("booth_ids") or []) or "N/A"
        booth_ids = ", ".join(scope.get("booth_ids") or []) or "N/A"
        hall_names = ", ".join(scope.get("hall_names") or []) or "N/A"
        zone_ids = ", ".join(scope.get("zone_ids") or []) or "N/A"
        booth_size_type = "N/A"
        booth_area_total = "N/A"
        package_tier = "N/A"
        discount_pct = "N/A"
        amount_paid_aed = "N/A"
    else:
        booth_codes = _unique_join(assignments_df.get("booth_code"), default="N/A")
        booth_ids = _unique_join(assignments_df.get("booth_id"), default="N/A")
        hall_names = _unique_join(assignments_df.get("hall_name"), default="N/A")
        zone_ids = _unique_join(assignments_df.get("zone_id"), default="N/A")
        booth_size_type = _unique_join(assignments_df.get("booth_size_type"), default="N/A")
        package_tier = _unique_join(assignments_df.get("package_tier"), default="N/A")

        booth_area_total = "N/A"
        if "booth_area_sqm" in assignments_df.columns:
            area_sum = pd.to_numeric(assignments_df["booth_area_sqm"], errors="coerce").fillna(0).sum()
            booth_area_total = _safe_num(area_sum, 2)

        discount_pct = "N/A"
        if "discount_pct" in assignments_df.columns:
            discounts = pd.to_numeric(assignments_df["discount_pct"], errors="coerce").dropna()
            if not discounts.empty:
                discount_pct = _safe_num(discounts.mean(), 2)

        amount_paid_aed = "N/A"
        if "amount_paid_aed" in assignments_df.columns:
            paid_sum = pd.to_numeric(assignments_df["amount_paid_aed"], errors="coerce").fillna(0).sum()
            amount_paid_aed = _safe_num(paid_sum, 2)

    time_intervals_analysed = _time_intervals_label(df, getattr(filters, "frequency", "Hourly"))

    # =========================================================
    # PDF BLOCKS (MATCHES TEMPLATE)
    # =========================================================
    exhibitor_contact= {
        "title": "Exhibitor Contact Details",
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Primary Contact", "Details":contact_name},
            {"Attribute": "Contact Email", "Details": contact_email},
            {"Attribute": "Contact Phone", "Details": contact_phone},
        ],
    }
    block_event_exhibitor = {
        "title": "Event and Exhibitor Details",
        "summary": [
            (
                f"<strong>{exhibitor_name}</strong> is assigned to booth "
                f"<strong>{booth_codes if booth_codes != 'N/A' else booth_ids}</strong> "
                f"in <strong>{hall_names}</strong> for <strong>{event_name}</strong>, "
                f"under the <strong>{package_tier}</strong> package, with "
                f"<strong>{time_intervals_analysed}</strong> analysed."
                )
        ],
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Event Name", "Details": event_name},
            {"Attribute": "Event Window", "Details": event_window},
            {"Attribute": "Exhibitor Name", "Details": exhibitor_name},
            {"Attribute": "Exhibitor ID", "Details": exhibitor_id},
            {"Attribute": "Industry", "Details": industry},
            {"Attribute": "HQ Country", "Details": hq_country},
        ],
    }

    block_booth_allocation = {
        "title": "Booth Allocation",
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Booth Code", "Details": booth_codes if booth_codes != "N/A" else booth_ids},
            {"Attribute": "Hall", "Details": hall_names},
            {"Attribute": "Zone", "Details": zone_ids},
            {"Attribute": "Booth Size Type", "Details": booth_size_type},
            {"Attribute": "Total Booth Area (sqm)", "Details": booth_area_total},
        ],
    }

    block_commercial_scope = {
        "title": "Commercial and Analysis Scope",
        "columns": ["Attribute", "Details"],
        "table_rows": [
            {"Attribute": "Package Tier", "Details": package_tier},
            {"Attribute": "Avg Discount (%)", "Details": discount_pct},
            {"Attribute": "Amount Paid (AED)", "Details": amount_paid_aed},
            {"Attribute": "Time Intervals Analysed", "Details": time_intervals_analysed},
        ],
    }

    # =========================================================
    # EXCEL 
    # =========================================================
    xlsx_rows = [
    # ===== Event & Exhibitor =====
    {"Attribute": "Event & Exhibitor", "Details": ""},
    {"Attribute": "Primary Contact", "Details":contact_name},
    {"Attribute": "Contact Email", "Details": contact_email},
    {"Attribute": "Contact Phone", "Details": contact_phone},

    {"Attribute": "Event Name", "Details": event_name},
    {"Attribute": "Event Window", "Details": event_window},
    {"Attribute": "Exhibitor Name", "Details": exhibitor_name},
    {"Attribute": "Exhibitor ID", "Details": exhibitor_id},
    {"Attribute": "Industry", "Details": industry},
    {"Attribute": "HQ Country", "Details": hq_country},
    {"Attribute": "", "Details": ""},

    # ===== Booth Allocation =====
    {"Attribute": "Booth Allocation", "Details": ""},
    {"Attribute": "Booth Code", "Details": booth_codes if booth_codes != "N/A" else booth_ids},
    {"Attribute": "Hall", "Details": hall_names},
    {"Attribute": "Zone", "Details": zone_ids},
    {"Attribute": "Booth Size Type", "Details": booth_size_type},
    {"Attribute": "Total Booth Area (sqm)", "Details": booth_area_total},
    {"Attribute": "", "Details": ""},

    # ===== Commercial =====
    {"Attribute": "Commercial Details", "Details": ""},
    {"Attribute": "Package Tier", "Details": package_tier},
    {"Attribute": "Avg Discount (%)", "Details": discount_pct},
    {"Attribute": "Amount Paid (AED)", "Details": amount_paid_aed},
    {"Attribute": "Time Intervals Analysed", "Details": time_intervals_analysed},
    
    ]
    


    # =========================================================
    # RETURN
    # =========================================================
    return {
        "key": "booth_profile",
        "title": title,
        "blocks": [
            exhibitor_contact,
            block_event_exhibitor,
            block_booth_allocation,
            block_commercial_scope,
        ],
        "summary": [],
        "columns": [],
        "table_rows": [],
        "xlsx_sheets": [
            {
                "name": "Exhibitor Profile",
                "columns": ["Attribute", "Details"],
                "rows": xlsx_rows,
            }
        ],
    }