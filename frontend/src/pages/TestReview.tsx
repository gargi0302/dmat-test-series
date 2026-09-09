import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { TestDetail } from "@/types";
import { MODULE_LABELS } from "@/types";
import { QuestionVisual, OptionGrid, MultiPartOptionGrid } from "@/components/QuestionView";
import { formatMMSS } from "@/lib/time";
import { ResultTag } from "@/components/Badges";
import { decodePartAnswers } from "@/lib/multiPart";

function formatEncodedAnswers(raw: string | null, labels: string[]): string {
  const decoded = decodePartAnswers(raw);
  return labels.map((label) => `${label}: ${decoded[label] ?? "—"}`).join(", ");
}

export default function TestReview() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    api.getTest(testId).then(setTest).catch((e) => setError(e.message));
  }, [testId]);

  if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!test) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading…</div>;

  const question = test.questions[index];
  const attempt = test.attempts.find((a) => a.question_id === question.id)!;
  const unanswered = !attempt.selected_answer;
  const optionOrder = (test.settings_snapshot?.option_order as Record<string, string[]> | undefined)?.[question.id] ?? null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to={`/tests/${test.id}/results`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Results</Link>
      <h1 className="text-2xl font-bold tracking-tight mt-2 mb-6">Answer Review — {MODULE_LABELS[test.module]}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold mb-4">Question {index + 1}</h2>
          <div className="mb-5">
            <QuestionVisual question={question} />
          </div>

          {question.parts?.length ? (
            <MultiPartOptionGrid
              question={question}
              selectedByPart={decodePartAnswers(attempt.selected_answer)}
              revealCorrectness
            />
          ) : (
            <OptionGrid
              question={question}
              selected={attempt.selected_answer}
              optionOrder={optionOrder}
              correctAnswer={attempt.correct_answer_snapshot}
              revealCorrectness
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[var(--border)] text-sm">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Your Answer</p>
              <p className="font-semibold">
                {question.parts?.length
                  ? formatEncodedAnswers(attempt.selected_answer, question.parts.map((p) => p.label))
                  : question.variables?.length
                    ? formatEncodedAnswers(attempt.selected_answer, question.variables)
                    : attempt.selected_answer ?? "— none —"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Correct Answer</p>
              <p className="font-semibold text-[var(--correct)]">
                {question.parts?.length
                  ? formatEncodedAnswers(attempt.correct_answer_snapshot, question.parts.map((p) => p.label))
                  : question.variables?.length
                    ? formatEncodedAnswers(attempt.correct_answer_snapshot, question.variables)
                    : attempt.correct_answer_snapshot ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Result</p>
              <ResultTag isCorrect={attempt.is_correct} unanswered={unanswered} />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Time Taken</p>
              <p className="font-semibold tabular-nums">{formatMMSS(attempt.time_spent_seconds)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium disabled:opacity-40">
              ← Previous Question
            </button>
            <button disabled={index === test.questions.length - 1} onClick={() => setIndex((i) => i + 1)} className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium disabled:opacity-40">
              Next Question →
            </button>
          </div>
        </div>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 h-fit">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-1.5">
            {test.questions.map((q, i) => {
              const a = test.attempts.find((att) => att.question_id === q.id);
              let cls = "bg-[var(--surface-2)] text-[var(--text-muted)]";
              if (a?.selected_answer && a.is_correct) cls = "bg-[var(--correct-soft)] text-[var(--correct)]";
              else if (a?.selected_answer && a.is_correct === false) cls = "bg-[var(--incorrect-soft)] text-[var(--incorrect)]";
              return (
                <button key={q.id} onClick={() => setIndex(i)} className={`h-8 rounded text-xs font-semibold tabular-nums ${cls} ${i === index ? "ring-2 ring-[var(--accent)]" : ""}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
