"""Second-opinion classification by Claude for files the rules could not settle.

Only low-confidence files reach this step, so most uploads cost nothing. Scanned PDFs and images
(no extractable text) are sent as documents so the model can read stamped Arabic specifications."""
import base64
import logging
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from ..config import settings

log = logging.getLogger("aq.ai")

TEXT_LIMIT = 12_000
MAX_VISUAL_BYTES = 20 * 1024 * 1024  # stay well under the 32 MB request limit

SYSTEM = """You classify one file uploaded to a university course file (Al-Baha University, Faculty of Computing).
Every course file has four components:
- spec: the official course specification (NCAAA templates TP-153 / T-104), course plan or course description document
- theory: lecture slides, lecture notes, chapters, summaries, textbook excerpts used for teaching
- practical: lab sheets, lab manuals, tutorials, programming exercises, source code for labs
- assessment: exams, quizzes, assignments, homework, projects given to students, answer keys, rubrics, grading forms
Use "other" for anything that is none of these (course reports, timelines, attendance, blank templates, unrelated files).
Judge by what the document is, not by single words: a lecture that mentions "exam" is still theory; a lab marked
"Marking" with a grading rubric is assessment. The file name and folder are hints, the content decides.
Confidence is your probability that the component is right. Write the reason in Arabic, one short sentence."""


class AIResult(BaseModel):
    component: Literal["spec", "theory", "practical", "assessment", "other"]
    confidence: float = Field(ge=0, le=1)
    reason_ar: str
    course_code_in_document: str | None = None


class AIUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


def enabled() -> bool:
    return bool(settings.anthropic_api_key) and settings.ai_enabled


_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=120.0)
    return _client


def classify_with_ai(*, course: str, path: str, text: str, data: bytes, kind: str) -> tuple[AIResult | None, AIUsage, str | None]:
    """Returns (result, usage, error). Never raises: an API problem leaves the file for human review."""
    content: list[dict] = []
    has_text = len(text.strip()) >= 200
    if not has_text and kind == "pdf" and len(data) <= MAX_VISUAL_BYTES:
        content.append({"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                                       "data": base64.standard_b64encode(data).decode()}})
    elif not has_text and kind == "image" and len(data) <= MAX_VISUAL_BYTES:
        media = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg" if data[:3] == b"\xff\xd8\xff" else "image/gif"
        content.append({"type": "image", "source": {"type": "base64", "media_type": media,
                                                    "data": base64.standard_b64encode(data).decode()}})
    body = f"Course: {course}\nFile path: {path}\nDetected file type: {kind}\n"
    body += f"\nExtracted text (may be partial):\n{text[:TEXT_LIMIT]}" if has_text else "\nNo text could be extracted from this file."
    content.append({"type": "text", "text": body})

    try:
        response = _get_client().beta.messages.parse(
            model=settings.ai_model,
            max_tokens=2000,
            system=SYSTEM,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": content}],
            output_format=AIResult,
        )
    except anthropic.APIStatusError as exc:
        log.warning("AI classification failed (%s): %s", exc.status_code, exc)
        return None, AIUsage(), f"تعذّر التحليل الذكي ({exc.status_code})"
    except anthropic.APIConnectionError as exc:
        log.warning("AI classification connection error: %s", exc)
        return None, AIUsage(), "تعذّر الاتصال بخدمة التحليل الذكي"

    usage = AIUsage(input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens)
    if response.stop_reason == "refusal":
        return None, usage, "رفض النموذج تحليل الملف"
    if response.parsed_output is None:
        return None, usage, "لم يُرجع التحليل الذكي نتيجة صالحة"
    return response.parsed_output, usage, None
