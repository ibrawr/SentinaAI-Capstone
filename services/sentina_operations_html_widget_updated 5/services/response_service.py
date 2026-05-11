from __future__ import annotations

from typing import Any, Dict, List, Optional


def success_response(
    *,
    intent: str,
    summary: str,
    title: Optional[str] = None,
    response_type: str = "summary_card",
    data: Optional[Dict[str, Any]] = None,
    follow_up_actions: Optional[List[Dict[str, Any]]] = None,
    help_link: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "status": "success",
        "intent": intent,
        "title": title,
        "summary": summary,
        "response_type": response_type,
        "data": data or {},
        "follow_up_actions": follow_up_actions or [],
        "help_link": help_link,
    }


USER_GUIDE_LINK = "/docs-static/operations_widget_guide.html"


def unsupported_response() -> Dict[str, Any]:
    return {
        "status": "unsupported",
        "intent": "help_fallback",
        "response_type": "help_card",
        "title": "How I can help",
        "summary": "I can help with live overview, trends, venue occupancy, event-wise occupancy breakdown, busiest halls, comparisons, overcrowded areas, and congestion hotspots.",
        "data": {
            "capabilities": [
                "Live overview",
                "Trends",
                "Venue occupancy",
                "Event-wise occupancy breakdown",
                "Top busiest halls",
                "Compare periods",
                "Overcrowded areas",
                "Congestion hotspots",
            ]
        },
        "follow_up_actions": [
            {"label": "Live overview", "action": "ops_live_overview"},
            {"label": "Trends", "action": "ops_trends"},
            {"label": "Open user guide", "action": "open_user_guide"},
        ],
        "help_link": USER_GUIDE_LINK,
    }


def access_denied_response() -> Dict[str, Any]:
    return {
        "status": "forbidden",
        "intent": "access_denied",
        "response_type": "help_card",
        "title": "Access denied",
        "summary": "That data is not available for your role.",
        "data": {},
        "follow_up_actions": [{"label": "Open user guide", "action": "open_user_guide"}],
        "help_link": USER_GUIDE_LINK,
    }
