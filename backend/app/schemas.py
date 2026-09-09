"""Pydantic (v2) request/response schemas."""
from typing import Optional, Literal, Any
from pydantic import BaseModel, ConfigDict

Module = Literal["figure_sequences", "mathematical_equations", "latin_squares"]
OptionType = Literal["mcq", "numeric", "text"]
QuestionStatus = Literal["needs_review", "approved", "skipped"]
Confidence = Literal["high", "medium", "low", "none"]
TestMode = Literal["full", "custom", "practice"]
TestStatus = Literal["in_progress", "completed", "abandoned"]


class OptionOut(BaseModel):
    key: str
    text: Optional[str] = None
    image_path: Optional[str] = None


class PartOut(BaseModel):
    """One part of a multi-part question (e.g. "Matrix 5"), each with its own
    options and its own answer — for questions the source PDF asks two (or
    more) sub-answers for at once."""
    label: str
    options: list[OptionOut]
    correct_answer: Optional[str] = None
    detected_answer_raw: Optional[str] = None


# ---------- Settings ----------

class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    default_question_count: int
    default_timer_minutes: int
    slow_threshold_seconds: int
    dark_mode: str
    randomize_questions: bool
    randomize_options: bool


class SettingsUpdate(BaseModel):
    default_question_count: Optional[int] = None
    default_timer_minutes: Optional[int] = None
    slow_threshold_seconds: Optional[int] = None
    dark_mode: Optional[str] = None
    randomize_questions: Optional[bool] = None
    randomize_options: Optional[bool] = None


# ---------- Questions ----------

class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    module: Module
    import_batch_id: Optional[str] = None
    question_number: Optional[int] = None
    question_text: Optional[str] = None
    question_image_path: Optional[str] = None
    option_type: OptionType
    options: Optional[list[OptionOut]] = None
    correct_answer: Optional[str] = None
    detected_answer_raw: Optional[str] = None
    parts: Optional[list[PartOut]] = None
    variables: Optional[list[str]] = None
    difficulty: Optional[str] = None
    topic: str
    source_pdf_filename: Optional[str] = None
    source_page: Optional[int] = None
    source_question_number: Optional[int] = None
    status: QuestionStatus
    confidence: Confidence
    created_at: int


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    option_type: Optional[OptionType] = None
    options: Optional[list[OptionOut]] = None
    correct_answer: Optional[str] = None
    parts: Optional[list[PartOut]] = None
    difficulty: Optional[str] = None
    topic: Optional[str] = None
    status: Optional[QuestionStatus] = None


class QuestionStats(BaseModel):
    attempts: int
    correct: int
    best_time_seconds: Optional[float] = None
    average_time_seconds: Optional[float] = None


class QuestionWithStats(QuestionOut):
    stats: QuestionStats


# ---------- Import ----------

class ImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    module: Module
    questions_pdf_name: str
    answer_key_pdf_name: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    imported_count: int
    needs_review_count: int
    approved_count: int
    skipped_count: int
    created_at: int


class ImportBatchDetail(ImportBatchOut):
    questions: list[QuestionOut]


# ---------- Tests ----------

class TestCreate(BaseModel):
    module: Module
    mode: TestMode
    question_count: Optional[int] = None
    difficulty: Optional[str] = None  # for custom mode
    order: Optional[Literal["sequential", "random"]] = "sequential"
    timer_minutes: Optional[int] = None  # override; full test always uses settings default


class TestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    module: Module
    mode: TestMode
    question_ids: list[str]
    started_at: Optional[int] = None
    end_timestamp: Optional[int] = None
    completed_at: Optional[int] = None
    total_time_seconds: Optional[int] = None
    score: Optional[int] = None
    status: TestStatus
    settings_snapshot: Optional[dict[str, Any]] = None
    created_at: int


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    test_id: str
    question_id: str
    question_number_in_test: int
    selected_answer: Optional[str] = None
    correct_answer_snapshot: Optional[str] = None
    is_correct: Optional[bool] = None
    time_spent_seconds: float
    marked_for_review: bool
    visited: bool


class TestDetail(TestOut):
    attempts: list[AttemptOut]
    questions: list[QuestionOut]


class AttemptPatch(BaseModel):
    """Autosave payload for one question within an in-progress test.
    elapsed_seconds (computed client-side from timestamps, never a decrementing
    counter) is ADDED to the question's accumulated time_spent_seconds — this is
    what makes revisiting a question accumulate rather than reset its time.
    mark_active flags this question as the one now being viewed (sets
    active_since server-side, used to recover time if the browser crashes)."""
    elapsed_seconds: Optional[float] = None
    selected_answer: Optional[str] = None
    marked_for_review: Optional[bool] = None
    mark_active: Optional[bool] = None


class TestSubmit(BaseModel):
    final_elapsed_seconds: float = 0
    final_question_id: Optional[str] = None


class SubmitPreview(BaseModel):
    answered: int
    unanswered: int
    marked_for_review: int
    total: int


class ScoreSummary(BaseModel):
    score: int
    total: int
    percentage: float
    correct: int
    incorrect: int
    unanswered: int
    total_time_seconds: int
    average_time_seconds: float
    fastest_question_number: Optional[int] = None
    slowest_question_number: Optional[int] = None


# ---------- Dashboard ----------

class ModuleSummary(BaseModel):
    module: Module
    question_count: int
    tests_available: int
    last_score_percentage: Optional[float] = None
    best_score_percentage: Optional[float] = None


class TopicBreakdownItem(BaseModel):
    topic: str
    accuracy: float
    average_time_seconds: float
    attempts: int


class DashboardOut(BaseModel):
    modules: list[ModuleSummary]
    average_accuracy: Optional[float] = None
    average_question_time_seconds: Optional[float] = None
    topic_breakdown: dict[str, list[TopicBreakdownItem]]
