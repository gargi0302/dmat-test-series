import type {
  DashboardData, ImportBatch, ImportBatchDetail, ModuleId, Question,
  QuestionStatus, QuestionWithStats, ScoreSummary, Settings, Test, TestDetail, TestMode,
} from "@/types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Settings
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  // Dashboard
  getDashboard: () => request<DashboardData>("/dashboard"),

  // Questions
  listQuestions: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<Question[]>(`/questions?${qs.toString()}`);
  },
  getQuestion: (id: string) => request<QuestionWithStats>(`/questions/${id}`),
  updateQuestion: (id: string, patch: Partial<Question>) =>
    request<Question>(`/questions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  bulkApproveHighConfidence: (importBatchId: string) =>
    request<Question[]>(`/questions/bulk-approve-high-confidence?import_batch_id=${importBatchId}`, { method: "POST" }),
  approveQuestion: (id: string) => api.updateQuestion(id, { status: "approved" as QuestionStatus }),
  skipQuestion: (id: string) => api.updateQuestion(id, { status: "skipped" as QuestionStatus }),
  deleteQuestion: (id: string) => request<void>(`/questions/${id}`, { method: "DELETE" }),

  // Imports
  createImport: (module: ModuleId, questionsPdf: File, answerKeyPdf: File | null) => {
    const fd = new FormData();
    fd.append("module", module);
    fd.append("questions_pdf", questionsPdf);
    if (answerKeyPdf) fd.append("answer_key_pdf", answerKeyPdf);
    return request<ImportBatchDetail>("/imports", { method: "POST", body: fd });
  },
  listImports: (module?: ModuleId) => request<ImportBatch[]>(`/imports${module ? `?module=${module}` : ""}`),
  getImport: (id: string) => request<ImportBatchDetail>(`/imports/${id}`),
  deleteImport: (id: string) => request<void>(`/imports/${id}`, { method: "DELETE" }),

  // Tests
  createTest: (payload: {
    module: ModuleId; mode: TestMode; question_count?: number; difficulty?: string;
    order?: "sequential" | "random"; timer_minutes?: number | null;
  }) => request<TestDetail>("/tests", { method: "POST", body: JSON.stringify(payload) }),
  listTests: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<Test[]>(`/tests?${qs.toString()}`);
  },
  getTest: (id: string) => request<TestDetail>(`/tests/${id}`),
  patchAttempt: (testId: string, questionId: string, patch: {
    elapsed_seconds?: number; selected_answer?: string | null; marked_for_review?: boolean; mark_active?: boolean;
  }) => request(`/tests/${testId}/attempts/${questionId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  submitTest: (id: string, payload: { final_elapsed_seconds?: number; final_question_id?: string | null }) =>
    request<ScoreSummary>(`/tests/${id}/submit`, { method: "POST", body: JSON.stringify(payload) }),
  abandonTest: (id: string) => request<Test>(`/tests/${id}/abandon`, { method: "POST" }),
  getResults: (id: string) => request<ScoreSummary>(`/tests/${id}/results`),
  deleteTest: (id: string) => request<void>(`/tests/${id}`, { method: "DELETE" }),
};
