"""Creates the SQLite database and all tables. Safe to re-run — it only
creates tables that don't already exist and never touches existing data.
Run from /backend with its venv active: `python ../scripts/init_db.py`
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db import Base, engine, DATABASE_PATH  # noqa: E402
from app import models  # noqa: F401,E402 — registers models on Base

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print(f"Database ready at {DATABASE_PATH}")
