"""SQLAlchemy models.

Module values: "figure_sequences" | "mathematical_equations" | "latin_squares"
Kept as plain strings (not DB enums) so new modules could be added later without a migration.
"""
import time
import uuid
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, JSON, ForeignKey
)
from sqlalchemy.orm import relationship

from .db import Base


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


def now_ms() -> int:
    return int(time.time() * 1000)


# Topic vocabularies per module. "Uncategorized" is always allowed and is the
# default when the source PDF doesn't give enough information to tag a topic —
# never auto-guessed beyond what's explicit.
TOPIC_CHOICES = {
    "figure_sequences": [
        "Movement", "Diagonal Movement", "Boundary/Bounce", "Rotation",
        "Orientation", "Colour", "Shape Change", "Position Change",
        "Perimeter", "Grid Movement", "Multi-rule", "Other", "Uncategorized",
    ],
    "mathematical_equations": [
        "Linear System", "Substitution", "Ratio", "Difference of Squares",
        "Product System", "Chain Equation", "Other", "Uncategorized",
    ],
    "latin_squares": [
        "Row/Column Elimination", "Symbol Frequency", "Diagonal Logic",
        "Multi-step Deduction", "Other", "Uncategorized",
    ],
}

MODULES = list(TOPIC_CHOICES.keys())


class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, default=1)
    default_question_count = Column(Integer, default=20)
    default_timer_minutes = Column(Integer, default=25)
    slow_threshold_seconds = Column(Integer, default=75)
    dark_mode = Column(String, default="system")  # "light" | "dark" | "system"
    randomize_questions = Column(Boolean, default=False)
    randomize_options = Column(Boolean, default=False)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(String, primary_key=True, default=gen_id)
    module = Column(String, nullable=False)
    questions_pdf_name = Column(String, nullable=False)
    answer_key_pdf_name = Column(String, nullable=True)
    status = Column(String, default="processing")  # processing | ready | failed
    error_message = Column(Text, nullable=True)
    imported_count = Column(Integer, default=0)
    needs_review_count = Column(Integer, default=0)
    approved_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)
    created_at = Column(Integer, default=now_ms)

    questions = relationship("Question", back_populates="import_batch", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"
    id = Column(String, primary_key=True, default=gen_id)
    module = Column(String, nullable=False, index=True)
    import_batch_id = Column(String, ForeignKey("import_batches.id"), nullable=True)

    question_number = Column(Integer, nullable=True)  # display number within its source
    question_text = Column(Text, nullable=True)  # best-effort extracted text (editable)
    question_image_path = Column(String, nullable=True)  # relative path under /data/question-images

    option_type = Column(String, default="mcq")  # mcq | numeric | text
    options = Column(JSON, nullable=True)  # [{key,text,image_path}]
    correct_answer = Column(String, nullable=True)  # null until known with confidence
    detected_answer_raw = Column(String, nullable=True)  # low-confidence parser guess, shown as an
    # unconfirmed hint in the review screen — NEVER copied into correct_answer automatically
    parts = Column(JSON, nullable=True)  # multi-part questions (e.g. "Matrix 5" + "Matrix 6"):
    # [{label, options:[{key,text,image_path}], correct_answer}] — set INSTEAD of
    # options/correct_answer above, never alongside them
    variables = Column(JSON, nullable=True)  # fill-in-the-blank(s), e.g. ["A","B","C","D"] —
    # when set, correct_answer (if known) is a JSON {"A": "9", ...} string instead of a plain value

    difficulty = Column(String, nullable=True)  # Easy | Medium | Hard | null
    topic = Column(String, default="Uncategorized")

    source_pdf_filename = Column(String, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_question_number = Column(Integer, nullable=True)

    status = Column(String, default="needs_review")  # needs_review | approved | skipped
    confidence = Column(String, default="none")  # high | medium | low | none

    created_at = Column(Integer, default=now_ms)

    import_batch = relationship("ImportBatch", back_populates="questions")


class Test(Base):
    __tablename__ = "tests"
    id = Column(String, primary_key=True, default=gen_id)
    module = Column(String, nullable=False)
    mode = Column(String, nullable=False)  # full | custom | practice
    question_ids = Column(JSON, nullable=False)  # ordered list of question ids

    started_at = Column(Integer, nullable=True)
    end_timestamp = Column(Integer, nullable=True)  # epoch ms deadline, null for practice
    completed_at = Column(Integer, nullable=True)

    total_time_seconds = Column(Integer, nullable=True)
    score = Column(Integer, nullable=True)
    status = Column(String, default="in_progress")  # in_progress | completed | abandoned

    settings_snapshot = Column(JSON, nullable=True)
    created_at = Column(Integer, default=now_ms)

    attempts = relationship("Attempt", back_populates="test", cascade="all, delete-orphan")


class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(String, primary_key=True, default=gen_id)
    test_id = Column(String, ForeignKey("tests.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    question_number_in_test = Column(Integer, nullable=False)

    selected_answer = Column(String, nullable=True)
    correct_answer_snapshot = Column(String, nullable=True)
    is_correct = Column(Boolean, nullable=True)

    time_spent_seconds = Column(Float, default=0)
    active_since = Column(Integer, nullable=True)  # epoch ms; set while this is the current question

    marked_for_review = Column(Boolean, default=False)
    visited = Column(Boolean, default=False)

    test = relationship("Test", back_populates="attempts")
    question = relationship("Question")
