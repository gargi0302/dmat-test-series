import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db, SOURCE_PDF_DIR, QUESTION_IMAGE_DIR
from .. import models, schemas
from ..models import MODULES
from ..services.pdf_parser.extract import parse_pdf

router = APIRouter()


def _save_upload(upload: UploadFile, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload.filename or "upload.pdf").name
    dest = dest_dir / safe_name
    stem, suffix = dest.stem, dest.suffix
    i = 1
    while dest.exists():
        dest = dest_dir / f"{stem}_{i}{suffix}"
        i += 1
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return dest


def _to_detail(db: Session, batch: models.ImportBatch) -> schemas.ImportBatchDetail:
    questions = (
        db.query(models.Question)
        .filter(models.Question.import_batch_id == batch.id)
        .order_by(models.Question.question_number)
        .all()
    )
    return schemas.ImportBatchDetail(
        **schemas.ImportBatchOut.model_validate(batch).model_dump(),
        questions=[schemas.QuestionOut.model_validate(q) for q in questions],
    )


@router.post("", response_model=schemas.ImportBatchDetail)
def create_import(
    module: str = Form(...),
    questions_pdf: UploadFile = File(...),
    answer_key_pdf: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    if module not in MODULES:
        raise HTTPException(status_code=400, detail=f"Unknown module '{module}'")

    q_path = _save_upload(questions_pdf, SOURCE_PDF_DIR)
    k_path = _save_upload(answer_key_pdf, SOURCE_PDF_DIR) if answer_key_pdf is not None else None
    # "same PDF for both" — client may send the exact same file twice; treat
    # identically-named uploads as the same source for key-section detection.
    same_file = k_path is not None and k_path.name.split("_")[0] == q_path.name.split("_")[0] and k_path.stat().st_size == q_path.stat().st_size

    batch = models.ImportBatch(
        module=module,
        questions_pdf_name=q_path.name,
        answer_key_pdf_name=k_path.name if k_path else None,
        status="processing",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    image_dir = QUESTION_IMAGE_DIR / batch.id
    url_prefix = f"/media/question-images/{batch.id}"

    try:
        parsed = parse_pdf(
            module=module,
            questions_pdf_path=q_path,
            answer_key_pdf_path=None if same_file else k_path,
            source_pdf_filename=q_path.name,
            image_out_dir=image_dir,
            image_url_prefix=url_prefix,
        )
    except Exception as e:  # noqa: BLE001 — surface parser failures to the UI rather than crashing
        batch.status = "failed"
        batch.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Parsing failed: {e}")

    if not parsed:
        batch.status = "failed"
        batch.error_message = (
            "No question markers were detected in this PDF. The layout may not "
            "match any supported pattern — try a different file or check the README."
        )
        db.commit()
        raise HTTPException(status_code=422, detail=batch.error_message)

    for pq in parsed:
        db.add(models.Question(
            module=module,
            import_batch_id=batch.id,
            question_number=pq.source_question_number,
            question_text=pq.question_text,
            question_image_path=pq.question_image_path,
            option_type=pq.option_type,
            options=pq.options,
            correct_answer=pq.correct_answer,
            detected_answer_raw=pq.detected_answer_raw,
            parts=pq.parts,
            variables=pq.variables,
            difficulty=None,
            topic="Uncategorized",
            source_pdf_filename=q_path.name,
            source_page=pq.source_page,
            source_question_number=pq.source_question_number,
            status=pq.status,
            confidence=pq.confidence,
        ))

    batch.imported_count = len(parsed)
    batch.needs_review_count = len(parsed)
    batch.approved_count = 0
    batch.skipped_count = 0
    batch.status = "ready"
    db.commit()
    db.refresh(batch)

    return _to_detail(db, batch)


@router.get("", response_model=list[schemas.ImportBatchOut])
def list_imports(module: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.ImportBatch)
    if module:
        q = q.filter(models.ImportBatch.module == module)
    return q.order_by(models.ImportBatch.created_at.desc()).all()


@router.get("/{batch_id}", response_model=schemas.ImportBatchDetail)
def get_import(batch_id: str, db: Session = Depends(get_db)):
    batch = db.get(models.ImportBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return _to_detail(db, batch)


@router.delete("/{batch_id}", status_code=204)
def delete_import(batch_id: str, db: Session = Depends(get_db)):
    """Deletes an entire import batch and every question it produced (and
    their rendered images). Use this to remove a bad/duplicate import rather
    than leaving stale questions in the bank — e.g. after re-uploading a PDF
    that parsed incorrectly the first time."""
    from .questions import _delete_question_images  # local import avoids a circular import

    batch = db.get(models.ImportBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    questions = db.query(models.Question).filter(models.Question.import_batch_id == batch_id).all()
    for q in questions:
        _delete_question_images(q)
        db.delete(q)
    db.delete(batch)
    db.commit()

    batch_image_dir = QUESTION_IMAGE_DIR / batch_id
    try:
        if batch_image_dir.is_dir() and not any(batch_image_dir.iterdir()):
            batch_image_dir.rmdir()
    except OSError:
        pass
