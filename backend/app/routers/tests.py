import json
import random
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..services import scoring

router = APIRouter()


def _settings(db: Session) -> models.Settings:
    row = db.get(models.Settings, 1)
    if not row:
        row = models.Settings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _detail(db: Session, test: models.Test) -> schemas.TestDetail:
    attempts = (
        db.query(models.Attempt)
        .filter(models.Attempt.test_id == test.id)
        .order_by(models.Attempt.question_number_in_test)
        .all()
    )
    by_id = {q.id: q for q in db.query(models.Question).filter(models.Question.id.in_(test.question_ids)).all()}
    ordered = [by_id[qid] for qid in test.question_ids if qid in by_id]
    return schemas.TestDetail(
        **schemas.TestOut.model_validate(test).model_dump(),
        attempts=[schemas.AttemptOut.model_validate(a) for a in attempts],
        questions=[schemas.QuestionOut.model_validate(q) for q in ordered],
    )


def _score_summary(db: Session, test: models.Test) -> schemas.ScoreSummary:
    attempts = (
        db.query(models.Attempt)
        .filter(models.Attempt.test_id == test.id)
        .order_by(models.Attempt.question_number_in_test)
        .all()
    )
    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    incorrect = sum(1 for a in attempts if a.is_correct is False)
    unanswered = sum(1 for a in attempts if a.selected_answer is None)
    total_time = int(sum(a.time_spent_seconds or 0 for a in attempts))
    avg_time = (total_time / total) if total else 0.0
    timed = [a for a in attempts if (a.time_spent_seconds or 0) > 0]
    fastest = min(timed, key=lambda a: a.time_spent_seconds) if timed else None
    slowest = max(timed, key=lambda a: a.time_spent_seconds) if timed else None
    return schemas.ScoreSummary(
        score=correct,
        total=total,
        percentage=round((correct / total * 100) if total else 0.0, 1),
        correct=correct,
        incorrect=incorrect,
        unanswered=unanswered,
        total_time_seconds=total_time,
        average_time_seconds=round(avg_time, 1),
        fastest_question_number=fastest.question_number_in_test if fastest else None,
        slowest_question_number=slowest.question_number_in_test if slowest else None,
    )


@router.post("", response_model=schemas.TestDetail)
def create_test(payload: schemas.TestCreate, db: Session = Depends(get_db)):
    settings = _settings(db)

    q = db.query(models.Question).filter(
        models.Question.module == payload.module,
        models.Question.status == "approved",
    )
    if payload.difficulty:
        q = q.filter(models.Question.difficulty == payload.difficulty)
    pool = q.order_by(models.Question.question_number).all()
    if not pool:
        raise HTTPException(
            status_code=400,
            detail="No approved questions available for this module yet — import and approve some first.",
        )

    count = settings.default_question_count if payload.mode == "full" else (payload.question_count or settings.default_question_count)
    count = max(1, min(count, len(pool)))

    order = payload.order or ("random" if settings.randomize_questions else "sequential")
    chosen = random.sample(pool, count) if order == "random" else pool[:count]

    if payload.mode == "full":
        timer_minutes: Optional[int] = settings.default_timer_minutes
    elif payload.mode == "practice":
        timer_minutes = None
    else:
        timer_minutes = payload.timer_minutes

    now = int(time.time() * 1000)
    end_ts = now + timer_minutes * 60 * 1000 if timer_minutes else None

    option_order: dict[str, list[str]] = {}
    if settings.randomize_options:
        for question in chosen:
            if question.options:
                keys = [o["key"] for o in question.options]
                random.shuffle(keys)
                option_order[question.id] = keys

    test = models.Test(
        module=payload.module,
        mode=payload.mode,
        question_ids=[c.id for c in chosen],
        started_at=now,
        end_timestamp=end_ts,
        status="in_progress",
        settings_snapshot={
            "timer_minutes": timer_minutes,
            "slow_threshold_seconds": settings.slow_threshold_seconds,
            "option_order": option_order,
        },
    )
    db.add(test)
    db.commit()
    db.refresh(test)

    for i, question in enumerate(chosen):
        if question.parts:
            # multi-part question: snapshot answers as {label: choice}, JSON-encoded
            snapshot = json.dumps({p["label"]: p.get("correct_answer") for p in question.parts})
        else:
            snapshot = question.correct_answer
        db.add(models.Attempt(
            test_id=test.id,
            question_id=question.id,
            question_number_in_test=i + 1,
            correct_answer_snapshot=snapshot,
            active_since=now if i == 0 else None,
            visited=(i == 0),
        ))
    db.commit()

    return _detail(db, test)


