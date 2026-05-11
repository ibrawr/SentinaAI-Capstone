from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class AssistantQueryRequest(BaseModel):
    user_id: str
    role: str
    query: str
    session_id: Optional[str] = "default_session"


class GuidedActionRequest(BaseModel):
    user_id: str
    user_name: str = "Operator"
    role: str = "OPERATIONS"
    session_id: str = "default_session"
    analysis_type: str
    metric: Optional[str] = None
    scope_type: Literal["full_venue", "custom", "assignment"] = "full_venue"
    zone_ids: List[str] = Field(default_factory=list)
    hall_ids: List[str] = Field(default_factory=list)
    zone_id: Optional[str] = None
    hall_id: Optional[str] = None
    time_range: Literal["today", "yesterday", "last_7_days", "custom"] = "custom"
    aggregation: Literal["hourly", "daily"] = "hourly"
    event_id: Optional[str] = None
    booth_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    compare_with: Optional[str] = None
    limit: Optional[int] = 5

    @model_validator(mode="after")
    def normalize_scope_filters(self):
        if self.zone_id and self.zone_id not in self.zone_ids:
            self.zone_ids.append(self.zone_id)
        if self.hall_id and self.hall_id not in self.hall_ids:
            self.hall_ids.append(self.hall_id)
        if self.scope_type not in {"custom", "assignment"}:
            self.zone_ids = []
            self.hall_ids = []
            self.zone_id = None
            self.hall_id = None
        else:
            self.zone_id = self.zone_ids[0] if self.zone_ids else None
            self.hall_id = self.hall_ids[0] if self.hall_ids else None
        return self


class SaveViewRequest(BaseModel):
    user_id: str
    session_id: str = "default_session"
    name: str = Field(min_length=1, max_length=100)
    view_payload: Dict[str, Any]


class SavedView(BaseModel):
    view_id: str
    user_id: str
    session_id: str
    name: str
    created_at: str
    view_payload: Dict[str, Any]


class AssistantResponse(BaseModel):
    status: str
    intent: Optional[str] = None
    response_type: Optional[str] = None
    summary: str
    title: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    follow_up_actions: List[Dict[str, Any]] = Field(default_factory=list)
    help_link: Optional[str] = None


class WidgetBootstrapResponse(BaseModel):
    status: str = "success"
    role: str = "OPERATIONS"
    greeting: Dict[str, Any]
    primary_actions: List[Dict[str, Any]]
    latest_available_date: str
    earliest_available_date: str
    assistant_name: str = "Senti Assistant"
    saved_views: List[SavedView] = Field(default_factory=list)
