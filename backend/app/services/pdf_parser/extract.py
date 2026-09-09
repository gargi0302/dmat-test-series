"""Orchestrates one import: locates question regions, crops/renders every
question (and its options) straight from the source PDF, matches an answer
key when one is available, and returns ParsedQuestion records ready to be
inserted as Question rows. Nothing here invents or regenerates content —
every visual is a direct crop; every answer either resolves with a traceable
confidence or is left blank for manual review."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json
import re
import pdfplumber
import pymupdf

from . import boundary_detect as bd
from . import answer_key as ak
from . import rendering as rnd

NUMERIC_HINT = re.compile(r"find the value of\s+([A-Za-z])\b", re.IGNORECASE)
# "A = ? • B = ? • C = ? • D = ?" style — one input per variable asked for,
# rather than a single generic "enter your answer" box.
VARIABLE_PATTERN = re.compile(r"\b([A-Za-z])\s*=\s*\?")


def extract_variables(text: str) -> list[str]:
    seen: list[str] = []
    for m in VARIABLE_PATTERN.finditer(text or ""):
        v = m.group(1).upper()
        if v not in seen:
            seen.append(v)
    return seen


@dataclass
class ParsedOption:
    key: str
    text: str | None
    image_path: str | None


@dataclass
class ParsedPart:
    label: str
    options: list[dict]
    correct_answer: str | None
    detected_answer_raw: str | None


@dataclass
class ParsedQuestion:
    source_question_number: int
    question_text: str | None
    question_image_path: str
    option_type: str
    options: list[dict] | None
    correct_answer: str | None
    detected_answer_raw: str | None
    confidence: str
    status: str
    source_page: int  # 1-based, for display
    parts: list[dict] | None = None  # set instead of options/correct_answer for
    # multi-part questions (e.g. "Matrix 5" + "Matrix 6" each with their own
    # options and answer) — never both.
    variables: list[str] | None = None  # for a fill-in-the-blank(s) question
    # ("A = ? • B = ? • C = ? • D = ?"), the exact variable letters the source
    # PDF asks for, in order — the frontend renders one labeled input per
    # variable instead of a single generic box. correct_answer becomes a
    # JSON {"A": "9", ...} object when this is set, matching how `parts`
    # answers are encoded.


def _overlaps(bbox, o) -> bool:
    x0, top, x1, bottom = bbox
    ox0, oy0, ox1, oy1 = o.get("x0", 0), o.get("top", 0), o.get("x1", 0), o.get("bottom", 0)
    return not (ox1 <= x0 or ox0 >= x1 or oy1 <= top or oy0 >= bottom)


def region_has_graphics(page, bbox) -> bool:
    if any(_overlaps(bbox, im) for im in page.images):
        return True
    if any(_overlaps(bbox, o) for o in list(page.rects) + list(page.curves)):
        return True
    return sum(1 for l in page.lines if _overlaps(bbox, l)) >= 3


def _save_crop(doc, page_index: int, bbox, out_dir: Path, filename: str, url_prefix: str) -> str:
    pix = rnd.render_page_region(doc, page_index, bbox)
    out_path = out_dir / filename
    rnd.save_pixmap(pix, out_path)
    return f"{url_prefix}/{filename}"


def _build_options(doc, page, page_index: int, qnum: int, regions, image_out_dir: Path,
                    image_url_prefix: str, name_suffix: str = "") -> list[dict]:
    """Builds the option list for one group of option Regions — cropping each
    graphical option straight from the PDF, or extracting its text if it's
    plain text. Shared by both ordinary single-answer questions and each part
    of a multi-part question."""
    options = []
    for oi, oregion in enumerate(regions):
        okey = oregion.marker.label
        obbox = oregion.bbox
        if region_has_graphics(page, obbox):
            ofname = f"q{qnum:04d}_p{page_index + 1}{name_suffix}_opt{oi + 1}.png"
            oimg = _save_crop(doc, page_index, obbox, image_out_dir, ofname, image_url_prefix)
            otext = None
        else:
            oimg = None
            raw = (page.crop(obbox).extract_text() or "").strip()
            otext = re.sub(r"^(Option\s+\d+|[A-F])[\.\):]?\s*", "", raw, flags=re.IGNORECASE).strip() or None
        options.append(ParsedOption(key=okey, text=otext, image_path=oimg).__dict__)
    return options


def parse_pdf(
    module: str,
    questions_pdf_path: Path,
    answer_key_pdf_path: Path | None,
    source_pdf_filename: str,
    image_out_dir: Path,
    image_url_prefix: str,
) -> list[ParsedQuestion]:
    same_file = answer_key_pdf_path is None or answer_key_pdf_path == questions_pdf_path
    image_out_dir.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(questions_pdf_path) as pdf:
        key_start = ak.find_key_section_start(pdf) if same_file else None
        page_limit = key_start if key_start is not None else None
        regions = bd.detect_question_regions(pdf, page_limit=page_limit)

        # Answer key text: same file's later pages, or a separate file.
        key_entries: dict[int, dict] = {}
        if same_file and key_start is not None:
            key_text = "\n".join((pdf.pages[i].extract_text() or "") for i in range(key_start, len(pdf.pages)))
            key_entries = ak.parse_answer_key_text(key_text)
        elif not same_file and answer_key_pdf_path is not None:
            with pdfplumber.open(answer_key_pdf_path) as key_pdf:
                key_text = "\n".join((p.extract_text() or "") for p in key_pdf.pages)
                key_entries = ak.parse_answer_key_text(key_text)

        doc = pymupdf.open(questions_pdf_path)
        results: list[ParsedQuestion] = []

        for region in regions:
            qnum = region.marker.number
            page = pdf.pages[region.page_index]
            bbox = region.bbox

            question_text = (page.crop(bbox).extract_text() or "").strip() or None

            # NOTE: question_image intentionally covers the WHOLE question
            # region, options included — an attempt to trim it to just above
            # the options row was reverted (real-PDF testing showed option
            # crops are deliberately pulled up to reach image content sitting
            # well above their own label, so "top of the options row" can't be
            # derived from their bboxes; a wrong guess produced a near-empty
            # crop, which is a far worse outcome than the original cosmetic
            # redundancy of also seeing the options inside the full snapshot).
            fname = f"q{qnum:04d}_p{region.page_index + 1}.png"
            question_image_path = _save_crop(doc, region.page_index, bbox, image_out_dir, fname, image_url_prefix)

            option_groups, option_style = bd.detect_option_groups(pdf, region.page_index, bbox)
            options: list[dict] | None = None
            parts: list[dict] | None = None
            variables: list[str] | None = None
            option_type = "text"
            correct_answer: str | None = None
            detected_raw: str | None = None
            confidence = "none"
            option_flag_ambiguous = option_style == "ambiguous"

            if len(option_groups) > 1:
                # Multi-part question (e.g. "Matrix 5" + "Matrix 6"), each
                # part with its own options and its own answer. No known
                # answer-key format in this codebase carries per-part
                # answers, so each part's correct_answer is left for manual
                # review rather than guessed.
                option_type = "mcq"
                parsed_parts = []
                for gi, (label, group_regions) in enumerate(option_groups):
                    part_options = _build_options(
                        doc, page, region.page_index, qnum, group_regions,
                        image_out_dir, image_url_prefix, name_suffix=f"_part{gi + 1}",
                    )
                    parsed_parts.append(ParsedPart(
                        label=label or f"Part {gi + 1}",
                        options=part_options,
                        correct_answer=None,
                        detected_answer_raw=None,
                    ).__dict__)
                parts = parsed_parts
                confidence = "medium"  # structure parsed cleanly; answers still need verification
            else:
                if option_groups:
                    option_type = "mcq"
                    options = _build_options(doc, page, region.page_index, qnum, option_groups[0][1], image_out_dir, image_url_prefix)
                else:
                    variables = extract_variables(question_text or "")
                    if variables:
                        option_type = "text"
                    elif NUMERIC_HINT.search(question_text or ""):
                        option_type = "numeric"
                valid_keys = [o["key"] for o in options] if options else None
                parsed_entry = key_entries.get(qnum)
                correct_answer, confidence, detected_raw = ak.resolve_answer(
                    option_type, valid_keys, parsed_entry, question_text
                )
                if variables and correct_answer is not None:
                    # Wrap the single resolved value into the same
                    # {variable: value} encoding the frontend uses for
                    # multi-variable answers — tie it to whichever variable
                    # the answer key actually targeted (e.g. "Q1: G=33"),
                    # falling back to the first asked-for variable if the key
                    # didn't name one or named one this question doesn't ask.
                    target = (parsed_entry or {}).get("variable")
                    key = target.upper() if target and target.upper() in variables else variables[0]
                    correct_answer = json.dumps({key: correct_answer})

            if option_flag_ambiguous:
                confidence = "low"
                correct_answer = None

            # Never auto-published: every freshly parsed question lands in the
            # review queue regardless of confidence. Only an explicit human
            # "Approve" in the Import Preview screen makes it testable.
            status = "needs_review"

            results.append(ParsedQuestion(
                source_question_number=qnum,
                question_text=question_text,
                question_image_path=question_image_path,
                option_type=option_type,
                options=options,
                correct_answer=correct_answer,
                detected_answer_raw=detected_raw,
                confidence=confidence,
                status=status,
                source_page=region.page_index + 1,
                parts=parts,
                variables=variables,
            ))

        doc.close()

    return results
