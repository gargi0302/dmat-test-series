from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..models import MODULES

router = APIRouter()


@router.get("", response_model=schemas.DashboardOut)
def get_dashboard(db: Session = Depends(get_db)):
    settings = db.get(models.Settings, 1)
    full_length = settings.default_question_count if settings else 20

    modules_out = []
    for module in MODULES:
        approved = (
            db.query(models.Question)
            .filter(models.Question.module == module, models.Question.status == "approved")
            .count()
        )
        completed_tests = (
            db.query(models.Test)
            .filter(models.Test.module == module, models.Test.status == "completed")
            .order_by(models.Test.completed_at.desc())
            .all()
        )
        last_pct = None
        best_pct = None
        if completed_tests:
            pcts = [
                (t.score / len(t.question_ids) * 100) if t.question_ids else 0.0
                for t in completed_tests
            ]
            last_pct = round(pcts[0], 1)
            best_pct = round(max(pcts), 1)
        modules_out.append(schemas.ModuleSummary(
            module=module,
            question_count=approved,
            tests_available=approved // full_length if full_length else 0,
            last_score_percentage=last_pct,
            best_score_percentage=best_pct,
        ))

    all_completed = db.query(models.Test).filter(models.Test.status == "completed").all()
    accuracies = [(t.score / len(t.question_ids) * 100) for t in all_completed if t.question_ids]
    average_accuracy = round(sum(accuracies) / len(accuracies), 1) if accuracies else None

    all_attempts = (
        db.query(models.Attempt)
        .join(models.Test, models.Attempt.test_id == models.Test.id)
        .filter(models.Test.status == "completed")
        .all()
    )
    timed = [a.time_spent_seconds for a in all_attempts if a.time_spent_seconds]
    average_question_time = round(sum(timed) / len(timed), 1) if timed else None

    # Topic breakdown, built only from real recorded attempts (never fabricated).
    topic_breakdown: dict[str, list[schemas.TopicBreakdownItem]] = {}
    for module in MODULES:
        buckets: dict[str, list[models.Attempt]] = defaultdict(list)
        rows = (
            db.query(models.Attempt, models.Question)
            .join(models.Test, models.Attempt.test_id == models.Test.id)
            .join(models.Question, models.Attempt.question_id == models.Question.id)
            .filter(models.Test.status == "completed", models.Question.module == module)
            .all()
        )
        for attempt, question in rows:
            buckets[question.topic or "Uncategorized"].append(attempt)

        items = []
        for topic, atts in buckets.items():
            n = len(atts)
            correct = sum(1 for a in atts if a.is_correct)
            times = [a.time_spent_seconds for a in atts if a.time_spent_seconds]
            items.append(schemas.TopicBreakdownItem(
                topic=topic,
                accuracy=round((correct / n * 100) if n else 0.0, 1),
                average_time_seconds=round(sum(times) / len(times), 1) if times else 0.0,
                attempts=n,
            ))
        items.sort(key=lambda i: i.accuracy)
        topic_breakdown[module] = items

    return schemas.DashboardOut(
        modules=modules_out,
        average_accuracy=average_accuracy,
        average_question_time_seconds=average_question_time,
        topic_breakdown=topic_breakdown,
    )
