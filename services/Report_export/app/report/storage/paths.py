from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


DOMAIN_PREFIX = {
    "sustainability": "SB",
    "operations": "OP",
    "exhibitors": "EX",
    "soc": "SC",
}

ALLOWED_FORMATS = {"pdf", "xlsx"}


def _project_root() -> Path:
    # .../Report_export/app/report/storage/paths.py
    # parents[3] => .../Report_export
    return Path(__file__).resolve().parents[3]


def storage_root() -> Path:
    path = _project_root() / "storage"
    path.mkdir(parents=True, exist_ok=True)
    return path


def reports_root() -> Path:
    path = storage_root() / "reports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_report_id() -> str:
    return str(uuid4())


def generate_report_code(domain: str) -> str:
    if domain not in DOMAIN_PREFIX:
        raise ValueError(f"Unsupported domain: {domain}")

    prefix = DOMAIN_PREFIX[domain]
    now = datetime.now(timezone.utc)
    suffix = uuid4().hex[:4].upper()

    return f"{prefix}-{now:%Y%m%d-%H%M%S}-{suffix}"


def build_report_filename(report_code: str, fmt: str) -> str:
    if fmt not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported format: {fmt}")

    return f"{report_code}.{fmt}"


def build_report_file_path(domain: str, report_code: str, fmt: str) -> Path:
    if domain not in DOMAIN_PREFIX:
        raise ValueError(f"Unsupported domain: {domain}")
    if fmt not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported format: {fmt}")

    now = datetime.now(timezone.utc)

    folder = reports_root() / domain / f"{now:%Y}" / f"{now:%m}"
    folder.mkdir(parents=True, exist_ok=True)

    return folder / build_report_filename(report_code, fmt)

def ensure_parent_dir(file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)