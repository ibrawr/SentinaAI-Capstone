from __future__ import annotations

from typing import Any, Dict

_CONTEXT_STORE: Dict[str, Dict[str, Any]] = {}


def _key(user_id: str, session_id: str = "default_session") -> str:
    return f"{user_id}::{session_id}"


def get_context(user_id: str, session_id: str = "default_session") -> Dict[str, Any]:
    return _CONTEXT_STORE.get(_key(user_id, session_id), {})


def update_context(user_id: str, payload: Dict[str, Any], session_id: str = "default_session") -> Dict[str, Any]:
    current = get_context(user_id, session_id).copy()
    current.update(payload)
    _CONTEXT_STORE[_key(user_id, session_id)] = current
    return current
