"""Send the files the rules route to review through the Claude second opinion (read-only; costs API credit).

    python tests/eval_ai_review.py "<path to 03_Courses>" [out.csv]
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import settings  # noqa: E402
from app.services import ai_classify  # noqa: E402
from app.services.classify import classify  # noqa: E402
from app.services.extract import ExtractionError, detect_type, extract_text  # noqa: E402

PRICE_IN, PRICE_OUT = 4.00, 20.00  # USD per million tokens, claude-opus-5-5

root = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
rows, tin, tout = [], 0, 0
for path in sorted(p for p in root.rglob("*") if p.is_file() and not p.name.startswith("~$")):
    data = path.read_bytes()
    kind = detect_type(data, path.name)
    if kind in ("empty", "rar", "zip"):
        continue
    try:
        text = extract_text(data, kind)
    except ExtractionError:
        text = ""
    rel = str(path.relative_to(root)).replace("\\", "/")
    rule = classify(rel, text, kind)
    if rule.confidence >= settings.review_threshold and rule.component != "other":
        continue
    course = rel.split("/")[0]
    ai, usage, error = ai_classify.classify_with_ai(course=course, path=rel, text=text, data=data, kind=kind)
    tin, tout = tin + usage.input_tokens, tout + usage.output_tokens
    if ai:
        accepted = ai.component != "other" and ai.confidence >= settings.ai_accept_confidence
        rows.append((rel, rule.component, ai.component, ai.confidence, "auto" if accepted else "team", ai.reason_ar))
        print(f"{'AUTO' if accepted else 'TEAM'} {ai.component:<10} {ai.confidence:.2f} | {rel[:80]} | {ai.reason_ar}")
    else:
        rows.append((rel, rule.component, "", 0, "error", error))
        print(f"ERR  {rel[:80]} | {error}")

cost = tin / 1e6 * PRICE_IN + tout / 1e6 * PRICE_OUT
auto = sum(1 for r in rows if r[4] == "auto")
print(f"\nfiles sent: {len(rows)} | settled by AI: {auto} | still for the team: {len(rows) - auto}")
print(f"tokens in/out: {tin}/{tout} | cost ~ ${cost:.2f}")
if out:
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["path", "rules", "ai", "confidence", "route", "reason"])
        w.writerows(rows)
