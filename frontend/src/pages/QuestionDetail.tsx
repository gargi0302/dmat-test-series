import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { QuestionWithStats } from "@/types";
import { MODULE_LABELS, TOPIC_CHOICES } from "@/types";
import { ConfidenceBadge, StatusBadge } from "@/components/Badges";
import { QuestionVisual, OptionGrid, MultiPartOptionGrid } from "@/components/QuestionView";
import { formatShortSeconds } from "@/lib/time";

export default function QuestionDetail() {
  const { questionId } = useParams<{ questionId: string }>();
  const navigate = useNavigate();
  const [question, setQuestion] = useState<QuestionWithStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    if (!questionId) return;
    api.getQuestion(questionId).then(setQuestion).catch((e) => setError(e.message));
  };
  useEffect(load, [questionId]);

  if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!question) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading…</div>;

  const updateField = async (patch: Partial<QuestionWithStats>) => {
    const updated = await api.updateQuestion(question.id, patch);
    setQuestion({ ...question, ...updated });
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteQuestion(question.id);
      navigate(`/bank/${question.module}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to={`/bank/${question.module}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← {MODULE_LABELS[question.module]} bank</Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Question {question.question_number ?? "?"}</h1>
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={question.confidence} />
          <StatusBadge status={question.status} />
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 ml-2">
              <button onClick={doDelete} disabled={deleting} className="px-2.5 py-1 rounded-md bg-[var(--incorrect)] text-white text-xs font-medium disabled:opacity-50">
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-md border border-[var(--border)] text-xs font-medium">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="ml-2 px-2.5 py-1 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--incorrect)] hover:border-[var(--incorrect)]">
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
        <div className="mb-5">
          <QuestionVisual question={question} />
        </div>
        {question.parts?.length ? (
          <MultiPartOptionGrid question={question} selectedByPart={{}} revealCorrectness />
        ) : (
          <OptionGrid question={question} selected={null} correctAnswer={question.correct_answer} revealCorrectness />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Previous Performance</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Attempts" value={String(question.stats.attempts)} />
            <Row label="Correct" value={`${question.stats.correct}/${question.stats.attempts}`} />
            <Row label="Best Time" value={question.stats.best_time_seconds != null ? formatShortSeconds(question.stats.best_time_seconds) : "—"} />
            <Row label="Average Time" value={question.stats.average_time_seconds != null ? formatShortSeconds(question.stats.average_time_seconds) : "—"} />
          </dl>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Classification</h2>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--text-muted)] block mb-1">Topic</span>
              <select
                value={question.topic}
                onChange={(e) => updateField({ topic: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)]"
              >
                {TOPIC_CHOICES[question.module].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)] block mb-1">Difficulty</span>
              <select
                value={question.difficulty ?? ""}
                onChange={(e) => updateField({ difficulty: e.target.value || null })}
                className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)]"
              >
                <option value="">Not set</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Source</h2>
        <p className="text-[var(--text-muted)]">{question.source_pdf_filename} — page {question.source_page}, question #{question.source_question_number}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
