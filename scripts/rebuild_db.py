"""Destroys and recreates the SQLite database from scratch — ALL imported
questions, tests, and history are lost. Source PDFs and rendered question
images in /data are left untouched (re-import to repopulate the bank).
Run from /backend with its venv active: `python ../scripts/rebuild_db.py`
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db import Base, engine, DATABASE_PATH  # noqa: E402
from app import models  # noqa: F401,E402

if __name__ == "__main__":
    confirm = input(f"This will DELETE all data in {DATABASE_PATH} and recreate empty tables. Type 'yes' to continue: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        sys.exit(0)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print(f"Database rebuilt at {DATABASE_PATH}")
