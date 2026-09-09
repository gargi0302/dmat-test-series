from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db, QUESTION_IMAGE_DIR
from .. import models, schemas
from ..models import TOPIC_CHOICES
from ..services.counts import recompute_batch_counts

router = APIRouter()


def _delete_question_images(question: models.Question) -> None:
    """Best-effort removal of a question's rendered PNG crops from disk.
    Never raises — a missing/already-gone file is not an error here."""
    paths = []
    if question.question_image_path:
        paths.append(question.question_image_path)
    for o in (question.options or []):
        if o.get("image_path"):
            paths.append(o["image_path"])
    for p in (question.parts or []):
        for o in p.get("options", []):
            if o.get("image_path"):
                paths.append(o["image_path"])
    prefix = "/media/question-images/"
    for p in paths:
        if not p.startswith(prefix):
            continue
        try:
            (QUESTION_IMAGE_DIR / Path(p[len(prefix):])).unlink(missing_ok=True)
        except OSError:
            pass


def _stats(db: Session, question_id: str) -> schemas.QuestionStats:
    attempts = (
        db.query(models.Attempt)
        .join(models.Test, models.Attempt.test_id == models.Test.id)
        .filter(models.Attempt.question_id == question_id, models.Test.status == "completed")
        .all()
    )
    n = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    times = [a.time_spent_seconds for a in attempts if a.time_spent_seconds]
    return schemas.QuestionStats(
        attempts=n,
        correct=correct,
        best_time_seconds=min(times) if times else None,
        average_time_seconds=(sum(times) / len(times)) if times else None,
    )


@router.get("", response_model=list[schemas.QuestionOut])
def list_questions(
    module: Optional[str] = None,
    status: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Question)
    if module:
        q = q.filter(models.Question.module == module)
    if status:
        q = q.filter(models.Question.status == status)
    if topic:
        q = q.filter(models.Question.topic == topic)
    if difficulty:
        q = q.filter(models.Question.difficulty == difficulty)
    if search:
        like = f"%{search}%"
        q = q.filter(models.Question.question_text.ilike(like))
    return q.order_by(models.Question.module, models.Question.question_number).all()


@router.get("/topics")
def list_topics():
    return TOPIC_CHOICES


@router.get("/{question_id}", response_model=schemas.QuestionWithStats)
def get_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return schemas.QuestionWithStats(
        **schemas.QuestionOut.model_validate(question).model_dump(),
        stats=_stats(db, question_id),
    )


@router.patch("/{question_id}", response_model=schemas.QuestionOut)
def update_question(question_id: str, patch: schemas.QuestionUpdate, db: Session = Depends(get_db)):
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    data = patch.model_dump(exclude_unset=True)
    old_status = question.status
    for k, v in data.items():
        if k == "options" and v is not None:
            v = [o if isinstance(o, dict) else dict(o) for o in v]
        setattr(question, k, v)
    db.commit()
    db.refresh(question)
    if "status" in data and data["status"] != old_status and question.import_batch_id:
        recompute_batch_counts(db, question.import_batch_id)
    return question


@router.delete("/{question_id}", status_code=204)
def delete_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    batch_id = question.import_batch_id
    _delete_question_images(question)
    db.delete(question)
    db.commit()
    if batch_id:
        recompute_batch_counts(db, batch_id)


@router.post("/bulk-approve-high-confidence", response_model=list[schemas.QuestionOut])
def bulk_approve_high_confidence(import_batch_id: str, db: Session = Depends(get_db)):
    qs = (
        db.query(models.Question)
        .filter(
            models.Question.import_batch_id == import_batch_id,
            models.Question.status == "needs_review",
            models.Question.confidence == "high",
        )
        .all()
    )
    for q in qs:
        q.status = "approved"
    db.commit()
    recompute_batch_counts(db, import_batch_id)
    return qs
