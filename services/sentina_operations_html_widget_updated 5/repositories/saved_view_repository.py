from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4


_SAVED_VIEWS: List[Dict[str, Any]] = []


class SavedViewRepository:
    @staticmethod
    def create(user_id: str, session_id: str, name: str, view_payload: Dict[str, Any]) -> Dict[str, Any]:
        record = {
            'view_id': str(uuid4()),
            'user_id': user_id,
            'session_id': session_id,
            'name': name,
            'created_at': datetime.utcnow().isoformat(),
            'view_payload': view_payload,
        }
        _SAVED_VIEWS.insert(0, record)
        return record

    @staticmethod
    def list_by_user(user_id: str) -> List[Dict[str, Any]]:
        return [item for item in _SAVED_VIEWS if item['user_id'] == user_id]

    @staticmethod
    def get(view_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        for item in _SAVED_VIEWS:
            if item['view_id'] == view_id and (user_id is None or item['user_id'] == user_id):
                return item
        return None

    @staticmethod
    def delete(view_id: str, user_id: Optional[str] = None) -> bool:
        for idx, item in enumerate(_SAVED_VIEWS):
            if item['view_id'] == view_id and (user_id is None or item['user_id'] == user_id):
                _SAVED_VIEWS.pop(idx)
                return True
        return False
