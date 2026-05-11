import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# =========================================================
# CONFIG
# =========================================================

ALLOWED_DOMAINS = {"sustainability", "operations", "exhibitors", "soc"}
ALLOWED_STATUSES = {"DRAFT", "GENERATED"}
ALLOWED_FORMATS = {"pdf", "xlsx"}


def _project_root() -> Path:
    # .../Report_export/app/report/storage/store.py
    # parents[3] => .../Report_export
    return Path(__file__).resolve().parents[3]


def _storage_dir() -> Path:
    path = _project_root() / "storage"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _db_path() -> Path:
    return _storage_dir() / "report_storage.db"


# =========================================================
# CONNECTION HELPERS
# =========================================================

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_report_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                report_id TEXT PRIMARY KEY,
                report_code TEXT UNIQUE NOT NULL,

                report_name TEXT NOT NULL,
                domain TEXT NOT NULL,

                section_list TEXT,
                filters_json TEXT NOT NULL,

                status TEXT NOT NULL,
                format TEXT,

                generated_by_user_id INTEGER,
                generated_by_name TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                generated_at TEXT,

                file_path TEXT,
                file_name TEXT,
                mime_type TEXT,
                file_size_bytes INTEGER,
                checksum TEXT,

                deleted_at TEXT
            )
            """
        )

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports(domain)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_deleted_at ON reports(deleted_at)"
        )

        conn.commit()


# =========================================================
# INTERNAL HELPERS
# =========================================================

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_domain(domain: str) -> None:
    if domain not in ALLOWED_DOMAINS:
        raise ValueError(f"Unsupported domain: {domain}")


def _validate_status(status: str) -> None:
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"Unsupported status: {status}")


def _validate_format(fmt: Optional[str]) -> None:
    if fmt is None:
        return
    if fmt not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported format: {fmt}")


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    item = dict(row)

    item["section_list"] = json.loads(item["section_list"]) if item["section_list"] else []
    item["filters_json"] = json.loads(item["filters_json"]) if item["filters_json"] else {}

    return item


# =========================================================
# CRUD
# =========================================================

def create_draft_report(
    *,
    report_id: str,
    report_code: str,
    report_name: str,
    domain: str,
    filters_json: Dict[str, Any],
    section_list: Optional[List[str]] = None,
    fmt: Optional[str] = None,
    generated_by_user_id: Optional[int] = None,
    generated_by_name: Optional[str] = None,
) -> Dict[str, Any]:
    _validate_domain(domain)
    _validate_status("DRAFT")
    _validate_format(fmt)

    now = _utc_now_iso()
    section_list = section_list or []

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO reports (
                report_id,
                report_code,
                report_name,
                domain,
                section_list,
                filters_json,
                status,
                format,
                generated_by_user_id,
                generated_by_name,
                created_at,
                updated_at,
                generated_at,
                file_path,
                file_name,
                mime_type,
                file_size_bytes,
                checksum,
                deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                report_code,
                report_name,
                domain,
                json.dumps(section_list),
                json.dumps(filters_json),
                "DRAFT",
                fmt,
                generated_by_user_id,
                generated_by_name,
                now,
                now,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
        )
        conn.commit()

    created = get_report_by_id(report_id)
    if created is None:
        raise RuntimeError("Draft report was inserted but could not be retrieved.")
    return created


def list_reports(include_deleted: bool = False) -> List[Dict[str, Any]]:
    query = "SELECT * FROM reports"
    params: List[Any] = []

    if not include_deleted:
        query += " WHERE deleted_at IS NULL"

    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()

    return [_row_to_dict(row) for row in rows]


def get_report_by_id(report_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM reports WHERE report_id = ?",
            (report_id,),
        ).fetchone()

    if row is None:
        return None

    return _row_to_dict(row)


def get_report_by_code(report_code: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM reports WHERE report_code = ?",
            (report_code,),
        ).fetchone()

    if row is None:
        return None

    return _row_to_dict(row)


def mark_report_generated(
    *,
    report_id: str,
    fmt: str,
    file_path: str,
    file_name: str,
    mime_type: str,
    file_size_bytes: int,
    checksum: str,
) -> Optional[Dict[str, Any]]:
    _validate_format(fmt)

    now = _utc_now_iso()

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE reports
            SET
                status = ?,
                format = ?,
                generated_at = ?,
                updated_at = ?,
                file_path = ?,
                file_name = ?,
                mime_type = ?,
                file_size_bytes = ?,
                checksum = ?
            WHERE report_id = ?
              AND deleted_at IS NULL
            """,
            (
                "GENERATED",
                fmt,
                now,
                now,
                file_path,
                file_name,
                mime_type,
                file_size_bytes,
                checksum,
                report_id,
            ),
        )
        conn.commit()

    return get_report_by_id(report_id)


