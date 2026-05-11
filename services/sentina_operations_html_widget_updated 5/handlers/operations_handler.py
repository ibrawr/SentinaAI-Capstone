from __future__ import annotations

from typing import Any, Dict

from models.schemas import GuidedActionRequest
from services.operations_service import FilterPayload, service
from services.response_service import success_response, unsupported_response
from services.suggestion_service import build_follow_up_actions


INTENT_MAP = {
    "occupancy_summary": "ops_occupancy_summary",
    "crowd_movement": "ops_crowd_movement",
    "hall_performance": "ops_hall_performance",
    "event_performance": "ops_event_performance",
    "time_comparison": "ops_time_comparison",
    "explore_trends": "ops_explore_trends",
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
        compare_with=None if req.compare_with in (None, "", "none") else req.compare_with,
        limit=req.limit or 5,
    )


def handle_guided_operations_request(req: GuidedActionRequest) -> Dict[str, Any]:
    payload = _payload(req)
    intent = INTENT_MAP.get(req.analysis_type)

    if not intent:
        return unsupported_response()

    if req.analysis_type == "occupancy_summary":
        data = service.live_overview(payload)
        summary = data["summary"]
        busiest_hall = summary.get("busiest_hall", {}).get("hall_name") or "the selected halls"
        return success_response(
            intent=intent,
            title="Occupancy Summary",
            summary=(
                f"For the selected filters, total occupancy is {summary.get('total_current_occupancy', 0)}, "
                f"{busiest_hall} has the highest occupancy, and "
                f"{summary.get('overcrowded_count', 0)} halls crossed the overcrowding threshold."
            ),
            response_type="summary_card",
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump(), summary),
        )

    if req.analysis_type == "crowd_movement":
        data = service.crowd_movement(payload)
        total_inflow = data.get("total_inflow", 0)
        total_outflow = data.get("total_outflow", 0)
        net_flow = data.get("net_flow", 0)
        peak_period = data.get("peak_period_label", "the selected period")
        return success_response(
            intent=intent,
            title="Crowd Movement",
            summary=(
                f"For the selected filters, inflow was {total_inflow}, outflow was {total_outflow}, "
                f"and net flow was {net_flow}. The busiest movement period was {peak_period}."
            ),
            response_type="chart_card",
            data=data,
            follow_up_actions=build_follow_up_actions(
                intent,
                req.model_dump(),
                {
                    "total_inflow": total_inflow,
                    "total_outflow": total_outflow,
                    "net_flow": net_flow,
                    "peak_period_label": peak_period,
                },
            ),
        )

    if req.analysis_type == "hall_performance":
        data = service.top_busiest_halls(payload)
        top = data.get("top") or {}
        top_name = top.get("hall_name", "No hall")
        return success_response(
            intent=intent,
            title="Hall Performance",
            summary=f"For the selected filters, {top_name} ranks highest based on occupancy performance.",
            response_type="table_card",
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump(), top),
        )

    if req.analysis_type == "event_performance":
        data = service.event_wise_breakdown(payload)
        row_count = len(data.get("rows", []))
        return success_response(
            intent=intent,
            title="Event Performance",
            summary=(
                f"Event-level performance is ready for the selected filters with {row_count} event rows."
            ),
            response_type="table_card",
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    if req.analysis_type == "time_comparison":
        data = service.compare_periods(payload)
        delta = data.get("delta", 0)
        compare_label = data.get("previous_label") or req.compare_with or "the comparison period"
        current_label = data.get("current_label") or "the selected range"
        return success_response(
            intent=intent,
            title="Time Comparison",
            summary=(
                f"Average occupancy changed by {delta} compared with {compare_label} "
                f"for {current_label}."
            ),
            response_type="table_card",
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump(), {"delta": delta, "compare_with": compare_label}),
        )

    if req.analysis_type == "explore_trends":
        data = service.explore_trends(payload)
        metric_label = (req.metric or "occupancy").replace("_", " ")
        return success_response(
            intent=intent,
            title=data.get("title", "Explore Trends"),
            summary=f"The {metric_label} trend is shown for the selected halls, zones, and date range.",
            response_type="chart_card",
            data=data,
            follow_up_actions=build_follow_up_actions(intent, req.model_dump()),
        )

    return unsupported_response()
