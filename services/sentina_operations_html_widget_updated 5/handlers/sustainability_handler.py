from __future__ import annotations

from typing import Any, Dict

from models.schemas import GuidedActionRequest
from services.operations_service import FilterPayload
from services.response_service import success_response, unsupported_response
from services.suggestion_service import build_follow_up_actions
from services.sustainability_service import service


INTENT_MAP = {
    'sus_overview': 'sus_overview',
    'sus_energy': 'sus_energy',
    'sus_comfort': 'sus_comfort',
    'sus_event_overview': 'sus_event_overview',
    'sus_event_impact': 'sus_event_overview',
    'sus_efficiency_carbon': 'sus_efficiency_carbon',
    'sus_time_comparison': 'sus_time_comparison',
}


def _payload(req: GuidedActionRequest) -> FilterPayload:
    return FilterPayload(
        analysis_type=req.analysis_type,
        metric=req.metric,
        scope_type=req.scope_type,
        zone_ids=req.zone_ids or ([] if not req.zone_id else [req.zone_id]),
        hall_ids=req.hall_ids or ([] if not req.hall_id else [req.hall_id]),
        time_range=req.time_range,
        start_date=req.start_date,
        end_date=req.end_date,
        compare_with=None if req.compare_with in (None, '', 'none') else req.compare_with,
        limit=req.limit or 5,
    )


def handle_guided_sustainability_request(req: GuidedActionRequest) -> Dict[str, Any]:
    payload = _payload(req)
    normalized_type = 'sus_event_overview' if req.analysis_type == 'sus_event_impact' else req.analysis_type
    intent = INTENT_MAP.get(req.analysis_type)

    if not intent:
        return unsupported_response()

    if normalized_type == 'sus_overview':
        data = service.overview(payload)
        cards = data.get('cards', [])
        meta = data.get('meta', {})
        hvac = cards[0]['value'] if len(cards) > 0 else '0 kWh'
        carbon = cards[1]['value'] if len(cards) > 1 else '0 kg CO2'
        top_hall = meta.get('top_hall', 'the selected halls')
        return success_response(
            intent=intent,
            title='Sustainability Overview',
            summary=(
                f'For the selected filters, HVAC energy was {hvac}, carbon was {carbon}, '
                f'and {top_hall} used the most energy.'
            ),
            response_type='summary_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump(), meta),
        )

    if normalized_type == 'sus_energy':
        data = service.energy(payload)
        kpis = data.get('kpis', [])
        total_energy = kpis[0]['value'] if len(kpis) > 0 else '0 kWh'
        peak = data.get('badges', [{}])[0].get('value', 'the selected range')
        return success_response(
            intent=intent,
            title='Energy',
            summary=(
                f'HVAC energy for the selected filters was {total_energy}. '
                f'The highest interval was {peak}.'
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    if normalized_type == 'sus_comfort':
        data = service.comfort(payload)
        kpis = data.get('kpis', [])
        avg_comfort = kpis[0]['value'] if len(kpis) > 0 else '0'
        worst_period = data.get('badges', [{}])[0].get('value', 'the selected range')
        return success_response(
            intent=intent,
            title='Environmental Comfort',
            summary=(
                f'Average comfort was {avg_comfort}. '
                f'The worst comfort period was {worst_period}.'
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    if normalized_type == 'sus_event_overview':
        data = service.event_overview(payload)
        meta = data.get('meta', {})
        event_count = meta.get('event_count', 0)
        if event_count <= 1:
            summary = (
                f"Event overview is ready for {meta.get('top_event_name', 'the selected event')}. "
                f"Selected event energy totals {meta.get('top_event_energy', 0)} kWh in the current range."
            )
        else:
            summary = (
                f"By-event overview is ready for {event_count} events in the selected range. "
                f"The top event by energy is {meta.get('top_event_name', 'the selected event')} and the top inflow event is "
                f"{meta.get('top_inflow_event_name', 'the selected event')}."
            )
        return success_response(
            intent=intent,
            title='By Event Overview',
            summary=summary,
            response_type='chart_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump(), meta),
        )

    if normalized_type == 'sus_efficiency_carbon':
        data = service.efficiency_and_carbon(payload)
        kpis = data.get('kpis', [])
        total_carbon = kpis[0]['value'] if len(kpis) > 0 else '0 kg CO2'
        avg_efficiency = kpis[1]['value'] if len(kpis) > 1 else '0'
        return success_response(
            intent=intent,
            title='Efficiency & Carbon',
            summary=(
                f'Total carbon was {total_carbon}, and average efficiency score was {avg_efficiency} '
                f'for the selected filters.'
            ),
            response_type='chart_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    if normalized_type == 'sus_time_comparison':
        data = service.compare_periods(payload)
        return success_response(
            intent=intent,
            title='Comparison',
            summary=(
                f"Comparison is ready for {data.get('current_label', 'the selected range')} versus "
                f"{data.get('previous_label', 'the comparison range')}."
            ),
            response_type='table_card',
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    return unsupported_response()
