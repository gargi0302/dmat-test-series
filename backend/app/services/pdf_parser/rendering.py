"""Rendering originals from the source PDF to pixel-faithful PNG crops.

Hard rule: this module only ever renders/crops what is already on the PDF page.
It never draws, redraws, or synthesizes any visual content. A page or region is
rasterized with PyMuPDF exactly as it appears in the source file.
"""
from __future__ import annotations
from pathlib import Path
import pymupdf

BASE_ZOOM = 3.5  # ~252 DPI baseline for normal/large crops
MIN_TARGET_PX = 700.0  # small crops (e.g. one MCQ option) are zoomed further so
# their shorter side is still at least this many pixels — a flat zoom factor
# left small option images looking soft/blurry on high-DPI screens even
# though the render was technically "high resolution" for a full page.
MAX_ZOOM = 9.0  # cap so a tiny region (e.g. a single glyph) doesn't balloon


def render_full_page(doc: "pymupdf.Document", page_index: int, zoom: float = BASE_ZOOM) -> "pymupdf.Pixmap":
    page = doc[page_index]
    mat = pymupdf.Matrix(zoom, zoom)
    return page.get_pixmap(matrix=mat, alpha=False)


def render_page_region(
    doc: "pymupdf.Document",
    page_index: int,
    bbox_pt: tuple[float, float, float, float],
    zoom: float | None = None,
    pad_pt: float = 4.0,
) -> "pymupdf.Pixmap":
    """bbox_pt = (x0, top, x1, bottom) in PDF points (pdfplumber's coordinate
    system — top-left origin, same as PyMuPDF's page space). Clamped to the
    page and padded slightly so glyph edges aren't clipped.

    zoom=None (the default) picks an adaptive zoom: BASE_ZOOM for normal-size
    regions, scaled up (capped at MAX_ZOOM) for small ones so every crop's
    shorter side reaches at least MIN_TARGET_PX pixels — without this, a
    small MCQ option's crop stayed technically "3x" but was still only ~150px
    across, which read as blurry once displayed."""
    page = doc[page_index]
    x0, top, x1, bottom = bbox_pt
    x0 = max(0.0, x0 - pad_pt)
    top = max(0.0, top - pad_pt)
    x1 = min(page.rect.width, x1 + pad_pt)
    bottom = min(page.rect.height, bottom + pad_pt)

    if zoom is None:
        shorter_side = max(1.0, min(x1 - x0, bottom - top))
        zoom = max(BASE_ZOOM, min(MAX_ZOOM, MIN_TARGET_PX / shorter_side))

    clip = pymupdf.Rect(x0, top, x1, bottom)
    mat = pymupdf.Matrix(zoom, zoom)
    return page.get_pixmap(matrix=mat, clip=clip, alpha=False)


def save_pixmap(pix: "pymupdf.Pixmap", out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(out_path))
