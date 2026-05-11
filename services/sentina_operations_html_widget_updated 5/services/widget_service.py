from __future__ import annotations

from typing import Any, Dict, List

from repositories.saved_view_repository import SavedViewRepository
from services.response_service import USER_GUIDE_LINK

PRIMARY_ACTIONS: List[Dict[str, Any]] = [
    {'id': 'overview', 'label': 'Overview', 'analysis_type': 'occupancy_summary', 'icon': 'layout-dashboard'},
    {'id': 'occupancy', 'label': 'Occupancy', 'analysis_type': 'occupancy_summary', 'icon': 'users'},
    {'id': 'crowd_flow', 'label': 'Crowd Flow', 'analysis_type': 'crowd_movement', 'icon': 'move-right'},
    {'id': 'trends', 'label': 'Trends', 'analysis_type': 'explore_trends', 'icon': 'trending-up'},
    {'id': 'hall_performance', 'label': 'Hall Performance', 'analysis_type': 'hall_performance', 'icon': 'bar-chart-3'},
]

TREND_METRICS: List[Dict[str, str]] = [
    {'value': 'venue_trend', 'label': 'Venue trend'},
    {'value': 'occupancy_trend', 'label': 'Occupancy trend'},
    {'value': 'flow_trend', 'label': 'Flow trend'},
    {'value': 'congestion_trend', 'label': 'Congestion trend'},
    {'value': 'queue_trend', 'label': 'Queue trend'},
]

COMPARE_OPTIONS: List[Dict[str, str]] = [
    {'value': 'none', 'label': 'No comparison'},
    {'value': 'yesterday', 'label': 'Previous day'},
    {'value': 'last_7_days', 'label': 'Previous 7 days'},
]


def build_bootstrap(user_id: str, user_name: str, latest_available_date: str, earliest_available_date: str) -> Dict[str, Any]:
    return {
        'status': 'success',
        'role': 'OPERATIONS',
        'greeting': {
            'title': f'Hi {user_name} 👋',
            'message': 'Use a structured workflow to analyze live operations by zone, hall, and date range.',
            'tooltip': 'Senti Operations',
        },
        'assistant_name': 'Senti Operations',
        'primary_actions': PRIMARY_ACTIONS,
        'latest_available_date': latest_available_date,
        'earliest_available_date': earliest_available_date,
        'saved_views': SavedViewRepository.list_by_user(user_id),
    }


def build_guided_flow_config(zones: List[Dict[str, str]], halls_by_zone: Dict[str, List[Dict[str, str]]]) -> Dict[str, Any]:
    return {
        'steps': [
            {'id': 'metric', 'title': 'What do you want to analyze?', 'type': 'chips', 'options': TREND_METRICS},
            {'id': 'scope_type', 'title': 'Scope', 'type': 'chips', 'options': [
                {'value': 'full_venue', 'label': 'Full venue'},
                {'value': 'custom', 'label': 'Zone / hall'},
            ]},
            {'id': 'zone_ids', 'title': 'Zones', 'type': 'multi_select', 'show_when': {'scope_type': 'custom'}, 'options': zones},
            {'id': 'hall_ids', 'title': 'Halls', 'type': 'dependent_multi_select', 'show_when': {'scope_type': 'custom'}, 'options_by_parent': halls_by_zone},
            {'id': 'date_range', 'title': 'Choose date range', 'type': 'date_range'},
            {'id': 'compare_with', 'title': 'Compare with', 'type': 'chips', 'options': COMPARE_OPTIONS},
        ],
        'help_link': USER_GUIDE_LINK,
    }


SUSTAINABILITY_PRIMARY_ACTIONS: List[Dict[str, Any]] = [
    {'id': 'sus_overview', 'label': 'Overview', 'analysis_type': 'sus_overview', 'icon': 'leaf'},
    {'id': 'sus_energy', 'label': 'Energy', 'analysis_type': 'sus_energy', 'icon': 'zap'},
    {'id': 'sus_comfort', 'label': 'Comfort', 'analysis_type': 'sus_comfort', 'icon': 'thermometer'},
    {'id': 'sus_event_overview', 'label': 'By Event Overview', 'analysis_type': 'sus_event_overview', 'icon': 'calendar-range'},
    {'id': 'sus_efficiency_carbon', 'label': 'Efficiency & Carbon', 'analysis_type': 'sus_efficiency_carbon', 'icon': 'bar-chart-3'},
]


def build_sustainability_bootstrap(
    user_id: str,
    user_name: str,
    latest_available_date: str,
    earliest_available_date: str,
) -> Dict[str, Any]:
    return {
        'status': 'success',
        'role': 'SUSTAINABILITY',
        'greeting': {
            'title': f'Hi {user_name} 👋',
            'message': 'Use a structured workflow to analyze sustainability by zone, hall, and date range.',
            'tooltip': 'Senti Sustainability',
        },
        'assistant_name': 'Senti Sustainability',
        'primary_actions': SUSTAINABILITY_PRIMARY_ACTIONS,
        'latest_available_date': latest_available_date,
        'earliest_available_date': earliest_available_date,
        'saved_views': SavedViewRepository.list_by_user(user_id),
    }


