from __future__ import annotations

from typing import Any, Dict, List, Optional


def _base_filters(payload: Dict[str, Any]) -> Dict[str, Any]:
    zone_ids = payload.get('zone_ids') or ([] if not payload.get('zone_id') else [payload.get('zone_id')])
    hall_ids = payload.get('hall_ids') or ([] if not payload.get('hall_id') else [payload.get('hall_id')])
    return {
        'scope_type': payload.get('scope_type', 'full_venue'),
        'zone_ids': zone_ids,
        'hall_ids': hall_ids,
        'time_range': 'custom',
        'start_date': payload.get('start_date'),
        'end_date': payload.get('end_date'),
        'compare_with': payload.get('compare_with'),
    }


def build_follow_up_actions(
    intent: str,
    payload: Dict[str, Any],
    summary_data: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    summary_data = summary_data or {}
    base_filters = _base_filters(payload)

    if intent == 'ops_occupancy_summary':
        busiest_hall = summary_data.get('busiest_hall') or {}
        actions = []
        if busiest_hall.get('hall_id'):
            actions.append({
                'label': 'Top hall',
                'action': 'view_hall',
                'payload': {
                    **base_filters,
                    'analysis_type': 'hall_performance',
                    'scope_type': 'custom',
                    'hall_ids': [busiest_hall.get('hall_id')],
                },
            })
        actions.append({
            'label': 'Peak hour',
            'action': 'show_trend',
            'payload': {**base_filters, 'analysis_type': 'explore_trends', 'metric': 'occupancy_trend'},
        })
        return actions[:2]

    if intent == 'ops_crowd_movement':
        return [
            {
                'label': 'Peak periods',
                'action': 'show_peak_periods',
                'payload': {**base_filters, 'analysis_type': 'explore_trends', 'metric': 'flow_trend'},
            },
            {
                'label': 'Top hall',
                'action': 'show_hall_performance',
                'payload': {**base_filters, 'analysis_type': 'hall_performance', 'scope_type': payload.get('scope_type', 'full_venue')},
            },
        ]

    if intent == 'ops_hall_performance':
        return [
            {
                'label': 'Compare period',
                'action': 'show_time_comparison',
                'payload': {**base_filters, 'analysis_type': 'time_comparison', 'compare_with': payload.get('compare_with') or 'yesterday'},
            },
            {
                'label': 'Occupancy trend',
                'action': 'show_trend',
                'payload': {**base_filters, 'analysis_type': 'explore_trends', 'metric': 'occupancy_trend'},
            },
        ]

    if intent == 'ops_event_performance':
        return [
            {
                'label': 'By hall',
                'action': 'show_hall_performance',
                'payload': {**base_filters, 'analysis_type': 'hall_performance'},
            },
            {
                'label': 'Crowd flow',
                'action': 'show_crowd_movement',
                'payload': {**base_filters, 'analysis_type': 'crowd_movement'},
            },
        ]

    if intent == 'ops_time_comparison':
        return [
            {
                'label': 'Occupancy trend',
                'action': 'show_trend',
                'payload': {**base_filters, 'analysis_type': 'explore_trends', 'metric': 'occupancy_trend'},
            },
            {
                'label': 'Crowd movement',
                'action': 'show_crowd_movement',
                'payload': {**base_filters, 'analysis_type': 'crowd_movement'},
            },
        ]

    if intent == 'ops_explore_trends':
        return [
            {
                'label': 'Compare period',
                'action': 'show_time_comparison',
                'payload': {**base_filters, 'analysis_type': 'time_comparison', 'compare_with': payload.get('compare_with') or 'yesterday'},
            },
            {
                'label': 'Top hall',
                'action': 'show_hall_performance',
                'payload': {**base_filters, 'analysis_type': 'hall_performance'},
            },
        ]

    if intent == 'sus_overview':
        return [
            {
                'label': 'Energy',
                'action': 'show_energy',
                'payload': {**base_filters, 'analysis_type': 'sus_energy'},
            },
            {
                'label': 'Comfort',
                'action': 'show_comfort',
                'payload': {**base_filters, 'analysis_type': 'sus_comfort'},
            },
        ]

    if intent == 'sus_energy':
        return [
            {
                'label': 'By Event Overview',
                'action': 'show_event_overview',
                'payload': {**base_filters, 'analysis_type': 'sus_event_overview'},
            },
            {
                'label': 'Efficiency & Carbon',
                'action': 'show_efficiency',
                'payload': {**base_filters, 'analysis_type': 'sus_efficiency_carbon'},
            },
        ]

    if intent == 'sus_comfort':
        return [
            {
                'label': 'By Event Overview',
                'action': 'show_event_overview',
                'payload': {**base_filters, 'analysis_type': 'sus_event_overview'},
            },
            {
                'label': 'Energy',
                'action': 'show_energy',
                'payload': {**base_filters, 'analysis_type': 'sus_energy'},
            },
        ]

    if intent == 'sus_event_overview':
        return [
            {
                'label': 'Overview',
                'action': 'show_overview',
                'payload': {**base_filters, 'analysis_type': 'sus_overview'},
            },
            {
                'label': 'Energy',
                'action': 'show_energy',
                'payload': {**base_filters, 'analysis_type': 'sus_energy'},
            },
        ]

    if intent == 'sus_efficiency_carbon':
        return [
            {
                'label': 'By Event Overview',
                'action': 'show_event_overview',
                'payload': {**base_filters, 'analysis_type': 'sus_event_overview'},
            },
            {
                'label': 'Comfort',
                'action': 'show_comfort',
                'payload': {**base_filters, 'analysis_type': 'sus_comfort'},
            },
        ]

    if intent == 'sus_time_comparison':
        return [
            {
                'label': 'Energy',
                'action': 'show_energy',
                'payload': {**base_filters, 'analysis_type': 'sus_energy'},
            },
            {
                'label': 'By Event Overview',
                'action': 'show_event_overview',
                'payload': {**base_filters, 'analysis_type': 'sus_event_overview'},
            },
        ]

    return []


def get_default_suggestions(role: str) -> List[str]:
    role_upper = role.upper()
    if role_upper == 'OPERATIONS':
        return ['Overview', 'Occupancy', 'Crowd Flow', 'Trends', 'Hall Performance']
    if role_upper == 'SUSTAINABILITY':
        return ['Overview', 'Energy', 'Comfort', 'By Event Overview', 'Efficiency & Carbon']
    if role_upper == 'EXHIBITOR':
        return ['Overview', 'Traffic Context', 'Engagement', 'Operating Environment', 'Performance']
    return ['Open user guide']
