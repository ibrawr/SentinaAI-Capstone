from __future__ import annotations

from typing import Any, Dict, List

from models.schemas import GuidedActionRequest
from services.exhibitor_service import ExhibitorFilterPayload, service
from services.response_service import success_response, unsupported_response


INTENT_MAP = {
    'exh_overview': 'exh_overview',
    'exh_traffic_context': 'exh_traffic_context',
    'exh_engagement': 'exh_engagement',
    'exh_operating_environment': 'exh_operating_environment',
    'exh_performance': 'exh_performance',
    'exh_comparison': 'exh_comparison',
}

FOLLOW_UPS: Dict[str, List[Dict[str, Any]]] = {
    'exh_overview': [
        {'label': 'Traffic Context', 'analysis_type': 'exh_traffic_context'},
        {'label': 'Comparison', 'analysis_type': 'exh_comparison', 'compare_with': 'event_average'},
    ],
    'exh_traffic_context': [
        {'label': 'Engagement', 'analysis_type': 'exh_engagement'},
        {'label': 'Operating Environment', 'analysis_type': 'exh_operating_environment'},
    ],
    'exh_engagement': [
        {'label': 'Operating Environment', 'analysis_type': 'exh_operating_environment'},
        {'label': 'Performance', 'analysis_type': 'exh_performance'},
    ],
    'exh_operating_environment': [
        {'label': 'Performance', 'analysis_type': 'exh_performance'},
        {'label': 'Comparison', 'analysis_type': 'exh_comparison', 'compare_with': 'best_day_in_event'},
    ],
    'exh_performance': [
        {'label': 'Comparison', 'analysis_type': 'exh_comparison', 'compare_with': 'event_average'},
        {'label': 'Traffic Context', 'analysis_type': 'exh_traffic_context'},
    ],
    'exh_comparison': [
        {'label': 'Traffic Context', 'analysis_type': 'exh_traffic_context'},
        {'label': 'Performance', 'analysis_type': 'exh_performance'},
    ],
}


TITLES = {
    'exh_overview': 'Overview',
    'exh_traffic_context': 'Traffic Context',
    'exh_engagement': 'Engagement',
    'exh_operating_environment': 'Operating Environment',
    'exh_performance': 'Performance',
    'exh_comparison': 'Comparison',
}


def _payload(req: GuidedActionRequest, assignment: Dict[str, Any]) -> ExhibitorFilterPayload:
    event_id = req.event_id or str(assignment['eventId'])
    booth_id = req.booth_id or str(assignment['boothId'])
    zone_ids = req.zone_ids or [str(assignment['zoneId'])]
    hall_ids = req.hall_ids or [str(assignment['hallId'])]
    return ExhibitorFilterPayload(
        analysis_type=req.analysis_type,
        exhibitor_id=str(assignment['effectiveExhibitorId']),
        event_id=event_id,
        booth_id=booth_id,
        zone_ids=zone_ids,
        hall_ids=hall_ids,
        start_date=req.start_date or assignment['eventStartDate'],
        end_date=req.end_date or assignment['eventEndDate'],
        compare_with=None if req.compare_with in (None, '', 'none') else req.compare_with,
        aggregation=req.aggregation or 'hourly',
        limit=req.limit or 5,
    )


def _follow_up_actions(intent: str, req: GuidedActionRequest, assignment: Dict[str, Any]) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    for item in FOLLOW_UPS.get(intent, []):
        actions.append(
            {
                'label': item['label'],
                'action': item['analysis_type'],
                'payload': {
                    **req.model_dump(),
                    'analysis_type': item['analysis_type'],
                    'compare_with': item.get('compare_with', 'event_average' if item['analysis_type'] == 'exh_comparison' else 'none'),
                    'event_id': req.event_id or str(assignment['eventId']),
                    'booth_id': req.booth_id or str(assignment['boothId']),
                    'zone_ids': req.zone_ids or [str(assignment['zoneId'])],
                    'hall_ids': req.hall_ids or [str(assignment['hallId'])],
                    'scope_type': 'assignment',
                },
            }
        )
    return actions[:2]


def handle_guided_exhibitor_request(req: GuidedActionRequest) -> Dict[str, Any]:
    assignment = service.resolve_assignment(req.user_id, req.event_id)
    payload = _payload(req, assignment)
    intent = INTENT_MAP.get(req.analysis_type)
    if not intent:
        return unsupported_response()

    if req.analysis_type == 'exh_overview':
        data = service.overview(payload, assignment)
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f"{assignment['exhibitorName']} is assigned to booth {assignment['boothCode']} for "
                f"{assignment['eventName']}. The analysis is bounded to {payload.start_date} through {payload.end_date}."
            ),
            response_type='summary_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    if req.analysis_type == 'exh_traffic_context':
        data = service.traffic_context(payload, assignment)
        total_inflow = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Total inflow'), 0)
        total_outflow = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Total outflow'), 0)
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f"Traffic around booth {assignment['boothCode']} recorded inflow {total_inflow} and outflow {total_outflow}. "
                f"The busiest period was {data.get('summary', {}).get('peak_period', 'the selected window')}."
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    if req.analysis_type == 'exh_engagement':
        data = service.engagement(payload, assignment)
        avg_value = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Average'), 0)
        level = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Level'), 'N/A')
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f"Engagement for booth {assignment['boothCode']} averaged {avg_value} and is classified as {level}. "
                f"Peak engagement happened at {data.get('summary', {}).get('peak_period', 'the selected window')}."
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    if req.analysis_type == 'exh_operating_environment':
        data = service.operating_environment(payload, assignment)
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f"Operating conditions around booth {assignment['boothCode']} show the strongest day as "
                f"{data.get('summary', {}).get('best_day', 'N/A')} and the weakest day as {data.get('summary', {}).get('quiet_day', 'N/A')}."
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    if req.analysis_type == 'exh_performance':
        data = service.performance(payload, assignment)
        peak_contribution = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Peak contribution %'), 0)
        consistency = next((item['value'] for item in data.get('kpis', []) if item['label'] == 'Consistency'), 'N/A')
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f'Performance context shows a peak contribution of {peak_contribution}% '
                f'with a {consistency.lower()} consistency profile.'
            ),
            response_type='table_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    if req.analysis_type == 'exh_comparison':
        data = service.comparison(payload, assignment)
        return success_response(
            intent=intent,
            title=TITLES[intent],
            summary=(
                f"Comparison is ready for {data.get('summary', {}).get('current_label', 'the selected range')} versus "
                f"{data.get('summary', {}).get('baseline_label', 'the selected baseline')}."
            ),
            response_type='table_card',
            data=data,
            follow_up_actions=_follow_up_actions(intent, req, assignment),
        )

    return unsupported_response()
