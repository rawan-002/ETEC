"""Detect a file's real type from its bytes and pull out its text."""
import io
import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from ..config import settings

logging.getLogger("pypdf").setLevel(logging.ERROR)

TEXT_LIMIT = 20_000


def detect_type(data: bytes, filename: str) -> str:
    """Return pdf, docx, pptx, xlsx, zip, rar, doc_legacy, text, image, empty or unknown.
    The extension is only a fallback: the audit found a Word file saved as .pdf."""
    if not data or not data.strip(b"\x00"):
        return "empty"
    head = data[:8]
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"Rar!"):
        return "rar"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "doc_legacy"  # old .doc / .ppt / .xls
    if head.startswith((b"\x89PNG", b"\xff\xd8\xff", b"GIF8")):
        return "image"
    if head.startswith(b"PK"):
        try:
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            return "unknown"
        if any(n.startswith("word/") for n in names):
            return "docx"
        if any(n.startswith("ppt/") for n in names):
            return "pptx"
        if any(n.startswith("xl/") for n in names):
            return "xlsx"
        return "zip"
    ext = PurePosixPath(filename.lower()).suffix
    if ext in {".txt", ".md", ".csv", ".py", ".java", ".c", ".cpp", ".html", ".sql", ".js"}:
        return "text"
    return "unknown"


def extract_text(data: bytes, kind: str) -> str:
    try:
        if kind == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            parts = []
            for page in reader.pages[:40]:
                parts.append(page.extract_text() or "")
                if sum(map(len, parts)) > TEXT_LIMIT:
                    break
            return "\n".join(parts)[:TEXT_LIMIT]
        if kind == "docx":
            import docx
            d = docx.Document(io.BytesIO(data))
            text = [p.text for p in d.paragraphs]
            for table in d.tables:
                for row in table.rows:
                    text.append(" | ".join(c.text for c in row.cells))
            return "\n".join(text)[:TEXT_LIMIT]
        if kind == "pptx":
            from pptx import Presentation
            prs = Presentation(io.BytesIO(data))
            text = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        text.append(shape.text_frame.text)
            return "\n".join(text)[:TEXT_LIMIT]
        if kind == "xlsx":
            from openpyxl import load_workbook
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            text = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True, max_row=200):
                    text.append(" ".join(str(v) for v in row if v is not None))
            return "\n".join(text)[:TEXT_LIMIT]
        if kind == "text":
            return data.decode("utf-8", errors="ignore")[:TEXT_LIMIT]
    except Exception as exc:  # a broken file must not stop the rest of the upload
        raise ExtractionError(str(exc)[:300]) from exc
    return ""


class ExtractionError(Exception):
    pass


@dataclass
class ArchiveEntry:
    path: str
    data: bytes


@dataclass
class ArchiveResult:
    entries: list[ArchiveEntry] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def expand_zip(data: bytes) -> ArchiveResult:
    """Read a zip in memory with entry-count and size limits. Nothing is written to disk."""
    result = ArchiveResult()
    total = 0
    limit = settings.max_archive_total_mb * 1024 * 1024
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = _decode_name(info)
            base = PurePosixPath(name).name
            if base.startswith(("~$", ".")) or "__MACOSX" in name:
                result.skipped.append(name)
                continue
            if len(result.entries) >= settings.max_archive_entries or total + info.file_size > limit:
                result.skipped.append(name)
                continue
            total += info.file_size
            result.entries.append(ArchiveEntry(name, zf.read(info)))
    return result


def _decode_name(info: zipfile.ZipInfo) -> str:
    # Windows zips store Arabic names in cp437 unless the UTF-8 flag is set.
    if info.flag_bits & 0x800:
        return info.filename
    try:
        return info.filename.encode("cp437").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return info.filename
