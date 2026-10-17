"""Rule-based classification into specification / theory / practical / assessment.

Signals come from the file path and name first, then from the content, as in the manual audit
(e.g. an exam saved inside a lecture folder is found by "Midterm" / "اختبار" in its text).
An AI classifier can later take the low-confidence cases; the interface stays the same."""
import re
from dataclasses import dataclass

from ..models import ASSESSMENT, OTHER, PRACTICAL, SPEC, THEORY

NAME_RULES: dict[str, list[str]] = {
    SPEC: [r"specification", r"spec\b", r"توصيف", r"tp-?153", r"t-?104", r"course\s*spec"],
    ASSESSMENT: [r"exam(?!ple)", r"midterm", r"mid[-_ ]?term", r"final", r"quiz", r"test\b", r"assignment",
                 r"homework", r"\bhw\d*", r"rubric", r"اختبار", r"امتحان", r"واجب", r"تكليف", r"تقييم",
                 r"نموذج\s*اجابة", r"answer", r"marking", r"case\s*study"],
    PRACTICAL: [r"(?<![a-z])labs?(?![a-z])", r"lab[\s_-]?\d+", r"laboratory", r"practical", r"tutorial", r"معمل",
                r"عملي", r"تطبيق\s*عملي", r"workshop", r"(?<![a-z])sheet"],
    THEORY: [r"lecture", r"(?<![a-z])lec(?![a-z])", r"lec[\s_-]?\d+", r"chapter", r"(?<![a-z])ch[\s_-]?\d+", r"slides?",
             r"محاضر", r"فصل", r"نظري", r"unit\s*\d+", r"week[\s_-]?\d+", r"(?<![a-z])l\d+(?![a-z0-9])", r"powerpoint"],
}
CODE_EXTENSIONS = (".java", ".py", ".c", ".cpp", ".cs", ".js", ".sql", ".html", ".ipynb")
SLIDE_TYPES = ("pptx",)

CONTENT_RULES: dict[str, list[str]] = {
    SPEC: [r"course\s+specifications?", r"توصيف\s+المقرر", r"course\s+learning\s+outcomes",
           r"credit\s+hours", r"assessment\s+of\s+course\s+learning", r"نواتج\s+التعلم"],
    ASSESSMENT: [r"mid[- ]?term\s+exam", r"final\s+exam", r"answer\s+(all|the\s+following)", r"\bmarks?\b",
                 r"student\s+(name|id)", r"اسم\s+الطالب", r"الرقم\s+الجامعي", r"اختبار", r"الدرجة",
                 r"time\s+allowed", r"choose\s+the\s+correct"],
    PRACTICAL: [r"\blab\s+\d+", r"lab\s+(sheet|manual|exercise)", r"objectives?\s+of\s+(this|the)\s+lab",
                r"in\s+this\s+lab", r"تجربة\s+عملية", r"المعمل"],
    THEORY: [r"lecture\s+\d+", r"learning\s+objectives", r"chapter\s+\d+", r"المحاضرة"],
}

PRIORITY = [SPEC, ASSESSMENT, PRACTICAL, THEORY]
CODE_RE = re.compile(r"(?<![A-Za-z])(CS|IS|IT|SE|MATH|STAT|PHYS|ENGL|ARAB|ISLM|HIST|AI)\s?-?\s?(\d{4})")


@dataclass
class Classification:
    component: str
    confidence: float
    reason: str
    codes_in_text: list[str]


def _hits(rules: dict[str, list[str]], text: str) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for comp, patterns in rules.items():
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                found.setdefault(comp, []).append(m.group(0).strip())
    return found


def classify(path: str, text: str, detected_type: str) -> Classification:
    name_hits = _hits(NAME_RULES, path)
    content_hits = _hits(CONTENT_RULES, text[:8000]) if text else {}
    codes = sorted({a + b for a, b in CODE_RE.findall(text[:4000])}) if text else []

    # A name or folder hit ("Lecture 3", "Final exam/", "Labs/Lab2") is the strongest single signal;
    # content alone is weaker because lectures quote exam words and specifications mention labs.
    scores: dict[str, float] = {}
    for comp in PRIORITY:
        score = 0.0
        if comp in name_hits:
            score += 0.75
        if comp in content_hits:
            score += 0.3 + 0.1 * min(len(content_hits[comp]) - 1, 2)
        scores[comp] = score

    lower = path.lower()
    if lower.endswith(CODE_EXTENSIONS):
        scores[PRACTICAL] += 0.35  # source code is lab material
    if detected_type in SLIDE_TYPES or lower.endswith(".ppt"):
        scores[THEORY] += 0.3  # slide decks are usually lectures
    # A specification is identified by its content even when the filename says nothing.
    if SPEC in content_hits and len(content_hits[SPEC]) >= 2:
        scores[SPEC] = max(scores[SPEC], 0.8)

    best = max(PRIORITY, key=lambda c: (scores[c], -PRIORITY.index(c)))
    top = scores[best]
    if top == 0:
        return Classification(OTHER, 0.0, "لا توجد إشارة في الاسم أو المحتوى", codes)

    # Two competing name signals (e.g. "Lab exam") are genuinely ambiguous.
    runner_up = max((s for c, s in scores.items() if c != best), default=0.0)
    confidence = min(0.98, top) - (0.25 if runner_up >= top - 0.15 and runner_up > 0 else 0.0)

    parts = []
    if best in name_hits:
        parts.append(f"الاسم: {', '.join(name_hits[best][:2])}")
    if best in content_hits:
        parts.append(f"المحتوى: {', '.join(content_hits[best][:2])}")
    if not text:
        parts.append("لم يُستخرج نص من الملف")
    return Classification(best, round(max(confidence, 0.05), 2), "؛ ".join(parts) or "نوع الملف", codes)
