from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
from jinja2 import Environment, FileSystemLoader, select_autoescape
import pdfkit
import os
import shutil


def _find_wkhtmltopdf() -> str:
    env_path = os.getenv("WKHTMLTOPDF_PATH")
    if env_path and Path(env_path).exists():
        return str(Path(env_path).resolve())

    project_root = Path(__file__).resolve().parents[3]

    bundled_candidates = [
        project_root / "wkhtmltopdf" / "bin" / "wkhtmltopdf.exe",
        project_root / "wkhtmltopdf" / "wkhtmltopdf.exe",
        project_root / "wkhtmltopdf" / "bin" / "wkhtmltopdf",
        project_root / "wkhtmltopdf" / "wkhtmltopdf",
    ]
    for p in bundled_candidates:
        if p.exists():
            return str(p.resolve())

    system_candidates = [
        Path(r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"),
        Path(r"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe"),
        Path("/usr/local/bin/wkhtmltopdf"),
        Path("/usr/bin/wkhtmltopdf"),
        Path("/opt/homebrew/bin/wkhtmltopdf"),
    ]
    for p in system_candidates:
        if p.exists():
            return str(p.resolve())

    found = shutil.which("wkhtmltopdf")
    if found:
        return str(Path(found).resolve())

    raise RuntimeError(
        "wkhtmltopdf not found. Put it in "
        "'services/Report_export/wkhtmltopdf/bin/wkhtmltopdf.exe' "
        "or set WKHTMLTOPDF_PATH."
    )


def _get_pdfkit_config():
    wkhtmltopdf_path = _find_wkhtmltopdf()
    return wkhtmltopdf_path, pdfkit.configuration(wkhtmltopdf=wkhtmltopdf_path)


def render_pdf(payload: Dict[str, Any], template_path: str) -> bytes:
    app_dir = Path(__file__).resolve().parents[2]

    templates_dir = app_dir / "templates"
    static_dir = app_dir / "statics"

    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )

    template = env.get_template(template_path)

    meta = payload.get("meta", {}) or {}
    module = (
        meta.get("module")
        or meta.get("report_type")
        or meta.get("type")
        or ""
    ).strip().lower()

    cover_map = {
        "operations": "cover_operation.png",
        "sustainability": "cover_sustainability.png",
        "soc": "cover_soc.png",
        "exhibitor": "cover_exhibitor.png",
        "exhibitors": "cover_exhibitor.png",
    }

    cover_filename = cover_map.get(module, "cover_default.png")
    cover = static_dir / cover_filename
    cover_uri = cover.resolve().as_uri()

    html = template.render(
        meta=payload.get("meta", {}),
        sections=payload.get("pdf_sections", []),
        assets={"cover_image": cover_uri},
    )

    options = {
        "enable-local-file-access": "",
        "allow": str(static_dir.resolve()),
    }

    wkhtmltopdf_path, pdfkit_config = _get_pdfkit_config()

    pdf = pdfkit.from_string(
        html,
        output_path=False,
        options=options,
        configuration=pdfkit_config,
    )

    if isinstance(pdf, (bytes, bytearray)):
        return bytes(pdf)

    raise RuntimeError(
        f"pdfkit did not return PDF bytes. wkhtmltopdf used: {wkhtmltopdf_path}"
    )