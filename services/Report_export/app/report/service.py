from typing import Dict, Any
from app.report.schemas import ExportRequest

from app.report.module.sustainability.report_builder import build_sustainability_report
from app.report.module.operations.report_builder import build_operations_report
from app.report.module.exhibitors.report_builder import build_exhibitors_report

from app.report.renderers.pdf import render_pdf
from app.report.renderers.xlsx import render_xlsx


MODULE_BUILDERS = {
    "sustainability": build_sustainability_report,
    "operations": build_operations_report,
    "exhibitors": build_exhibitors_report,

}

MODULE_TEMPLATES = {
    "sustainability": "sustainability/main.html",
    "operations": "operations/main.html",
    "exhibitors": "exhibitors/main.html",
}


def generate_report_file(body: ExportRequest) -> Dict[str, Any]:
    module = body.filters.module
    fmt = body.format

    if module not in MODULE_BUILDERS:
        raise ValueError(f"Unsupported module: {module}")

    payload = MODULE_BUILDERS[module](body.filters, mode=fmt, datasets=body.datasets)

    print("DEBUG module:", module)
    print("DEBUG fmt:", fmt)
    print("DEBUG template_path:", MODULE_TEMPLATES[module])
    print("DEBUG payload keys:", payload.keys())
    print("DEBUG pdf_sections count:", len(payload.get("pdf_sections", [])))
    print("DEBUG xlsx_sheets count:", len(payload.get("xlsx", {}).get("sheets", [])))
    print("DEBUG pdf_sections titles:", [s.get("title") for s in payload.get("pdf_sections", [])])

    filename = f"{module}_report.{fmt}"

    if fmt == "pdf":
        template_path = MODULE_TEMPLATES[module]
        file_bytes = render_pdf(payload, template_path)
        return {"format": "pdf", "bytes": file_bytes, "filename": filename}

    if fmt == "xlsx":
        file_bytes = render_xlsx(payload)
        return {"format": "xlsx", "bytes": file_bytes, "filename": filename}

    raise ValueError("Unsupported format")