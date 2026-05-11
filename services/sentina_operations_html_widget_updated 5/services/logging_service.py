from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional


def build_log(
    *,
    session_id: str,
    user_id: str,
    user_name: Optional[str] = None,
    role: str,
    raw_query: str,
    intent: Optional[str],
    entities: Dict[str, Any],
    response_status: str,
    response_type: Optional[str],
    summary: Optional[str],
    latency_ms: Optional[int],
):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "session_id": session_id,
        "user_id": user_id,
        "user_name": user_name,
        "role": role,
        "raw_query": raw_query,
        "intent": intent,
        "entities": entities,
        "response_status": response_status,
        "response_type": response_type,
        "summary": summary,
        "latency_ms": latency_ms,
    }


def build_action_log(
    *,
    session_id: str,
    user_id: str,
    user_name: Optional[str] = None,
    role: str,
    action_payload: Dict[str, Any],
    intent: str,
    response_status: str,
    response_type: Optional[str],
    summary: str,
):
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "session_id": session_id,
        "user_id": user_id,
        "user_name": user_name,
        "role": role,
        "raw_query": action_payload.get("analysis_type", "guided_action"),
        "intent": intent,
        "entities": action_payload,
        "response_status": response_status,
        "response_type": response_type,
        "summary": summary,
        "latency_ms": None,
    }
