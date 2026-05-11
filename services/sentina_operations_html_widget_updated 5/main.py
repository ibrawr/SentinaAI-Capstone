from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from handlers.operations_handler import handle_guided_operations_request
from handlers.sustainability_handler import handle_guided_sustainability_request
from handlers.exhibitors_handler import handle_guided_exhibitor_request
from models.schemas import GuidedActionRequest, SaveViewRequest
from repositories.assistant_log_repository import AssistantLogRepository
from repositories.saved_view_repository import SavedViewRepository
from services.context_service import get_context, update_context
from services.data_loader import (
    earliest_available_date,
    get_halls_by_zone,
    get_zone_options,
    latest_available_date,
)
from services.exhibitor_service import service as exhibitor_service

from services.widget_service import (
    build_bootstrap,
    build_guided_flow_config,
    build_sustainability_bootstrap,
    build_sustainability_flow_config,
    build_exhibitor_bootstrap,
    build_exhibitor_flow_config,
)

from services.logging_service import build_action_log
from services.response_service import unsupported_response

BASE_DIR = Path(__file__).parent
UI_DIR = BASE_DIR / 'ui'
DOCS_DIR = BASE_DIR / 'docs'

app = FastAPI(title='Senti Role Assistants API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.mount('/ui', StaticFiles(directory=UI_DIR), name='ui')
app.mount('/docs-static', StaticFiles(directory=DOCS_DIR), name='docs-static')


@app.get('/')
def root() -> FileResponse:
    return FileResponse(UI_DIR / 'index.html')


@app.get('/favicon.ico')
def favicon() -> RedirectResponse:
    return RedirectResponse(url='/ui/favicon.svg')


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'message': 'Senti assistant API is running',
        'widget': '/',
        'bootstrap': '/assistant/widget/bootstrap?user_id=u1&user_name=Rumaisa&role=OPERATIONS',
    }


@app.get('/admin/ai/logs')
def get_all_logs():
    return AssistantLogRepository.get_all_logs()


@app.get('/assistant/widget/bootstrap')
def widget_bootstrap(user_id: str, user_name: str = 'Operator', role: str = 'OPERATIONS'):
    if role.upper() == 'SUSTAINABILITY':
        return build_sustainability_bootstrap(
            user_id=user_id,
            user_name=user_name,
            latest_available_date=latest_available_date(),
            earliest_available_date=earliest_available_date(),
        )

    if role.upper() == 'EXHIBITOR':
        assignments = exhibitor_service.resolve_assignments(user_id)
        assignment = assignments[0]
        return build_exhibitor_bootstrap(
            user_id=user_id,
            user_name=user_name,
            assignment=assignment,
            assignments=assignments,
        )

    return build_bootstrap(
        user_id=user_id,
        user_name=user_name,
        latest_available_date=latest_available_date(),
        earliest_available_date=earliest_available_date(),
    )


@app.get('/assistant/widget/flow-config')
def widget_flow_config(role: str = 'OPERATIONS', user_id: str = 'EXH0215'):
    if role.upper() == 'SUSTAINABILITY':
        return build_sustainability_flow_config(get_zone_options(), get_halls_by_zone())
    if role.upper() == 'EXHIBITOR':
        assignment = exhibitor_service.resolve_assignment(user_id)
        return build_exhibitor_flow_config(assignment)
    return build_guided_flow_config(get_zone_options(), get_halls_by_zone())


@app.post('/assistant/widget/action')
def widget_action(req: GuidedActionRequest):
    if req.role.upper() == 'SUSTAINABILITY' or req.analysis_type.startswith('sus_'):
        result = handle_guided_sustainability_request(req)
    elif req.role.upper() == 'EXHIBITOR' or req.analysis_type.startswith('exh_'):
        result = handle_guided_exhibitor_request(req)
    else:
        result = handle_guided_operations_request(req)
    update_context(
        req.user_id,
        {
            'last_intent': result.get('intent'),
            'last_payload': req.model_dump(),
            'last_response': result,
        },
        req.session_id,
    )
    AssistantLogRepository.add_log(
        build_action_log(
            session_id=req.session_id,
            user_id=req.user_id,
            user_name=req.user_name,
            role=req.role,
            action_payload=req.model_dump(),
            intent=result.get('intent', req.analysis_type),
            response_status=result.get('status', 'unknown'),
            response_type=result.get('response_type'),
            summary=result.get('summary', ''),
        )
    )
    return result


@app.get('/assistant/widget/context')
def widget_context(user_id: str, session_id: str = 'default_session'):
    return get_context(user_id, session_id)


@app.post('/assistant/widget/save-view')
def save_view(req: SaveViewRequest):
    if not req.view_payload or 'request' not in req.view_payload or 'results' not in req.view_payload:
        raise HTTPException(status_code=422, detail='A completed analysis must be saved.')
    record = SavedViewRepository.create(req.user_id, req.session_id, req.name, req.view_payload)
    return {'status': 'success', 'saved_view': record}


@app.get('/assistant/widget/saved-views')
def list_saved_views(user_id: str):
    return {'status': 'success', 'saved_views': SavedViewRepository.list_by_user(user_id)}


@app.delete('/assistant/widget/saved-views/{view_id}')
def delete_saved_view(view_id: str, user_id: str):
    deleted = SavedViewRepository.delete(view_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Saved view not found')
    return {'status': 'success', 'view_id': view_id}


@app.get('/assistant/widget/help')
def widget_help():
    return unsupported_response()