def build_sustainability_flow_config(
    zones: List[Dict[str, str]],
    halls_by_zone: Dict[str, List[Dict[str, str]]],
) -> Dict[str, Any]:
    return {
        'steps': [
            {
                'id': 'scope_type',
                'title': 'Scope',
                'type': 'chips',
                'options': [
                    {'value': 'full_venue', 'label': 'Full venue'},
                    {'value': 'custom', 'label': 'Zone / hall'},
                ],
            },
            {
                'id': 'zone_ids',
                'title': 'Zones',
                'type': 'multi_select',
                'show_when': {'scope_type': 'custom'},
                'options': zones,
            },
            {
                'id': 'hall_ids',
                'title': 'Halls',
                'type': 'dependent_multi_select',
                'show_when': {'scope_type': 'custom'},
                'options_by_parent': halls_by_zone,
            },
            {'id': 'date_range', 'title': 'Choose date range', 'type': 'date_range'},
            {
                'id': 'compare_with',
                'title': 'Compare with',
                'type': 'chips',
                'options': COMPARE_OPTIONS,
            },
        ],
        'help_link': USER_GUIDE_LINK,
    }


def _serialize_exhibitor_assignment(assignment: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'exhibitor_id': assignment['effectiveExhibitorId'],
        'exhibitor_name': assignment['exhibitorName'],
        'event_id': assignment['eventId'],
        'event_name': assignment['eventName'],
        'event_start_date': assignment['eventStartDate'],
        'event_end_date': assignment['eventEndDate'],
        'booth_id': assignment['boothId'],
        'booth_code': assignment['boothCode'],
        'hall_id': assignment['hallId'],
        'hall_name': assignment['hallName'],
        'zone_id': assignment['zoneId'],
        'package_tier': assignment.get('packageTier'),
        'amount_paid_aed': assignment.get('amountPaidAed'),
    }


EXHIBITOR_PRIMARY_ACTIONS: List[Dict[str, Any]] = [
    {'id': 'exh_overview', 'label': 'Overview', 'analysis_type': 'exh_overview', 'icon': 'layout-dashboard'},
    {'id': 'exh_traffic_context', 'label': 'Traffic Context', 'analysis_type': 'exh_traffic_context', 'icon': 'move-right'},
    {'id': 'exh_engagement', 'label': 'Engagement', 'analysis_type': 'exh_engagement', 'icon': 'activity'},
    {'id': 'exh_operating_environment', 'label': 'Operating Environment', 'analysis_type': 'exh_operating_environment', 'icon': 'thermometer'},
    {'id': 'exh_performance', 'label': 'Performance', 'analysis_type': 'exh_performance', 'icon': 'bar-chart-3'},
    {'id': 'exh_comparison', 'label': 'Comparison', 'analysis_type': 'exh_comparison', 'icon': 'git-compare'},
]


EXHIBITOR_COMPARE_OPTIONS: List[Dict[str, str]] = [
    {'value': 'event_average', 'label': 'Event average'},
    {'value': 'previous_day_same_event', 'label': 'Previous day in same event'},
    {'value': 'previous_matched_hour_band', 'label': 'Previous matched hour band'},
    {'value': 'previous_event', 'label': 'Previous event'},
    {'value': 'best_day_in_event', 'label': 'Best day in event'},
    {'value': 'weakest_day_in_event', 'label': 'Weakest day in event'},
]


def build_exhibitor_bootstrap(
    user_id: str,
    user_name: str,
    assignment: Dict[str, Any],
    assignments: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    serialized_assignments = [_serialize_exhibitor_assignment(item) for item in (assignments or [assignment])]
    selected_assignment = _serialize_exhibitor_assignment(assignment)
    return {
        'status': 'success',
        'role': 'EXHIBITOR',
        'greeting': {
            'title': f'Hi {user_name} 👋',
            'message': 'Choose the event you want to analyze. Booth and dates lock automatically to the selected event assignment.',
            'tooltip': 'Senti Exhibitor',
        },
        'assistant_name': 'Senti Exhibitor',
        'primary_actions': EXHIBITOR_PRIMARY_ACTIONS,
        'latest_available_date': assignment['eventEndDate'],
        'earliest_available_date': assignment['eventStartDate'],
        'saved_views': SavedViewRepository.list_by_user(user_id),
        'assignment': selected_assignment,
        'assignments': serialized_assignments,
    }


def build_exhibitor_flow_config(assignment: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'steps': [
            {
                'id': 'assignment_scope',
                'title': 'Assignment scope',
                'type': 'assignment_summary',
                'assignment': {
                    'event_name': assignment['eventName'],
                    'event_start_date': assignment['eventStartDate'],
                    'event_end_date': assignment['eventEndDate'],
                    'booth_code': assignment['boothCode'],
                    'hall_name': assignment['hallName'],
                    'zone_id': assignment['zoneId'],
                },
            },
            {
                'id': 'aggregation',
                'title': 'Aggregation',
                'type': 'chips',
                'options': [
                    {'value': 'hourly', 'label': 'Hourly'},
                    {'value': 'daily', 'label': 'Daily'},
                ],
            },
            {
                'id': 'date_range',
                'title': 'Choose date range',
                'type': 'date_range',
                'min_date': assignment['eventStartDate'],
                'max_date': assignment['eventEndDate'],
            },
            {
                'id': 'compare_with',
                'title': 'Compare with',
                'type': 'chips',
                'options': EXHIBITOR_COMPARE_OPTIONS,
                'show_when_analysis_type': ['exh_comparison'],
            },
        ],
        'help_link': USER_GUIDE_LINK,
    }
