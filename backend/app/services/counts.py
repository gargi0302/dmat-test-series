from sqlalchemy.orm import Session
from .. import models


def recompute_batch_counts(db: Session, batch_id: str) -> None:
    batch = db.get(models.ImportBatch, batch_id)
    if not batch:
        return
    qs = db.query(models.Question).filter(models.Question.import_batch_id == batch_id).all()
    batch.imported_count = len(qs)
    batch.approved_count = sum(1 for q in qs if q.status == "approved")
    batch.skipped_count = sum(1 for q in qs if q.status == "skipped")
    batch.needs_review_count = sum(1 for q in qs if q.status == "needs_review")
    db.commit()
