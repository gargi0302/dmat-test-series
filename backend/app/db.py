"""SQLite database setup. The DB file lives in /database/dmat.db (outside /backend
so it survives a backend reinstall and matches the project's suggested layout)."""
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DATABASE_DIR = PROJECT_ROOT / "database"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = DATABASE_DIR / "dmat_recovered.db"
# NOTE: was "dmat.db" — that exact filename got stuck with a Windows-level
# lock on its SQLite rollback journal (dmat.db-journal) that wouldn't
# release even with no process attached to it (this folder lives under
# OneDrive-synced Desktop, a known source of this kind of transient lock).
# All data was verified intact (PRAGMA integrity_check: ok) and copied
# here under a fresh name to sidestep the stuck file rather than risk
# further writes against a path Windows wouldn't let go of.

DATA_DIR = PROJECT_ROOT / "data"
SOURCE_PDF_DIR = DATA_DIR / "source-pdfs"
QUESTION_IMAGE_DIR = DATA_DIR / "question-images"
SOURCE_PDF_DIR.mkdir(parents=True, exist_ok=True)
QUESTION_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """Lightweight migration: adds any model columns missing from an
    existing SQLite file (no formal migration tool is set up for this local
    app). Safe to call on every startup — a no-op once columns exist, and
    never touches existing data or tables that don't exist yet."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all() will create it fresh with all columns
            existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                col_type = col.type.compile(engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'))
