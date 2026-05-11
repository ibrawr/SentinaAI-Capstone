from services.response_service import success_response


def handle_soc_intent(intent: str, entities: dict):
    if intent == "soc_active_alerts":
        data = {
            "alerts": [
                {"id": "A-101", "severity": "CRITICAL", "hall_id": "Hall 2"},
                {"id": "A-102", "severity": "HIGH", "hall_id": "Hall 1"},
            ]
        }
        return success_response(
            intent=intent,
            summary="There are 2 active security alerts, including 1 critical alert in Hall 2.",
            data=data,
            response_type="table",
            suggestions=["Open the critical alert", "Summarize incidents"],
        )

    return success_response(intent, "SOC intent recognized, but not implemented yet.")