def require_report_by_id(report_id: str) -> Dict[str, Any]:
    report = get_report_by_id(report_id)
    if report is None:
        raise RuntimeError(f"Report not found: {report_id}")
    return report

def insert_generated_report(
    *,
    report_id: str,
    report_code: str,
    report_name: str,
    domain: str,
    filters_json: Dict[str, Any],
    section_list: Optional[List[str]] = None,
    fmt: str,
    generated_by_user_id: Optional[int] = None,
    generated_by_name: Optional[str] = None,
    generated_at: Optional[str] = None,
    file_path: str,
    file_name: str,
    mime_type: str,
    file_size_bytes: int,
    checksum: str,
) -> Dict[str, Any]:
    _validate_domain(domain)
    _validate_status("GENERATED")
    _validate_format(fmt)

    now = _utc_now_iso()
    generated_at = generated_at or now
    section_list = section_list or []

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO reports (
                report_id,
                report_code,
                report_name,
                domain,
                section_list,
                filters_json,
                status,
                format,
                generated_by_user_id,
                generated_by_name,
                created_at,
                updated_at,
                generated_at,
                file_path,
                file_name,
                mime_type,
                file_size_bytes,
                checksum,
                deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                report_code,
                report_name,
                domain,
                json.dumps(section_list),
                json.dumps(filters_json),
                "GENERATED",
                fmt,
                generated_by_user_id,
                generated_by_name,
                now,
                now,
                generated_at,
                file_path,
                file_name,
                mime_type,
                file_size_bytes,
                checksum,
                None,
            ),
        )
        conn.commit()

    created = get_report_by_id(report_id)
    if created is None:
        raise RuntimeError("Generated report was inserted but could not be retrieved.")
    return created


def update_draft_report(
    *,
    report_id: str,
    report_name: str,
    domain: str,
    filters_json: Dict[str, Any],
    section_list: Optional[List[str]] = None,
    fmt: Optional[str] = None,
) -> Dict[str, Any]:
    _validate_domain(domain)
    _validate_format(fmt)

    now = _utc_now_iso()
    section_list = section_list or []

    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE reports
            SET
                report_name = ?,
                domain = ?,
                section_list = ?,
                filters_json = ?,
                format = ?,
                updated_at = ?
            WHERE report_id = ?
              AND deleted_at IS NULL
              AND status = 'DRAFT'
            """,
            (
                report_name,
                domain,
                json.dumps(section_list),
                json.dumps(filters_json),
                fmt,
                now,
                report_id,
            ),
        )
        conn.commit()

    if cursor.rowcount == 0:
        raise RuntimeError(f"Draft report not found or not editable: {report_id}")

    updated = get_report_by_id(report_id)
    if updated is None:
        raise RuntimeError("Draft report was updated but could not be retrieved.")
    return updated


def soft_delete_report(report_id: str) -> bool:
    now = _utc_now_iso()

    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE reports
            SET deleted_at = ?, updated_at = ?
            WHERE report_id = ?
              AND deleted_at IS NULL
            """,
            (now, now, report_id),
        )
        conn.commit()

    return cursor.rowcount > 0