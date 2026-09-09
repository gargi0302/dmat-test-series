from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas

router = APIRouter()


def _get_or_create(db: Session) -> models.Settings:
    row = db.get(models.Settings, 1)
    if not row:
        row = models.Settings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=schemas.SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.patch("", response_model=schemas.SettingsOut)
def update_settings(patch: schemas.SettingsUpdate, db: Session = Depends(get_db)):
    row = _get_or_create(db)
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row
