"""Generic, format-agnostic question/option boundary detection.

Real dMAT question banks vary a lot in layout (single question per page,
6-per-page grids, image-only sequences, etc). Rather than hard-coding one
template, this module finds question/option "marker" text (e.g. "Question 5
of 150", "Q1.", "A.", "Option 2") anywhere in the document, then groups
markers into a row-major grid per page to derive each item's bounding box.

The bias throughout is toward NOT truncating real content: when in doubt, a
region's bounds are pulled wider (e.g. row 0 always starts at the page top)
rather than narrower, because over-cropping loses source content while a
slightly generous crop only adds harmless surrounding context. Anything the
detector can't resolve confidently is left for the human review screen.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from collections import defaultdict
import re

QUESTION_MARKER_PATTERNS = [
    re.compile(r"^Question\s+(\d+)\s+of\s+\d+", re.IGNORECASE),
    re.compile(r"^Question\s+(\d+)\b", re.IGNORECASE),
    re.compile(r"^Q\.?\s*(\d+)\s*[\.\):]", re.IGNORECASE),
    re.compile(r"^Q(\d+)\.?\s"),
    re.compile(r"^(\d+)\.\s+\S"),  # last-resort plain numbered list
]

OPTION_LETTER_PATTERN = re.compile(r"^\(?([A-F])\)?[\.\):]\s*(.*)$")
OPTION_BARE_LETTER_PATTERN = re.compile(r"^([A-F])$")
OPTION_NUMBERED_PATTERN = re.compile(r"^Option\s+(\d+)\b", re.IGNORECASE)
GROUP_LABEL_PATTERN = re.compile(r"Options?\s+for\s+(.+)", re.IGNORECASE)


@dataclass
class Line:
    top: float
    bottom: float
    x0: float
    x1: float
    text: str


@dataclass
class Marker:
    number: int
    label: str  # exact text of the marker, e.g. "B" or "Option 2" — never invented
    page_index: int
    top: float
    bottom: float
    x0: float
    x1: float


@dataclass
class Region:
    marker: Marker
    page_index: int
    bbox: tuple[float, float, float, float]  # x0, top, x1, bottom (pdf points)


def build_lines(page, tol: float = 2.5, col_gap: float = 25.0) -> list[Line]:
    """Groups words into visual lines. Two passes: first by near-identical
    top (a normal text line), then — because grid/multi-column layouts (e.g.
    "Q1. Set: Numbers    Q2. Set: Letters" side by side) put unrelated
    side-by-side blocks at the same top — split each top-group further
    wherever the horizontal gap between consecutive words is much wider than
    ordinary word spacing. Without this, two side-by-side question headers
    collapse into one Line and only the leftmost one is ever seen as a marker
    (confirmed by real-PDF testing on a 2-per-row question bank)."""
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    if not words:
        return []
    words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    top_groups: list[list[dict]] = []
    for w in words:
        if top_groups:
            running_top = sum(x["top"] for x in top_groups[-1]) / len(top_groups[-1])
            if abs(w["top"] - running_top) <= tol:
                top_groups[-1].append(w)
                continue
        top_groups.append([w])

    lines = []
    for g in top_groups:
        g.sort(key=lambda w: w["x0"])
        sub_groups: list[list[dict]] = [[g[0]]]
        for w in g[1:]:
            prev = sub_groups[-1][-1]
            if w["x0"] - prev["x1"] > col_gap:
                sub_groups.append([w])
            else:
                sub_groups[-1].append(w)
        for sg in sub_groups:
            lines.append(Line(
                top=min(w["top"] for w in sg),
                bottom=max(w["bottom"] for w in sg),
                x0=min(w["x0"] for w in sg),
                x1=max(w["x1"] for w in sg),
                text=" ".join(w["text"] for w in sg),
            ))
    lines.sort(key=lambda l: l.top)
    return lines


def _column_extents(page, row: list[Marker], top: float, bottom: float) -> list[tuple[float, float]]:
    """For a multi-column row, the true column boundary is rarely at the
    midpoint between marker LABELS — a short heading can sit far to one side
    of the actual table/content beneath it, and content belonging to that
    column can even sit numerically closer to the *next* marker's label than
    its own (confirmed by real-PDF testing: a Latin-square grid's own last
    column was nearer the neighbouring question's marker than its own,
    so a naive nearest-marker assignment truncated the puzzle itself).

    Instead: collect every word/rect/curve/image in the row's vertical band,
    union overlapping/touching ones into raw x-spans, then repeatedly merge
    whichever pair of spans has the SMALLEST gap between them until exactly
    len(row) spans remain — i.e. cut only at the len(row)-1 largest (most
    genuine) gaps. Each marker is then matched to the span containing it."""
    objs: list[tuple[float, float]] = []
    for w in page.extract_words(use_text_flow=False, keep_blank_chars=False):
        if w["top"] >= top - 1 and w["bottom"] <= bottom + 1:
            objs.append((w["x0"], w["x1"]))
    for o in list(page.rects) + list(page.curves) + list(page.images):
        o_top, o_bottom = o.get("top", -1), o.get("bottom", 1e9)
        if o_top >= top - 1 and o_bottom <= bottom + 1:
            objs.append((o["x0"], o["x1"]))

    fallback = [(m.x0, m.x1) for m in row]
    n = len(row)
    if not objs:
        return fallback

    objs.sort()
    segments = [list(objs[0])]
    for x0, x1 in objs[1:]:
        if x0 <= segments[-1][1]:
            segments[-1][1] = max(segments[-1][1], x1)
        else:
            segments.append([x0, x1])

    while len(segments) > n:
        gaps = [segments[i + 1][0] - segments[i][1] for i in range(len(segments) - 1)]
        j = min(range(len(gaps)), key=lambda i: gaps[i])
        segments[j][1] = max(segments[j][1], segments[j + 1][1])
        del segments[j + 1]

    if len(segments) < n:
        return fallback

    extents = []
    for m in row:
        best = min(segments, key=lambda s: 0 if s[0] <= m.x0 <= s[1] else min(abs(s[0] - m.x0), abs(s[1] - m.x0)))
        extents.append((best[0], best[1]))
    return extents


def _grid_group(markers: list[Marker], page_width: float, page_height: float,
                 row_tol: float = 8.0, first_row_top: float | None = None, page=None) -> list[Region]:
    """Row-major grid grouping: markers on (nearly) the same top form one row,
    read left-to-right; rows read top-to-bottom. Produces a bbox per marker.

    first_row_top controls where row 0's top bound sits:
      - an explicit float (e.g. 0.0 for a document's first page, or a
        question's own container top when grouping its options) is used as-is.
      - None (the default) pulls up only a modest, fixed amount from row 0's
        own marker top — enough to catch a small heading directly above it,
        but not so much that it swallows a full question's worth of content
        that overflowed onto this page from the previous one (confirmed by
        real-PDF testing: using the full page top on every page pulled a
        prior question's spillover lines into the next question's crop)."""
    if not markers:
        return []
    markers = sorted(markers, key=lambda m: (m.top, m.x0))
    rows: list[list[Marker]] = []
    for m in markers:
        if rows and abs(m.top - rows[-1][0].top) <= row_tol:
            rows[-1].append(m)
        else:
            rows.append([m])
    for r in rows:
        r.sort(key=lambda m: m.x0)

    regions: list[Region] = []
    for ri, row in enumerate(rows):
        if ri == 0:
            top_bound = first_row_top if first_row_top is not None else max(0.0, row[0].top - 20.0)
        else:
            # exact marker top — NOT pulled up. A pull-up margin here would
            # bleed the previous question/option's trailing line into this
            # one's extracted text (confirmed by real-PDF testing: it
            # corrupted answer cross-checks). The small pad in rendering.py
            # already keeps the *image* crop from clipping glyph edges.
            top_bound = row[0].top
        # Pull the bottom edge up slightly short of the next row's marker top.
        # Sub-pixel top jitter between words on what is visually the same
        # source line (bold label vs. regular text next to it) can otherwise
        # let a fragment of the next question/option's opening line bleed
        # into this crop's extracted text — confirmed by real-PDF testing.
        bottom_bound = (rows[ri + 1][0].top - 1.5) if ri + 1 < len(rows) else page_height

        if page is not None and len(row) > 1:
            extents = _column_extents(page, row, top_bound, bottom_bound)
        else:
            extents = [(m.x0, m.x1) for m in row]

        for ci, m in enumerate(row):
            col_min, col_max = extents[ci]
            left_bound = 0.0 if ci == 0 else (extents[ci - 1][1] + col_min) / 2
            right_bound = page_width if ci == len(row) - 1 else (col_max + extents[ci + 1][0]) / 2
            regions.append(Region(
                marker=m,
                page_index=m.page_index,
                bbox=(left_bound, top_bound, right_bound, bottom_bound),
            ))
    return regions


def detect_question_regions(pdf, page_limit: int | None = None) -> list[Region]:
    """Scans pages [0, page_limit) (or the whole document if page_limit is
    None) for question markers, picks the first pattern (most specific first)
    that yields a clean monotonically increasing sequence, and returns one
    Region per question. page_limit lets the caller exclude a later
    answer-key/solutions section of the same file from being misread as more
    questions."""
    pages = pdf.pages[:page_limit] if page_limit is not None else pdf.pages
    all_pages_lines = [build_lines(page) for page in pages]

    chosen: list[Marker] | None = None
    for pattern in QUESTION_MARKER_PATTERNS:
        hits: list[Marker] = []
        for page_index, lines in enumerate(all_pages_lines):
            for line in lines:
                m = pattern.match(line.text.strip())
                if m:
                    hits.append(Marker(
                        number=int(m.group(1)), label=line.text.strip(),
                        page_index=page_index, top=line.top, bottom=line.bottom,
                        x0=line.x0, x1=line.x1,
                    ))
        if len(hits) < 2:
            continue
        numbers = [h.number for h in hits]
        distinct_ratio = len(set(numbers)) / len(numbers)
        is_monotonic = numbers == sorted(numbers)
        if is_monotonic and distinct_ratio > 0.9:
            chosen = hits
            break
    if not chosen:
        return []

    by_page: dict[int, list[Marker]] = defaultdict(list)
    for h in chosen:
        by_page[h.page_index].append(h)

    regions: list[Region] = []
    for page_index, markers in by_page.items():
        page = pdf.pages[page_index]
        # Every page's opening row uses the same modest pull-up as any other
        # row (first_row_top=None) — including the document's first page.
        # An earlier version special-cased page 0 to the full page top, which
        # correctly avoided clipping a small heading right above Q1's marker,
        # but on a PDF whose first page carries a large cover/title/
        # instructions block before Q1 (confirmed by real-PDF testing on a
        # Latin-square bank), that swallowed the entire block into Q1's crop,
        # making it enormous and pushing the actual question off-screen.
        regions.extend(_grid_group(markers, float(page.width), float(page.height), page=page))
    regions.sort(key=lambda r: r.marker.number)
    return regions


def _content_top_above(page, floor: float, label_top: float, max_climb: float = 180.0) -> float:
    """Finds where the visual content sitting directly above an option's
    bare-letter label actually begins (e.g. a small diagram above "A"),
    by walking up from the label through contiguous graphical coverage and
    stopping at the first real gap — rather than climbing all the way to the
    container's own top, which pulled in the ENTIRE question above it
    (confirmed by real-PDF testing: every option crop came out spanning the
    full question height instead of just its own small image).

    max_climb bounds how far this can climb regardless of gaps: a page with
    many closely-packed/touching rects (e.g. several bordered diagrams side
    by side) can chain together with no real gap at all, letting the climb
    run all the way up through unrelated content above (confirmed by
    real-PDF testing: a multi-part question's option crops came out several
    times taller than the question itself). A modest cap keeps the common
    case — climbing past a small diagram sitting just above its label — while
    bounding the worst case."""
    lowest_allowed = label_top - max_climb
    objs = []
    for o in list(page.rects) + list(page.curves) + list(page.images):
        o_top, o_bottom = o.get("top", -1), o.get("bottom", 1e9)
        if o_top >= max(floor, lowest_allowed) - 1 and o_bottom <= label_top + 2:
            objs.append((o_top, o_bottom))
    if not objs:
        return max(floor, label_top - 20.0)
    objs.sort()
    bands = [list(objs[0])]
    for t, b in objs[1:]:
        if t <= bands[-1][1] + 5.0:
            bands[-1][1] = max(bands[-1][1], b)
        else:
            bands.append([t, b])
    return bands[-1][0]


def tighten_to_content(page, bbox: tuple[float, float, float, float], label_bbox: tuple[float, float, float, float] | None = None, pad: float = 6.0) -> tuple[float, float, float, float]:
    """Shrinks a region down to the actual union of graphical content (and,
    if given, a label's own text) strictly inside it — column/row-based
    bounds are necessarily approximate (derived from gaps between markers,
    not the content itself) and can leave a lot of dead space on one side
    when a small diagram sits off-center within its allotted column
    (confirmed by real-PDF testing: an option's image sat flush against one
    edge of its box, wasting roughly half the crop as blank margin). Falls
    back to the original bbox untouched if nothing is found inside it."""
    x0, top, x1, bottom = bbox
    xs0, ys0, xs1, ys1 = [], [], [], []
    for o in list(page.rects) + list(page.curves) + list(page.images):
        ox0, oy0 = o.get("x0", 0), o.get("top", 0)
        ox1, oy1 = o.get("x1", 0), o.get("bottom", 0)
        if ox0 >= x0 - 1 and ox1 <= x1 + 1 and oy0 >= top - 1 and oy1 <= bottom + 1:
            xs0.append(ox0); xs1.append(ox1); ys0.append(oy0); ys1.append(oy1)
    if not xs0:
        return bbox
    tx0, tx1 = min(xs0) - pad, max(xs1) + pad
    ty0, ty1 = min(ys0) - pad, max(ys1) + pad
    if label_bbox:
        lx0, ly0, lx1, ly1 = label_bbox
        tx0, tx1 = min(tx0, lx0 - pad), max(tx1, lx1 + pad)
        ty1 = max(ty1, ly1 + pad)
    return (max(x0, tx0), max(top, ty0), min(x1, tx1), min(bottom, ty1))


def _label_for_group(lines: list[Line], group: list[Region]) -> str | None:
    """Looks for a heading like "Options for Matrix 5" sitting above a group
    of options and returns "Matrix 5" — the exact text from the PDF, never
    invented. Picks whichever candidate heading is horizontally closest to
    the group (so "Options for Matrix 6" isn't mistakenly attached to the
    Matrix 5 group sitting right next to it)."""
    group_top = min(r.marker.top for r in group)
    gx0 = min(r.bbox[0] for r in group)
    gx1 = min(r.bbox[2] for r in group)
    center = (gx0 + gx1) / 2
    candidates = []
    for l in lines:
        m = GROUP_LABEL_PATTERN.search(l.text)
        if m and l.top < group_top:
            lc = (l.x0 + l.x1) / 2
            candidates.append((abs(lc - center), group_top - l.top, m.group(1).strip().rstrip(":").strip()))
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[0], c[1]))
    return candidates[0][2] or None


def detect_option_groups(
    pdf, page_index: int, container_bbox: tuple[float, float, float, float]
) -> tuple[list[tuple[str | None, list[Region]]], str]:
    """Looks for option markers ("A." / "Option 2" / bare "A") strictly
    inside container_bbox on one page. Returns (groups, style) where style is
    'letter' | 'numbered' | 'bare_letter' | 'none', and groups is a list of
    (label, regions) pairs — normally just one (label=None) for an ordinary
    single-answer question, but more than one when the marker sequence
    genuinely repeats (e.g. "Option 1/2/3" appearing twice for a two-part
    "Matrix 5 / Matrix 6" question) — split at each point the numbering
    resets, in reading order, rather than merging unrelated option sets or
    refusing to parse the question at all."""
    x0, top, x1, bottom = container_bbox
    page = pdf.pages[page_index]
    lines = [l for l in build_lines(page) if l.top >= top - 1 and l.bottom <= bottom + 1 and l.x0 >= x0 - 1 and l.x1 <= x1 + 1]

    def collect(pattern, label_fn, numeric_fn):
        hits = []
        for l in lines:
            m = pattern.match(l.text.strip())
            if m:
                hits.append(Marker(
                    number=numeric_fn(m), label=label_fn(m, l),
                    page_index=page_index, top=l.top, bottom=l.bottom, x0=l.x0, x1=l.x1,
                ))
        return hits

    numbered = collect(OPTION_NUMBERED_PATTERN, lambda m, l: l.text.strip(), lambda m: int(m.group(1)))
    lettered = collect(OPTION_LETTER_PATTERN, lambda m, l: m.group(1), lambda m: ord(m.group(1)) - ord("A") + 1)
    bare = collect(OPTION_BARE_LETTER_PATTERN, lambda m, l: m.group(1), lambda m: ord(m.group(1)) - ord("A") + 1)

    for hits, style in ((numbered, "numbered"), (lettered, "letter"), (bare, "bare_letter")):
        if not hits:
            continue
        if style == "bare_letter":
            # Bare single letters ("A", "B", ...) are also exactly what a
            # Latin-square grid's own cell values look like, scattered at many
            # different vertical positions — that must NOT be mistaken for an
            # options row. Only trust this style when every hit sits on one
            # single visual row (a genuine "A  B  C  D" options line under an
            # image-based option set, confirmed by real-PDF testing).
            tops = sorted(h.top for h in hits)
            if tops[-1] - tops[0] > 8.0:
                continue

        page_w, page_h = float(page.width), float(page.height)
        options_top = _content_top_above(page, top, min(h.top for h in hits))
        regions = _grid_group(hits, page_w, page_h, first_row_top=options_top, page=page)
        clamped = []
        for r in regions:
            rx0, rtop, rx1, rbottom = r.bbox
            # An option's own marker (its label, or the last line of a
            # numbered heading) is always the bottom-most content that
            # belongs to it — nothing meaningful follows it within the
            # question. _grid_group's row-based bottom bound assumes there
            # might be a wrapping row below (bounding against page/container
            # bottom when there isn't one), which left single-row option sets
            # absorbing all the empty space to the bottom of the page
            # (confirmed by real-PDF testing: option crops came out several
            # times taller than their own content). Pin it tight instead.
            tight_bottom = r.marker.bottom + 12.0
            rbottom = min(rbottom, tight_bottom)
            loose_bbox = (max(rx0, x0), max(rtop, top), min(rx1, x1), min(rbottom, bottom))
            label_bbox = (r.marker.x0, r.marker.top, r.marker.x1, r.marker.bottom)
            tight_bbox = tighten_to_content(page, loose_bbox, label_bbox=label_bbox)
            clamped.append(Region(marker=r.marker, page_index=r.page_index, bbox=tight_bbox))

        ordered = sorted(clamped, key=lambda r: (r.marker.top, r.marker.x0))
        raw_groups: list[list[Region]] = []
        last_num = None
        for r in ordered:
            if not raw_groups or r.marker.number <= last_num:
                raw_groups.append([])
            raw_groups[-1].append(r)
            last_num = r.marker.number

        # A split that leaves a singleton group is more likely noise than a
        # genuine second part — bail out to "ambiguous" rather than guess.
        if len(raw_groups) > 1 and any(len(g) < 2 for g in raw_groups):
            return [], "ambiguous"

        result = []
        multi = len(raw_groups) > 1
        for gi, g in enumerate(raw_groups):
            g_sorted = sorted(g, key=lambda r: r.marker.number)
            label = (_label_for_group(lines, g) or f"Part {gi + 1}") if multi else None
            result.append((label, g_sorted))
        return result, style
    return [], "none"
