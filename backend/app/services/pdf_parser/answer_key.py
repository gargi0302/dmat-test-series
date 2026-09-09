"""Answer-key text parsing. Never guesses: every entry either resolves with a
traceable confidence level, or is left unset for manual review (spec rule —
NEVER silently guess an answer)."""
from __future__ import annotations
import re

HEADING_PATTERN = re.compile(
    r"^(?:\d+\s+)?(Answer\s*Key(\s*&\s*Detailed\s*Solutions)?|Detailed\s*Solutions|Solutions?|Answer\s*Sheet)\s*$",
    re.IGNORECASE,
)


def find_key_section_start(pdf) -> int | None:
    """Returns the 0-based page index where an answer-key/solutions section
    heading first appears as its own short line (not a table-of-contents
    reference, which always carries a trailing page number), or None if no
    such heading is found anywhere in the document."""
    for page_index, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if line and HEADING_PATTERN.match(line):
                return page_index
    return None


def parse_answer_key_text(text: str) -> dict[int, dict]:
    """Tries several known answer-key formats and returns whichever yields
    the most complete parse. Each entry: {"value": str, "variable": str|None}."""
    candidates: dict[str, dict[int, dict]] = {}

    # "Q1: G = 33" / "Q1: 33"  (math systems — value plus the variable it targets)
    var_eq = re.findall(r"Q(\d+)\s*:\s*([A-Za-z])\s*=\s*(-?\d+(?:\.\d+)?)", text)
    if var_eq:
        d: dict[int, dict] = {}
        for num, var, val in var_eq:
            d[int(num)] = {"value": val, "variable": var}
        candidates["var_eq"] = d

    # "Question 5 ... Correct Option: B" blocks
    correct_option = re.findall(
        r"Question\s+(\d+)\b.*?Correct\s+Option\s*:\s*([A-Za-z0-9]+)",
        text, re.IGNORECASE | re.DOTALL,
    )
    if correct_option:
        d = {}
        for num, val in correct_option:
            d.setdefault(int(num), {"value": val, "variable": None})
        candidates["correct_option"] = d

    # Dense grid "Q1 1 Q21 2 Q41 3 ..." (repeated Qn <token> pairs, incl. symbol glyphs).
    # No trailing \b: symbol glyphs (★■●▲) aren't \w characters, so a boundary
    # assertion right after one never matches and silently drops that entry
    # (confirmed by real-PDF testing — every star/square/circle/triangle
    # answer in a Latin-square key was lost this way).
    grid = re.findall(r"Q(\d+)\s+([A-Za-z0-9▲■●★]+)", text)
    if grid:
        d = {}
        for num, val in grid:
            d.setdefault(int(num), {"value": val, "variable": None})
        candidates["grid"] = d

    # Plain numbered list "1. C" / "Q1 - C" / "Q1: C" (one per line)
    plain: dict[int, dict] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        m = re.match(r"^Q?(\d+)\s*[\.\-:\)]\s*([A-Za-z0-9▲■●★]+)\s*$", line)
        if m:
            plain[int(m.group(1))] = {"value": m.group(2), "variable": None}
    if plain:
        candidates["plain_list"] = plain

    if not candidates:
        return {}
    best = max(candidates, key=lambda k: len(candidates[k]))
    return candidates[best]


def resolve_answer(
    option_type: str,
    valid_option_keys: list[str] | None,
    parsed_entry: dict | None,
    question_text: str | None = None,
) -> tuple[str | None, str, str | None]:
    """Returns (correct_answer, confidence, detected_answer_raw).
    correct_answer is only ever set at confidence 'high' or 'medium' —
    'low'/'none' always leave it None so nothing gets guessed."""
    if not parsed_entry:
        return None, "none", None
    value = str(parsed_entry["value"]).strip()
    variable = parsed_entry.get("variable")

    if option_type == "mcq" and valid_option_keys:
        norm_keys = {k.strip().upper(): k for k in valid_option_keys}
        if value.strip().upper() in norm_keys:
            return norm_keys[value.strip().upper()], "high", value
        return None, "low", value

    # numeric / text (fill-in) answers
    variable_ok = True
    if variable and question_text:
        # cross-check: if the question explicitly names a single target variable
        # ("Find the value of G."), the key's variable should match it.
        m = re.search(r"[Vv]alue\s+of\s+([A-Za-z])\b", question_text)
        if m and m.group(1).upper() != variable.upper():
            variable_ok = False

    looks_clean = bool(re.fullmatch(r"-?\d+(\.\d+)?", value) or re.fullmatch(r"[A-Za-z0-9▲■●★]+", value))
    if looks_clean and variable_ok:
        return value, "high" if variable else "medium", value
    return None, "low", value