@router.get("", response_model=list[schemas.TestOut])
def list_tests(module: Optional[str] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Test)
    if module:
        q = q.filter(models.Test.module == module)
    if status:
        q = q.filter(models.Test.status == status)
    return q.order_by(models.Test.created_at.desc()).all()


@router.get("/{test_id}", response_model=schemas.TestDetail)
def get_test(test_id: str, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return _detail(db, test)


@router.delete("/{test_id}", status_code=204)
def delete_test(test_id: str, db: Session = Depends(get_db)):
    """Deletes a test series (and its attempts) from history. Does not
    touch the underlying question bank."""
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    db.delete(test)  # cascades to Attempt rows (Test.attempts is cascade="all, delete-orphan")
    db.commit()


@router.patch("/{test_id}/attempts/{question_id}", response_model=schemas.AttemptOut)
def patch_attempt(test_id: str, question_id: str, patch: schemas.AttemptPatch, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test or test.status != "in_progress":
        raise HTTPException(status_code=400, detail="Test is not in progress")
    attempt = (
        db.query(models.Attempt)
        .filter(models.Attempt.test_id == test_id, models.Attempt.question_id == question_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if patch.elapsed_seconds:
        attempt.time_spent_seconds = (attempt.time_spent_seconds or 0) + max(0.0, patch.elapsed_seconds)
        attempt.active_since = None
    if patch.selected_answer is not None:
        attempt.selected_answer = patch.selected_answer or None
    if patch.marked_for_review is not None:
        attempt.marked_for_review = patch.marked_for_review
    if patch.mark_active:
        attempt.active_since = int(time.time() * 1000)
        attempt.visited = True

    db.commit()
    db.refresh(attempt)
    return attempt


@router.post("/{test_id}/submit", response_model=schemas.ScoreSummary)
def submit_test(test_id: str, payload: schemas.TestSubmit, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if test.status == "completed":
        return _score_summary(db, test)

    if payload.final_question_id and payload.final_elapsed_seconds:
        attempt = (
            db.query(models.Attempt)
            .filter(models.Attempt.test_id == test_id, models.Attempt.question_id == payload.final_question_id)
            .first()
        )
        if attempt:
            attempt.time_spent_seconds = (attempt.time_spent_seconds or 0) + max(0.0, payload.final_elapsed_seconds)
            attempt.active_since = None

    attempts = db.query(models.Attempt).filter(models.Attempt.test_id == test_id).all()
    for a in attempts:
        a.is_correct = scoring.grade(a.selected_answer, a.correct_answer_snapshot)

    test.completed_at = int(time.time() * 1000)
    test.status = "completed"
    test.total_time_seconds = int(sum(a.time_spent_seconds or 0 for a in attempts))
    test.score = sum(1 for a in attempts if a.is_correct)
    db.commit()

    return _score_summary(db, test)


@router.post("/{test_id}/abandon", response_model=schemas.TestOut)
def abandon_test(test_id: str, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if test.status == "in_progress":
        test.status = "abandoned"
        db.commit()
        db.refresh(test)
    return test


@router.get("/{test_id}/results", response_model=schemas.ScoreSummary)
def get_results(test_id: str, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if test.status != "completed":
        raise HTTPException(status_code=400, detail="Test is not completed yet")
    return _score_summary(db, test)
