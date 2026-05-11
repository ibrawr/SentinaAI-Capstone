from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "assistant_logs.sqlite3"

_DB_LOCK = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _DB_LOCK:
        with _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS assistant_logs (
                    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    session_id TEXT,
                    user_id TEXT,
                    user_name TEXT,
                    role TEXT,
                    raw_query TEXT,
                    intent TEXT,
                    entities_json TEXT,
                    response_status TEXT,
                    response_type TEXT,
                    summary TEXT,
                    latency_ms INTEGER,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assistant_logs_timestamp ON assistant_logs (timestamp)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assistant_logs_user_id ON assistant_logs (user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assistant_logs_session_id ON assistant_logs (session_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assistant_logs_role ON assistant_logs (role)"
            )
            conn.commit()


_init_db()


class AssistantLogRepository:
    @staticmethod
    def add_log(log: Dict[str, Any]) -> None:
        entities = log.get("entities")
        serialized_entities = json.dumps(entities if entities is not None else {}, ensure_ascii=False)

        with _DB_LOCK:
            with _connect() as conn:
                conn.execute(
                    """
                    INSERT INTO assistant_logs (
                        timestamp,
                        session_id,
                        user_id,
                        user_name,
                        role,
                        raw_query,
                        intent,
                        entities_json,
                        response_status,
                        response_type,
                        summary,
                        latency_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        log.get("timestamp"),
                        log.get("session_id"),
                        log.get("user_id"),
                        log.get("user_name"),
                        log.get("role"),
                        log.get("raw_query"),
                        log.get("intent"),
                        serialized_entities,
                        log.get("response_status"),
                        log.get("response_type"),
                        log.get("summary"),
                        log.get("latency_ms"),
                    ),
                )
                conn.commit()

    @staticmethod
    def _row_to_log(row: sqlite3.Row) -> Dict[str, Any]:
        entities_json = row["entities_json"]
        try:
            entities = json.loads(entities_json) if entities_json else {}
        except json.JSONDecodeError:
            entities = {}

        return {
            "timestamp": row["timestamp"],
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "role": row["role"],
            "raw_query": row["raw_query"],
            "intent": row["intent"],
            "entities": entities,
            "response_status": row["response_status"],
            "response_type": row["response_type"],
            "summary": row["summary"],
            "latency_ms": row["latency_ms"],
        }

    @staticmethod
    def get_all_logs() -> List[Dict[str, Any]]:
        with _DB_LOCK:
            with _connect() as conn:
                rows = conn.execute(
                    """
                    SELECT
                        timestamp,
                        session_id,
                        user_id,
                        user_name,
                        role,
                        raw_query,
                        intent,
                        entities_json,
                        response_status,
                        response_type,
                        summary,
                        latency_ms
                    FROM assistant_logs
                    ORDER BY log_id ASC
                    """
                ).fetchall()
        return [AssistantLogRepository._row_to_log(row) for row in rows]

    @staticmethod
    def get_logs_by_user(user_id: str) -> List[Dict[str, Any]]:
        with _DB_LOCK:
            with _connect() as conn:
                rows = conn.execute(
                    """
                    SELECT
                        timestamp,
                        session_id,
                        user_id,
                        user_name,
                        role,
                        raw_query,
                        intent,
                        entities_json,
                        response_status,
                        response_type,
                        summary,
                        latency_ms
                    FROM assistant_logs
                    WHERE user_id = ?
                    ORDER BY log_id ASC
                    """,
                    (user_id,),
                ).fetchall()
        return [AssistantLogRepository._row_to_log(row) for row in rows]

    @staticmethod
    def get_logs_by_role(role: str) -> List[Dict[str, Any]]:
        with _DB_LOCK:
            with _connect() as conn:
                rows = conn.execute(
                    """
                    SELECT
                        timestamp,
                        session_id,
                        user_id,
                        user_name,
                        role,
                        raw_query,
                        intent,
                        entities_json,
                        response_status,
                        response_type,
                        summary,
                        latency_ms
                    FROM assistant_logs
                    WHERE role = ?
                    ORDER BY log_id ASC
                    """,
                    (role,),
                ).fetchall()
        return [AssistantLogRepository._row_to_log(row) for row in rows]
