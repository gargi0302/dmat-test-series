export type ModuleId = "figure_sequences" | "mathematical_equations" | "latin_squares";

export const MODULES: ModuleId[] = ["figure_sequences", "mathematical_equations", "latin_squares"];

export const MODULE_LABELS: Record<ModuleId, string> = {
  figure_sequences: "Figure Sequences",
  mathematical_equations: "Mathematical Equations",
  latin_squares: "Latin Squares",
};

export type OptionType = "mcq" | "numeric" | "text";
export type QuestionStatus = "needs_review" | "approved" | "skipped";
export type Confidence = "high" | "medium" | "low" | "none";
export type TestMode = "full" | "custom" | "practice";
export type TestStatus = "in_progress" | "completed" | "abandoned";

export interface Option {
  key: string;
  text: string | null;
  image_path: string | null;
}

/** One part of a multi-part question (e.g. "Matrix 5" + "Matrix 6" both
 * asked within a single question) — each part has its own options and its
 * own answer. */
export interface QuestionPart {
  label: string;
  options: Option[];
  correct_answer: string | null;
  detected_answer_raw?: string | null;
}

export interface Question {
  id: string;
  module: ModuleId;
  import_batch_id: string | null;
  question_number: number | null;
  question_text: string | null;
  question_image_path: string | null;
  option_type: OptionType;
  options: Option[] | null;
  correct_answer: string | null;
  detected_answer_raw: string | null;
  parts: QuestionPart[] | null;
  variables: string[] | null;
  difficulty: string | null;
  topic: string;
  source_pdf_filename: string | null;
  source_page: number | null;
  source_question_number: number | null;
  status: QuestionStatus;
  confidence: Confidence;
  created_at: number;
}

export interface QuestionStats {
  attempts: number;
  correct: number;
  best_time_seconds: number | null;
  average_time_seconds: number | null;
}

export interface QuestionWithStats extends Question {
  stats: QuestionStats;
}

export interface ImportBatch {
  id: string;
  module: ModuleId;
  questions_pdf_name: string;
  answer_key_pdf_name: string | null;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  imported_count: number;
  needs_review_count: number;
  approved_count: number;
  skipped_count: number;
  created_at: number;
}

export interface ImportBatchDetail extends ImportBatch {
  questions: Question[];
}

export interface Test {
  id: string;
  module: ModuleId;
  mode: TestMode;
  question_ids: string[];
  started_at: number | null;
  end_timestamp: number | null;
  completed_at: number | null;
  total_time_seconds: number | null;
  score: number | null;
  status: TestStatus;
  settings_snapshot: Record<string, unknown> | null;
  created_at: number;
}

export interface Attempt {
  id: string;
  test_id: string;
  question_id: string;
  question_number_in_test: number;
  selected_answer: string | null;
  correct_answer_snapshot: string | null;
  is_correct: boolean | null;
  time_spent_seconds: number;
  marked_for_review: boolean;
  visited: boolean;
}

export interface TestDetail extends Test {
  attempts: Attempt[];
  questions: Question[];
}

export interface ScoreSummary {
  score: number;
  total: number;
  percentage: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  total_time_seconds: number;
  average_time_seconds: number;
  fastest_question_number: number | null;
  slowest_question_number: number | null;
}

export interface ModuleSummary {
  module: ModuleId;
  question_count: number;
  tests_available: number;
  last_score_percentage: number | null;
  best_score_percentage: number | null;
}

export interface TopicBreakdownItem {
  topic: string;
  accuracy: number;
  average_time_seconds: number;
  attempts: number;
}

export interface DashboardData {
  modules: ModuleSummary[];
  average_accuracy: number | null;
  average_question_time_seconds: number | null;
  topic_breakdown: Record<string, TopicBreakdownItem[]>;
}

export interface Settings {
  default_question_count: number;
  default_timer_minutes: number;
  slow_threshold_seconds: number;
  dark_mode: "light" | "dark" | "system";
  randomize_questions: boolean;
  randomize_options: boolean;
}

export const TOPIC_CHOICES: Record<ModuleId, string[]> = {
  figure_sequences: [
    "Movement", "Diagonal Movement", "Boundary/Bounce", "Rotation",
    "Orientation", "Colour", "Shape Change", "Position Change",
    "Perimeter", "Grid Movement", "Multi-rule", "Other", "Uncategorized",
  ],
  mathematical_equations: [
    "Linear System", "Substitution", "Ratio", "Difference of Squares",
    "Product System", "Chain Equation", "Other", "Uncategorized",
  ],
  latin_squares: [
    "Row/Column Elimination", "Symbol Frequency", "Diagonal Logic",
    "Multi-step Deduction", "Other", "Uncategorized",
  ],
};
