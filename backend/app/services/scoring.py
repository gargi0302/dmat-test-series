import json
from typing import Optional


def _normalize(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().upper()


def grade(selected: Optional[str], correct: Optional[str]) -> Optional[bool]:
    """Returns None (ungraded) if either side is missing — an unanswered
    question, or a question whose correct answer was never confirmed, is
    never silently marked wrong or right.

    Multi-part questions store their answer as a JSON object of
    {part_label: choice} rather than a plain string — detected here by a
    leading '{' on either side. A part-by-part comparison requires every
    part's correct answer to be known; if any part's answer was never
    confirmed, the whole question stays ungraded (None) rather than being
    marked wrong for a part nobody could have answered correctly."""
    if selected is None or correct is None:
        return None
    selected, correct = selected.strip(), correct.strip()
    if selected.startswith("{") or correct.startswith("{"):
        try:
            sel = json.loads(selected) if selected.startswith("{") else {}
            cor = json.loads(correct) if correct.startswith("{") else {}
        except json.JSONDecodeError:
            return None
        if not cor or any(v is None for v in cor.values()):
            return None
        return all(_normalize(sel.get(k)) == _normalize(v) for k, v in cor.items())
    return _normalize(selected) == _normalize(correct)
