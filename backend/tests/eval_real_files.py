"""Run the classifier over a real program folder (read-only) and report how files were sorted.

    python tests/eval_real_files.py "<path to 01_Computer_Science_CS/03_Courses>" [out.csv]
"""
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import settings  # noqa: E402
from app.services.classify import classify  # noqa: E402
from app.services.extract import ExtractionError, detect_type, extract_text  # noqa: E402

root = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
rows, counts, review = [], Counter(), 0
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    if path.name.startswith("~$"):
        continue
    data = path.read_bytes()
    kind = detect_type(data, path.name)
    text = ""
    if kind not in ("empty", "rar", "zip"):
        try:
            text = extract_text(data, kind)
        except ExtractionError:
            pass
    rel = str(path.relative_to(root)).replace("\\", "/")
    res = classify(rel, text, kind)
    low = res.confidence < settings.review_threshold or res.component == "other" or kind in ("empty", "rar")
    review += low
    counts[res.component] += 1
    rows.append((rel, kind, res.component, res.confidence, "review" if low else "auto", res.reason))

total = len(rows)
print(f"files: {total}")
for comp, n in counts.most_common():
    print(f"  {comp:<11} {n}")
print(f"auto-classified: {total - review} ({100 * (total - review) // max(total, 1)}%), to review: {review}")
if out:
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["path", "type", "component", "confidence", "route", "reason"])
        w.writerows(rows)
