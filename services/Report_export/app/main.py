from pathlib import Path
import hashlib
from typing import cast

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response

from app.report.schemas import (
    ReportFilters,
    ExportFormat,
    ExportRequest,
    ReportActionRequest,
)
from app.report.service import generate_report_file

from app.report.storage.store import (
    init_report_db,
    create_draft_report,
    update_draft_report,
    list_reports,
    require_report_by_id,
    insert_generated_report,
    mark_report_generated,
    soft_delete_report,
)
from app.report.storage.paths import (
    generate_report_id,
    generate_report_code,
    build_report_file_path,
    build_report_filename,
    ensure_parent_dir,
)

app = FastAPI()


@app.on_event("startup")
def startup_event():
    init_report_db()

def _build_request_from_filters(filters, fmt: str, datasets=None, generated_by_user_id=None, generated_by_name=None) -> ExportRequest:
    filters_model = filters if isinstance(filters, ReportFilters) else ReportFilters.model_validate(filters)
    return ExportRequest(
        filters=filters_model,
        format=cast(ExportFormat, fmt),
        generated_by_user_id=generated_by_user_id,
        generated_by_name=generated_by_name,
        datasets=datasets,
    )

def _mime_type_for(fmt: str) -> str:
    return (
        "application/pdf"
        if fmt == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.post("/api/render-report")
async def render_report_bytes(body: ReportActionRequest):
    try:
        request_obj = _build_request_from_filters(
            body.filters,
            body.format,
            datasets=body.datasets,
            generated_by_user_id=body.generated_by_user_id,
            generated_by_name=body.generated_by_name,
        )
        result = generate_report_file(request_obj)
        return Response(content=result["bytes"], media_type=_mime_type_for(body.format))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reports/download-new")
async def download_new_report(body: ReportActionRequest):
    try:
        filters_model = body.filters
        filters = filters_model.model_dump(mode="json")
        fmt = body.format

        if not filters or not isinstance(filters, dict):
            raise HTTPException(status_code=400, detail="filters object is required")

        if not fmt:
            raise HTTPException(status_code=400, detail="format is required")
        
        domain = filters_model.module
        report_name = filters_model.report_title
        section_list = filters_model.sections

        request_obj = _build_request_from_filters(filters_model, fmt)
        result = generate_report_file(request_obj)
        file_bytes = result["bytes"]

        report_id = generate_report_id()
        report_code = generate_report_code(domain)

        file_path = build_report_file_path(domain, report_code, fmt)
        ensure_parent_dir(file_path)
        file_path.write_bytes(file_bytes)

        checksum = hashlib.sha256(file_bytes).hexdigest()
        file_size_bytes = len(file_bytes)
        mime_type = _mime_type_for(fmt)
        final_file_name = build_report_filename(report_code, fmt)

        insert_generated_report(
            report_id=report_id,
            report_code=report_code,
            report_name=report_name,
            domain=domain,
            filters_json=filters,
            section_list=section_list,
            fmt=fmt,
            generated_by_name="System User",
            file_path=str(file_path),
            file_name=final_file_name,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            checksum=checksum,
        )

        return FileResponse(
            path=str(file_path),
            filename=final_file_name,
            media_type=mime_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reports/{report_id}/finalize")
async def finalize_draft_report(report_id: str):
    try:
        report = require_report_by_id(report_id)

        if report.get("deleted_at") is not None:
            raise HTTPException(status_code=404, detail="Report has been deleted")

        if report.get("status") != "DRAFT":
            raise HTTPException(status_code=400, detail="Only draft reports can be finalized")

        filters = report.get("filters_json", {})
        fmt = report.get("format")

        if not fmt:
            raise HTTPException(status_code=400, detail="Draft report format is missing")

        request_obj = _build_request_from_filters(filters, fmt)
        result = generate_report_file(request_obj)
        file_bytes = result["bytes"]

        file_path = build_report_file_path(report["domain"], report["report_code"], fmt)
        ensure_parent_dir(file_path)
        file_path.write_bytes(file_bytes)

        checksum = hashlib.sha256(file_bytes).hexdigest()
        file_size_bytes = len(file_bytes)
        mime_type = _mime_type_for(fmt)
        final_file_name = build_report_filename(report["report_code"], fmt)

        mark_report_generated(
            report_id=report_id,
            fmt=fmt,
            file_path=str(file_path),
            file_name=final_file_name,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            checksum=checksum,
        )

        return FileResponse(
            path=str(file_path),
            filename=final_file_name,
            media_type=mime_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reports/draft")
async def create_report_draft(body: ReportActionRequest):
    try:
        filters_model = body.filters
        filters = filters_model.model_dump(mode="json")
        fmt = body.format

        report_id = generate_report_id()
        report_code = generate_report_code(filters_model.module)

        report = create_draft_report(
            report_id=report_id,
            report_code=report_code,
            report_name=filters_model.report_title,
            domain=filters_model.module,
            filters_json=filters,
            section_list=filters_model.sections,
            fmt=fmt,
            generated_by_name="System User",
        )

        return {"success": True, "data": report}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.put("/api/reports/{report_id}/draft")
async def update_report_draft(report_id: str, body: ReportActionRequest):
    try:
        existing = require_report_by_id(report_id)

        if existing.get("deleted_at") is not None:
            raise HTTPException(status_code=404, detail="Report has been deleted")

        if existing.get("status") != "DRAFT":
            raise HTTPException(status_code=400, detail="Only draft reports can be edited")

        filters_model = body.filters
        filters = filters_model.model_dump(mode="json")
        fmt = body.format

        updated = update_draft_report(
            report_id=report_id,
            report_name=filters_model.report_title,
            domain=filters_model.module,
            filters_json=filters,
            section_list=filters_model.sections,
            fmt=fmt,
        )

        return {"success": True, "data": updated}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports")
async def get_reports():
    reports = list_reports()
    return {"success": True, "data": reports}


@app.get("/api/reports/{report_id}/download")
async def download_report(report_id: str):
    report = require_report_by_id(report_id)

    if report.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Report has been deleted")

    if report.get("status") != "GENERATED":
        raise HTTPException(status_code=400, detail="Report is not generated yet")

    file_path = report.get("file_path")
    file_name = report.get("file_name")

    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=file_name,
        media_type=report.get("mime_type") or "application/octet-stream",
    )


@app.get("/api/reports/{report_id}/view")
async def view_report(report_id: str):
    report = require_report_by_id(report_id)

    if report.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Report has been deleted")

    if report.get("status") != "GENERATED":
        raise HTTPException(status_code=400, detail="Report is not generated yet")

    file_path = report.get("file_path")

    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File not found")

    if report.get("format") == "pdf":
        return FileResponse(
            path=file_path,
            media_type="application/pdf",
        )

    return FileResponse(
        path=file_path,
        filename=report.get("file_name"),
        media_type=report.get("mime_type"),
    )


@app.delete("/api/reports/{report_id}")
async def delete_report(report_id: str):
    report = require_report_by_id(report_id)

    if report.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Report already deleted")

    file_path = report.get("file_path")
    if file_path and Path(file_path).exists():
        try:
            Path(file_path).unlink()
        except Exception:
            pass

    success = soft_delete_report(report_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete report")

    return {"success": True, "message": "Report deleted"}

@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    report = require_report_by_id(report_id)

    if report.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Report has been deleted")

    return {"success": True, "data": report}
